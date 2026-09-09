#!/usr/bin/env node
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {homedir, platform} from 'node:os';
import path from 'node:path';
import {localServerConfig} from '../server/local-server-config.mjs';

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const rawArgs = process.argv.slice(2);
const noOpen = rawArgs.includes('--no-open') || process.env.WORKBENCH_NO_OPEN === '1';
const args = rawArgs.filter(argument => argument !== '--no-open');
const command = ['new', 'open'].includes(args[0]) ? args.shift() : 'open';
let url;
try { ({url} = localServerConfig()); }
catch (error) { console.error(error.message); process.exit(2); }

function help() {
  process.stdout.write(`Axiovela\n\nUsage:\n  axiovela                         Open the last project or the project chooser\n  axiovela /path/to/project        Open an existing research project\n  axiovela open /path/to/project   Open an existing research project\n  axiovela new /path/to/project    Create and open a Git-initialized project\n\nOptions:\n  --no-open                          Start without opening a browser\n\nThe command can be run from any directory after installation.\nThe legacy ml-workbench command remains available.\n`);
}

if (args.includes('--help') || args.includes('-h')) {
  help();
  process.exit(0);
}
if (args.some(argument => argument.startsWith('-'))) {
  process.stderr.write('Unknown option. Run axiovela --help for usage.\n');
  process.exit(2);
}
if (args.length > 1) {
  help();
  process.exitCode = 2;
  process.exit();
}

function resolveProject(input) {
  if (!input) return null;
  const expanded = input.replace(/^~(?=$|[\\/])/, homedir());
  return path.resolve(process.cwd(), expanded);
}

const requestedRoot = resolveProject(args[0]);
if (command === 'new' && !requestedRoot) {
  process.stderr.write('axiovela new requires a project path.\n');
  process.exit(2);
}
if (command === 'open' && requestedRoot) {
  try {
    if (!(await stat(requestedRoot)).isDirectory()) throw new Error('not a directory');
  } catch {
    process.stderr.write(`Project directory does not exist: ${requestedRoot}\nUse "axiovela new ${JSON.stringify(requestedRoot)}" to create it.\n`);
    process.exit(2);
  }
}
if (!existsSync(path.join(repoRoot, 'dist', 'index.html'))) {
  process.stderr.write(`The UI has not been built. Run "npm run build" in ${repoRoot}, then try again.\n`);
  process.exit(2);
}

async function health() {
  try {
    const response = await fetch(`${url}/api/health`, {signal: AbortSignal.timeout(700)});
    if (!response.ok) return false;
    const payload = await response.json();
    return payload.ok === true && payload.service === 'ml-theory-workbench-local-backend';
  } catch { return false; }
}

async function activateExistingServer() {
  if (!requestedRoot) return;
  const response = await fetch(`${url}/api/project/open`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({path: requestedRoot, create: command === 'new', initializeGit: command === 'new'}),
    signal: AbortSignal.timeout(30000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || `The running workbench returned ${response.status}`);
}

function openBrowser() {
  if (noOpen) return;
  const target = platform() === 'win32'
    ? ['cmd.exe', ['/c', 'start', '', url]]
    : platform() === 'darwin'
      ? ['open', [url]]
      : ['xdg-open', [url]];
  const opener = spawn(target[0], target[1], {detached: true, stdio: 'ignore'});
  opener.on('error', () => process.stderr.write(`Could not open a browser. Open ${url} manually.\n`));
  opener.unref();
}

if (await health()) {
  try {
    await activateExistingServer();
    openBrowser();
    process.stdout.write(`Axiovela is ready at ${url}${requestedRoot ? `\nProject: ${requestedRoot}` : ''}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
  process.exit();
}

const child = spawn(process.execPath, [path.join(repoRoot, 'server', 'index.mjs')], {
  cwd: repoRoot,
  env: {
    ...process.env,
    ...(requestedRoot ? {WORKBENCH_PROJECT_ROOT: requestedRoot} : {}),
    ...(command === 'new' ? {WORKBENCH_INITIALIZE_GIT: '1'} : {}),
  },
  stdio: 'inherit',
});
const childExit = new Promise(resolve => {
  child.once('error', error => { console.error(`Could not start Axiovela: ${error.message}`); resolve(1); });
  child.once('exit', code => resolve(code ?? 0));
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));

let ready = false;
for (let attempt = 0; attempt < 80; attempt += 1) {
  await new Promise(resolve => setTimeout(resolve, 125));
  if (await health()) { ready = true; break; }
  if (child.exitCode !== null) break;
}
if (!ready) {
  if (child.exitCode === null) child.kill('SIGTERM');
  process.stderr.write(`Axiovela did not become ready at ${url}.\n`);
  process.exit(1);
}

openBrowser();
process.stdout.write(`Axiovela is ready at ${url}${requestedRoot ? `\nProject: ${requestedRoot}` : ''}\nPress Ctrl+C to stop it.\n`);
const exitCode = await childExit;
process.exit(exitCode);
