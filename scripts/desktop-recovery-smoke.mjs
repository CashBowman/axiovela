import assert from 'node:assert/strict';
import {mkdtemp, mkdir, cp, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {_electron as electron} from 'playwright-core';

// Use disposable state. Linux installed-package tests retain the system-owned
// sandbox helper; copying it loses ownership required by its setuid sandbox.
const temporary = await mkdtemp(path.join(os.tmpdir(), 'axiovela recovery ü '));
const systemInstall = process.platform === 'linux' && process.env.AXIOVELA_TEST_INSTALLED_ROOT;
const installed = systemInstall ? path.resolve(systemInstall) : path.join(temporary, 'Installed app');
const home = path.join(temporary, 'home');
const profile = path.join(temporary, 'profile');
const env = {...process.env, HOME: home, USERPROFILE: home, APPDATA: path.join(home, 'AppData/Roaming'), LOCALAPPDATA: path.join(home, 'AppData/Local'), XDG_CONFIG_HOME: path.join(home, '.config'), XDG_CACHE_HOME: path.join(home, '.cache'), TECTONIC_CACHE_DIR: path.join(home, 'tectonic-cache'), PATH: '', CI: '1'};
for (const key of Object.keys(env)) if (/^(WORKBENCH_|AXIOVELA_|HYPOTERA_|METHODFLOW_|OPENAI_|ANTHROPIC_|GEMINI_|GOOGLE_|AZURE_|NODE_OPTIONS$|NODE_PATH$|ELECTRON_RUN_AS_NODE$)/.test(key)) delete env[key];
env.AXIOVELA_DESKTOP_PROFILE = profile;
for (const directory of [home, profile, env.APPDATA, env.LOCALAPPDATA, env.XDG_CONFIG_HOME, env.XDG_CACHE_HOME]) await mkdir(directory, {recursive: true});
const source = process.env.AXIOVELA_TEST_INSTALLED_ROOT || process.env.HYPOTERA_TEST_INSTALLED_ROOT || process.env.METHODFLOW_TEST_INSTALLED_ROOT || `out/Axiovela-${process.platform}-${process.arch}`;
if (!systemInstall) await cp(source, installed, {recursive: true, verbatimSymlinks: true});
const executablePath = path.join(installed, process.platform === 'darwin' ? 'Axiovela.app/Contents/MacOS/axiovela' : process.platform === 'win32' ? 'axiovela.exe' : 'axiovela');
let application;
let child;
const deadline = setTimeout(() => { child?.kill('SIGKILL'); console.error('Recovery smoke timed out'); process.exit(1); }, 90000);
async function launch() {
  application = await electron.launch({executablePath, env, chromiumSandbox: true, timeout: 30000});
  child = application.process();
  const page = await application.firstWindow({timeout: 20000});
  await page.getByRole('button', {name: 'Choose experiment model and provider'}).waitFor();
  await page.waitForFunction(async () => (await fetch('/api/health')).ok);
  return page;
}
try {
  for (const file of ['tools.json', 'window.json', 'state.json']) await writeFile(path.join(profile, file), '{invalid JSON');
  let page = await launch();
  // Allow initial project loading to finish, then check the actual unload guard.
  await page.waitForFunction(() => document.querySelector('.projectTabs button[aria-label="Project"]') && !document.querySelector('.activeProjectTab'));
  assert.equal(await page.evaluate(() => { const event = new Event('beforeunload', {cancelable: true}); window.dispatchEvent(event); return event.defaultPrevented; }), false);
  await application.close(); application = null;
  console.log('Recovery smoke: clean blank-workspace quit and corrupt-settings startup passed');
  await writeFile(path.join(profile, 'state.json'), JSON.stringify({projectRoot: path.join(temporary, 'deleted-project')}));
  page = await launch();
  await page.evaluate(() => localStorage.setItem('recovery-proof', 'saved'));
  await application.evaluate(({BrowserWindow, dialog}) => {
    globalThis.recoveryPrompts = [];
    dialog.showMessageBox = async (_window, options) => { globalThis.recoveryPrompts.push(options); return {response: 0}; };
    const window = BrowserWindow.getAllWindows()[0];
    globalThis.recoveryBeforePid = window.webContents.getOSProcessId();
    globalThis.recoveryLoaded = false;
    window.webContents.once('did-finish-load', () => { globalThis.recoveryLoaded = true; });
    // Playwright's attached Windows renderer cannot be terminated reliably by
    // process.kill, forcefullyCrashRenderer, or Page.crash on every host. Emit
    // Electron's exact event there; native Mac/Linux runs retain a real crash.
    if (process.platform === 'win32') window.webContents.emit('render-process-gone', {}, {reason: 'crashed'});
    else process.kill(window.webContents.getOSProcessId(), 'SIGKILL');
  });
  const recoveryDeadline = Date.now() + 20000;
  while (!await application.evaluate(() => globalThis.recoveryLoaded)) {
    if (Date.now() >= recoveryDeadline) {
      const diagnostic = await application.evaluate(({BrowserWindow}) => {
        const contents = BrowserWindow.getAllWindows()[0].webContents;
        return {prompts: globalThis.recoveryPrompts, beforePid: globalThis.recoveryBeforePid, currentPid: contents.getOSProcessId(), listeners: contents.listenerCount('render-process-gone'), crashed: contents.isCrashed(), loading: contents.isLoading(), url: contents.getURL()};
      });
      assert.fail(`Renderer must reload after recovery approval: ${JSON.stringify(diagnostic)}`);
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const prompts = await application.evaluate(() => globalThis.recoveryPrompts);
  assert.equal(prompts.length, 1);
  assert.equal(prompts[0].title, 'Recover Axiovela');
  assert.deepEqual(prompts[0].buttons, ['Reload workspace', 'Quit Axiovela']);
  // Query the actual reloaded WebContents rather than Playwright's pre-reload Page.
  const state = await application.evaluate(async ({BrowserWindow}) => {
    const contents = BrowserWindow.getAllWindows()[0].webContents;
    return {crashed: contents.isCrashed(), ...await contents.executeJavaScript(`(async () => ({saved: localStorage.getItem('recovery-proof'), health: (await fetch('/api/health')).status, title: document.title, buttons: document.querySelectorAll('button').length}))()`) };
  });
  assert.equal(state.crashed, false);
  assert.equal(state.saved, 'saved');
  assert.equal(state.health, 200);
  assert.equal(state.title, 'Axiovela');
  assert.ok(state.buttons > 10, 'Recovered renderer must display the real workspace');
  await application.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].emit('unresponsive'));
  assert.equal((await application.evaluate(() => globalThis.recoveryPrompts)).at(-1).buttons[0], 'Keep waiting');
  await application.close(); application = null;
  console.log(`Recovery smoke passed: ${process.platform === 'win32' ? 'renderer-gone event' : 'real renderer crash'}, recovery dialog/reload, saved state, responsive backend, unresponsive wait, and normal quit.`);
} finally {
  clearTimeout(deadline);
  if (application) {
    await application.evaluate(({app}) => { setTimeout(() => app.exit(0), 10); }).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 500));
    child?.kill('SIGKILL');
  }
  await rm(temporary, {recursive: true, force: true});
}
