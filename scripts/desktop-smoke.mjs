import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, readdir, rm, writeFile, lstat, realpath, cp} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {_electron as electron} from 'playwright-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const temporary = await mkdtemp(path.join(os.tmpdir(), 'axiovela desktop smoke '));
const profile = path.join(temporary, 'profile');
const home = path.join(temporary, 'home');
await mkdir(home);
const packaged = process.argv.includes('--packaged');
// Importing the electron npm package can synchronously download a development
// runtime. A packaged smoke test must use only the binary under test.
const electronBinary = packaged ? null : (await import('electron')).default;
const appDir = ((process.env.AXIOVELA_TEST_INSTALLED_ROOT || process.env.HYPOTERA_TEST_INSTALLED_ROOT) || process.env.METHODFLOW_TEST_INSTALLED_ROOT) || path.join(temporary, 'Installed application');
if (packaged && !((process.env.AXIOVELA_TEST_INSTALLED_ROOT || process.env.HYPOTERA_TEST_INSTALLED_ROOT) || process.env.METHODFLOW_TEST_INSTALLED_ROOT)) await cp(path.join(root, `out/Axiovela-${process.platform}-${process.arch}`), appDir, {recursive: true, verbatimSymlinks: true});
const executablePath = packaged ? process.platform === 'darwin' ? path.join(appDir, 'Axiovela.app/Contents/MacOS/axiovela') : path.join(appDir, process.platform === 'win32' ? 'axiovela.exe' : 'axiovela') : electronBinary;
if (packaged) {
  const contents = process.platform === 'darwin' ? path.join(appDir, 'Axiovela.app/Contents/Resources/app') : path.join(appDir, 'resources/app');
  assert.deepEqual((await readdir(contents)).sort(), ['BETA_NOTICE.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'desktop', 'dist', 'examples', 'node_modules', 'package.json', 'project-template', 'server', 'src']);
  for (const file of await readdir(contents, {recursive: true})) {
    assert.ok(!/(?:^|[/\\])(?:\.git|\.env|auth\.json|credentials\.json|providers\.json|\.npmrc)(?:[/\\]|$)/i.test(file), `Private file in packaged app: ${file}`);
    const full = path.join(contents, file);
    if ((await lstat(full)).isSymbolicLink()) {
      const resolved = await realpath(full);
      assert.ok(resolved.startsWith(contents + path.sep), `Packaged symlink escapes the application: ${file}`);
    }
  }
  // The app must be self-contained: it cannot find dependencies by walking up
  // into the developer checkout's node_modules directory.
  assert.ok(!appDir.startsWith(root));
}
const env = {...process.env, METHODFLOW_DESKTOP_PROFILE: profile, HOME: home, USERPROFILE: home, APPDATA: path.join(home, 'AppData', 'Roaming'), LOCALAPPDATA: path.join(home, 'AppData', 'Local'), XDG_CONFIG_HOME: path.join(home, '.config'), XDG_CACHE_HOME: path.join(home, '.cache'), PATH: process.platform === 'win32' ? path.join(process.env.SystemRoot, 'System32') : ''};
// Windows known-folder APIs expand USERPROFILE/AppData/{Local,Roaming};
// arbitrary APPDATA paths alone do not redirect them. These directories need
// to exist. Keep Tectonic's cache explicitly inside the disposable fixture.
for (const directory of [env.APPDATA, env.LOCALAPPDATA, env.XDG_CONFIG_HOME, env.XDG_CACHE_HOME]) await mkdir(directory, {recursive: true});
env.TECTONIC_CACHE_DIR = path.join(home, 'tectonic-cache');
await mkdir(env.TECTONIC_CACHE_DIR);
for (const key of Object.keys(env)) if (/^(?:WORKBENCH_|OPENAI_|ANTHROPIC_|GEMINI_|GOOGLE_|AZURE_|NODE_OPTIONS$|NODE_PATH$|ELECTRON_RUN_AS_NODE$)/.test(key)) delete env[key];
// Fake native engines run through the bundled runtime; no account or keys.
await cp(path.join(root, 'scripts/fixtures/assistant-rpc.mjs'), path.join(temporary, 'codex-fixture.mjs'));
await cp(path.join(root, 'scripts/fixtures/provider-cli.mjs'), path.join(temporary, 'pi-fixture.mjs'));
env.WORKBENCH_CODEX_PATH = path.join(temporary, 'codex-fixture.mjs');
env.WORKBENCH_PI_PATH = path.join(temporary, 'pi-fixture.mjs');
env.WORKBENCH_HERDR_PATH = path.join(temporary, 'herdr-fixture.mjs');
env.HYPOTERA_HERDR_FIXTURE = path.join(temporary, 'herdr-state.json');
let application;
const errors = [];
const deadline = setTimeout(() => { console.error('Desktop smoke exceeded its deadline.'); application?.process().kill('SIGKILL'); process.exit(1); }, (process.env.AXIOVELA_TEST_LATEX || process.env.HYPOTERA_TEST_LATEX) === '1' ? 480000 : 120000);
try {
  console.log('Desktop smoke: launching packaged application');
  application = await electron.launch({executablePath, args: packaged ? [] : [root], env, chromiumSandbox: true, timeout: 45000});
  application.process().stderr.on('data', chunk => { if (String(chunk).includes('Cannot start Axiovela:')) process.stderr.write(chunk); });
  const page = await application.firstWindow({timeout: 30000});
  if (packaged) {
    const pngBytes = await application.evaluate(async ({app}) => {
      const {createRequire} = process.getBuiltinModule('node:module');
      const path = process.getBuiltinModule('node:path');
      const sharp = createRequire(path.join(app.getAppPath(), 'package.json'))('sharp');
      const png = await sharp({create: {width: 4, height: 4, channels: 4, background: '#336699'}}).png().toBuffer();
      return png.length;
    });
    assert.ok(pngBytes > 50, 'Installed Sharp and libvips must encode a real PNG');
  }
  console.log('Desktop smoke: waiting for blank workspace');
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('button', {name: 'Choose experiment model and provider'}).waitFor({timeout: 30000});
  assert.equal(await page.locator('.desktopWelcome').count(), 0);
  assert.equal(await page.locator('.brand').innerText(), 'Axiovela');
  assert.equal(await page.title(), 'Axiovela');
  assert.equal(await application.evaluate(({app}) => app.getName()), 'MethodFlow', 'Keep OS encryption identity across the rename');
  assert.equal(await application.evaluate(({app}) => app.getPath('userData')), profile, 'Legacy profile override still works');
  await page.getByRole('button', {name: 'Choose experiment model and provider'}).click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('button', {name: 'Close model picker', exact: true}).click();
  await page.getByRole('dialog').waitFor({state: 'hidden'});
  if (((process.env.AXIOVELA_SCREENSHOT || process.env.HYPOTERA_SCREENSHOT) || process.env.METHODFLOW_SCREENSHOT)) await page.screenshot({path: ((process.env.AXIOVELA_SCREENSHOT || process.env.HYPOTERA_SCREENSHOT) || process.env.METHODFLOW_SCREENSHOT) + '-welcome.png'});
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  assert.deepEqual(await page.evaluate(() => Object.keys(window.methodflowDesktop).sort()), ['chooseData', 'chooseFolder', 'chooseTool', 'createExample', 'detectTools', 'exportMarkdownPdf', 'onExampleRequest', 'setupProvider']);
  assert.equal(await page.evaluate(() => location.href), 'methodflow://app/');
  const preferences = await application.evaluate(({BrowserWindow}) => {
    const p = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
    return {sandbox: p.sandbox, contextIsolation: p.contextIsolation, nodeIntegration: p.nodeIntegration};
  });
  assert.deepEqual(preferences, {sandbox: true, contextIsolation: true, nodeIntegration: false});
  const second = spawn(executablePath, packaged ? [] : [root], {env, stdio: 'ignore'});
  const secondTimeout = setTimeout(() => second.kill(), 10000);
  assert.equal((await once(second, 'exit'))[0], 0, 'A second launch should focus the existing instance');
  clearTimeout(secondTimeout);
  const help = page.getByRole('button', {name: 'About access permissions'});
  assert.equal(await page.locator('.accessTooltip').isVisible(), false);
  assert.equal(await page.locator('.accessHint').count(), 0);
  assert.equal(await page.locator('.agenticHeaderControl').textContent(), 'Agentic mode');
  await help.hover();
  assert.equal(await page.getByRole('tooltip').isVisible(), true);
  assert.match(await page.getByRole('tooltip').textContent(), /Full access can change files/);
  await help.focus();
  await help.press('Escape');
  assert.equal(await page.locator('.accessTooltip').isVisible(), false);
  // One shared control opens model/provider setup, including on a blank workspace.
  assert.equal(await page.locator('.connectionPickerControls > button').count(), 1);
  await page.getByRole('button', {name: 'Choose experiment model and provider'}).click();
  const connectionDialog = page.getByRole('dialog', {name: 'Experiment connection'});
  assert.equal(await connectionDialog.getByRole('searchbox').count(), 0);
  await connectionDialog.getByRole('combobox', {name: 'Connection', exact: true}).selectOption('gemini');
  await connectionDialog.getByRole('heading', {name: '1. Install Gemini CLI', exact: true}).waitFor();
  await connectionDialog.getByRole('button', {name: 'Windows', exact: true}).click();
  assert.ok((await connectionDialog.innerText()).includes('npm.cmd install -g @google/gemini-cli'));
  assert.ok((await connectionDialog.innerText()).includes('(Get-Command gemini -CommandType Application -ErrorAction Stop).Source'));
  await connectionDialog.getByRole('button', {name: 'macOS / Linux', exact: true}).click();
  assert.ok((await connectionDialog.innerText()).includes('command -v gemini'));
  await connectionDialog.getByRole('button', {name: 'Windows', exact: true}).click();
  await assert.rejects(page.evaluate(() => window.methodflowDesktop.chooseTool('INVALID')), /Unknown tool/);
  await application.evaluate(({dialog}, file) => { dialog.showOpenDialog = async () => ({canceled: false, filePaths: [file]}); }, path.join(temporary, 'chosen-gemini'));
  await connectionDialog.getByRole('button', {name: 'Locate installed Gemini CLI…', exact: true}).click();
  await connectionDialog.getByText(/Location saved/).waitFor();
  assert.equal(JSON.parse(await readFile(path.join(profile, 'tools.json'), 'utf8')).GEMINI, path.join(temporary, 'chosen-gemini'));
  await connectionDialog.getByRole('combobox', {name: 'Connection', exact: true}).selectOption('pi');
  await connectionDialog.locator('summary').filter({hasText: 'Install or connect Pi'}).click();
  await connectionDialog.getByRole('heading', {name: '3. Add Herdr for Agentic mode', exact: true}).waitFor();
  const setupShot = process.env.AXIOVELA_SCREENSHOT;
  if (setupShot) await page.screenshot({path: setupShot + '-connection-setup.png'});
  await connectionDialog.getByRole('button', {name: 'Close model picker', exact: true}).click();
  console.log('Desktop smoke: direct setup, shared Pi/Herdr instructions, native tool location, and no model search passed');
  await page.getByRole('combobox', {name: 'Research focus', exact: true}).selectOption('biology');
  await page.getByRole('button', {name: 'Choose experiment model and provider'}).click();
  await connectionDialog.getByText('Science & engineering', {exact: true}).waitFor();
  await connectionDialog.getByRole('combobox', {name: 'Connection', exact: true}).selectOption('pi');
  await connectionDialog.locator('summary').filter({hasText: 'Install or connect Pi'}).click();
  await connectionDialog.getByRole('button', {name: 'Connect an API key instead', exact: true}).click();
  assert.equal(await connectionDialog.getByRole('combobox', {name: 'Connection', exact: true}).inputValue(), 'openai-api');
  await connectionDialog.getByLabel('API key', {exact: true}).waitFor();
  assert.equal(await connectionDialog.getByLabel('API key', {exact: true}).getAttribute('type'), 'password');
  assert.equal(await connectionDialog.getByLabel('API key', {exact: true}).inputValue(), '');
  await connectionDialog.getByRole('button', {name: 'Close model picker', exact: true}).click();
  console.log('Desktop smoke: single-instance launch passed; creating example');
  // Exercise the actual native-picker IPC and account-free example with an
  // isolated destination. Only the OS dialog is replaced, not project creation.
  await application.evaluate(({dialog}, folder) => { dialog.showOpenDialog = async () => ({canceled: false, filePaths: [folder]}); }, temporary);
  await application.evaluate(({Menu}) => Menu.getApplicationMenu().items.find(item => item.label === 'Help').submenu.items.find(item => item.label === 'Try the example study').click());
  await page.waitForFunction(() => document.querySelector('.projectSwitcher')?.textContent.includes('A line or a constant?'), {timeout: 30000});
  const project = await page.evaluate(() => fetch('/api/project').then(r => r.json()));
  assert.ok(project.root.startsWith(temporary + path.sep));
  await page.getByRole('combobox', {name: 'Research focus', exact: true}).selectOption('data-science');
  await page.waitForFunction(async () => (await fetch('/api/assistant/capabilities').then(r => r.json())).preferences.experiment.profileId === 'data-science');
  await page.reload();
  await page.waitForFunction(() => document.querySelector('[aria-label="Research focus"]')?.value === 'data-science');
  assert.equal(JSON.parse(await readFile(path.join(project.root, 'config/assistant.json'), 'utf8')).experiment.profileId, 'data-science');
  const pickerFile = path.join(temporary, 'interview.mp3');
  await writeFile(pickerFile, 'isolated audio fixture');
  await application.evaluate(({dialog}, file) => { dialog.showOpenDialog = async (_window, options) => { globalThis.dataPickerOptions = options; return {canceled: false, filePaths: [file]}; }; }, pickerFile);
  await page.getByRole('button', {name: 'Link dataset', exact: true}).click();
  await page.getByRole('button', {name: 'Choose files', exact: true}).click();
  await page.getByText('1 item added to workspace datasets.', {exact: true}).waitFor();
  assert.equal((await application.evaluate(() => globalThis.dataPickerOptions)).defaultPath, project.root);
  assert.deepEqual((await application.evaluate(() => globalThis.dataPickerOptions)).properties, ['openFile', 'multiSelections']);
  const nativeData = await page.evaluate(() => fetch('/api/datasets').then(r => r.json()));
  assert.equal(nativeData.datasets.at(-1).format, 'mp3');
  await page.locator('.datasetDialog input[type="file"]:not([webkitdirectory])').setInputFiles({name: 'large.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(12 * 1024 * 1024, 65)});
  await page.locator('.datasetList article').filter({hasText: 'large.pdf'}).waitFor();
  const folderFixture = path.join(temporary, 'data-fixture');
  await mkdir(path.join(folderFixture, 'nested'), {recursive: true});
  await writeFile(path.join(folderFixture, 'nested', 'paper.pdf'), '%PDF fixture');
  await application.evaluate(({dialog}, folder) => { dialog.showOpenDialog = async (_window, options) => { globalThis.dataPickerOptions = options; return {canceled: false, filePaths: [folder]}; }; }, folderFixture);
  await page.getByRole('button', {name: 'Choose folder', exact: true}).click();
  await page.locator('.datasetList article').filter({hasText: 'data-fixture'}).waitFor();
  assert.deepEqual((await application.evaluate(() => globalThis.dataPickerOptions)).properties, ['openDirectory']);
  if ((process.env.AXIOVELA_SCREENSHOT || process.env.HYPOTERA_SCREENSHOT)) await page.screenshot({path: (process.env.AXIOVELA_SCREENSHOT || process.env.HYPOTERA_SCREENSHOT) + '-datasets.png'});
  await application.evaluate(({dialog}, file) => { dialog.showOpenDialog = async () => ({canceled: false, filePaths: [file]}); }, pickerFile);
  await page.getByRole('button', {name: 'Close datasets', exact: true}).click();
  await page.getByLabel('Attach context', {exact: true}).click();
  await page.getByRole('button', {name: 'Attach files', exact: true}).click();
  await page.locator('.attachmentChip').filter({hasText: 'interview.mp3'}).waitFor();
  await page.getByRole('button', {name: 'Remove attachment', exact: true}).click();
  await page.getByLabel('Attach context', {exact: true}).click();
  await application.evaluate(({dialog}, folder) => { dialog.showOpenDialog = async () => ({canceled: false, filePaths: [folder]}); }, temporary);
  await page.locator('.agenticHeaderControl label.switch').click();
  await page.getByRole('heading', {name: 'Get Agentic mode ready', exact: true}).waitFor();
  assert.equal(await page.getByRole('checkbox', {name: 'Agentic mode', exact: true}).isChecked(), false);
  assert.ok((await page.locator('.agenticSetupDialog').innerText()).includes('Herdr · Not found'));
  await page.getByRole('button', {name: 'Windows', exact: true}).click();
  assert.ok((await page.locator('.agenticSetupDialog').innerText()).includes('install.ps1'));
  await page.getByRole('button', {name: 'macOS / Linux', exact: true}).click();
  if ((process.env.AXIOVELA_SCREENSHOT || process.env.HYPOTERA_SCREENSHOT)) await page.screenshot({path: (process.env.AXIOVELA_SCREENSHOT || process.env.HYPOTERA_SCREENSHOT) + '-agentic-setup.png'});
  await page.getByRole('button', {name: 'Connect an API key instead', exact: true}).click();
  await connectionDialog.getByLabel('API key', {exact: true}).waitFor();
  await connectionDialog.getByRole('button', {name: 'Close model picker', exact: true}).click();
  await page.locator('.agenticHeaderControl label.switch').click();
  await page.getByRole('heading', {name: 'Get Agentic mode ready', exact: true}).waitFor();
  await cp(path.join(root, 'scripts/fixtures/herdr-start.mjs'), env.WORKBENCH_HERDR_PATH);
  await writeFile(env.HYPOTERA_HERDR_FIXTURE, '{}');
  await page.getByRole('button', {name: 'Retry and enable', exact: true}).click();
  await page.getByRole('heading', {name: 'Get Agentic mode ready', exact: true}).waitFor({state: 'hidden'});
  assert.equal(await page.getByRole('checkbox', {name: 'Agentic mode', exact: true}).isChecked(), true);
  assert.equal(await readFile(env.HYPOTERA_HERDR_FIXTURE + '.starts', 'utf8'), 'start\n');
  assert.equal(await page.getByRole('combobox', {name: 'Research focus', exact: true}).inputValue(), 'data-science');
  await page.getByRole('combobox', {name: 'Research focus', exact: true}).selectOption('math-statistics');
  await page.waitForFunction(async () => (await fetch('/api/assistant/capabilities').then(r => r.json())).preferences.experiment.profileId === 'math-statistics');
  assert.equal(await page.getByRole('combobox', {name: 'Access', exact: true}).inputValue(), 'full');
  await page.locator('.agenticHeaderControl label.switch').click();
  assert.equal(await page.getByRole('combobox', {name: 'Research focus', exact: true}).inputValue(), 'math-statistics');
  assert.equal(project.runs.length, 1);
  assert.ok(project.artifacts.length > 0);
  if (packaged) {
    const appRoot = await application.evaluate(({app}) => app.getAppPath());
    const {execFileSync} = await import('node:child_process');
    const engine = execFileSync(path.join(appRoot, 'desktop/tools', process.platform === 'win32' ? 'tectonic.exe' : 'tectonic'), ['--version'], {encoding: 'utf8', timeout: 15000});
    assert.match(engine, /Tectonic 0.17.0/);
  }

  if ((process.env.AXIOVELA_TEST_LATEX || process.env.HYPOTERA_TEST_LATEX) === '1') {
    const figure = project.artifacts.find(artifact => /\.svg$/i.test(artifact.path));
    assert.ok(figure, 'The example should supply an SVG to exercise image conversion');
    const result = await page.evaluate(async figurePath => {
      const source = String.raw`\documentclass{article}
\usepackage{amsmath,svg}
\begin{document}
Axiovela packaged LaTeX: $\int_0^1 x^2\,dx=1/3$.
\includesvg[width=5cm]{` + figurePath + String.raw`}
\end{document}`;
      const response = await fetch('/api/writeups/compile', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({draftText: source})});
      const result = await response.json();
      if (!response.ok) return {compileError: result};
      const pdf = await fetch(result.url);
      return {engine: result.engine, prefix: (await pdf.text()).slice(0, 5)};
    }, figure.path);
    if (result.compileError) {
      // This fixture contains only synthetic data. Capture native stderr as well
      // as the API diagnostic so platform failures are actionable in CI.
      const appRoot = await application.evaluate(({app}) => app.getAppPath());
      const {spawnSync} = await import('node:child_process');
      const diagnostic = spawnSync(path.join(appRoot, 'desktop/tools', process.platform === 'win32' ? 'tectonic.exe' : 'tectonic'),
        ['--keep-logs', '--outdir', path.join(project.root, 'exports'), path.join(project.root, 'writeups/main.render.tex')],
        {cwd: project.root, env, encoding: 'utf8', timeout: 120000});
      console.error('Synthetic LaTeX diagnostic:', diagnostic.error?.message || '', diagnostic.status, diagnostic.stdout, diagnostic.stderr);
      throw new Error(JSON.stringify(result.compileError));
    }
    assert.equal(result.prefix, '%PDF-');
    assert.ok(result.engine.includes('desktop'));
    console.log('Desktop smoke: bundled Tectonic compiled math and an SVG figure into a served PDF');
  }
  console.log('Desktop smoke: example loaded; checking project picker');
  const metric = JSON.parse(await readFile(path.join(project.root, 'runs/ols-seed-7/metrics.json'), 'utf8'));
  assert.ok(Object.keys(metric).length > 0);
  await page.getByRole('button', {name: 'Trials', exact: true}).click();
  await page.locator('.trialLedger button').first().waitFor();
  assert.equal(await page.getByRole('progressbar').count(), 0);
  const trialPath = path.join(project.root, 'runs/ols-seed-7/run.json');
  const trialSource = await readFile(trialPath, 'utf8');
  await writeFile(trialPath, JSON.stringify({...JSON.parse(trialSource), summary: 'Freshly saved trial result.'}));
  await page.locator('.trialLedger button').filter({hasText: 'ols-seed-7'}).click();
  await page.getByText('Freshly saved trial result.', {exact: true}).waitFor();
  if ((process.env.AXIOVELA_SCREENSHOT || process.env.HYPOTERA_SCREENSHOT)) await page.screenshot({path: (process.env.AXIOVELA_SCREENSHOT || process.env.HYPOTERA_SCREENSHOT) + '-trials.png'});
  await writeFile(trialPath, trialSource);
  await page.getByRole('button', {name: 'Write-up', exact: true}).click();
  await page.waitForFunction(() => document.querySelector('button[aria-label="Markdown"]')?.textContent.includes('Draft'));
  const screenshotPrefix = (process.env.AXIOVELA_SCREENSHOT || process.env.HYPOTERA_SCREENSHOT) || process.env.METHODFLOW_SCREENSHOT;
  if (screenshotPrefix) {
    await page.getByRole('button', {name: 'Markdown', exact: true}).click();
    await page.waitForFunction(() => document.querySelector('.writeupEditor textarea')?.value.includes('A line or a constant'));
    await page.locator('.markdownPreview h1').waitFor();
    await page.screenshot({path: screenshotPrefix + '-writeup.png'});
  }
  await page.getByRole('button', {name: 'Results', exact: true}).click();
  if (((process.env.AXIOVELA_SCREENSHOT || process.env.HYPOTERA_SCREENSHOT) || process.env.METHODFLOW_SCREENSHOT)) await page.screenshot({path: ((process.env.AXIOVELA_SCREENSHOT || process.env.HYPOTERA_SCREENSHOT) || process.env.METHODFLOW_SCREENSHOT) + '-example.png'});
  await page.evaluate(() => localStorage.setItem('desktop-smoke-persistence', 'saved'));
  // Folder creation succeeds on a machine with no Git on PATH.
  await page.getByRole('button', {name: 'Project', exact: true}).click();
  await page.getByRole('button', {name: 'Browse folders…'}).click();
  await page.waitForFunction(folder => document.querySelector('[aria-label="Project folder"]')?.value === folder, temporary);
  const blank = path.join(temporary, 'New research project');
  await page.getByRole('textbox', {name: 'Project folder'}).fill(blank);
  await page.getByRole('button', {name: 'Open or create', exact: true}).click();
  await page.waitForFunction(folder => document.querySelector('.projectSwitcher')?.textContent.includes(folder), 'New research project');
  assert.ok((await readdir(blank)).includes('workbench.project.json'));
  assert.ok(!(await readdir(blank)).includes('.git'));
  // Drop figures into the middle of a document, not at its end. Real textarea
  // Names arrive from an initial record, before metrics or figures exist.
  const plannedRun = path.join(blank, 'runs', 'planned-01');
  await mkdir(plannedRun, {recursive: true});
  await writeFile(path.join(plannedRun, 'run.json'), JSON.stringify({id: 'planned-01', name: 'Small pilot', experiment: 'Baseline comparison', status: 'running', startedAt: new Date().toISOString(), metrics: {}, artifacts: []}));
  await page.getByRole('button', {name: 'Trials', exact: true}).click();
  await page.locator('.trialLedger').getByText('Small pilot', {exact: true}).waitFor();
  await page.locator('.trialLedger').getByText('Baseline comparison', {exact: true}).waitFor();
  await page.getByRole('button', {name: 'Results', exact: true}).click();
  await page.getByRole('combobox', {name: 'Figures from', exact: true}).selectOption({label: 'Baseline comparison'});
  await page.getByText(/No figures yet for Baseline comparison/).waitFor();
  if (process.env.AXIOVELA_SCREENSHOT) await page.screenshot({path: process.env.AXIOVELA_SCREENSHOT + '-planned-experiment.png'});
  await rm(plannedRun, {recursive: true});
  // geometry and native DataTransfer exercise the shared browser/desktop UI.
  await page.getByRole('button', {name: 'Write-up', exact: true}).click();
  await page.waitForFunction(() => [...document.querySelectorAll('.draftIndicator')].every(el => el.textContent === 'Empty'));
  assert.equal(await page.getByRole('button', {name: 'Markdown', exact: true}).getAttribute('aria-pressed'), 'true', 'New projects default to Markdown');
  const formatMenu = page.getByRole('button', {name: 'Write-up default format', exact: true});
  await formatMenu.click();
  assert.equal(await page.getByRole('radio', {name: 'Markdown', exact: true}).isChecked(), true);
  if (process.env.AXIOVELA_SCREENSHOT) await page.screenshot({path: process.env.AXIOVELA_SCREENSHOT + '-format-default.png'});
  await page.getByRole('radio', {name: 'LaTeX', exact: true}).click();
  assert.equal(await page.getByRole('button', {name: 'Markdown', exact: true}).getAttribute('aria-pressed'), 'true', 'Changing the default does not switch or convert the current editor');
  await page.reload();
  await page.getByRole('button', {name: 'Write-up', exact: true}).click();
  await formatMenu.click();
  assert.equal(await page.getByRole('radio', {name: 'LaTeX', exact: true}).isChecked(), true, 'Default survives reload');
  await page.getByRole('radio', {name: 'Markdown', exact: true}).click();
  await page.reload();
  await page.getByRole('button', {name: 'Write-up', exact: true}).click();
  await formatMenu.click();
  assert.equal(await page.getByRole('radio', {name: 'Markdown', exact: true}).isChecked(), true, 'Both choices persist');
  await page.getByRole('radio', {name: 'LaTeX', exact: true}).click();
  await formatMenu.click();
  await page.getByRole('radio', {name: 'LaTeX', exact: true}).press('Escape');
  assert.equal(await formatMenu.getAttribute('aria-expanded'), 'false');
  assert.equal(await formatMenu.evaluate(button => button === document.activeElement), true);
  await page.getByRole('button', {name: 'LaTeX', exact: true}).click();
  // An assistant or external editor writes the unselected format. The indicator
  // must refresh without selecting that format or replacing the current editor.
  await writeFile(path.join(blank, 'writeups/main.md'), '# Newly written paper');
  await page.waitForFunction(() => document.querySelector('button[aria-label="Markdown"]')?.textContent.includes('Draft'));
  await writeFile(path.join(blank, 'writeups/main.md'), '  \n');
  await page.waitForFunction(() => document.querySelector('button[aria-label="Markdown"]')?.textContent.includes('Empty'));
  await page.getByRole('button', {name: 'Markdown', exact: true}).click();
  const editor = page.getByRole('textbox', {name: 'Write-up source'});
  await editor.fill('First paragraph.\n\nTarget line.\n\nLast paragraph.');
  assert.match(await page.getByRole('button', {name: 'Markdown', exact: true}).textContent(), /Draft/);
  await editor.evaluate(element => {
    const transfer = new DataTransfer();
    transfer.setData('application/x-workbench-artifact', JSON.stringify({path: 'artifacts/figures/example.png', caption: 'Inserted figure'}));
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const y = rect.top + parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop) + 2.5 * parseFloat(style.lineHeight);
    element.dispatchEvent(new DragEvent('drop', {bubbles: true, cancelable: true, dataTransfer: transfer, clientX: rect.left + 20, clientY: y}));
  });
  await page.waitForFunction(() => document.querySelector('[aria-label="Write-up source"]').value.includes('![Inserted figure]'));
  const dropped = await editor.inputValue();
  assert.ok(dropped.indexOf('![Inserted figure]') < dropped.indexOf('Target line.'));
  assert.ok(dropped.startsWith('First paragraph.'));
  assert.ok(dropped.endsWith('Last paragraph.'));
  // Wrapped and scrolled source still targets logical source lines.
  await editor.fill('A long line '.repeat(100) + '\nTail.');
  await editor.evaluate(element => {
    const transfer = new DataTransfer();
    transfer.setData('application/x-workbench-artifact', JSON.stringify({path: 'artifacts/figures/wrapped.png', caption: 'Wrapped'}));
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(new DragEvent('drop', {bubbles: true, cancelable: true, dataTransfer: transfer, clientY: rect.top + 80}));
  });
  await page.waitForFunction(() => document.querySelector('[aria-label="Write-up source"]').value.startsWith('![Wrapped]'));
  await editor.fill(Array.from({length: 100}, (_, i) => `Line ${i}`).join('\n'));
  await editor.evaluate(element => {
    const style = getComputedStyle(element);
    const height = parseFloat(style.lineHeight);
    element.scrollTop = height * 40;
    const transfer = new DataTransfer();
    transfer.items.add(new File(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="blue"/></svg>'], 'uploaded.svg', {type: 'image/svg+xml'}));
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(new DragEvent('drop', {bubbles: true, cancelable: true, dataTransfer: transfer, clientY: rect.top + parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop) + height / 2}));
  });
  await page.waitForFunction(() => document.querySelector('[aria-label="Write-up source"]').value.includes('uploaded'), {timeout: 15000});
  const uploaded = await editor.inputValue();
  assert.ok(uploaded.indexOf('uploaded') > uploaded.indexOf('Line 39'));
  assert.ok(uploaded.indexOf('uploaded') < uploaded.indexOf('Line 40'));
  await page.getByRole('button', {name: 'Save source', exact: true}).click();
  await page.waitForFunction(() => document.querySelector('.writeupFullPane .paneHint')?.textContent === 'All changes saved.');
  await page.getByRole('button', {name: 'Methods', exact: true}).click();
  console.log('Desktop smoke: checking access changes through the actual UI');
  const access = page.getByRole('combobox', {name: 'Access', exact: true});
  let nativeSession;
  for (const [mode, sandbox] of [['ask', 'read-only'], ['auto', 'workspace-write'], ['full', 'danger-full-access'], ['ask', 'read-only']]) {
    await access.selectOption(mode);
    await page.getByRole('textbox', {name: 'Experiment Chatbot message'}).fill('FIXTURE_STATE');
    const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/assistant') && response.request().method() === 'POST');
    await page.getByRole('button', {name: 'Send', exact: true}).click();
    const response = await responsePromise;
    assert.equal(response.request().postDataJSON().permissionMode, mode);
    assert.equal(response.request().postDataJSON().defaultWriteupFormat, 'latex');
    assert.equal(response.request().postDataJSON().writeupFormat, 'markdown', 'Current editor and initial write-up default remain independent');
    const started = await response.json();
    assert.ok(started.id);
    let record;
    const turnDeadline = Date.now() + 10000;
    do {
      record = await page.evaluate(id => fetch(`/api/assistant/${id}`).then(r => r.json()), started.id);
      if (record.status !== 'running') break;
      assert.ok(Date.now() < turnDeadline, 'Fixture assistant turn timed out');
      await new Promise(resolve => setTimeout(resolve, 100));
    } while (true);
    assert.equal(record.status, 'complete');
    assert.ok(record.output, `Expected policy output for ${mode}: ${JSON.stringify(record)}`);
    const policy = JSON.parse(record.output);
    assert.equal(policy.sandbox, sandbox);
    assert.equal(policy.approvalPolicy, mode === 'auto' ? 'on-request' : 'never');
    if (nativeSession) assert.equal(policy.id, nativeSession);
    nativeSession = policy.id;
    await page.waitForFunction(() => !document.querySelector('button.stopTask'));
  }
  await page.getByRole('button', {name: 'Choose experiment model and provider'}).click();
  await page.getByRole('combobox', {name: 'Connection', exact: true}).selectOption('pi');
  await page.getByRole('button', {name: 'Use model', exact: true}).click();
  await page.waitForFunction(() => document.querySelector('.modelPickerButton')?.textContent.startsWith('Pi'));
  assert.equal(await access.locator('option[value="auto"]').evaluate(option => option.disabled), true, await access.evaluate(el => el.outerHTML));
  assert.equal(await access.locator('option[value="ask"]').evaluate(option => option.disabled), false);
  assert.equal(await access.locator('option[value="full"]').evaluate(option => option.disabled), false);
  const denied = await page.evaluate(async () => {
    const response = await fetch('/api/assistant', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({message: 'STATE', permissionMode: 'auto', selection: {adapterId: 'pi', modelId: '', effort: ''}})});
    return {status: response.status, body: await response.json()};
  });
  assert.ok(denied.status >= 400, 'Pi Auto-approve must also be rejected by the backend');
  const toolHelp = await application.evaluate(async ({Menu, dialog}) => {
    const original = dialog.showMessageBox;
    let detail = '';
    dialog.showMessageBox = async (_window, options) => { detail = options.detail; return {response: 0}; };
    try {
      Menu.getApplicationMenu().items.find(item => item.label === 'Help').submenu.items.find(item => item.label === 'Optional tool setup…').click();
      const deadline = Date.now() + 5000;
      while (!detail && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    } finally { dialog.showMessageBox = original; }
    return detail;
  });
  assert.match(toolHelp, /22\.19/);
  assert.match(toolHelp, /herdr integration install pi/);
  assert.match(toolHelp, /Tectonic/);
  const notices = await application.evaluate(async ({Menu, dialog}) => {
    const original = dialog.showMessageBox; const captured = [];
    dialog.showMessageBox = async (_window, options) => { captured.push(options.detail); return {response: captured.length === 1 ? 1 : 0}; };
    try {
      Menu.getApplicationMenu().items.find(item => item.label === 'Help').submenu.items.find(item => item.label === 'License and software notice').click();
      const deadline = Date.now() + 5000;
      while (captured.length < 2 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    }
    finally { dialog.showMessageBox = original; }
    return captured;
  });
  assert.match(notices[0], /Applicable law may limit/);
  assert.match(notices[1], /IN NO EVENT SHALL THE\s+AUTHORS/);
  console.log('Desktop smoke: access changes, Pi limits, legal notices, and resumed conversation passed; closing first process');
  assert.deepEqual(errors, [], 'Renderer should not throw errors');
  await application.close(); application = null;
  console.log('Desktop smoke: relaunching');
  delete env.METHODFLOW_DESKTOP_PROFILE;
  env.HYPOTERA_DESKTOP_PROFILE = profile;
  // A new process gets a new loopback port but the same stable application origin.
  application = await electron.launch({executablePath, args: packaged ? [] : [root], env, chromiumSandbox: true, timeout: 45000});
  const reopened = await application.firstWindow({timeout: 30000});
  await reopened.waitForFunction(() => document.querySelector('.projectSwitcher')?.textContent.includes('New research project'));
  assert.equal(await reopened.evaluate(() => localStorage.getItem('desktop-smoke-persistence')), 'saved');
  console.log('Desktop smoke: persistence passed; starting cancellation fixture');
  // Start an intentionally long local fixture to verify the close guard and the
  // persisted cancellation record. No provider or external tool is involved.
  await writeFile(path.join(blank, 'workflows/seed-matched-comparison.mjs'), 'setInterval(() => {}, 1000);\n');
  const run = await reopened.evaluate(async () => {
    const options = body => ({method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)});
    const approval = await fetch('/api/approvals', options({})).then(r => r.json());
    return fetch('/api/runs', options({approvalToken: approval.approvalToken})).then(r => r.json());
  });
  assert.equal(run.status, 'running');
  await application.evaluate(({dialog, app}) => { globalThis.smokeQuitPrompt = ''; dialog.showMessageBox = async (_window, options) => { globalThis.smokeQuitPrompt = options.message; return {response: 0}; }; app.quit(); });
  const promptDeadline = Date.now() + 5000;
  while (!await application.evaluate(() => Boolean(globalThis.smokeQuitPrompt))) { assert.ok(Date.now() < promptDeadline, 'Expected a running-task quit prompt'); await new Promise(resolve => setTimeout(resolve, 50)); }
  assert.match(await application.evaluate(() => globalThis.smokeQuitPrompt), /still running/);
  assert.equal((await reopened.evaluate(() => fetch('/api/runs').then(r => r.json()))).runs[0].status, 'running');
  await application.evaluate(({dialog}) => { dialog.showMessageBox = async () => ({response: 1}); });
  await application.close(); application = null;
  console.log('Desktop smoke: shutdown finished');
  assert.equal(JSON.parse(await readFile(path.join(blank, 'runs', run.id, 'run.json'), 'utf8')).status, 'canceled');
  // An explicitly configured but unavailable engine must produce actionable UI,
  // rather than making a missing installation look like a document syntax error.
  await writeFile(path.join(profile, 'tools.json'), `${JSON.stringify({LATEX: path.join(temporary, 'missing-tectonic.exe')}, null, 2)}\n`);
  application = await electron.launch({executablePath, args: packaged ? [] : [root], env, chromiumSandbox: true, timeout: 45000});
  const missingLatex = await application.firstWindow({timeout: 30000});
  await missingLatex.waitForFunction(() => document.querySelector('.projectSwitcher')?.textContent.includes('New research project'));
  await missingLatex.getByRole('button', {name: 'Write-up', exact: true}).click();
  await missingLatex.getByRole('button', {name: 'LaTeX', exact: true}).click();
  const latexEditor = missingLatex.getByRole('textbox', {name: 'Write-up source'});
  await latexEditor.fill('\\documentclass{article}\\begin{document}Setup check\\end{document}');
  await missingLatex.getByRole('button', {name: 'Render document', exact: true}).click();
  await missingLatex.getByRole('heading', {name: 'PDF rendering needs Tectonic', exact: true}).waitFor();
  assert.match(await missingLatex.getByRole('alertdialog').innerText(), /Tools → Select Tectonic executable/);
  await application.close(); application = null;
  console.log(`Desktop ${packaged ? 'packaged' : 'development'} smoke passed: sandbox configuration, secure origin, single instance, native picker, bundled example, Git-free project, relaunch persistence, quit guard, and persisted cancellation.`);
} catch (error) {
  console.error(error.stack || error.message);
  throw error;
} finally {
  if (application) {
    const killTimer = setTimeout(() => application?.process().kill('SIGKILL'), 5000);
    await application.close().catch(() => {});
    clearTimeout(killTimer);
  }
  await rm(temporary, {recursive: true, force: true, maxRetries: 8, retryDelay: 250});
  clearTimeout(deadline);
}
