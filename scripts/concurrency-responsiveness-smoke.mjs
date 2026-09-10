import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp, mkdir, rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const tmp = await mkdtemp(path.join(os.tmpdir(), 'axiovela-responsive-'));
const env = {...process.env};
for (const key of Object.keys(env)) if (/^(WORKBENCH_|OPENAI_|ANTHROPIC_|GEMINI_|GOOGLE_|AZURE_|NODE_OPTIONS$)/.test(key)) delete env[key];
Object.assign(env, {HOME: tmp, USERPROFILE: tmp, XDG_CONFIG_HOME: tmp, WORKBENCH_PORT: '8893', WORKBENCH_STATE_PATH: path.join(tmp, 'state.json'), WORKBENCH_PROVIDER_SETTINGS_PATH: path.join(tmp, 'providers.json'), WORKBENCH_CODEX_PATH: path.resolve('scripts/fixtures/assistant-rpc.mjs')});
const child = spawn(process.execPath, [process.argv[2] || 'server/index.mjs'], {env, stdio: ['ignore', 'pipe', 'pipe']});
let diagnostics = ''; child.stderr.on('data', x => { diagnostics += x; });
const base = 'http://127.0.0.1:8893';
const pause = ms => new Promise(r => setTimeout(r, ms));
const request = async (url, root, body, method = 'POST') => {
  const res = await fetch(base + url, {method: body ? method : 'GET', headers: {'content-type': 'application/json', ...(root ? {'x-axiovela-project': encodeURIComponent(root)} : {})}, ...(body ? {body: JSON.stringify(body)} : {}), signal: AbortSignal.timeout(2500)});
  return {status: res.status, data: await res.json()};
};
let releaseUpload, upload;
try {
  let ready = false;
  for (let i = 0; i < 60; i++) { try { if ((await request('/api/health')).status === 200) { ready = true; break; } } catch {} await pause(100); }
  assert.ok(ready, diagnostics);
  const first = (await request('/api/project/open', null, {path: path.join(tmp, 'one'), create: true})).data.root;
  const second = (await request('/api/project/open', null, {path: path.join(tmp, 'two'), create: true})).data.root;
  const body = {message: 'FIXTURE_HANG', permissionMode: 'ask', selection: {adapterId: 'codex', modelId: 'test-model', effort: 'low'}};
  const running = (await request('/api/assistant', first, body)).data;
  assert.equal(running.status, 'running');
  const encoder = new TextEncoder();
  upload = fetch(base + '/api/bibliography', {method: 'PUT', headers: {'content-type': 'application/json', 'x-axiovela-project': encodeURIComponent(first)}, duplex: 'half', body: new ReadableStream({start(controller) {
    controller.enqueue(encoder.encode('{"source":'));
    releaseUpload = () => { controller.enqueue(encoder.encode('""}')); controller.close(); };
  }})});
  await pause(200);
  assert.equal((await request(`/api/assistant/${running.id}`, first)).data.status, 'running', 'status is available during an incomplete upload');
  const writer = (await request('/api/assistant', first, {...body, role: 'writing'})).data;
  assert.equal(writer.status, 'running', 'a second assistant starts despite an unrelated file operation');
  assert.equal((await request('/api/project', second)).data.root, second, 'another project remains responsive');
  assert.equal((await request(`/api/assistant/${writer.id}/cancel`, first, {})).data.status, 'canceled', 'stop bypasses slow filesystem work');
  assert.equal((await request(`/api/assistant/${running.id}`, first)).data.status, 'running');
  releaseUpload(); releaseUpload = null; assert.equal((await upload).status, 200);
  const newChat = (await request('/api/assistant/conversations', first, {role: 'experiment'})).data.conversation;
  const collisions = await Promise.all([1, 2].map(() => request('/api/assistant', first, {...body, conversationId: newChat.id})));
  assert.deepEqual(collisions.map(r => r.status).sort(), [202, 409], 'simultaneous same-conversation admission stays exclusive');
  const pulse = (await request('/api/assistant', second, {...body, message: 'FIXTURE_HEARTBEAT'})).data;
  let observed;
  for (let i = 0; i < 20; i++) {
    observed = (await request(`/api/assistant/${pulse.id}`, second)).data;
    if (observed.events?.at(-1)?.label === 'Composing response' && Date.parse(observed.lastActivityAt) - Date.parse(observed.events.at(-1).at) > 200) break;
    await pause(100);
  }
  assert.ok(Date.parse(observed.lastActivityAt) - Date.parse(observed.events.at(-1).at) > 200, 'repeated provider deltas refresh liveness without duplicating timeline entries');
  console.log('Responsiveness smoke passed: held-open upload cannot block status, stop, another assistant, or another project; same-conversation admission remains atomic; repeated provider activity advances its timestamp.');
} finally {
  releaseUpload?.(); await upload?.catch(() => {});
  if (child.exitCode === null) { const closed = new Promise(resolve => child.once('close', resolve)); child.kill('SIGTERM'); await closed; }
  await rm(tmp, {recursive: true, force: true});
}
