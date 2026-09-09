const {app, BrowserWindow, Menu, dialog, ipcMain, protocol, session, shell, safeStorage, screen} = require('electron');
const {spawn} = require('node:child_process');
const {launchSetup} = require('./provider-setup.cjs');
const fs = require('node:fs/promises');
const path = require('node:path');
const {randomBytes} = require('node:crypto');
const {APP_URL, isAppUrl, isExternalUrl, allowsPermission} = require('./security.cjs');
const {credentialStore} = require('./credentials.cjs');
const {toolEnvironment, toolKeys, toolStatus} = require('./tools.cjs');
const {attachWindowRecovery} = require('./recovery.cjs');
const {atomicWriteFile} = require('../server/atomic-file.cjs');
let toolSettings = {};
let recoverWindow;

// Retain the original OS encryption identity and profile across the product rename.
// Visible branding comes from the window, menus and packaged product metadata.
app.setName('MethodFlow');
app.setAppUserModelId('com.squirrel.Axiovela.axiovela');
if (process.platform === 'linux') {
  app.setDesktopName('axiovela.desktop');
  app.commandLine.appendSwitch('class', 'axiovela');
}
// Test profiles are separate OS app profiles, not research-project overrides.
const profileOverride = (process.env.AXIOVELA_DESKTOP_PROFILE || process.env.HYPOTERA_DESKTOP_PROFILE) || process.env.METHODFLOW_DESKTOP_PROFILE;
app.setPath('userData', profileOverride ? path.resolve(profileOverride) : path.join(app.getPath('appData'), 'MethodFlow'));
protocol.registerSchemesAsPrivileged([{scheme: 'methodflow', privileges: {standard: true, secure: true, supportFetchAPI: true, stream: true}}]);

const root = path.resolve(__dirname, '..');
const token = randomBytes(32).toString('hex');
let mainWindow, backend, backendUrl, backendExit, allowClose = false, closePending = false, stopping = false;
let requestId = 0;
const activityRequests = new Map();

function nodeEnvironment() {
  const env = {...process.env, ELECTRON_RUN_AS_NODE: '1'};
  // Shell launchers and development overrides must not redirect a desktop build.
  const toolOverrides = new Set(['WORKBENCH_COMPATIBLE_API_KEY', 'WORKBENCH_CODEX_PATH', 'WORKBENCH_CLAUDE_PATH', 'WORKBENCH_GEMINI_PATH', 'WORKBENCH_PI_PATH', 'WORKBENCH_HERDR_PATH', 'WORKBENCH_OPENCODE_PATH', 'WORKBENCH_LATEX_PATH']);
  for (const key of Object.keys(env)) if ((key.startsWith('WORKBENCH_') && !toolOverrides.has(key)) || ['NODE_OPTIONS', 'NODE_PATH'].includes(key)) delete env[key];
  return toolEnvironment(env, toolSettings, {root});
}

async function startBackend() {
  const privateDir = app.getPath('userData');
  await fs.mkdir(privateDir, {recursive: true, mode: 0o700});
  const store = credentialStore(path.join(privateDir, 'provider-settings.encrypted'), safeStorage);
  backend = spawn(process.execPath, [path.join(__dirname, 'backend-entry.mjs')], {
    cwd: root, windowsHide: true,
    env: {...nodeEnvironment(), WORKBENCH_HOST: '127.0.0.1', WORKBENCH_PORT: '0', WORKBENCH_UI_ORIGINS: 'methodflow://app', WORKBENCH_STATE_PATH: path.join(privateDir, 'state.json')},
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  // Backend stderr can include tool diagnostics. Do not persist or expose it.
  backend.stderr.resume();
  backendExit = new Promise(resolve => backend.once('exit', resolve));
  backend.on('message', async message => {
    if (message?.type === 'storage') {
      try {
        if (!['read', 'write'].includes(message.operation)) throw new Error('Unknown storage operation');
        if (!Number.isFinite(message.expiresAt) || message.expiresAt <= Date.now()) throw new Error('Secure storage request expired. Retry the operation.');
        const signal = AbortSignal.timeout(Math.max(1, Math.min(120000, Math.ceil(message.expiresAt - Date.now()))));
        const value = await store[message.operation](message.value, {signal});
        if (backend.connected) backend.send({type: 'storage-result', id: message.id, value});
      } catch (error) { if (backend.connected) backend.send({type: 'storage-result', id: message.id, error: error.message}); }
    }
    if (message?.type === 'activity') activityRequests.get(message.id)?.(message.running);
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('The local service did not start within 30 seconds.')), 30000);
    const finish = error => { clearTimeout(timer); backend.off('message', ready); error ? reject(error) : resolve(); };
    const ready = message => {
      if (message?.type === 'startup-error') return finish(new Error(`The local service could not load (${message.code || 'startup error'}). Reinstall Axiovela or check your application profile.`));
      if (message?.type !== 'ready') return;
      if (!Number.isInteger(message.port) || message.port < 1 || message.port > 65535) return finish(new Error('Invalid local service address.'));
      backendUrl = `http://127.0.0.1:${message.port}`; finish();
    };
    backend.on('message', ready);
    backend.once('error', () => finish(new Error('Cannot launch the bundled application runtime.')));
    backend.once('exit', () => finish(new Error('The local service stopped during startup.')));
    backend.send({type: 'configure', token});
  });
  backend.once('exit', () => {
    if (stopping) return;
    if (!process.env.CI) dialog.showErrorBox('Axiovela service stopped', 'Your project files remain on disk. Quit and reopen Axiovela to reconnect.');
    mainWindow?.destroy();
  });
}

async function proxyRequest(request) {
  if (!isAppUrl(request.url)) return new Response('Unknown application origin', {status: 403});
  const url = new URL(request.url);
  // Concatenate paths to a fixed origin. Never resolve //host as a new origin.
  const headers = {'x-methodflow-session': token, origin: 'methodflow://app'};
  for (const name of ['content-type', 'range']) if (request.headers.has(name)) headers[name] = request.headers.get(name);
  try {
    const response = await fetch(backendUrl + url.pathname + url.search, {
      method: request.method, headers, redirect: 'error', signal: request.signal,
      ...(!['GET', 'HEAD'].includes(request.method) ? {body: request.body, duplex: 'half'} : {}),
    });
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'");
    responseHeaders.set('X-Content-Type-Options', 'nosniff');
    return new Response(response.body, {status: response.status, headers: responseHeaders});
  } catch { return new Response('The local Axiovela service is unavailable. Quit and reopen the app.', {status: 503}); }
}

function trustedSender(event) {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame || !isAppUrl(event.senderFrame.url)) throw new Error('Untrusted desktop request');
}

async function createExample() {
  const result = await dialog.showOpenDialog(mainWindow, {title: 'Choose where to save the example project', properties: ['openDirectory', 'createDirectory']});
  if (result.canceled) return null;
  const destination = path.join(result.filePaths[0], `Axiovela example ${new Date().toISOString().replace(/[:.]/g, '-')}`);
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'examples/linear-regression/run.mjs'), '--out', destination], {cwd: root, env: nodeEnvironment(), windowsHide: true, stdio: 'ignore'});
    const timer = setTimeout(() => { child.kill(); reject(new Error('Example creation timed out.')); }, 30000);
    child.once('error', () => { clearTimeout(timer); reject(new Error('Cannot start the bundled example.')); });
    child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('Cannot create the example. Choose a writable folder and try again.')); });
  });
  return destination;
}

async function saveToolSettings(notify = true) {
  await atomicWriteFile(path.join(app.getPath('userData'), 'tools.json'), JSON.stringify(toolSettings, null, 2) + '\n', {mode: 0o600});
  if (notify) await dialog.showMessageBox(mainWindow, {message: 'Tool locations saved', detail: 'Quit and reopen Axiovela to use these locations. Active work will continue until you quit.'});
}

function runningActivity() {
  if (!backend?.connected) return Promise.resolve(0);
  return new Promise(resolve => {
    const id = ++requestId;
    const timer = setTimeout(() => { activityRequests.delete(id); resolve(null); }, 3000);
    activityRequests.set(id, running => { clearTimeout(timer); activityRequests.delete(id); resolve(running); });
    backend.send({type: 'activity', id});
  });
}

async function requestClose() {
  if (closePending || !mainWindow || mainWindow.isDestroyed()) return;
  closePending = true;
  try {
    const running = await runningActivity();
    if (running === null || running > 0) {
      const {response} = await dialog.showMessageBox(mainWindow, {type: 'question', title: 'Quit Axiovela?', message: running === null ? 'The local service is not responding.' : `${running} task${running === 1 ? ' is' : 's are'} still running.`, detail: 'Quitting stops local tasks. Recorded results and project files stay on disk.', buttons: ['Keep working', 'Stop tasks and quit'], defaultId: 0, cancelId: 0});
      if (response !== 1) return;
    }
    allowClose = true; mainWindow.close();
  } finally { closePending = false; }
}

async function stopBackend() {
  if (stopping) return;
  stopping = true;
  if (backend?.connected) backend.send({type: 'shutdown'});
  if (backendExit) {
    let timer;
    await Promise.race([backendExit, new Promise(resolve => { timer = setTimeout(() => { backend.kill(); resolve(); }, 5000); })]);
    clearTimeout(timer);
  }
}

async function windowOptions() {
  const defaults = {width: 1440, height: 950};
  try {
    const saved = JSON.parse(await fs.readFile(path.join(app.getPath('userData'), 'window.json'), 'utf8'));
    if (['x', 'y', 'width', 'height'].every(key => Number.isFinite(saved[key])) && saved.width >= 900 && saved.height >= 600 && screen.getAllDisplays().some(({workArea: a}) => saved.x < a.x + a.width && saved.x + saved.width > a.x && saved.y < a.y + a.height && saved.y + saved.height > a.y)) return saved;
  } catch {}
  return defaults;
}

async function createWindow() {
  mainWindow = new BrowserWindow({...await windowOptions(), minWidth: 900, minHeight: 600, show: false, title: 'Axiovela', backgroundColor: '#edf1f4', icon: path.join(__dirname, 'icons/icon.png'), webPreferences: {preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true}});
  mainWindow.once('ready-to-show', () => mainWindow.show());
  recoverWindow = attachWindowRecovery(mainWindow, {dialog, isStopping: () => stopping || allowClose, quit: () => app.quit()});
  mainWindow.on('close', event => {
    if (!allowClose) { event.preventDefault(); void requestClose(); return; }
    atomicWriteFile(path.join(app.getPath('userData'), 'window.json'), JSON.stringify(mainWindow.getNormalBounds()), {mode: 0o600}).catch(() => {});
  });
  mainWindow.webContents.on('will-prevent-unload', event => {
    const response = dialog.showMessageBoxSync(mainWindow, {type: 'question', message: 'Leave with unsaved write-up changes?', detail: 'Keep working to save your changes first. A local recovery draft may be available when you reopen.', buttons: ['Keep working', 'Leave'], defaultId: 0, cancelId: 0});
    if (response === 1) event.preventDefault(); else allowClose = false;
  });
  mainWindow.webContents.on('will-navigate', (event, url) => { if (url !== APP_URL) { event.preventDefault(); if (isExternalUrl(url)) void shell.openExternal(url); } });
  mainWindow.webContents.on('will-attach-webview', event => event.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(({url}) => {
    if (isAppUrl(url)) mainWindow.webContents.downloadURL(url);
    else if (isExternalUrl(url)) void shell.openExternal(url);
    return {action: 'deny'};
  });
  mainWindow.on('closed', () => { mainWindow = null; app.quit(); });
  await mainWindow.loadURL(APP_URL);
}

if (process.platform === 'win32' && process.argv.some(arg => /^--squirrel-/.test(arg))) {
  const event = process.argv.find(arg => /^--squirrel-/.test(arg));
  if (['--squirrel-install', '--squirrel-updated', '--squirrel-uninstall'].includes(event)) {
    const updater = path.resolve(path.dirname(process.execPath), '..', 'Update.exe');
    const child = spawn(updater, [event === '--squirrel-uninstall' ? '--removeShortcut' : '--createShortcut', path.basename(process.execPath)], {windowsHide: true});
    child.once('exit', () => app.quit()); child.once('error', () => app.quit());
  } else app.quit();
} else if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); } });
  app.on('before-quit', event => {
    event.preventDefault();
    if (mainWindow && !mainWindow.isDestroyed()) void requestClose();
    else void stopBackend().finally(() => app.exit(0));
  });
  app.whenReady().then(async () => {
    session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => callback(contents === mainWindow?.webContents && allowsPermission(permission, details.requestingUrl, details.isMainFrame)));
    session.defaultSession.setPermissionCheckHandler((contents, permission, origin, details) => contents === mainWindow?.webContents && allowsPermission(permission, details.requestingUrl || origin, details.isMainFrame));
    // The renderer only talks to our custom origin. External links open in the browser.
    session.defaultSession.webRequest.onBeforeRequest({urls: ['http://*/*', 'https://*/*', 'file://*/*']}, (_details, callback) => callback({cancel: true}));
    protocol.handle('methodflow', proxyRequest);
    ipcMain.handle('desktop:setup-provider', async (event, id, action) => { trustedSender(event); return launchSetup(id, action, {env: toolEnvironment(process.env, toolSettings, {root})}); });
    ipcMain.handle('desktop:detect-tools', async event => { trustedSender(event); return toolStatus(nodeEnvironment()); });
    ipcMain.handle('desktop:export-markdown-pdf', async (event, resource) => {
      trustedSender(event);
      if (typeof resource !== 'string' || !/^\/api\/artifacts\/file\?path=exports%2Fchat-[a-f0-9-]+\.html$/.test(resource)) throw new Error('Choose a rendered Markdown document.');
      const choice = await dialog.showSaveDialog(mainWindow, {title: 'Export PDF', defaultPath: 'research-writeup.pdf', filters: [{name: 'PDF document', extensions: ['pdf']}]});
      if (choice.canceled || !choice.filePath) return false;
      const preview = new BrowserWindow({show: false, webPreferences: {sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false}});
      preview.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
      try {
        await preview.loadURL(new URL(resource, APP_URL).href);
        const bytes = await preview.webContents.printToPDF({printBackground: true, preferCSSPageSize: true});
        await atomicWriteFile(choice.filePath, bytes);
        return true;
      } finally { preview.destroy(); }
    });
    ipcMain.handle('desktop:choose-tool', async (event, key) => {
      trustedSender(event);
      if (!toolKeys.includes(key)) throw new Error('Unknown tool');
      const choice = await dialog.showOpenDialog(mainWindow, {title: `Select ${key === 'LATEX' ? 'Tectonic' : key.toLowerCase()} executable`, properties: ['openFile']});
      if (choice.canceled || !choice.filePaths[0]) return false;
      toolSettings[key] = choice.filePaths[0];
      await saveToolSettings(false);
      return true;
    });
    ipcMain.handle('desktop:choose-folder', async event => { trustedSender(event); const result = await dialog.showOpenDialog(mainWindow, {title: 'Choose or create a research folder', properties: ['openDirectory', 'createDirectory']}); return result.canceled ? null : result.filePaths[0]; });
    ipcMain.handle('desktop:choose-data', async (event, directory) => {
      trustedSender(event);
      if (typeof directory !== 'boolean') throw new Error('Invalid file picker mode.');
      const response = await fetch(backendUrl + '/api/project', {headers: {'x-methodflow-session': token, origin: 'methodflow://app'}});
      if (!response.ok) throw new Error('Cannot read the active project.');
      const project = await response.json();
      const result = await dialog.showOpenDialog(mainWindow, {title: directory ? 'Choose a data folder' : 'Choose data files', ...(project.root ? {defaultPath: project.root} : {}), properties: directory ? ['openDirectory'] : ['openFile', 'multiSelections']});
      return result.canceled ? [] : result.filePaths;
    });
    ipcMain.handle('desktop:create-example', async event => { trustedSender(event); return createExample(); });
    app.setAboutPanelOptions({applicationName: 'Axiovela', applicationVersion: app.getVersion()});
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [{label: 'Axiovela', submenu: [{label: 'About Axiovela', click: () => app.showAboutPanel()}, {type: 'separator'}, {role: 'services'}, {type: 'separator'}, {role: 'hide', label: 'Hide Axiovela'}, {role: 'hideOthers'}, {role: 'unhide'}, {type: 'separator'}, {role: 'quit', label: 'Quit Axiovela'}]}] : []),
      {label: 'File', submenu: [{label: 'Quit Axiovela', accelerator: 'CmdOrCtrl+Q', click: () => app.quit()}]},
      {role: 'editMenu'}, {label: 'View', submenu: [{role: 'resetZoom'}, {role: 'zoomIn'}, {role: 'zoomOut'}, {role: 'togglefullscreen'}, {type: 'separator'}, {label: 'Reload workspace…', click: () => { void recoverWindow?.(); }}]},
      {label: 'Tools', submenu: [
        {label: 'Check installed tools', click: () => dialog.showMessageBox(mainWindow, {title: 'Research tools', message: 'Configured tool locations', detail: `Node and document rendering libraries are bundled. Optional tools are discovered at these locations; presence does not verify versions or project packages. Saved changes take effect after restarting.\n\n${toolStatus(nodeEnvironment())}`})},
        ...toolKeys.map(key => ({label: key === 'LATEX' ? 'Select Tectonic executable…' : `Select ${key.toLowerCase()} executable…`, click: async () => {
          const choice = await dialog.showOpenDialog(mainWindow, {title: `Select ${key === 'LATEX' ? 'Tectonic' : key.toLowerCase()} executable`, properties: ['openFile']});
          if (choice.canceled) return;
          toolSettings[key] = choice.filePaths[0];
          await saveToolSettings();
        }})),
        {label: 'Add tool folder…', click: async () => {
          const choice = await dialog.showOpenDialog(mainWindow, {title: 'Choose a bin or Scripts folder (Python, Conda, Git, or other tools)', properties: ['openDirectory']});
          if (choice.canceled) return;
          toolSettings.directories = [...new Set([...(Array.isArray(toolSettings.directories) ? toolSettings.directories : []), choice.filePaths[0]])];
          await saveToolSettings();
        }},
        {label: 'Reset tool locations', click: async () => { toolSettings = {}; await saveToolSettings(); }},
      ]},
      {label: 'Help', submenu: [{label: 'Try the example study', click: () => mainWindow?.webContents.send('desktop:example-requested')}, {
        label: 'Optional tool setup…',
        click: async () => {
          const detail = await fs.readFile(path.join(__dirname, 'tool-setup.txt'), 'utf8');
          const {response} = await dialog.showMessageBox(mainWindow, {
            title: 'Optional tool setup', message: 'Included tools and optional setup', detail,
            buttons: ['Close', 'Pi setup guide', 'Herdr setup guide'],
          });
          if (response === 1) await shell.openExternal('https://github.com/earendil-works/pi/tree/main/packages/coding-agent#quick-start');
          if (response === 2) await shell.openExternal('https://herdr.dev/docs/install/');
        },
      }, {type: 'separator'}, {label: 'License and software notice', click: async () => {
        const notice = await fs.readFile(path.join(root, 'BETA_NOTICE.md'), 'utf8');
        await dialog.showMessageBox(mainWindow, {title: 'License and software notice', message: 'Axiovela desktop', detail: notice, buttons: ['Close', 'Read MIT license']}).then(async ({response}) => { if (response === 1) await dialog.showMessageBox(mainWindow, {title: 'MIT License', message: 'MIT License', detail: await fs.readFile(path.join(root, 'LICENSE'), 'utf8')}); });
      }}, {label: 'About Axiovela', click: () => dialog.showMessageBox(mainWindow, {message: `Axiovela ${app.getVersion()} · desktop`, detail: 'Local research workspace. Project files stay in the folder you choose. AI connections contact your selected provider. Closing the app stops local tasks.'})}, {label: 'Downloads and release notes', click: () => shell.openExternal('https://github.com/CashBowman/axiovela/releases')}, {label: 'Report a problem', click: () => shell.openExternal('https://github.com/CashBowman/axiovela/issues/new/choose')}]},
    ]));
    try { const saved = JSON.parse(await fs.readFile(path.join(app.getPath('userData'), 'tools.json'), 'utf8')); toolSettings = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}; } catch { toolSettings = {}; }
    await startBackend(); await createWindow();
  }).catch(async error => { console.error(`Cannot start Axiovela: ${error.message}`); if (!process.env.CI) dialog.showErrorBox('Cannot start Axiovela', error.message); await stopBackend(); app.exit(1); });
}
