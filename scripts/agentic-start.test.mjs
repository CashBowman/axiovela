import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile, readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {discoverAgenticMode, ensureAgenticMode} from '../server/agentic-mode.mjs';
const pi = {available: true, models: [{id: 'fixture/model'}]};
test('Agentic startup handles cold start, concurrency, missing tools, login, incompatibility and failure', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'axiovela-agentic-start-'));
  const prior = {herdr: process.env.WORKBENCH_HERDR_PATH, fixture: process.env.HYPOTERA_HERDR_FIXTURE};
  const config = path.join(root, 'server.json');
  process.env.HYPOTERA_HERDR_FIXTURE = config;
  process.env.WORKBENCH_HERDR_PATH = path.resolve('scripts/fixtures/herdr-start.mjs');
  try {
    await writeFile(config, '{}');
    assert.equal((await discoverAgenticMode(pi, root)).canStart, true);
    const ready = await Promise.all([ensureAgenticMode(pi, root), ensureAgenticMode(pi, root)]);
    assert.ok(ready.every(item => item.available));
    assert.equal(await readFile(config + '.starts', 'utf8'), 'start\n', 'concurrent enable requests share one startup');
    await ensureAgenticMode(pi, root);
    assert.equal(await readFile(config + '.starts', 'utf8'), 'start\n', 'reuse a running server');
    await assert.rejects(ensureAgenticMode({available: true, models: []}, root), error => /login/.test(error.message) && !error.details.agentic.piAvailable);
    await writeFile(config, '{"incompatible":true}');
    await assert.rejects(ensureAgenticMode(pi, root), /compatible/);
    assert.equal(await readFile(config + '.starts', 'utf8'), 'start\n', 'never replace an incompatible running server');
    await rm(config + '.ready');
    await writeFile(config, '{"fail":true}');
    await assert.rejects(ensureAgenticMode(pi, root), /exited during startup/);
    await writeFile(config, '{"stall":true}');
    await assert.rejects(ensureAgenticMode(pi, root, {timeout: 400}), /in time/);
    process.env.WORKBENCH_HERDR_PATH = path.join(root, 'missing-herdr');
    await assert.rejects(ensureAgenticMode(pi, root), error => error.status === 409 && !error.details.agentic.herdrAvailable);
  } finally {
    for (const [key, value] of [['WORKBENCH_HERDR_PATH', prior.herdr], ['HYPOTERA_HERDR_FIXTURE', prior.fixture]]) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await rm(root, {recursive: true, force: true});
  }
});
