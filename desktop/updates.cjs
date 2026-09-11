// Guided updates only. This module cannot launch installers, stop tasks, or
// mutate application/research files. The only writes are its own cache files.
const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash, verify, createPublicKey} = require('node:crypto');
const {EventEmitter} = require('node:events');
const {atomicWriteFile} = require('../server/atomic-file.cjs');
const config = require('./update-config.json');
const releaseRoot = `https://github.com/${config.repository}/releases`;

function version(value) {
  if (typeof value !== 'string' || value.length > 100) throw new Error('Invalid release version.');
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(value);
  if (!match || match.slice(1, 4).some(n => !Number.isSafeInteger(Number(n))) || match[4]?.split('.').some(n => /^\d+$/.test(n) && (n.length > 1 && n[0] === '0' || !Number.isSafeInteger(Number(n))))) throw new Error('Invalid release version.');
  return {numbers: match.slice(1, 4).map(Number), pre: match[4]?.split('.') || []};
}
function compare(a, b) {
  const x = version(a), y = version(b);
  for (let i = 0; i < 3; i++) if (x.numbers[i] !== y.numbers[i]) return Math.sign(x.numbers[i] - y.numbers[i]);
  if (!x.pre.length || !y.pre.length) return x.pre.length ? -1 : y.pre.length ? 1 : 0;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const l = x.pre[i], r = y.pre[i];
    if (l === r) continue;
    if (l === undefined || r === undefined) return l === undefined ? -1 : 1;
    const ln = /^\d+$/.test(l), rn = /^\d+$/.test(r);
    if (ln && rn) return Math.sign(Number(l) - Number(r));
    if (ln !== rn) return ln ? -1 : 1;
    return l < r ? -1 : 1;
  }
  return 0;
}
function formats(platform) { return platform === 'darwin' ? ['dmg', 'zip'] : platform === 'win32' ? ['exe', 'zip'] : ['zip', 'deb', 'rpm']; }
function assetUrl(tag, name) {
  if (!/^v?[0-9A-Za-z.-]+$/.test(tag) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,180}$/.test(name)) throw new Error('Invalid release asset.');
  return `${releaseRoot}/download/${tag}/${name}`;
}
function validateManifest(envelope, {keys, tag, now = Date.now()}) {
  if (!keys.length) throw new Error('Verified downloads are not configured for this build. Use the release page.');
  if (typeof envelope?.payload !== 'string' || envelope.payload.length > 200000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(envelope.signature || '')) throw new Error('Invalid signed update metadata.');
  const data = Buffer.from(envelope.payload, 'utf8');
  const signature = Buffer.from(envelope.signature, 'base64');
  if (!keys.some(pem => { const key = createPublicKey(pem); return key.asymmetricKeyType === 'ed25519' && verify(null, data, key, signature); })) throw new Error('Update signature verification failed.');
  const manifest = JSON.parse(envelope.payload);
  const published = Date.parse(manifest.publishedAt), expires = Date.parse(manifest.expiresAt);
  if (manifest.schema !== 1 || manifest.tag !== tag || manifest.version !== tag.replace(/^v/, '') || !Number.isFinite(published) || !Number.isFinite(expires) || published > now + 300000 || expires <= now || expires <= published || expires - published > 31 * 86400000) throw new Error('Update metadata is invalid or expired.');
  version(manifest.version);
  // Ordinary releases must remain readable by 0.2.0. A future migration needs
  // an independently reviewed backup/recovery implementation, not a flag here.
  if (manifest.dataCompatibility !== '0.2.0' || !Array.isArray(manifest.assets) || manifest.assets.length > 30 || typeof manifest.notes !== 'string' || manifest.notes.length > 4000) throw new Error('This update requires a separate compatibility review.');
  const seen = new Set();
  for (const asset of manifest.assets) {
    if (!['darwin', 'win32', 'linux'].includes(asset.platform) || !['x64', 'arm64'].includes(asset.arch) || !formats(asset.platform).includes(asset.format) || !asset.name?.endsWith(`.${asset.format}`) || !/^[a-f0-9]{64}$/.test(asset.sha256) || !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > 8 * 1024 ** 3) throw new Error('Invalid update artifact.');
    assetUrl(tag, asset.name);
    const id = `${asset.platform}/${asset.arch}/${asset.format}`;
    if (seen.has(id)) throw new Error('Ambiguous update artifact.');
    seen.add(id);
  }
  return manifest;
}

// Follow only GitHub's HTTPS asset redirect hosts. Never forward credentials.
async function request(url, {fetcher = fetch, signal} = {}) {
  for (let i = 0; i < 6; i++) {
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.username || u.password || u.port || !['github.com', 'api.github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(u.hostname)) throw new Error('Untrusted update host.');
    const response = await fetcher(u.href, {signal, redirect: 'manual', headers: {'User-Agent': 'Axiovela-update-check', Accept: 'application/octet-stream'}});
    if ([301, 302, 303, 307, 308].includes(response.status)) { await response.body?.cancel(); url = new URL(response.headers.get('location'), url).href; continue; }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`Update service unavailable (${response.status}). Try again later.`); }
    return response;
  }
  throw new Error('Too many update redirects.');
}
async function jsonRequest(url, options) {
  const response = await request(url, options);
  let size = 0; const parts = [];
  for await (const part of response.body) { size += part.length; if (size > 2 * 1024 ** 2) throw new Error('Update metadata is too large.'); parts.push(Buffer.from(part)); }
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}

class Updates extends EventEmitter {
  constructor({profile, currentVersion, platform = process.platform, arch = process.arch, keys = config.publicKeys, fetcher = fetch}) {
    super(); version(currentVersion);
    Object.assign(this, {profile, currentVersion, platform, arch, keys, fetcher});
    this.state = {status: 'idle', channel: 'stable', currentVersion, formats: formats(platform), format: formats(platform)[0], release: null, error: null, progress: 0};
  }
  snapshot() { return structuredClone(this.state); }
  set(change) { Object.assign(this.state, change); this.emit('change', this.snapshot()); }
  async initialize() {
    try { const saved = JSON.parse(await fs.readFile(path.join(this.profile, 'updates.json'), 'utf8')); this.state.channel = saved.channel === 'beta' ? 'beta' : 'stable'; } catch {}
    // Each launch gets a private directory. No extraction and no automatic
    // replay/install of downloads left by a crash. No research cleanup sweep.
    const cache = path.join(this.profile, 'update-downloads');
    await fs.mkdir(cache, {recursive: true, mode: 0o700});
    this.cache = await fs.mkdtemp(path.join(cache, 'session-'));
  }
  async channel(value) {
    if (!['stable', 'beta'].includes(value) || this.busy) throw new Error('Wait for the current update operation to finish.');
    this.busy = true;
    try {
      await atomicWriteFile(path.join(this.profile, 'updates.json'), JSON.stringify({channel: value}), {mode: 0o600});
      this.manifest = null; this.downloaded = null;
      this.set({channel: value, status: 'idle', release: null, error: null, progress: 0});
    } finally { this.busy = false; }
  }
  async check() {
    if (this.busy || this.state.status === 'ready') return this.snapshot();
    this.busy = true; this.manifest = null; this.downloaded = null;
    this.set({status: 'checking', error: null, release: null});
    try {
      const releases = await jsonRequest(`https://api.github.com/repos/${config.repository}/releases?per_page=100`, {fetcher: this.fetcher, signal: AbortSignal.timeout(30000)});
      if (!Array.isArray(releases)) throw new Error('Invalid release list.');
      const eligible = releases.filter(r => {
        try { const v = version(r.tag_name.replace(/^v/, '')); return !r.draft && (this.state.channel === 'beta' || !r.prerelease && !v.pre.length) && compare(r.tag_name.replace(/^v/, ''), this.currentVersion) > 0; } catch { return false; }
      }).sort((a, b) => compare(b.tag_name.replace(/^v/, ''), a.tag_name.replace(/^v/, '')));
      const release = eligible[0];
      this.manifest = null; this.downloaded = null;
      if (!release) { this.set({status: 'current', release: null}); return this.snapshot(); }
      this.set({release: {version: release.tag_name.replace(/^v/, ''), tag: release.tag_name, notes: String(release.body || '').slice(0, 1500), verified: false}, progress: 0});
      if (!this.keys.length) throw new Error('Verified downloads are not configured for this build. Use the release page.');
      const envelope = await jsonRequest(assetUrl(release.tag_name, 'axiovela-update.json'), {fetcher: this.fetcher, signal: AbortSignal.timeout(30000)});
      this.manifest = validateManifest(envelope, {keys: this.keys, tag: release.tag_name});
      const availableFormats = formats(this.platform).filter(format => this.manifest.assets.some(asset => asset.platform === this.platform && asset.arch === this.arch && asset.format === format));
      if (!availableFormats.length) throw new Error('This release has no download for this system. Use the release page.');
      this.set({status: 'available', formats: availableFormats, format: availableFormats.includes(this.state.format) ? this.state.format : availableFormats[0], release: {...this.state.release, notes: this.manifest.notes, verified: true}});
    } catch (error) { this.set({status: this.state.release ? 'available' : 'error', error: error.message}); }
    finally { this.busy = false; }
    return this.snapshot();
  }
  cancel() { this.controller?.abort(); }
  async download(format) {
    if (this.busy) return this.snapshot();
    if (!this.cache) throw new Error('Update storage is unavailable. Use the release page.');
    if (!this.manifest || !formats(this.platform).includes(format)) throw new Error('No verified update is available.');
    if (Date.parse(this.manifest.expiresAt) <= Date.now()) throw new Error('Update metadata expired. Check again.');
    const asset = this.manifest.assets.find(a => a.platform === this.platform && a.arch === this.arch && a.format === format);
    if (!asset) throw new Error('This release has no download for this system and format. Use the release page.');
    this.busy = true; this.controller = new AbortController(); this.downloaded = null;
    this.set({status: 'downloading', format, progress: 0, error: null});
    const temporary = path.join(this.cache, `${asset.name}.partial`), destination = path.join(this.cache, asset.name);
    let file;
    try {
      const signal = AbortSignal.any([this.controller.signal, AbortSignal.timeout(60 * 60 * 1000)]);
      const response = await request(assetUrl(this.manifest.tag, asset.name), {fetcher: this.fetcher, signal});
      file = await fs.open(temporary, 'wx', 0o600);
      const hash = createHash('sha256'); let received = 0, lastProgress = 0;
      for await (const part of response.body) {
        signal.throwIfAborted(); received += part.length;
        if (received > asset.size) throw new Error('Update exceeds its signed size.');
        hash.update(part); await file.writeFile(part);
        if (Date.now() - lastProgress > 150) { this.set({progress: Math.floor(received / asset.size * 100)}); lastProgress = Date.now(); }
      }
      signal.throwIfAborted();
      if (received !== asset.size || hash.digest('hex') !== asset.sha256) throw new Error('Update integrity verification failed. Retry the download.');
      await file.sync(); await file.close(); file = null;
      this.controller.signal.throwIfAborted();
      await fs.rename(temporary, destination);
      this.downloaded = destination;
      this.set({status: 'ready', progress: 100});
    } catch (error) {
      await file?.close().catch(() => {});
      await fs.rm(temporary, {force: true});
      this.set({status: 'available', progress: 0, error: this.controller.signal.aborted ? 'Download cancelled. You can retry whenever you like.' : error.message});
    } finally { this.busy = false; this.controller = null; }
    return this.snapshot();
  }
}
module.exports = {Updates, version, compare, validateManifest, assetUrl, request, releaseRoot};
