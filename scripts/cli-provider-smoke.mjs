import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {discoverRuntime, runAssistant} from '../server/assistant-runtime.mjs';
import {researchProfiles, profileSkillPath, profileInstructions, profileId, canResumeProfile} from '../server/research-profiles.mjs';
import {herdrAgentActions} from '../server/assistant-cli.mjs';
import {agenticWorkerModel, agenticOrchestratorPrompt, agenticWorkspaceLabel, agenticWorkerPrefix, agenticActivityFromResults, mergeAgenticActivity} from '../server/agentic-mode.mjs';
const cwd = await mkdtemp(path.join(os.tmpdir(), 'workbench-cli-test-'));
try {
  for (const id of ['claude', 'gemini', 'opencode', 'pi']) {
    process.env[`WORKBENCH_${id.toUpperCase()}_PATH`] = path.resolve('scripts/fixtures/provider-cli.mjs');
    const catalog = await discoverRuntime(id, cwd, true);
    assert.equal(catalog.available, true); assert.ok(catalog.models.length);
    let sessionId, effective, usage;
    const selection = {adapterId: id, modelId: catalog.models[0].id, effort: catalog.models[0].efforts[0] || ''};
    const options = {selection, mode: id === 'opencode' ? 'full' : 'ask', cwd, prompt: 'STATE', signal: new AbortController().signal, onSession: value => {sessionId = value;}, onEffective: value => {effective = value;}, onUsage: value => {usage = value;}, onOutput: () => {}, onEvent: () => {}};
    const first = JSON.parse(await runAssistant(options));
    assert.ok(sessionId); const previous = sessionId;
    await runAssistant({...options, sessionId}); assert.equal(sessionId, previous);
    for (const mode of catalog.modes) {
      const changed = JSON.parse(await runAssistant({...options, sessionId, mode}));
      assert.equal(sessionId, previous, 'changing access must preserve the conversation');
      if (id === 'pi') {
        assert.ok(changed.args.includes(mode === 'full' ? 'read,bash,edit,write,grep,find,ls' : 'read,grep,find,ls'));
        for (const flag of ['--no-extensions', '--no-skills', '--no-prompt-templates', '--no-approve']) assert.ok(changed.args.includes(flag));
      }
      if (id === 'claude') assert.ok(changed.args.includes(mode === 'full' ? 'bypassPermissions' : mode === 'auto' ? 'auto' : 'dontAsk'));
      if (id === 'gemini') { assert.ok(changed.args.includes(mode === 'ask' ? 'plan' : 'yolo')); assert.equal(changed.args.includes('--sandbox'), mode === 'auto'); }
    }
    if (id === 'claude') { assert.ok(first.args.includes('dontAsk')); assert.ok(first.args.includes('Read,Glob,Grep')); }
    if (id === 'gemini') { assert.ok(first.args.includes('plan')); const auto = JSON.parse(await runAssistant({...options, mode: 'auto'})); assert.ok(auto.args.includes('--sandbox')); }
    if (id === 'opencode') assert.ok(first.args.includes('--auto'));
    if (id === 'pi') {
      assert.ok(first.args.includes('read,grep,find,ls')); assert.ok(!first.args.includes('--offline')); assert.equal(usage.tokens.input, 1200); assert.equal(usage.tokens.cacheRead, 5000); assert.equal(usage.cost, 0.012);
      for (const profile of researchProfiles) {
        const selected = JSON.parse(await runAssistant({...options, selection: {...selection, profileId: profile.id}}));
        const skillIndex = selected.args.indexOf('--skill');
        if (profile.id === 'general') assert.equal(skillIndex, -1);
        else {
          assert.equal(selected.args[skillIndex + 1], profileSkillPath(profile.id));
          assert.match(profileInstructions(profile.id), /access/);
          assert.ok(selected.args.includes('read,grep,find,ls'), 'profiles do not elevate access');
          const delegated = agenticOrchestratorPrompt({projectRoot: cwd, jobId: 'assistant-profile-test', profileId: profile.id});
          assert.ok(delegated.includes(profileInstructions(profile.id)), 'worker briefs inherit the complete profile');
        }
      }
      await assert.rejects(runAssistant({...options, selection: {...selection, profileId: '../../untrusted'}}), /research profile/);
      const activity = [];
      let progressCount = 0;
      const progressEvents = [], progressAtEvent = [];
      await runAssistant({...options, prompt: 'PI_PROGRESS', onActivity: () => { progressCount++; }, onEvent: event => { progressEvents.push(event); progressAtEvent.push(progressCount); }});
      assert.equal(progressCount, 8, 'Pi forwards tool progress, each repeated delta, final message and agent completion, without counting RPC responses');
      assert.deepEqual(progressEvents.map(event => [event.kind, event.status]), [['tool', 'running'], ['tool', 'complete'], ['status', 'running'], ['status', 'running'], ['status', 'running']]);
      assert.deepEqual(progressAtEvent, [1, 3, 4, 5, 6], 'tool output and repeated text deltas refresh liveness independently of timeline deduplication');
      assert.ok(!JSON.stringify(progressEvents).includes('private'), 'activity labels do not expose tool output or reasoning');
      let workerProgress = 0;
      const workerEvents = [];
      await runAssistant({...options, mode: 'full', prompt: 'HERDR_ACTIVITY', onActivity: () => { workerProgress++; }, onEvent: event => workerEvents.push(event), onAgentActivity: updates => activity.push(...updates)});
      assert.deepEqual(activity.slice(-2), [{name: 'mf_12345678_linear', status: 'done'}, {name: 'mf_12345678_sine', status: 'done'}]);
      assert.equal(workerProgress, 10, 'Pi Agentic mode forwards worker lifecycle, repeated wait output, and completion activity');
      assert.ok(workerEvents.some(event => event.label === 'Waiting for Pi workers to finish'));
      assert.ok(!JSON.stringify(workerEvents).includes('private worker output'));
      await assert.rejects(runAssistant({...options, mode: 'auto'}), /supports these/);
    }
    if (['claude', 'gemini'].includes(id)) assert.equal(effective.modelId, 'reported-model');
    await assert.rejects(runAssistant({...options, prompt: 'FAIL'}), id === 'pi' ? /Fixture authentication expired/ : undefined);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 250);
    await assert.rejects(runAssistant({...options, prompt: 'HANG', signal: controller.signal}), /canceled/); clearTimeout(timer);
  }
  for (const invalid of ['../../escape', '/tmp/skill', {}, 42]) assert.throws(() => profileId(invalid), /research profile/);
  assert.equal(canResumeProfile({}, {profileId: 'general'}), true);
  assert.equal(canResumeProfile({profileId: 'biology'}, {profileId: 'math-statistics'}), false);
  assert.equal(agenticWorkerModel([{id: 'openai/gpt-5.5'}, {id: 'openai/gpt-5.4-mini'}]), 'openai/gpt-5.4-mini');
  const jobId = 'assistant-12345678-abcd';
  assert.deepEqual(herdrAgentActions('herdr agent start mf_12345678_linear && herdr agent prompt mf_12345678_sine brief'), [{action: 'start', name: 'mf_12345678_linear'}, {action: 'prompt', name: 'mf_12345678_sine'}]);
  const orchestration = agenticOrchestratorPrompt({projectRoot: cwd, routerModelId: 'openai/gpt-5.5', workerModelId: 'openai/gpt-5.4-mini', jobId});
  assert.match(orchestration, /at most 3 workers/); assert.match(orchestration, /never guess IDs/i); assert.match(orchestration, /gpt-5\.4-mini/); assert.match(orchestration, new RegExp(agenticWorkspaceLabel(jobId))); assert.match(orchestration, new RegExp(agenticWorkerPrefix(jobId)));
  const observed = agenticActivityFromResults(jobId, {workspaces: [{workspace_id: 'w9', label: agenticWorkspaceLabel(jobId)}]}, {agents: [{workspace_id: 'w9', agent_name: `${agenticWorkerPrefix(jobId)}plots`, agent: 'pi', agent_status: 'working'}, {workspace_id: 'w8', agent_name: `${agenticWorkerPrefix(jobId)}unrelated`, agent: 'pi', agent_status: 'idle'}]});
  assert.deepEqual(observed.workers, [{name: `${agenticWorkerPrefix(jobId)}plots`, kind: 'pi', status: 'working'}]);
  const merged = mergeAgenticActivity({workspaceSeen: true, workers: [{name: `${agenticWorkerPrefix(jobId)}plots`, kind: 'pi', status: 'working'}]}, {checkedAt: new Date().toISOString(), available: true, workspaceSeen: false, workers: []});
  assert.equal(merged.workers[0].status, 'done');
  console.log('CLI provider smoke passed: Claude, Gemini, OpenCode, Pi catalogs, selection, session resume, permission flags, failure, cancellation.');
} finally { await rm(cwd, {recursive: true, force: true}); }
