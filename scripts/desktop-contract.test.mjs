import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp, readFile, rm, mkdir, writeFile, symlink} from 'node:fs/promises';
import {copyDesktopBundle} from './desktop-bundle.mjs';
import os from 'node:os';
import path from 'node:path';
import {localServerConfig} from '../server/local-server-config.mjs';
import {fork, spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
const require = createRequire(import.meta.url);
const {isAppUrl, isExternalUrl, allowsPermission, isMarkdownPdfResource} = require('../desktop/security.cjs');
const {credentialStore} = require('../desktop/credentials.cjs');
const config = require('../forge.config.cjs');

test('DMG bundle framework links work after removing the build directory', {skip: process.platform === 'win32'}, async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'axiovela-dmg-test-'));
  const source = path.join(temporary, 'build/App.app');
  const destination = path.join(temporary, 'installed/App.app');
  const framework = 'Contents/Frameworks/Electron Framework.framework';
  try {
    await mkdir(path.join(source, framework, 'Versions/A'), {recursive: true});
    await writeFile(path.join(source, framework, 'Versions/A/Electron Framework'), 'framework fixture');
    await symlink('A', path.join(source, framework, 'Versions/Current'));
    await symlink('Versions/Current/Electron Framework', path.join(source, framework, 'Electron Framework'));
    await copyDesktopBundle(source, destination);
    await rm(path.join(temporary, 'build'), {recursive: true});
    assert.equal(await readFile(path.join(destination, framework, 'Electron Framework'), 'utf8'), 'framework fixture');
  } finally { await rm(temporary, {recursive: true, force: true}); }
});

test('desktop URL boundary rejects alternate hosts, credentials and executable schemes', () => {
  assert.ok(isAppUrl('methodflow://app/api/project'));
  for (const value of ['methodflow://evil/', 'methodflow://user@app/', 'file:///etc/passwd', 'javascript:alert(1)', 'https://example.com/']) assert.equal(isAppUrl(value), false);
  assert.ok(isExternalUrl('https://example.com/paper'));
  for (const value of ['file:///tmp/test', 'javascript:alert(1)', 'https://user:password@example.com', 'methodflow://app/']) assert.equal(isExternalUrl(value), false);
});
test('ephemeral ports are opt-in and still loopback only', () => {
  assert.throws(() => localServerConfig({WORKBENCH_PORT: '0'}));
  assert.equal(localServerConfig({WORKBENCH_PORT: '0'}, {allowEphemeral: true}).port, 0);
  assert.throws(() => localServerConfig({WORKBENCH_PORT: '0', WORKBENCH_HOST: '0.0.0.0'}, {allowEphemeral: true}));
});
test('only the trusted main frame can request clipboard writes; reads remain denied', () => {
  assert.ok(allowsPermission('clipboard-sanitized-write', 'methodflow://app/', true));
  assert.equal(allowsPermission('clipboard-read', 'methodflow://app/', true), false);
  assert.equal(allowsPermission('clipboard-sanitized-write', 'methodflow://app/', false), false);
  assert.equal(allowsPermission('clipboard-sanitized-write', 'https://example.com/', true), false);
  assert.equal(allowsPermission('media', 'methodflow://app/', true), false);
});
test('installer allowlist excludes research, source control, credentials and tools', () => {
  for (const file of ['/.git/config', '/.local/DEVELOPMENT-HANDOFF.md', '/.local/desktop-profile/state.json', '/.env', '/.lavish/plan.html', '/runs/a.json', '/providers.json', '/out/app', '/src/main.jsx']) assert.ok(config.packagerConfig.ignore(file), file);
  for (const file of ['/desktop/main.cjs', '/server/index.mjs', '/dist/index.html', '/src/markdown-format.mjs', '/project-template/.gitignore', '/node_modules/yaml/package.json']) assert.equal(config.packagerConfig.ignore(file), false, file);
});
test('credential store refuses unavailable encryption without writing plaintext', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'axiovela-vault-test-'));
  const file = path.join(root, 'vault');
  try {
    for (const platform of ['darwin', 'linux', 'win32']) {
      const unavailable = credentialStore(file, {
        isEncryptionAvailable: () => false,
        isAsyncEncryptionAvailable: async () => false,
      }, {platform});
      assert.deepEqual(await unavailable.read(), {});
      await assert.rejects(unavailable.write({key: 'synthetic-test-key'}), /No API key was saved/);
      await assert.rejects(readFile(file), {code: 'ENOENT'});
    }
    const plaintext = credentialStore(file, {isEncryptionAvailable: () => true, getSelectedStorageBackend: () => 'basic_text'}, {platform: 'linux'});
    await assert.rejects(plaintext.write({key: 'synthetic-test-key'}), /No API key was saved/);
    await assert.rejects(readFile(file), {code: 'ENOENT'});
  } finally { await rm(root, {recursive: true, force: true}); }
});

test('desktop backend refuses unauthenticated requests and shuts down its listener', {timeout: 15000}, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'axiovela-desktop-backend-'));
  const token = randomBytes(32).toString('hex');
  const child = fork(fileURLToPath(new URL('../desktop/backend-entry.mjs', import.meta.url)), [], {
    env: {...process.env, WORKBENCH_PROJECT_ROOT: '', WORKBENCH_INITIALIZE_GIT: '', WORKBENCH_HOST: '127.0.0.1', WORKBENCH_PORT: '0', WORKBENCH_STATE_PATH: path.join(root, 'state.json'), WORKBENCH_UI_ORIGINS: 'methodflow://app'},
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  const exited = once(child, 'exit');
  try {
    const ready = new Promise((resolve, reject) => {
      child.on('message', message => { if (message.type === 'ready') resolve(message.port); if (message.type === 'startup-error') reject(new Error('Backend failed to start')); });
      child.once('error', reject); child.once('exit', () => reject(new Error('Backend exited before readiness')));
    });
    child.send({type: 'configure', token});
    const url = `http://127.0.0.1:${await ready}`;
    assert.equal((await fetch(url + '/api/health')).status, 403);
    assert.equal((await fetch(url + '/api/health', {headers: {'x-methodflow-session': 'wrong'}})).status, 403);
    assert.equal((await fetch(url + '/api/health', {headers: {'x-methodflow-session': token, origin: 'https://example.com'}})).status, 403);
    const response = await fetch(url + '/api/health', {headers: {'x-methodflow-session': token, origin: 'methodflow://app'}});
    assert.equal(response.status, 200);
    assert.equal((await response.json()).projectRoot, null);
    child.send({type: 'shutdown'});
    await exited;
    await assert.rejects(fetch(url + '/api/health', {signal: AbortSignal.timeout(1000)}));
  } finally { if (child.exitCode === null) { child.kill(); await exited; } await rm(root, {recursive: true, force: true}); }
});

test('repeated Linux user installs preserve the first launcher backup', {skip: process.platform !== 'linux'}, async () => {
  const {mkdir, writeFile} = await import('node:fs/promises');
  const {execFile} = await import('node:child_process');
  const {promisify} = await import('node:util');
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'axiovela-launcher-test-'));
  const data = path.join(temporary, 'data');
  try {
    await mkdir(path.join(temporary, `out/Axiovela-linux-${process.arch}`), {recursive: true});
    await writeFile(path.join(temporary, `out/Axiovela-linux-${process.arch}/axiovela`), 'fixture');
    await writeFile(path.join(temporary, 'package.json'), JSON.stringify({version: 'test'}));
    await mkdir(path.join(temporary, `out/Axiovela-linux-${process.arch}/resources/app`), {recursive: true});
    await writeFile(path.join(temporary, `out/Axiovela-linux-${process.arch}/resources/app/package.json`), JSON.stringify({version: 'test'}));
    await mkdir(path.join(data, 'applications'), {recursive: true});
    const launcher = path.join(data, 'applications/axiovela.desktop');
    await writeFile(launcher, 'original launcher');
    const legacyLauncher = path.join(data, 'applications/methodflow.desktop');
    const legacy = '[Desktop Entry]\nName=MethodFlow Beta\nStartupWMClass=methodflow\nIcon=/fixture/resources/app/desktop/icons/icon.png\n';
    await writeFile(legacyLauncher, legacy);
    const hypoteraLauncher = path.join(data, 'applications/hypotera.desktop');
    const previous = legacy.replaceAll('MethodFlow', 'Hypotera').replaceAll('methodflow', 'hypotera');
    await writeFile(hypoteraLauncher, previous);
    const fakeBin = path.join(temporary, 'bin');
    await mkdir(fakeBin);
    const cacheLog = path.join(temporary, 'cache-refresh.jsonl');
    const commandFixture = `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
if (path.basename(process.argv[1]) === 'kreadconfig6') console.log('en_US.UTF-8');
else fs.appendFileSync((process.env.AXIOVELA_CACHE_FIXTURE_LOG || process.env.HYPOTERA_CACHE_FIXTURE_LOG), JSON.stringify({command: path.basename(process.argv[1]), args: process.argv.slice(2), locale: process.env.LC_ALL}) + '\\n');
`;
    for (const command of ['kreadconfig6', 'kbuildsycoca6', 'update-desktop-database']) await writeFile(path.join(fakeBin, command), commandFixture, {mode: 0o755});
    const install = () => promisify(execFile)(process.execPath, [fileURLToPath(new URL('./desktop-install-linux.mjs', import.meta.url))], {cwd: temporary, env: {...process.env, XDG_DATA_HOME: data, PATH: fakeBin, HYPOTERA_CACHE_FIXTURE_LOG: cacheLog}});
    await install(); await install();
    const refreshed = (await readFile(cacheLog, 'utf8')).trim().split('\n').map(JSON.parse);
    assert.ok(refreshed.some(entry => entry.command === 'kbuildsycoca6' && entry.locale === 'en_US.UTF-8'));
    assert.ok(refreshed.some(entry => entry.command === 'update-desktop-database' && entry.args[0] === path.join(data, 'applications')));
    assert.equal(await readFile(launcher + '.before-test', 'utf8'), 'original launcher');
    assert.match(await readFile(launcher, 'utf8'), /Name=Axiovela\n/);
    assert.match(await readFile(hypoteraLauncher, 'utf8'), /NoDisplay=true/);
    assert.match(await readFile(hypoteraLauncher, 'utf8'), /axiovela/);
    assert.equal(await readFile(hypoteraLauncher + '.before-axiovela', 'utf8'), previous);
    assert.equal(await readFile(legacyLauncher + '.before-axiovela', 'utf8'), legacy);
    assert.match(await readFile(legacyLauncher, 'utf8'), /NoDisplay=true/);
    assert.match(await readFile(legacyLauncher, 'utf8'), /Name=Axiovela\n/);
    await writeFile(path.join(temporary, 'package.json'), JSON.stringify({version: 'next'}));
    await writeFile(path.join(temporary, `out/Axiovela-linux-${process.arch}/resources/app/package.json`), JSON.stringify({version: 'next'}));
    await install();
    assert.match(await readFile(legacyLauncher, 'utf8'), /desktop-next/);
    assert.equal(await readFile(legacyLauncher + '.before-axiovela', 'utf8'), legacy);
    await writeFile(legacyLauncher, 'custom user launcher');
    await install();
    assert.equal(await readFile(legacyLauncher, 'utf8'), 'custom user launcher');
  } finally { await rm(temporary, {recursive: true, force: true}); }
});

test('desktop tool discovery handles Dock PATH, Windows Path and explicit settings', () => {
  const {toolEnvironment} = require('../desktop/tools.cjs');
  const mac = toolEnvironment({PATH: '/usr/bin:/bin'}, {LATEX: '/custom/tectonic', directories: ['/custom/python/bin', '.', 'relative']}, {home: '/fixture', platform: 'darwin', root: '/missing'});
  assert.equal(mac.WORKBENCH_LATEX_PATH, '/custom/tectonic');
  assert.ok(mac.PATH.includes('/opt/homebrew/bin'));
  assert.ok(mac.PATH.includes('/custom/python/bin'));
  assert.ok(!mac.PATH.split(':').includes('.'));
  const win = toolEnvironment({Path: 'C:\\Windows\\System32', APPDATA: 'C:\\Users\\Test\\AppData\\Roaming'}, {}, {home: 'C:\\Users\\Test', platform: 'win32', root: 'C:\\missing'});
  assert.equal(win.Path, undefined);
  assert.ok(win.PATH.includes('C:\\Windows\\System32'));
  assert.ok(win.PATH.includes('C:\\Users\\Test\\AppData\\Roaming\\npm'));
  assert.ok(!win.PATH.includes('undefined'));
});


test('Linux launcher refuses a stale package before changing the application menu', {skip: process.platform !== 'linux'}, async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'axiovela-launcher-version-'));
  try {
    const source = path.join(temporary, `out/Axiovela-linux-${process.arch}`);
    await mkdir(path.join(source, 'resources/app'), {recursive: true});
    await writeFile(path.join(temporary, 'package.json'), JSON.stringify({version: '0.2.0-beta.7'}));
    await writeFile(path.join(source, 'resources/app/package.json'), JSON.stringify({version: '0.2.0-beta.6'}));
    await writeFile(path.join(source, 'axiovela'), '');
    const data = path.join(temporary, 'data');
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./desktop-install-linux.mjs', import.meta.url))], {cwd: temporary, env: {...process.env, XDG_DATA_HOME: data}, encoding: 'utf8'});
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Packaged app is 0.2.0-beta.6/);
    await assert.rejects(readFile(path.join(data, 'applications/axiovela.desktop')), {code: 'ENOENT'});
  } finally { await rm(temporary, {recursive: true, force: true}); }
});


test('Markdown PDF export accepts scoped documents while retaining its resource boundary', () => {
  const resource = '/api/artifacts/file?path=exports%2Fchat-ab12-cd34.html';
  assert.ok(isMarkdownPdfResource(resource));
  for (const workspace of ['/tmp/project α', 'C:\\research\\project β']) assert.ok(isMarkdownPdfResource(`${resource}&workspace=${encodeURIComponent(workspace)}`));
  for (const value of [null, `https://example.com${resource}`, `${resource}&other=1`, `${resource}&path=exports%2Fchat-ab12.html`, `${resource}&workspace=a&workspace=b`, `${resource}&workspace=`, `${resource}&workspace=%00`, `${resource}#fragment`, '/api/artifacts/file?path=exports%2F..%2Fsecret.html', '/api/artifacts/file?path=exports%2Fother.html']) assert.equal(isMarkdownPdfResource(value), false, String(value));
});
