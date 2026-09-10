import assert from 'node:assert/strict';
import {mkdtemp, mkdir, rm, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {_electron as electron} from 'playwright-core';
import electronBinary from 'electron';
const root = process.cwd();
const evidence = path.join(root, '.local/parallel-0.2.2'); await mkdir(evidence, {recursive: true});
const tmp = await mkdtemp(path.join(os.tmpdir(), 'axiovela-parallel-'));
const home = path.join(tmp, 'home'); await mkdir(home);
const env = {...process.env, APPDATA: path.join(home, 'AppData/Roaming'), LOCALAPPDATA: path.join(home, 'AppData/Local'), TECTONIC_CACHE_DIR: path.join(home, 'tectonic-cache'), HOME: home, USERPROFILE: home, AXIOVELA_DESKTOP_PROFILE: path.join(tmp, 'profile'), XDG_CONFIG_HOME: home, XDG_CACHE_HOME: home};
for (const directory of [env.APPDATA, env.LOCALAPPDATA, env.TECTONIC_CACHE_DIR]) await mkdir(directory, {recursive: true});
for (const key of Object.keys(env)) if (/^(WORKBENCH_|OPENAI_|ANTHROPIC_|GEMINI_|GOOGLE_|AZURE_|ELECTRON_RUN_AS_NODE$|NODE_OPTIONS$)/.test(key)) delete env[key];
await writeFile(path.join(tmp, 'codex.mjs'), (await readFile('scripts/fixtures/assistant-rpc.mjs', 'utf8')).replace('}, 140);', '}, 2200);'));
env.WORKBENCH_CODEX_PATH = path.join(tmp, 'codex.mjs');
let app, page;
const errors = [];
const first = path.join(tmp, 'dashboard_development_testing_α');
const second = path.join(tmp, 'dashboard_development_testing_2_β');
try {
  app = await electron.launch({executablePath: electronBinary, args: [root], env, chromiumSandbox: false});
  page = await app.firstWindow(); page.setDefaultTimeout(20000); page.on('pageerror', error => errors.push(error.message)); await page.waitForLoadState();
  await page.waitForFunction(() => document.querySelector('select[aria-label="Conversation"]')?.disabled === false);
  const api = (url, project, body) => page.evaluate(async ({url, project, body}) => {
    const response = await fetch(url, {method: body ? 'POST' : 'GET', headers: {'content-type': 'application/json', ...(project ? {'x-axiovela-project': encodeURIComponent(project)} : {})}, ...(body ? {body: JSON.stringify(body)} : {})});
    return {status: response.status, body: await response.json()};
  }, {url, project, body});
  const open = async project => {
    await page.getByRole('button', {name: 'Project', exact: true}).click();
    await page.getByRole('textbox', {name: 'Project folder'}).fill(project);
    await page.getByRole('button', {name: 'Open or create', exact: true}).click();
    await page.getByRole('dialog').waitFor({state: 'hidden'});
  };
  const send = async (role, message) => {
    await page.getByRole('textbox', {name: `${role} message`}).fill(message);
    const started = page.waitForResponse(response => new URL(response.url()).pathname === '/api/assistant' && response.request().method() === 'POST');
    await page.getByRole('button', {name: 'Send', exact: true}).click();
    assert.equal((await started).status(), 202, 'provider task is admitted before checking overlap');
    await page.getByRole('button', {name: 'Stop task'}).waitFor();
  };
  await open(first);
  await send('Experiment Chatbot', 'FIXTURE_HANG experiment-one');
  await page.getByRole('button', {name: 'Write-up', exact: true}).click();
  await send('Research Assistant', 'FIXTURE_HANG writing-one');
  let running = (await api('/api/assistant/activity')).body.jobs;
  assert.equal(running.length, 2, 'experiment and writing overlap');
  assert.deepEqual(new Set(running.map(r => r.role)), new Set(['experiment', 'writing']));
  const experimentJob = running.find(r => r.role === 'experiment');
  const duplicate = await api('/api/assistant', first, {message: 'Duplicate turn', role: 'experiment', conversationId: experimentJob.conversationId, permissionMode: 'ask'});
  assert.equal(duplicate.status, 409, 'same-conversation concurrent writes are rejected');
  await open(second);
  await send('Experiment Chatbot', 'FIXTURE_HANG experiment-two');
  running = (await api('/api/assistant/activity')).body.jobs;
  assert.equal(running.length, 3, 'three tasks overlap across two projects');
  assert.equal((await api(`/api/assistant/${experimentJob.id}`, second)).status, 404, 'wrong project cannot read a job');
  assert.equal((await api(`/api/assistant/${experimentJob.id}`, first)).body.status, 'running', 'hidden project still runs');
  await page.locator('.projectTabs').getByTitle(first, {exact: true}).click();
  await page.getByRole('button', {name: 'Write-up', exact: true}).click();
  await page.getByRole('button', {name: 'Stop task'}).click();
  await page.getByRole('button', {name: 'Stop task'}).waitFor({state: 'hidden'});
  running = (await api('/api/assistant/activity')).body.jobs;
  assert.equal(running.length, 2, 'stop affects only writing chat');
  assert.ok(running.every(r => r.role === 'experiment'));
  // A permanently delayed status response for one task must not prevent
  // another task from refreshing or dispatching its queued follow-up.
  await page.evaluate(id => {
    window.originalParallelFetch = window.fetch;
    window.delayedStatusCount = 0;
    window.fetch = (url, options) => {
      if (String(url) === `/api/assistant/${id}` && !options?.method) {
        window.delayedStatusCount++;
        return new Promise((resolve, reject) => {
          const abort = () => reject(new DOMException('Fixture delayed status', 'AbortError'));
          if (options?.signal?.aborted) abort(); else options?.signal?.addEventListener('abort', abort, {once: true});
        });
      }
      return window.originalParallelFetch(url, options);
    };
  }, experimentJob.id);
  await page.waitForFunction(() => window.delayedStatusCount > 0);
  // New conversations remain available while another conversation is busy.
  await page.getByRole('button', {name: 'Results', exact: true}).click();
  const previousConversation = await page.getByRole('combobox', {name: 'Conversation', exact: true}).inputValue();
  await page.getByRole('button', {name: 'New chat', exact: true}).click();
  await page.waitForFunction(previous => { const select = document.querySelector('select[aria-label="Conversation"]'); return select && !select.disabled && select.value !== previous; }, previousConversation);
  await send('Experiment Chatbot', 'First background chain turn');
  const composer = page.getByRole('textbox', {name: 'Experiment Chatbot message'});
  await composer.fill('Second background chain turn');
  await page.getByRole('button', {name: 'Queue message', exact: true}).click();
  await page.locator('.projectTabs').getByTitle(second, {exact: true}).click();
  const deadline = Date.now() + 12000;
  while (!(await api('/api/assistant?allConversations=1', first)).body.jobs.some(r => r.message === 'Second background chain turn' && r.status === 'complete')) {
    assert.ok(Date.now() < deadline, 'Hidden queued turn did not complete');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const chain = (await api('/api/assistant?allConversations=1', first)).body.jobs.filter(r => /background chain turn/.test(r.message));
  assert.equal(chain.length, 2, JSON.stringify((await api('/api/assistant?allConversations=1', first)).body.jobs.map(r => ({message:r.message, status:r.status, root:r.projectRoot, conversation:r.conversationId})))); assert.equal(chain[0].sessionId, chain[1].sessionId); assert.ok(chain.every(r => r.projectRoot === first));
  await page.evaluate(() => { window.fetch = window.originalParallelFetch; });
  // Reload reconnects to hidden work without relaunching it.
  await page.reload();
  await page.waitForFunction(() => document.querySelector('.parallelStatus')?.textContent.includes('2 tasks running'));
  assert.equal((await api('/api/assistant/activity')).body.jobs.length, 2);
  assert.equal(await page.locator('.projectBrand').innerText(), 'Axiovela');
  assert.equal(await page.locator('.topbar nav').evaluate(el => getComputedStyle(el).borderRadius), '0px');
  await page.setViewportSize({width: 1440, height: 900});
  await page.screenshot({path: path.join(evidence, 'parallel-header.png')});
  for (const r of (await api('/api/assistant/activity')).body.jobs) await api(`/api/assistant/${r.id}/cancel`, r.projectRoot, {});
  assert.deepEqual(errors, []);
  console.log('Parallel desktop smoke passed: three simultaneous tasks, two projects, independent stop, per-conversation exclusion, hidden queue dispatch/session continuity, scoped job reads, reload recovery, flat header C.');
} catch (error) {
  await page?.screenshot({path: path.join(evidence, 'parallel-failure.png')}).catch(() => {});
  await writeFile(path.join(evidence, 'parallel-failure.txt'), JSON.stringify({error: error.stack, pageErrors: errors, body: await page?.locator('body').innerText().catch(() => '')}, null, 2));
  console.error(await readFile(path.join(evidence, 'parallel-failure.txt'), 'utf8'));
  throw error;
} finally { await app?.evaluate(({dialog}) => { dialog.showMessageBox = async () => ({response: 1}); }).catch(() => {}); await app?.close(); await rm(tmp, {recursive: true, force: true}); }
