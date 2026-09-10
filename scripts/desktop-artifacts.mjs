import {readdir, mkdir, mkdtemp, cp, symlink, rm, readFile, writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import {copyDesktopBundle} from './desktop-bundle.mjs';
import {finalizeMacDmg} from './mac-finalize.mjs';
const root = process.cwd();
const version = JSON.parse(await readFile('package.json', 'utf8')).version;
// Apple's own hdiutil avoids a separate disk-image dependency chain.
if (process.platform === 'darwin') {
  await mkdir(path.join(root, 'out/make'), {recursive: true});
  // Synced build folders can attach FinderInfo to staged bundles after signing.
  // Stage outside the checkout so the DMG cannot inherit that unsigned metadata.
  const stage = await mkdtemp(path.join(os.tmpdir(), 'axiovela-dmg-stage-'));
  const dmg = path.join(root, `out/make/Axiovela-${version}-darwin-${process.arch}.dmg`);
  try {
    await copyDesktopBundle(path.join(root, `out/Axiovela-darwin-${process.arch}/Axiovela.app`), path.join(stage, 'Axiovela.app'));
    execFileSync('codesign', ['--verify', '--deep', '--strict', path.join(stage, 'Axiovela.app')], {stdio: 'inherit'});
    await symlink('/Applications', path.join(stage, 'Applications'));
    execFileSync('hdiutil', ['create', '-volname', 'Axiovela', '-srcfolder', stage, '-ov', '-format', 'UDZO', dmg], {stdio: 'inherit'});
    await finalizeMacDmg(dmg);
  } finally { await rm(stage, {recursive: true, force: true}); }
}
const directory = path.join(root, 'out/make');
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
await writeFile(path.join(directory, `BUILD-INFO-${process.platform}-${process.arch}.json`), JSON.stringify({version, sourceCommit, platform: process.platform, architecture: process.arch, node: process.version, builtAt: new Date().toISOString(), workflowRun: process.env.GITHUB_RUN_ID || null, tests: 'See the matching GitHub workflow run and release validation record; packaging alone is not a test result.'}, null, 2) + '\n');
// Put tester-facing instructions beside every platform's installer artifacts.
await cp(path.join(root, 'BETA_NOTICE.md'), path.join(directory, 'BETA_NOTICE.txt'));
await cp(path.join(root, 'LICENSE'), path.join(directory, 'LICENSE.txt'));
await cp(path.join(root, 'desktop/tool-setup.txt'), path.join(directory, 'OPTIONAL-TOOLS.txt'));
await cp(path.join(root, 'docs/release-start-here.txt'), path.join(directory, 'START-HERE.txt'));
await cp(path.join(root, 'docs/beta-feedback.txt'), path.join(directory, 'BETA-FEEDBACK.txt'));
if (process.platform === 'darwin' && process.arch === 'arm64') {
  await cp(path.join(root, 'docs/mac-beta-start-here.txt'), path.join(directory, 'START-HERE-APPLE-SILICON.txt'));
}
if (process.platform === 'darwin') {
  await cp(path.join(root, 'docs/mac-installation.md'), path.join(directory, 'README-MAC.md'));
}
const files = (await readdir(directory, {recursive: true})).filter(file => /\.(zip|deb|rpm|exe|nupkg|dmg)$/.test(file)).sort();
const lines = [];
for (const file of files) lines.push(`${createHash('sha256').update(await readFile(path.join(directory, file))).digest('hex')}  ${file.replaceAll('\\', '/')}`);
await writeFile(path.join(directory, `SHA256SUMS-${process.platform}-${process.arch}.txt`), `${lines.join('\n')}\n`);
console.log(`Prepared checksums for ${files.length} desktop downloads.`);
