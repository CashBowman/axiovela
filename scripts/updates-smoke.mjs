import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {_electron as electron} from 'playwright-core';
import electronBinary from 'electron';
const root = process.cwd();
const temporary = await mkdtemp(path.join(os.tmpdir(), 'axiovela-updates-ui-'));
const home = path.join(temporary, 'home'), profile = path.join(temporary, 'MethodFlow');
const env = {...process.env, HOME: home, USERPROFILE: home, APPDATA: path.join(home, 'AppData/Roaming'), LOCALAPPDATA: path.join(home, 'AppData/Local'), XDG_CONFIG_HOME: path.join(home, '.config'), XDG_CACHE_HOME: path.join(home, '.cache'), TECTONIC_CACHE_DIR: path.join(home, 'tectonic-cache'), PATH: '', CI: '1'};
for (const key of Object.keys(env)) if (/^(WORKBENCH_|AXIOVELA_|HYPOTERA_|METHODFLOW_|OPENAI_|ANTHROPIC_|GEMINI_|GOOGLE_|AZURE_|NODE_OPTIONS$|NODE_PATH$|ELECTRON_RUN_AS_NODE$)/.test(key)) delete env[key];
env.AXIOVELA_DESKTOP_PROFILE = profile;
for (const directory of [home, profile, env.APPDATA, env.LOCALAPPDATA, env.XDG_CONFIG_HOME, env.XDG_CACHE_HOME, env.TECTONIC_CACHE_DIR]) await mkdir(directory, {recursive: true});
const fixture = path.join(temporary, 'codex.mjs');
await writeFile(fixture, await readFile('scripts/fixtures/assistant-rpc.mjs'));
env.WORKBENCH_CODEX_PATH = fixture;
const packaged = process.argv.includes('--packaged');
const executablePath = packaged ? path.join(root, `out/Axiovela-${process.platform}-${process.arch}`, process.platform === 'darwin' ? 'Axiovela.app/Contents/MacOS/axiovela' : process.platform === 'win32' ? 'axiovela.exe' : 'axiovela') : electronBinary;
let application;
const deadline = setTimeout(() => { application?.process().kill('SIGKILL'); process.exit(1); }, 120000);
try {
  application = await electron.launch({executablePath, args: packaged ? [] : [root], env, chromiumSandbox: true});
  const page = await application.firstWindow(); page.setDefaultTimeout(15000);
  page.on('dialog', dialog => { void dialog.dismiss().catch(() => {}); });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.getByRole('button', {name: 'Project', exact: true}).click();
  await page.getByRole('textbox', {name: 'Project folder'}).fill(path.join(temporary, 'study'));
  await page.getByRole('button', {name: 'Open or create', exact: true}).click();
  await page.getByRole('dialog').waitFor({state: 'hidden'});
  const composer = page.getByRole('textbox', {name: 'Experiment Chatbot message'});
  await composer.fill('FIXTURE_HANG'); await page.getByRole('button', {name: 'Send', exact: true}).click();
  await page.getByRole('button', {name: 'Stop task'}).waitFor();
  console.log('Update UI: fixture task active');
  await composer.fill('Keep this unsent message');
  await page.getByRole('button', {name: 'Write-up', exact: true}).click();
  const editor = page.getByRole('textbox', {name: 'Write-up source'});
  await editor.fill('# Unsaved update test\nKeep this manuscript');
  // Inject a signed, offline provider through the test debugger, never a
  // production IPC endpoint or environment trust override.
  await application.evaluate(({app, Menu}) => {
    const {createRequire} = process.getBuiltinModule('node:module');
    const require = createRequire(process.getBuiltinModule('node:path').join(app.getAppPath(), 'package.json'));
    const {Updates} = require('./desktop/updates.cjs');
    const {generateKeyPairSync, createHash, sign} = process.getBuiltinModule('node:crypto');
    const pair = generateKeyPairSync('ed25519');
    const bytes = Buffer.from('verified UI download fixture');
    const parts = app.getVersion().split('-')[0].split('.').map(Number);
    const nextVersion = `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
    const format = process.platform === 'darwin' ? 'dmg' : process.platform === 'win32' ? 'exe' : 'zip';
    const manifest = {schema: 1, tag: `v${nextVersion}`, version: nextVersion, publishedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(), dataCompatibility: '0.2.0', notes: 'A concise, signed release note.', assets: [{name: `Axiovela-${nextVersion}.${format}`, platform: process.platform, arch: process.arch, format, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')}]};
    const payload = JSON.stringify(manifest), signed = {payload, signature: sign(null, Buffer.from(payload), pair.privateKey).toString('base64')};
    const check = Updates.prototype.check;
    globalThis.updateFixture = {slow: true, requests: 0};
    Updates.prototype.check = function () {
      this.keys = [pair.publicKey.export({type: 'spki', format: 'pem'})];
      this.fetcher = async (url, {signal}) => {
        globalThis.updateFixture.requests++;
        if (url.includes('api.github.com')) return Response.json([{tag_name: `v${nextVersion}`, body: 'notes'}]);
        if (url.endsWith('axiovela-update.json')) return Response.json(signed);
        if (!globalThis.updateFixture.slow) return new Response(bytes);
        return new Response(new ReadableStream({start(controller) {
          controller.enqueue(bytes.subarray(0, 5));
          signal.addEventListener('abort', () => controller.error(signal.reason), {once: true});
        }}));
      };
      return check.call(this);
    };
    Menu.getApplicationMenu().items.find(item => item.label === 'Help').submenu.items.find(item => item.label === 'Check for updates…').click();
  });
  await page.getByRole('button', {name: 'Download update', exact: true}).waitFor();
  console.log('Update UI: signed release available');
  assert.equal(await page.getByLabel('Release channel').inputValue(), 'stable');
  assert.match(await page.locator('.update-notes').innerText(), /signed release note/);
  await assert.rejects(page.evaluate(() => window.methodflowDesktop.update('install')), /Unknown update action/);
  await page.getByRole('button', {name: 'Download update', exact: true}).click();
  await page.getByRole('progressbar', {name: 'Update download'}).waitFor();
  await page.getByRole('button', {name: 'Cancel download', exact: true}).click();
  await page.getByRole('button', {name: 'Retry download', exact: true}).waitFor();
  console.log('Update UI: cancelled download');
  assert.equal(await editor.inputValue(), '# Unsaved update test\nKeep this manuscript');
  await page.getByRole('button', {name: 'Results', exact: true}).click();
  assert.equal(await composer.inputValue(), 'Keep this unsent message');
  assert.equal(await page.getByRole('button', {name: 'Stop task'}).count(), 1);
  await page.getByRole('button', {name: 'Write-up', exact: true}).click();
  await application.evaluate(() => { globalThis.updateFixture.slow = false; });
  await page.getByRole('button', {name: 'Retry download', exact: true}).click();
  await page.getByRole('button', {name: 'Show downloaded update', exact: true}).waitFor();
  console.log('Update UI: verified download ready');
  assert.equal(await page.getByRole('button', {name: 'Restart and update'}).count(), 0);
  assert.ok(await page.evaluate(async () => (await fetch('/api/assistant').then(r => r.json())).jobs.some(j => j.message === 'FIXTURE_HANG' && !['complete', 'error', 'cancelled'].includes(j.status))));
  await mkdir(path.join(root, '.local/update-evidence'), {recursive: true});
  await page.screenshot({path: path.join(root, '.local/update-evidence/ready.png')});
  await page.getByRole('button', {name: 'Later', exact: true}).click();
  assert.equal(await page.locator('.update-panel').count(), 0);
  await page.getByRole('button', {name: 'Results', exact: true}).click();
  await page.getByRole('button', {name: 'Stop task'}).click();
  await page.getByRole('button', {name: 'Stop task'}).waitFor({state: 'hidden'});
  await page.getByRole('button', {name: 'Write-up', exact: true}).click();
  await page.getByRole('button', {name: 'Save source', exact: true}).click();
  await page.waitForFunction(() => document.body.innerText.includes('All changes saved.'));
  const tabs = await page.evaluate(() => localStorage.getItem('axiovela-project-tabs'));
  await application.close(); application = null;
  application = await electron.launch({executablePath, args: packaged ? [] : [root], env, chromiumSandbox: true});
  const reopened = await application.firstWindow();
  await reopened.getByRole('button', {name: 'Project', exact: true}).waitFor();
  await reopened.waitForFunction(async () => (await fetch('/api/project').then(r => r.json())).root?.endsWith('study'));
  assert.equal(await reopened.evaluate(() => localStorage.getItem('axiovela-project-tabs')), tabs);
  assert.match(await readFile(path.join(temporary, 'study/writeups/main.md'), 'utf8'), /Keep this manuscript/);
  assert.equal((await reopened.evaluate(() => window.methodflowDesktop.update('state'))).status, 'idle');
  assert.deepEqual(errors, []);
  console.log('Update UI passed: actual IPC, signed offline download, cancel/retry, active fixture task and unsaved edits preserved, Later, saved workspace reopen; no installer execution.');
} catch (error) { console.error(error); throw error; }
finally {
  clearTimeout(deadline);
  // Test failure cleanup cannot wait for an active fixture task/unsaved prompt.
  if (application) { await application.evaluate(({app}) => app.exit(0)).catch(() => {}); await application.close().catch(() => {}); }
  await rm(temporary, {recursive: true, force: true});
}
