// Local, explicit release automation. No Actions dispatch, builds, services,
// automatic release publication, or private key upload.
import {readFile, writeFile, stat} from 'node:fs/promises';
import {createPrivateKey, createPublicKey, createHash, sign} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {validateManifest, assetUrl} = require('../desktop/updates.cjs');
const config = require('../desktop/update-config.json');
const pkg = require('../package.json');
const [specFile, keyFile, mode] = process.argv.slice(2);
if (!specFile || !keyFile || mode && mode !== '--upload-draft') throw new Error('Usage: node scripts/publish-update.mjs /absolute/staging/release.json /private/update-key.pem [--upload-draft]');
const spec = JSON.parse(await readFile(specFile, 'utf8'));
if (spec.version !== pkg.version || spec.tag !== `v${pkg.version}`) throw new Error('Release spec, source version and tag must match exactly.');
const key = createPrivateKey(await readFile(keyFile));
if (key.asymmetricKeyType !== 'ed25519') throw new Error('An Ed25519 release key is required.');
const publicKey = createPublicKey(key).export({type: 'spki', format: 'pem'}).toString();
if (!config.publicKeys.includes(publicKey)) throw new Error('Pin this release public key in desktop/update-config.json before building the bootstrap app. Never pin a private key.');
if (!Array.isArray(spec.assets) || !spec.assets.length) throw new Error('Specify reviewed release assets.');
const files = [];
const assets = [];
for (const asset of spec.assets) {
  assetUrl(spec.tag, asset.name);
  const file = path.resolve(path.dirname(specFile), asset.name);
  const info = await stat(file);
  if (!info.isFile() || info.size > 8 * 1024 ** 3) throw new Error('Not a supported release file.');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  assets.push({name: asset.name, platform: asset.platform, arch: asset.arch, format: asset.format, size: info.size, sha256: hash.digest('hex')});
  files.push(file);
}
const now = Date.now();
const manifest = {schema: 1, tag: spec.tag, version: spec.version, publishedAt: new Date(now).toISOString(), expiresAt: new Date(now + 30 * 86400000).toISOString(), dataCompatibility: spec.dataCompatibility, notes: spec.notes, assets};
const payload = JSON.stringify(manifest);
const envelope = {payload, signature: sign(null, Buffer.from(payload), key).toString('base64')};
validateManifest(envelope, {keys: config.publicKeys, tag: spec.tag});
const output = path.resolve(path.dirname(specFile), 'axiovela-update.json');
await writeFile(output, JSON.stringify(envelope, null, 2) + '\n', {flag: 'wx'});
if (mode === '--upload-draft') {
  const release = JSON.parse(execFileSync('gh', ['release', 'view', spec.tag, '--repo', config.repository, '--json', 'isDraft,isPrerelease'], {encoding: 'utf8'}));
  if (!release.isDraft || release.isPrerelease !== spec.version.includes('-')) throw new Error('Upload only to a draft with the correct prerelease setting. Metadata was generated locally.');
  // No --clobber: immutable artifact names catch accidental release replacement.
  execFileSync('gh', ['release', 'upload', spec.tag, ...files, output, '--repo', config.repository], {stdio: 'inherit'});
  console.log('Uploaded signed metadata and reviewed files to the existing draft. Review and publish the draft explicitly in GitHub.');
} else console.log(`Prepared ${output}. Upload it alongside the exact reviewed files to the matching GitHub release.`);
