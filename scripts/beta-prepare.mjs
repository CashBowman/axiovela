import {spawnSync} from 'node:child_process';
import {mkdirSync, readFileSync, writeFileSync, openSync, closeSync} from 'node:fs';
import path from 'node:path';

// Native-only: never label a cross-compiled artifact as locally tested.
const root = path.resolve(import.meta.dirname, '..');
process.chdir(root);
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const dryRun = process.argv.includes('--dry-run');
if (!['darwin', 'win32', 'linux'].includes(process.platform)) throw new Error('Unsupported desktop platform');
if (!['arm64', 'x64'].includes(process.arch) || (process.platform !== 'darwin' && process.arch !== 'x64')) throw new Error('Use Apple Silicon/Intel macOS, or x64 Windows/Linux');
const [major, minor] = process.versions.node.split('.').map(Number);
if (major !== 22 || minor < 12) throw new Error('Use Node 22.12 or newer within Node 22');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const steps = ['desktop:test', 'release:check', 'install:smoke', process.argv.includes('--portable') ? 'desktop:make:portable' : 'desktop:make', 'desktop:smoke', 'desktop:recovery:smoke'].map(name => ({name, command: npm, args: ['run', name, ...(name === 'desktop:smoke' ? ['--', '--packaged'] : [])]}));
if (process.platform === 'darwin') steps.push({name: 'installed-dmg', command: process.execPath, args: ['scripts/desktop-dmg-smoke.mjs']});
const directory = path.join(root, '.local', 'beta-validation', `${version}-${process.platform}-${process.arch}-${Date.now()}`);
if (!dryRun) mkdirSync(directory, {recursive: true});
const report = {version, platform: process.platform, architecture: process.arch, node: process.version, automatedChecksPassed: false, manualInstallation: 'NOT TESTED', distributionApproval: 'NOT ESTABLISHED', steps: []};
for (const step of steps) {
  console.log(`${dryRun ? '[preview] ' : ''}${step.command} ${step.args.join(' ')}`);
  if (dryRun) continue;
  const log = path.join(directory, `${step.name.replaceAll(':', '-')}.log`);
  console.log(`Log: ${log}`);
  const fd = openSync(log, 'w');
  const result = spawnSync(step.command, step.args, {stdio: ['ignore', fd, fd], shell: process.platform === 'win32' && step.command === npm, env: {...process.env, AXIOVELA_TEST_LATEX: '1'}});
  closeSync(fd);
  report.steps.push({name: step.name, status: result.status, error: result.error?.message, log: path.basename(log)});
  writeFileSync(path.join(directory, 'RESULTS.json'), JSON.stringify(report, null, 2) + '\n');
  if (result.status !== 0 || result.error) {
    console.error(`Stopped at ${step.name}. Read ${log}. Do not distribute this candidate as validated.`);
    process.exit(1);
  }
}
if (!dryRun) {
  report.automatedChecksPassed = true;
  writeFileSync(path.join(directory, 'RESULTS.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`Native candidate and checksums: ${path.join(root, 'out/make')}\nResults: ${directory}\nNext: follow docs/releases/0.2.0.md for downloaded-file installation acceptance. On Mac, automatic-trust distribution additionally requires npm run desktop:verify:mac.`);
}
