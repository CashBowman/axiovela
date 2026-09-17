import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {cleanupCodexSidebar, runAssistant} from '../server/assistant-runtime.mjs';

for (const scenario of ['idle', 'notLoaded', 'active', 'systemError', 'unknown', 'wrong-root', 'pinned', 'isPinned', 'worker', 'pagination', 'malformed', 'read-error', 'list-error', 'archive-error', 'abort-after-read', 'abort-after-list']) {
  test(`cleanup safety: ${scenario}`, async () => {
    const calls = [], controller = new AbortController();
    const rpc = {request: async (method, params, timeout) => {
      calls.push({method, params}); assert.ok(timeout <= 1500);
      if (method === 'thread/read') {
        assert.deepEqual(params, {threadId: 'root', includeTurns: false});
        if (scenario === 'read-error') throw new Error('Method not found');
        if (scenario === 'abort-after-read') controller.abort();
        return {thread: {id: scenario === 'wrong-root' ? 'other' : 'root', status: {type: ['notLoaded', 'active', 'systemError', 'unknown'].includes(scenario) ? scenario : 'idle'}, ...(scenario === 'pinned' ? {pinned: true} : {}), ...(scenario === 'isPinned' ? {isPinned: true} : {})}};
      }
      if (method === 'thread/loaded/list') {
        assert.deepEqual(params, {limit: 2});
        if (scenario === 'list-error') throw new Error('timed out');
        if (scenario === 'abort-after-list') controller.abort();
        return {data: scenario === 'malformed' ? null : scenario === 'worker' ? ['root', 'worker'] : ['root'], nextCursor: scenario === 'pagination' ? 'next-page' : null};
      }
      assert.equal(method, 'thread/archive'); assert.deepEqual(params, {threadId: 'root'});
      if (scenario === 'archive-error') throw new Error('archive failed');
    }};
    await cleanupCodexSidebar(rpc, {threadId: 'root', signal: controller.signal});
    assert.equal(calls.some(c => c.method === 'thread/archive'), ['idle', 'notLoaded', 'archive-error'].includes(scenario));
  });
}

test('native archive/resume retains history and only cleans matching completed managed turns', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'axiovela-codex-sidebar-'));
  const log = path.join(cwd, 'rpc.jsonl');
  const previous = process.env.WORKBENCH_CODEX_PATH;
  process.env.WORKBENCH_CODEX_PATH = path.resolve('scripts/fixtures/assistant-rpc.mjs');
  let sessionId;
  const calls = async () => (await readFile(log, 'utf8')).trim().split('\n').map(JSON.parse);
  const state = async () => JSON.parse(await readFile(path.join(cwd, `.fixture-${sessionId}.json`), 'utf8'));
  const run = extra => runAssistant({selection: {adapterId: 'codex', modelId: 'test-model', effort: 'high'}, mode: 'ask', cwd, prompt: 'FIXTURE_STATE', conversationId: 'stable-logical-id', conversationTitle: 'Manual research title', sessionId, env: {...process.env, AXIOVELA_CODEX_FIXTURE_LOG: log}, signal: new AbortController().signal, onSession: id => { if (sessionId) assert.equal(id, sessionId); sessionId = id; }, onOutput() {}, onEffective() {}, onEvent() {}, ...extra});
  try {
    for (let i = 1; i <= 3; i++) {
      const output = JSON.parse(await run());
      assert.equal(output.turns, i); assert.equal(output.name, 'Manual research title');
      const saved = await state(); assert.equal(saved.archived, true); assert.equal(saved.history.length, i);
    }
    const trace = await calls();
    assert.equal(trace.filter(c => c.method === 'thread/start').length, 1);
    assert.equal(trace.filter(c => c.method === 'turn/start').length, 3, 'accepted turns never replay');
    assert.equal(trace.filter(c => c.method === 'thread/unarchive').length, 2);
    assert.equal(trace.filter(c => c.method === 'thread/archive').length, 3);
    const earlierArchives = trace.filter(c => c.method === 'thread/archive').length;
    await run({prompt: 'FIXTURE_CHILD', onOutput: text => { assert.ok(!/Stale|Inspection/.test(text)); }});
    assert.equal((await calls()).filter(c => c.method === 'thread/archive').length, earlierArchives + 1, 'worker and stale completions do not clean up');
    await run({prompt: 'FIXTURE_ACTIVE_WORKER'});
    assert.equal((await state()).archived, false, 'loaded workers veto cleanup');
    const archives = (await calls()).filter(c => c.method === 'thread/archive').length;
    await assert.rejects(run({prompt: 'FIXTURE_FAIL'}), /rejected/);
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 250);
    try { await assert.rejects(run({prompt: 'FIXTURE_HANG', signal: controller.signal}), /canceled/); } finally { clearTimeout(timer); }
    assert.equal((await calls()).filter(c => c.method === 'thread/archive').length, archives, 'failed and canceled turns skip cleanup');
    await run({conversationId: undefined});
    assert.equal((await calls()).filter(c => c.method === 'thread/archive').length, archives, 'unmanaged sessions skip cleanup');
    assert.ok((await state()).history.length >= 7, 'provider transcript remains on disk');
    for (const fault of ['thread/read:timeout', 'thread/loaded/list:error', 'thread/archive:error', 'thread/archive:timeout']) {
      const before = (await state()).turns;
      const output = JSON.parse(await run({env: {...process.env, AXIOVELA_CODEX_FIXTURE_LOG: log, AXIOVELA_CODEX_FIXTURE_FAULT: fault}}));
      assert.equal(output.turns, before + 1, `${fault} does not discard completed output or replay a turn`);
      assert.equal((await state()).archived, false);
    }
    for (const fault of ['thread/resume:archived', 'thread/resume:error']) {
      const before = (await calls()).length;
      await assert.rejects(run({env: {...process.env, AXIOVELA_CODEX_FIXTURE_LOG: log, AXIOVELA_CODEX_FIXTURE_FAULT: fault}}));
      const attempts = (await calls()).slice(before);
      assert.equal(attempts.filter(c => c.method === 'thread/unarchive').length, fault.endsWith(':archived') ? 1 : 0);
      assert.equal(attempts.filter(c => c.method === 'thread/resume').length, fault.endsWith(':archived') ? 2 : 1);
      assert.equal(attempts.filter(c => c.method === 'turn/start').length, 0, 'rejected resumes never submit or replay work');
    }
  } finally { if (previous === undefined) delete process.env.WORKBENCH_CODEX_PATH; else process.env.WORKBENCH_CODEX_PATH = previous; await rm(cwd, {recursive: true, force: true}); }
});
