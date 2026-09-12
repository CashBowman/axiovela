import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, rename, rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {_electron as electron} from 'playwright-core';

const root = process.cwd();
const packagedBinary = process.env.AXIOVELA_FIGURE_TEST_BINARY;
const executablePath = packagedBinary || (await import('electron')).default;
const tmp = await mkdtemp(path.join(os.tmpdir(), 'axiovela-figure-edit-'));
const home = path.join(tmp, 'home');
const project = path.join(tmp, 'project');
const env = {...process.env, HOME: home, USERPROFILE: home, APPDATA: path.join(home, 'AppData/Roaming'), LOCALAPPDATA: path.join(home, 'AppData/Local'), AXIOVELA_DESKTOP_PROFILE: path.join(tmp, 'profile'), XDG_CONFIG_HOME: home, XDG_CACHE_HOME: home};
for (const directory of [home, env.APPDATA, env.LOCALAPPDATA]) await mkdir(directory, {recursive: true});
for (const key of Object.keys(env)) if (/^(WORKBENCH_|OPENAI_|ANTHROPIC_|GEMINI_|GOOGLE_|AZURE_|ELECTRON_RUN_AS_NODE$|NODE_OPTIONS$|NODE_PATH$)/.test(key)) delete env[key];
// Only a credential-free fixture can be selected in this temporary profile.
const fixture = path.join(tmp, 'codex.mjs');
await writeFile(fixture, await readFile('scripts/fixtures/assistant-rpc.mjs'));
env.WORKBENCH_CODEX_PATH = fixture;
let app;
try {
  app = await electron.launch({executablePath, args: packagedBinary ? [] : [root], env, chromiumSandbox: true});
  const page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  await page.waitForFunction(() => document.querySelector('select[aria-label="Conversation"]')?.disabled === false);
  await page.getByRole('button', {name: 'Project', exact: true}).click();
  await page.getByRole('textbox', {name: 'Project folder'}).fill(project);
  await page.getByRole('button', {name: 'Open or create', exact: true}).click();
  await page.getByRole('dialog').waitFor({state: 'hidden'});
  const relative = 'artifacts/figures/curve with spaces.svg';
  const file = path.join(project, relative);
  const metadata = path.join(project, 'artifacts/figures/metadata.json');
  const svg = width => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="80"><rect width="${width}" height="80" fill="#557799"/></svg>`;
  const saveMetadata = title => writeFile(metadata, JSON.stringify({schemaVersion: 'workbench.figures/v1', figures: [{path: relative, title, caption: title}]}));
  await writeFile(file, svg(320));
  await writeFile(path.join(project, 'artifacts/figures/other.svg'), svg(280));
  await saveMetadata('Original curve');
  await page.getByRole('button', {name: 'Results', exact: true}).click();
  const card = page.locator('.figureImage').filter({has: page.getByRole('img', {name: 'Original curve', exact: true})});
  await card.waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('.figureImage img')].some(img => img.naturalWidth === 320));
  const oldUrl = await card.locator('img').getAttribute('src');
  await card.click();
  await page.waitForFunction(() => document.querySelector('.viewerCanvas img')?.naturalWidth === 320);
  // Replace the same figure while its enlarged viewer is open, as an assistant
  // does when changing layout. The updated mtime can also reorder the gallery.
  await writeFile(file + '.tmp', svg(480));
  await rename(file + '.tmp', file);
  await saveMetadata('Revised curve');
  await page.getByRole('button', {name: 'Enlarge Revised curve', exact: true}).waitFor();
  await page.waitForFunction(() => document.querySelector('.viewerCanvas img')?.naturalWidth === 480, null, {timeout: 10000});
  assert.equal(await page.locator('#figure-viewer-title').innerText(), 'Revised curve');
  const revisedCard = page.getByRole('button', {name: 'Enlarge Revised curve', exact: true}).locator('img');
  await page.waitForFunction(() => [...document.querySelectorAll('.figureImage img')].some(img => img.naturalWidth === 480));
  const newUrl = await revisedCard.getAttribute('src');
  assert.notEqual(newUrl, oldUrl, 'same-path edits must reload the image');
  assert.equal(new URL(newUrl, page.url()).searchParams.get('path'), relative);
  assert.equal(await page.locator('.figureGrid > figure').count(), 2, 'editing must not add a gallery card');
  assert.equal(await page.getByRole('link', {name: 'Download original figure'}).getAttribute('href'), newUrl);
  assert.equal(await page.locator('.viewerFilmstrip button[aria-current="true"] img').getAttribute('src'), newUrl);
  // Ordinary project polls must not continuously reload an unchanged image.
  await page.waitForResponse(response => new URL(response.url()).pathname === '/api/project');
  assert.equal(await revisedCard.getAttribute('src'), newUrl);
  await page.getByRole('button', {name: 'Close figure viewer'}).click();
  console.log('Figure edit smoke passed: same-path replacement refreshes the card, open viewer, title, filmstrip and download without duplicates or poll-driven reloads.');
} finally {
  await app?.evaluate(({dialog}) => { dialog.showMessageBox = async () => ({response: 1}); }).catch(() => {});
  await app?.close();
  await rm(tmp, {recursive: true, force: true});
}
