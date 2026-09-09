import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {mkdtemp, mkdir, readFile, writeFile, rm, symlink} from 'node:fs/promises';
import net from 'node:net';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {projectFile} from '../server/assistant-api.mjs';
import {localServerConfig} from '../server/local-server-config.mjs';

const repo = fileURLToPath(new URL('..', import.meta.url));
const temporary = await mkdtemp(path.join(os.tmpdir(), 'axiovela-security-'));
const root = path.join(temporary, 'study');
await mkdir(root);
const reservation = net.createServer();
await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const base = `http://127.0.0.1:${port}`;
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|^WORKBENCH_)/i.test(key)));
Object.assign(env, {WORKBENCH_PROJECT_ROOT: root, WORKBENCH_PORT: String(port), WORKBENCH_STATE_PATH: path.join(temporary, 'state.json'), WORKBENCH_PROVIDER_SETTINGS_PATH: path.join(temporary, 'providers.json')});
const child = spawn(process.execPath, ['server/index.mjs'], {cwd: repo, env, stdio: ['ignore', 'pipe', 'pipe']});
let logs = '';
child.stdout.on('data', chunk => logs += chunk);
child.stderr.on('data', chunk => logs += chunk);
const request = (route, body, headers = {}) => fetch(base + route, {method: 'POST', headers: {'content-type': 'application/json', ...headers}, body: JSON.stringify(body)});
const rawRequest = (headers, requestPath = '/api/health') => new Promise((resolve, reject) => {
  const req = http.get(base, {path: requestPath, headers}, response => { response.resume(); resolve(response.statusCode); });
  req.on('error', reject);
});
try {
  assert.throws(() => localServerConfig({WORKBENCH_HOST: '0.0.0.0'}), /loopback/);
  assert.throws(() => localServerConfig({WORKBENCH_PORT: 'invalid'}), /integer/);
  assert.equal(localServerConfig({WORKBENCH_HOST: '::1'}).url, 'http://[::1]:8787');
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base + '/api/health')).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(child.exitCode, null, logs);
  assert.equal((await (await fetch(base + '/api/health')).json()).projectRoot, root);
  assert.equal(await rawRequest({host: `attacker.invalid:${port}`}), 403, 'reject DNS rebinding hosts');
  assert.equal((await fetch(base + '/api/project', {headers: {origin: 'https://attacker.invalid'}})).status, 403, 'reject foreign read origins');
  assert.equal((await fetch(base + '/api/health', {headers: {origin: base}})).status, 200);
  assert.equal((await fetch(base + '/api/health', {headers: {origin: 'null'}})).status, 403);
  assert.equal((await request('/api/project/open', {path: root}, {'content-type': 'text/plain'})).status, 415, 'reject browser simple-request content types');
  assert.equal((await request('/api/project/open', {path: root}, {'sec-fetch-site': 'cross-site'})).status, 403);
  assert.equal((await request('/api/project/open', null)).status, 400);
  assert.equal((await request('/api/project/open', [])).status, 400);
  assert.equal((await request('/api/project/open', {payload: 'x'.repeat(16 * 1024 * 1024)})).status, 413, 'oversized bodies return a usable HTTP error');
  assert.equal((await fetch(base + '/api/assistant/connections/constructor', {method: 'PUT', headers: {'content-type': 'application/json'}, body: '{}'})).status, 400, 'prototype properties are not providers');
  assert.equal((await fetch(base + '/api/health')).status, 200, 'invalid requests do not stop the server');
  for (const name of ['.pi/agent/auth.json', '.npmrc', '.env.local', 'providers.json', '.git/config']) {
    await assert.rejects(projectFile(root, name, true), /credentials/);
  }
  const ignore = await readFile(path.join(root, '.gitignore'), 'utf8');
  assert.match(ignore, /assistant/);
  execFileSync('git', ['init', root], {stdio: 'ignore'});
  for (const name of ['assistant/sessions/private.json', '.env', '.pi/agent/auth.json', 'providers.json']) {
    assert.equal(execFileSync('git', ['-C', root, 'check-ignore', name], {encoding: 'utf8'}).trim(), name);
  }
  if (process.platform !== 'win32') {
    const outside = path.join(temporary, 'outside.bib');
    await writeFile(outside, 'outside sentinel');
    await rm(path.join(root, 'references.bib'));
    await symlink(outside, path.join(root, 'references.bib'));
    const response = await fetch(base + '/api/bibliography', {method: 'PUT', headers: {'content-type': 'application/json'}, body: JSON.stringify({source: ''})});
    assert.equal(response.status, 400, 'bibliography cannot write through symlinks');
    assert.equal(await readFile(outside, 'utf8'), 'outside sentinel');
    await rm(path.join(root, 'references.bib'));
    await writeFile(path.join(root, 'references.bib'), '');
    const hostile = path.join(temporary, 'hostile');
    await mkdir(hostile);
    await symlink(temporary, path.join(hostile, 'writeups'));
    assert.equal((await request('/api/project/open', {path: hostile})).status, 400, 'reject symlink scaffolds before populating them');
    assert.equal((await (await fetch(base + '/api/health')).json()).projectRoot, root);
  }
  const approval = await (await request('/api/git/preview', {})).json();
  const other = path.join(temporary, 'other');
  assert.equal((await request('/api/project/open', {path: other, create: true})).status, 200);
  assert.equal((await request('/api/git/push', {approvalToken: approval.approvalToken})).status, 403, 'push approval is scoped to the previewed project');
  console.log('Security smoke passed: host/origin checks, JSON boundaries, credential exclusions, private project defaults, symlink rejection, and project-scoped Git approval.');
} finally {
  child.kill('SIGTERM');
  if (child.exitCode === null) await new Promise(resolve => child.once('close', resolve));
  await rm(temporary, {recursive: true, force: true});
}
