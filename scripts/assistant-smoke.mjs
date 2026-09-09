import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {discoverRuntime, validateSelection, runAssistant} from '../server/assistant-runtime.mjs';

const cwd = await mkdtemp(path.join(os.tmpdir(), 'workbench-assistant-'));
process.env.WORKBENCH_CODEX_PATH = path.resolve('scripts/fixtures/assistant-rpc.mjs');
const selection = {adapterId: 'codex', modelId: 'test-model', effort: 'high'};
const events = [];
let sessionId;
async function run(extra = {}) {
  return runAssistant({selection, mode: 'ask', cwd, prompt: 'FIXTURE_STATE', sessionId, signal: new AbortController().signal,
    onSession: id => { sessionId = id; }, onOutput: () => {}, onEffective: () => {}, onEvent: e => events.push(e), ...extra});
}
try {
  const catalog = await discoverRuntime('codex', cwd);
  assert.equal(catalog.models.length, 2);
  assert.equal(JSON.stringify(catalog).includes('NEVER-EXPOSE'), false);
  await assert.rejects(validateSelection({...selection, effort: 'ultra'}, cwd), /not supported/);
  await assert.rejects(validateSelection({...selection, modelId: 'missing'}, cwd), /no longer/);
  await assert.rejects(validateSelection({...selection, adapterId: 'not-a-provider'}, cwd), /supported/);
  const first = JSON.parse(await run());
  assert.equal(first.effort, 'high'); assert.equal(first.turnEffort, 'high'); assert.equal(first.sandbox, 'read-only'); assert.equal(first.approvalPolicy, 'never'); assert.equal(first.approvalsReviewer, 'user');
  const second = JSON.parse(await run({selection: {...selection, modelId: 'second-model', effort: ''}, mode: 'auto'}));
  assert.equal(second.id, first.id); assert.equal(second.turns, 2); assert.equal(second.model, 'second-model'); assert.equal(second.effort, 'low'); assert.equal(second.sandbox, 'workspace-write'); assert.equal(second.approvalPolicy, 'on-request'); assert.equal(second.approvalsReviewer, 'auto_review');
  const elevated = JSON.parse(await run({mode: 'full'}));
  assert.equal(elevated.id, first.id); assert.equal(elevated.sandbox, 'danger-full-access'); assert.equal(elevated.approvalPolicy, 'never');
  const restricted = JSON.parse(await run({mode: 'ask'}));
  assert.equal(restricted.id, first.id); assert.equal(restricted.sandbox, 'read-only'); assert.equal(restricted.approvalPolicy, 'never');
  const fresh = JSON.parse(await run({sessionId: null, mode: 'full'}));
  assert.notEqual(fresh.id, first.id); assert.equal(fresh.turns, 1); assert.equal(fresh.sandbox, 'danger-full-access');
  for (const flag of ['archived', 'archiveOnStart']) {
    const file = path.join(cwd, `.fixture-${sessionId}.json`);
    const prior = JSON.parse(await readFile(file, 'utf8'));
    await writeFile(file, JSON.stringify({...prior, [flag]: true}));
    const recovered = JSON.parse(await run());
    assert.equal(recovered.id, prior.id, 'archive recovery preserves the original native conversation');
    assert.equal(recovered.turns, prior.turns + 1, 'recovery starts exactly one new turn');
  }
  assert.equal(events.filter(event => event.label === 'Archived conversation restored').length, 2);
  const outputs = [];
  assert.equal(await run({prompt: 'FIXTURE_CHILD', onOutput: text => outputs.push(text)}), 'Root completed and verified both demos');
  assert.ok(!outputs.some(text => /Inspection sent|Stale response/.test(text)));
  assert.ok(outputs.includes('Root is still working'), 'root events arriving before the start reply are retained');
  await assert.rejects(run({prompt: 'FIXTURE_FAIL'}), /provider rejected/);
  await assert.rejects(run({sessionId: 'missing-session'}), /ENOENT/);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 200);
  await assert.rejects(run({prompt: 'FIXTURE_HANG', signal: controller.signal}), /canceled/); clearTimeout(timer);
  assert.equal(JSON.stringify(events).includes('private raw output'), false);
  process.env.WORKBENCH_CODEX_PATH = path.join(cwd, 'missing-runtime');
  const missing = await discoverRuntime('codex', cwd, true);
  assert.equal(missing.available, false); assert.equal(missing.type, 'cli'); assert.match(missing.setup, /sign in/);
  console.log('Assistant protocol smoke passed: catalog, validation, resume, model/effort change, fresh session, permissions, failure, cancellation, diagnostic filtering.');
} finally { await rm(cwd, {recursive: true, force: true}); }
