// Release inputs are pinned to upstream Tectonic 0.17.0 assets and SHA-256 digests.
// Download on the build host, never during application startup.
import {createHash} from 'node:crypto';
import {mkdir, mkdtemp, writeFile, chmod, rm, copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import extract from 'extract-zip';
const targets = {
  'darwin-arm64': ['aarch64-apple-darwin.tar.gz', 'a3f1cac7c5678f01661a92212f58480ae3b0634115d880dbc59e2953ded45667'],
  'darwin-x64': ['x86_64-apple-darwin.tar.gz', '7c90ef5b6ddb1eb1937e4337add5237b79338e4b9676459fa91187d24d6cdf80'],
  // Windows on ARM runs the reviewed x64 Tectonic engine through OS emulation.
  'win32-arm64': ['x86_64-pc-windows-msvc.zip', 'f61ce51f0b0ade1015b7de7ef368541c5424e9756ecbd0d7af97d6d48030845f'],
  'win32-x64': ['x86_64-pc-windows-msvc.zip', 'f61ce51f0b0ade1015b7de7ef368541c5424e9756ecbd0d7af97d6d48030845f'],
  'linux-x64': ['x86_64-unknown-linux-musl.tar.gz', '8533d07f9ccbd7a65824b9e0459041bca34af1eb33daba48f59215593753a3b7'],
  'linux-arm64': ['aarch64-unknown-linux-musl.tar.gz', 'b10954a95404f3ab2328d2fa59a5ebab8e657f893fab096f98be8db7c0c979b8'],
};
const target = targets[`${process.platform}-${process.arch}`];
if (!target) throw new Error('No reviewed Tectonic binary for this build target.');
const directory = path.resolve('desktop/tools');
const filename = process.platform === 'win32' ? 'tectonic.exe' : 'tectonic';
const temporary = await mkdtemp(path.join(tmpdir(), 'axiovela-tools-'));
try {
  const url = `https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%400.17.0/tectonic-0.17.0-${target[0]}`;
  console.log(`Preparing Tectonic 0.17.0 for ${process.platform}-${process.arch}…`);
  const response = await fetch(url, {signal: AbortSignal.timeout(120000)});
  if (!response.ok) throw new Error(`Tectonic download failed (${response.status}).`);
  const archive = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(archive).digest('hex') !== target[1]) throw new Error('Tectonic archive checksum mismatch.');
  const archivePath = path.join(temporary, target[0]);
  await writeFile(archivePath, archive);
  if (process.platform === 'win32') await extract(archivePath, {dir: temporary});
  else execFileSync('tar', ['-xzf', archivePath, '-C', temporary, filename]);
  const binary = path.join(temporary, filename);
  await chmod(binary, 0o755);
  const version = execFileSync(binary, ['--version'], {timeout: 15000, encoding: 'utf8'}).trim();
  if (!version.includes('0.17.0')) throw new Error(`Unexpected engine: ${version}`);
  await rm(directory, {recursive: true, force: true});
  await mkdir(directory, {recursive: true});
  await copyFile(binary, path.join(directory, filename));
  await chmod(path.join(directory, filename), 0o755);
  await writeFile(path.join(directory, 'build.json'), JSON.stringify({version, target: `${process.platform}-${process.arch}`, url, sha256: target[1]}, null, 2) + '\n');
  console.log(`${version} verified and bundled.`);
} finally { await rm(temporary, {recursive: true, force: true}); }
