#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {existsSync} from 'node:fs';

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const withLatex = process.argv.includes('--latex');
const [major, minor] = process.versions.node.split('.').map(Number);

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Usage: node scripts/install.mjs [--latex]\n\nInstalls Axiovela and its command. --latex also installs the optional PDF engine and requires Conda.');
  process.exit(0);
}

const unknownArgs = process.argv.slice(2).filter(argument => argument !== '--latex');
if (unknownArgs.length) {
  console.error(`Unknown option: ${unknownArgs[0]}\nRun with --help for usage.`);
  process.exit(2);
}

if (major !== 22 || minor < 12) {
  console.error(`Axiovela requires Node 22.12 or newer within Node 22. Found ${process.version}.`);
  process.exit(1);
}

function run(args, label) {
  console.log(`\n${label}…`);
  // npm.cmd cannot be spawned directly on Windows. Run npm's JS entry point
  // with Node so neither checkout paths nor arguments become shell source.
  const npmCli = [process.env.npm_execpath, path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')].find(candidate => candidate && path.basename(candidate) === 'npm-cli.js' && existsSync(candidate));
  if (process.platform === 'win32' && !npmCli) {
    console.error('Cannot find npm beside Node. Reinstall Node 22 with npm, or run npm.cmd run setup.');
    process.exit(1);
  }
  const result = spawnSync(process.platform === 'win32' ? process.execPath : npm, process.platform === 'win32' ? [npmCli, ...args] : args, {cwd: repoRoot, stdio: 'inherit'});
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(['ci', '--no-audit', '--no-fund'], 'Installing locked dependencies');
run(['run', 'build'], 'Building Axiovela');
if (withLatex) run(['run', 'setup:latex'], 'Installing the optional LaTeX engine');
run(['link', '--no-audit', '--no-fund'], 'Adding the axiovela command');

console.log('\nAxiovela is installed. Run `axiovela` from any directory.');
if (!withLatex) console.log('For PDF rendering, rerun `node scripts/install.mjs --latex` from this checkout.');
console.log('For optional Pi + Herdr Agentic mode, see docs/quick-start.md#agentic-mode-optional.');
