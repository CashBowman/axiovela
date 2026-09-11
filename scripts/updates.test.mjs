import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {generateKeyPairSync, sign, createHash} from 'node:crypto';
import {mkdtemp, mkdir, writeFile, readFile, readdir, rm, cp} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
const require = createRequire(import.meta.url);
const {Updates, compare, validateManifest, request} = require('../desktop/updates.cjs');
const {privateKey, publicKey} = generateKeyPairSync('ed25519');
const keys = [publicKey.export({type: 'spki', format: 'pem'})];
const bytes = Buffer.from('isolated application update fixture');
function manifest(overrides = {}) {
  return {schema: 1, version: '0.2.1', tag: 'v0.2.1', publishedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(), dataCompatibility: '0.2.0', notes: 'Small improvements.', assets: [{name: 'Axiovela-0.2.1-linux-x64.zip', platform: 'linux', arch: 'x64', format: 'zip', size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')}], ...overrides};
}
function envelope(value = manifest()) { const payload = JSON.stringify(value); return {payload, signature: sign(null, Buffer.from(payload), privateKey).toString('base64')}; }
function fetcher({signed = envelope(), artifact = () => new Response(bytes), releases = [{tag_name: 'v0.2.1', body: 'notes'}]} = {}) {
  return async (url, options) => url.includes('api.github.com') ? Response.json(releases) : url.endsWith('axiovela-update.json') ? Response.json(signed) : artifact(url, options);
}
async function isolated(fn, options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'axiovela-update-020-'));
  const profile = path.join(root, 'MethodFlow');
  await mkdir(profile);
  // Populated 0.2.0-shaped state, never live credentials or user research.
  const fixtures = {
    'MethodFlow/state.json': JSON.stringify({schemaVersion: 1, projectRoot: path.join(root, 'study')}),
    'MethodFlow/tools.json': '{"LATEX":"fixture-tool"}',
    'MethodFlow/provider-settings.encrypted': 'FAKE ENCRYPTED CREDENTIAL FIXTURE',
    'MethodFlow/Local Storage/fixture.json': JSON.stringify({'axiovela-project-tabs': [{root: path.join(root, 'study')}], 'axiovela-default-writeup-format': 'latex', draft: 'unsaved draft'}),
    'study/datasets/data.csv': 'x,y\n1,2\n', 'study/runs/run.json': '{"status":"completed","metric":0.75}',
    'study/writeups/main.md': '# Research\nOriginal manuscript', 'study/assistant/chat.json': '[{"text":"original conversation"}]',
    'study/exports/paper.pdf': 'fixture export', 'old-app/version': '0.2.0',
  };
  for (const [file, value] of Object.entries(fixtures)) { await mkdir(path.dirname(path.join(root, file)), {recursive: true}); await writeFile(path.join(root, file), value); }
  const updater = new Updates({profile, currentVersion: '0.2.0', platform: 'linux', arch: 'x64', keys, fetcher: fetcher(), ...options});
  await updater.initialize();
  try { await fn(updater, root); }
  finally {
    for (const [file, value] of Object.entries(fixtures)) assert.equal(await readFile(path.join(root, file), 'utf8'), value, `Preserve ${file}`);
    await rm(root, {recursive: true, force: true});
  }
}

test('semver orders stable and numeric betas, rejects malformed versions and downgrades', () => {
  assert.equal(compare('0.2.0-beta.10', '0.2.0-beta.9'), 1);
  assert.equal(compare('0.2.0', '0.2.0-beta.99'), 1);
  assert.equal(compare('0.2.0', '0.2.1'), -1);
  for (const value of ['0.02.0', 'v0.2.0', '0.2.0-beta.01', '../../app', '0.2']) assert.throws(() => compare(value, '0.2.0'));
});
test('signed metadata rejects tampering, missing trust, expiry, migrations, path traversal and wrong release', () => {
  assert.equal(validateManifest(envelope(), {keys, tag: 'v0.2.1'}).version, '0.2.1');
  const signed = envelope(); signed.payload = signed.payload.replace('Small', 'Other');
  assert.throws(() => validateManifest(signed, {keys, tag: 'v0.2.1'}), /signature/);
  assert.throws(() => validateManifest(envelope(), {keys: [], tag: 'v0.2.1'}), /not configured/);
  for (const value of [manifest({expiresAt: '2020-01-01'}), manifest({dataCompatibility: '0.3.0'}), manifest({tag: 'v0.2.2'}), manifest({assets: [{...manifest().assets[0], name: '../app.zip'}]})]) assert.throws(() => validateManifest(envelope(value), {keys, tag: 'v0.2.1'}));
});
test('stable is default; beta opt-in persists; returning to stable never downgrades', async () => {
  await isolated(async u => {
    u.fetcher = fetcher({releases: [{tag_name: 'v0.3.0-beta.1', prerelease: true}, {tag_name: 'v0.1.0'}]});
    assert.equal((await u.check()).status, 'current');
    await u.channel('beta');
    assert.equal(JSON.parse(await readFile(path.join(u.profile, 'updates.json'))).channel, 'beta');
    assert.equal((await u.check()).release.version, '0.3.0-beta.1');
    await u.channel('stable'); assert.equal((await u.check()).status, 'current');
  });
});
test('download verifies bytes, never replaces 0.2.0 or touches populated research/profile; fresh launch never installs staged file', async () => {
  await isolated(async u => {
    await u.check(); assert.equal(u.state.status, 'available');
    await u.download('zip'); assert.equal(u.state.status, 'ready');
    assert.deepEqual(await readFile(u.downloaded), bytes);
    const restarted = new Updates({profile: u.profile, currentVersion: '0.2.0'}); await restarted.initialize();
    assert.equal(restarted.downloaded, undefined); assert.equal(restarted.state.status, 'idle');
  });
});
test('corrupt and truncated updates are removed; retry succeeds', async () => {
  await isolated(async u => {
    await u.check();
    for (const body of [Buffer.alloc(bytes.length), bytes.subarray(0, 5), Buffer.alloc(bytes.length + 1)]) {
      u.fetcher = fetcher({artifact: () => new Response(body)}); await u.download('zip');
      assert.equal(u.state.status, 'available'); assert.equal(u.downloaded, null); assert.deepEqual(await readdir(u.cache), []);
    }
    u.fetcher = fetcher(); await u.download('zip'); assert.equal(u.state.status, 'ready');
  });
});
test('network failure preserves work and allows retry; checks are single-flight', async () => {
  await isolated(async u => {
    u.fetcher = async () => { throw new Error('Offline'); };
    await Promise.all([u.check(), u.check()]); assert.equal(u.state.status, 'error');
    u.fetcher = fetcher(); await u.check(); assert.equal(u.state.status, 'available');
    u.fetcher = fetcher({artifact: () => { throw new Error('Connection interrupted'); }});
    await u.download('zip'); assert.equal(u.state.status, 'available'); assert.deepEqual(await readdir(u.cache), []);
    u.fetcher = fetcher(); await u.download('zip'); assert.equal(u.state.status, 'ready');
  });
});
test('cancel mid-stream removes partial file, rejects concurrent channel switch and supports retry', async () => {
  await isolated(async u => {
    await u.check();
    let started; const ready = new Promise(resolve => { started = resolve; });
    u.fetcher = fetcher({artifact: (_url, {signal}) => new Response(new ReadableStream({start(controller) {
      controller.enqueue(bytes.subarray(0, 5)); started();
      signal.addEventListener('abort', () => controller.error(signal.reason), {once: true});
    }}))});
    const pending = u.download('zip'); await ready;
    await assert.rejects(u.channel('beta'));
    u.cancel(); await pending;
    assert.match(u.state.error, /cancelled/); assert.deepEqual(await readdir(u.cache), []);
    u.fetcher = fetcher(); await u.download('zip'); assert.equal(u.state.status, 'ready');
  });
});
test('redirects cannot downgrade TLS or redirect to arbitrary hosts; HTTP errors are retryable', async () => {
  for (const location of ['http://github.com/update', 'https://evil.example/update', 'file:///tmp/update']) await assert.rejects(request('https://github.com/test', {fetcher: async () => new Response(null, {status: 302, headers: {location}})}), /Untrusted/);
  await assert.rejects(request('https://github.com/test', {fetcher: async () => new Response(null, {status: 503})}), /503/);
});
test('platform and architecture mismatch never downloads a different artifact', async () => {
  for (const platform of ['darwin', 'win32']) await isolated(async u => { await u.check(); await assert.rejects(u.download(platform === 'darwin' ? 'dmg' : 'exe'), /no download/); }, {platform});
  await isolated(async u => { await u.check(); await assert.rejects(u.download('zip'), /no download/); }, {arch: 'arm64'});
});
test('all release formats download the matching CPU; Windows ARM selects its available ZIP', async () => {
  const targets = [['darwin', ['dmg', 'zip']], ['win32', ['exe', 'zip']], ['linux', ['zip', 'deb', 'rpm']]];
  const assets = targets.flatMap(([platform, formats]) => ['x64', 'arm64'].flatMap(arch => formats.filter(format => !(platform === 'win32' && arch === 'arm64' && format === 'exe')).map(format => ({...manifest().assets[0], name: `Axiovela-0.2.1-${platform}-${arch}.${format}`, platform, arch, format}))));
  for (const [platform] of targets) for (const arch of ['x64', 'arm64']) {
    const expected = assets.filter(asset => asset.platform === platform && asset.arch === arch);
    for (const asset of expected) await isolated(async u => {
      let requested;
      u.fetcher = fetcher({signed: envelope(manifest({assets})), artifact: url => { requested = url; return new Response(bytes); }});
      await u.check();
      assert.deepEqual(u.state.formats, expected.map(a => a.format));
      assert.equal(u.state.format, expected[0].format);
      await u.download(asset.format);
      assert.equal(u.state.status, 'ready');
      assert.ok(requested.endsWith('/' + asset.name));
      assert.deepEqual(await readFile(u.downloaded), bytes);
    }, {platform, arch});
  }
});
test('publisher signs exact local artifacts with the pinned key and refuses replacement; no build or network required', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'axiovela-publish-test-'));
  try {
    for (const dir of ['scripts', 'desktop', 'server', 'staging']) await mkdir(path.join(root, dir));
    for (const file of ['scripts/publish-update.mjs', 'desktop/updates.cjs', 'server/atomic-file.cjs']) await cp(new URL(`../${file}`, import.meta.url), path.join(root, file));
    await writeFile(path.join(root, 'desktop/update-config.json'), JSON.stringify({repository: 'CashBowman/axiovela', publicKeys: keys}));
    await writeFile(path.join(root, 'package.json'), JSON.stringify({version: '0.2.1'}));
    const keyPath = path.join(root, 'private.pem');
    await writeFile(keyPath, privateKey.export({type: 'pkcs8', format: 'pem'}), {mode: 0o600});
    await writeFile(path.join(root, 'staging', manifest().assets[0].name), bytes);
    const spec = path.join(root, 'staging/release.json'); await writeFile(spec, JSON.stringify(manifest()));
    const args = [path.join(root, 'scripts/publish-update.mjs'), spec, keyPath];
    let result = spawnSync(process.execPath, args, {cwd: root, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    const signed = JSON.parse(await readFile(path.join(root, 'staging/axiovela-update.json'), 'utf8'));
    assert.deepEqual(validateManifest(signed, {keys, tag: 'v0.2.1'}).assets, manifest().assets);
    result = spawnSync(process.execPath, args, {cwd: root, encoding: 'utf8'});
    assert.notEqual(result.status, 0); assert.match(result.stderr, /EEXIST/);
    await writeFile(path.join(root, 'desktop/update-config.json'), JSON.stringify({repository: 'CashBowman/axiovela', publicKeys: []}));
    result = spawnSync(process.execPath, args, {cwd: root, encoding: 'utf8'});
    assert.notEqual(result.status, 0); assert.match(result.stderr, /Pin this release public key/);
  } finally { await rm(root, {recursive: true, force: true}); }
});


test('GitHub release discovery requests JSON while asset redirects request binary data', async () => {
  const seen = [];
  const fetcher = async (url, {headers}) => {
    seen.push({url, accept: headers.Accept});
    if (url.startsWith('https://api.github.com/')) {
      return headers.Accept === 'application/vnd.github+json' ? Response.json([]) : new Response('', {status: 415});
    }
    assert.equal(headers.Accept, 'application/octet-stream');
    if (url.startsWith('https://github.com/')) return new Response(null, {status: 302, headers: {location: 'https://release-assets.githubusercontent.com/fixture.zip'}});
    return new Response(bytes);
  };
  assert.deepEqual(await (await request('https://api.github.com/repos/CashBowman/axiovela/releases', {fetcher})).json(), []);
  assert.deepEqual(Buffer.from(await (await request('https://github.com/CashBowman/axiovela/releases/download/v0.2.1/fixture.zip', {fetcher})).arrayBuffer()), bytes);
  assert.deepEqual(seen.map(v => v.accept), ['application/vnd.github+json', 'application/octet-stream', 'application/octet-stream']);
});
