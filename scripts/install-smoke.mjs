import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp, cp, mkdir, readFile, rm, access} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {stopProcess} from '../server/assistant-process.mjs';

const repo = fileURLToPath(new URL('..', import.meta.url));
const temporary = await mkdtemp(path.join(os.tmpdir(), 'axiovela-install-'));
const checkout = path.join(temporary, 'Checkout with spaces');
const prefix = path.join(temporary, 'commands');
const root = path.join(temporary, 'Research with spaces');
await mkdir(checkout);
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|^WORKBENCH_|^npm_config_|^npm_execpath$|^BASH_FUNC_)/i.test(key)));
Object.assign(env, {npm_config_prefix: prefix, WORKBENCH_STATE_PATH: path.join(temporary, 'state.json'), WORKBENCH_PROVIDER_SETTINGS_PATH: path.join(temporary, 'providers.json'), WORKBENCH_NO_OPEN: '1'});
const run = (args, options = {}) => new Promise((resolve, reject) => {
  const process = spawn(globalThis.process.execPath, args, {cwd: temporary, env, ...options, stdio: ['ignore', 'pipe', 'pipe']});
  let output = '';
  process.stdout.on('data', chunk => output = (output + chunk).slice(-16000));
  process.stderr.on('data', chunk => output = (output + chunk).slice(-16000));
  process.on('error', reject);
  process.on('close', code => resolve({code, output}));
});
let server, child;
try {
  for (const file of ['package.json', 'package-lock.json', 'index.html', 'bin', 'scripts', 'src', 'server', 'public', 'project-template']) await cp(path.join(repo, file), path.join(checkout, file), {recursive: true});
  const install = await run([path.join(checkout, 'scripts/install.mjs')]);
  assert.equal(install.code, 0, install.output);
  await access(path.join(prefix, process.platform === 'win32' ? 'axiovela.cmd' : 'bin/axiovela'));
  await access(path.join(prefix, process.platform === 'win32' ? 'methodflow.cmd' : 'bin/methodflow'));
  await access(path.join(prefix, process.platform === 'win32' ? 'ml-workbench.cmd' : 'bin/ml-workbench'));
  for (const alias of ['hypotera', 'methodflow', 'ml-workbench']) await access(path.join(prefix, process.platform === 'win32' ? alias + '.cmd' : 'bin/' + alias));
  const launcher = process.platform === 'win32' ? path.join(checkout, 'bin/ml-workbench.mjs') : path.join(prefix, 'bin/axiovela');
  assert.equal((await run([launcher, '--bad-flag'])).code, 2);
  assert.equal((await run([launcher, '--help'])).code, 0);
  // An unrelated local service must never receive a project activation request.
  let activations = 0;
  server = http.createServer((req, res) => { if (req.method === 'POST') activations++; res.writeHead(200, {'content-type': 'application/json'}); res.end(JSON.stringify({ok: true, service: 'unrelated-service'})); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  env.WORKBENCH_PORT = String(server.address().port);
  const occupied = await run([launcher, 'new', root, '--no-open']);
  assert.notEqual(occupied.code, 0, occupied.output);
  assert.equal(activations, 0);
  await new Promise(resolve => server.close(resolve));
  child = spawn(process.execPath, [launcher, 'new', root, '--no-open'], {cwd: temporary, env, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe']});
  let logs = '';
  child.stdout.on('data', chunk => logs += chunk); child.stderr.on('data', chunk => logs += chunk);
  const base = `http://127.0.0.1:${env.WORKBENCH_PORT}`;
  let health;
  for (let i = 0; i < 100; i++) {
    try { const response = await fetch(base + '/api/health'); if (response.ok) { health = await response.json(); break; } } catch {}
    if (child.exitCode !== null) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(health?.projectRoot, root, logs);
  const ui = await fetch(base);
  assert.equal(ui.status, 200);
  assert.match(await ui.text(), /Axiovela/);
  assert.match(await readFile(path.join(root, '.gitignore'), 'utf8'), /assistant/);
  assert.equal((await run([launcher, 'open', root, '--no-open'])).code, 0, 'reuse the running application');
  console.log('Installation smoke passed: clean dependency install, build, private-prefix command linking, paths with spaces, help/errors, occupied-port isolation, project creation, UI serving, and server reuse.');
} finally {
  if (child && child.exitCode === null) { stopProcess(child); await new Promise(resolve => child.once('close', resolve)); }
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  await rm(temporary, {recursive: true, force: true});
}
