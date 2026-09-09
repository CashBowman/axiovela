import {mkdtemp, mkdir, rm, readdir, lstat, realpath, readFile, writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {copyDesktopBundle} from './desktop-bundle.mjs';
import {inspectMacTrust, inspectMacContainer} from './mac-trust-report.mjs';
import {assertMacDistribution, assertTamperRejected} from './mac-release-gate.mjs';
import macConfig from './mac-release-config.cjs';

if (process.platform !== 'darwin') throw new Error('DMG smoke requires macOS');
const version = JSON.parse(await readFile('package.json', 'utf8')).version;
const distributionRequired = process.argv.includes('--distribution') || macConfig.macReleaseSettings().notarize;
const dmg = path.resolve(`out/make/Axiovela-${version}-darwin-${process.arch}.dmg`);
const temporary = await mkdtemp(path.join(os.tmpdir(), 'axiovela-dmg-smoke-'));
const mount = path.join(temporary, 'volume');
const installed = path.join(temporary, 'Applications');
let mounted = false;
try {
  await mkdir(mount);
  await mkdir(installed);
  execFileSync('hdiutil', ['verify', dmg], {stdio: 'inherit'});
  execFileSync('hdiutil', ['attach', dmg, '-readonly', '-nobrowse', '-mountpoint', mount], {stdio: 'inherit'});
  mounted = true;
  // Preserve macOS metadata as a Finder installation does. Node's cp drops
  // FinderInfo/resource forks and could hide an invalid seal in the real DMG.
  execFileSync('ditto', [path.join(mount, 'Axiovela.app'), path.join(installed, 'Axiovela.app')], {stdio: 'inherit'});
  execFileSync('hdiutil', ['detach', mount], {stdio: 'inherit'});
  mounted = false;
  // A build-host reference must fail rather than silently using the source app.
  await rm(path.resolve(`out/Axiovela-darwin-${process.arch}`), {recursive: true, force: true});
  const bundle = await realpath(path.join(installed, 'Axiovela.app'));
  const sharpDirectory = path.join(bundle, `Contents/Resources/app/node_modules/@img/sharp-darwin-${process.arch}/lib`);
  const sharpBinary = path.join(sharpDirectory, (await readdir(sharpDirectory)).find(name => name.endsWith('.node')));
  const loadCommands = execFileSync('otool', ['-l', sharpBinary], {encoding: 'utf8'});
  for (const [, entry] of loadCommands.matchAll(/cmd LC_RPATH\s+cmdsize \d+\s+path (.+) \(offset \d+\)/g)) {
    if (!entry.startsWith('@loader_path/')) throw new Error(`Unexpected packaged Sharp RPATH: ${entry}`);
    const target = await realpath(path.resolve(sharpDirectory, entry.slice('@loader_path/'.length)));
    if (!target.startsWith(bundle + path.sep)) throw new Error('Native library search path escapes bundle');
  }
  const report = inspectMacTrust(bundle);
  // A second, disposable copy exercises explicit policy assessment with
  // download quarantine. The launch smoke below is execution testing only.
  const quarantined = path.join(temporary, 'Downloaded/Axiovela.app');
  await copyDesktopBundle(bundle, quarantined);
  execFileSync('xattr', ['-w', 'com.apple.quarantine', `0083;${Math.floor(Date.now() / 1000).toString(16)};AxiovelaCI;`, quarantined]);
  report.quarantined = inspectMacTrust(quarantined);
  report.os = execFileSync('sw_vers', ['-productVersion'], {encoding: 'utf8'}).trim();
  report.architecture = process.arch;
  if (distributionRequired) report.container = inspectMacContainer(dmg);
  report.automatedDistributionPassed = false;
  await writeFile(`out/make/MAC-TRUST-${process.arch}.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  if (report.signature.status !== 0) throw new Error('Installed DMG code signature is invalid');
  if (report.quarantined.signature.status !== 0) throw new Error('Downloaded copy signature is invalid');
  if (distributionRequired) assertMacDistribution(report);
  for (const relative of await readdir(bundle, {recursive: true})) {
    const file = path.join(bundle, relative);
    if ((await lstat(file)).isSymbolicLink()) {
      const resolved = await realpath(file);
      if (!resolved.startsWith(bundle + path.sep)) throw new Error(`Bundle link escapes installed app: ${relative}`);
    }
  }
  execFileSync(process.execPath, ['scripts/desktop-smoke.mjs', '--packaged'], {
    stdio: 'inherit', env: {...process.env, AXIOVELA_TEST_INSTALLED_ROOT: installed},
  });
  execFileSync(process.execPath, ['scripts/desktop-recovery-smoke.mjs'], {
    stdio: 'inherit', env: {...process.env, AXIOVELA_TEST_INSTALLED_ROOT: installed},
  });
  // Normal use must not invalidate the bundle, and an actual resource change
  // must be detected by the integrity gate (the copy is disposable).
  execFileSync('codesign', ['--verify', '--deep', '--strict', bundle], {stdio: 'inherit'});
  await writeFile(path.join(bundle, 'Contents/Resources/app/BETA_NOTICE.md'), 'tamper fixture');
  const tampered = inspectMacTrust(bundle);
  assertTamperRejected(tampered.signature);
  report.automatedDistributionPassed = distributionRequired;
  await writeFile(`out/make/MAC-TRUST-${process.arch}.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(distributionRequired ? 'Mac automated distribution checks passed; real-machine Finder acceptance remains required.' : 'Mac integrity/execution checks passed. Distribution approval was NOT requested or granted.');
} finally {
  try { if (mounted) { execFileSync('hdiutil', ['detach', mount], {stdio: 'inherit'}); mounted = false; } }
  finally { if (!mounted) await rm(temporary, {recursive: true, force: true}); }
}
