// Deterministic native-session fixture. No network, credentials, or model calls.
import readline from 'node:readline';
import {randomUUID} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
let session;
process.stdout.write('null\n[]\nunstructured diagnostic noise\n');
const send = value => process.stdout.write(`${JSON.stringify(value)}\n`);
const event = (method, params) => send({method, params: method.startsWith('turn/') ? {threadId: session?.id, ...params, turn: {id: 'turn-1', ...params.turn}} : {threadId: session?.id, turnId: 'turn-1', ...params}});
const store = id => path.join(process.cwd(), `.fixture-${id}.json`);
for await (const line of readline.createInterface({input: process.stdin})) {
  const {id, method, params: p = {}} = JSON.parse(line);
  if (id == null) continue;
  let result = {};
  try {
    if (method === 'model/list') result = {data: [{id: 'test-model', model: 'test-model', displayName: 'Test model', isDefault: true, supportedReasoningEfforts: [{reasoningEffort: 'low'}, {reasoningEffort: 'high'}], defaultReasoningEffort: 'low'}, {id: 'second-model', model: 'second-model', displayName: 'Second model', supportedReasoningEfforts: [{reasoningEffort: 'low'}], defaultReasoningEffort: 'low'}], nextCursor: null};
    if (method === 'config/read') result = {config: {model: 'test-model', model_reasoning_effort: 'low', privateToken: 'NEVER-EXPOSE-FIXTURE'}};
    if (method === 'thread/start' || method === 'thread/resume') {
      session = method === 'thread/resume' ? JSON.parse(await readFile(store(p.threadId), 'utf8')) : {id: randomUUID(), turns: 0};
      if (session.archived) throw new Error(`session ${session.id} is archived. Run codex unarchive first.`);
      Object.assign(session, {model: p.model, effort: p.config?.model_reasoning_effort, sandbox: p.sandbox, approvalPolicy: p.approvalPolicy, approvalsReviewer: p.approvalsReviewer});
      result = {thread: {id: session.id}, model: session.model, reasoningEffort: session.effort, modelProvider: 'openai'};
    }
    if (method === 'thread/unarchive') {
      session = JSON.parse(await readFile(store(p.threadId), 'utf8'));
      session.archived = false; session.archiveOnStart = false;
      await writeFile(store(session.id), JSON.stringify(session));
      result = {thread: {id: session.id}};
    }
    if (method === 'turn/start') {
      if (session.archiveOnStart) throw new Error(`session ${session.id} is archived. Run codex unarchive first.`);
      session.turns++;
      await writeFile(store(session.id), JSON.stringify(session));
      result = {turn: {id: 'turn-1'}};
      const prompt = p.input[0].text;
      const request = prompt.match(/User request:\n([\s\S]*?)(?:\n\n|$)/)?.[1] || prompt;
      if (request.includes('FIXTURE_CHILD')) {
        event('turn/started', {threadId: 'child-thread', turn: {id: 'child-turn'}});
        event('item/completed', {threadId: 'child-thread', item: {type: 'agentMessage', text: 'Inspection sent to lead agent'}});
        event('turn/completed', {threadId: 'child-thread', turn: {id: 'child-turn', status: 'completed'}});
        event('item/completed', {turnId: 'previous-turn', item: {type: 'agentMessage', text: 'Stale response'}});
        event('turn/completed', {turnId: 'previous-turn', turn: {id: 'previous-turn', status: 'completed'}});
        event('item/completed', {item: {type: 'agentMessage', text: 'Root is still working'}});
      }
      setTimeout(() => {
        event('item/started', {item: {type: 'commandExecution', command: 'private raw output'}});
        event('item/completed', {item: {type: 'fileChange'}});
        if (request.includes('FIXTURE_HANG')) return;
        if (request.includes('FIXTURE_FAIL')) { event('turn/completed', {turn: {status: 'failed', error: {message: 'Fixture provider rejected this request'}}}); return; }
        const text = request.includes('FIXTURE_CHILD') ? 'Root completed and verified both demos' : request.includes('FIXTURE_LONG_CHAT') ? Array.from({length: 12}, (_, i) => `### Diagnostic ${i + 1}\n\nThis is a long conversation layout fixture, not a scientific finding. We inspect the recorded baseline and keep uncertainty separate from observations.\n\n- Sample size: **100**\n- Equation: \\(y = \\beta x + \\epsilon\\)\n- [Baseline diagnostic](artifacts/figures/nested/baseline.svg)\n\n\`\`\`python\nprint({"diagnostic": ${i + 1}, "status": "complete"})\n\`\`\``).join('\n\n') : request.includes('FIXTURE_PROMPT') ? JSON.stringify({prompt, ...session}) : request.includes('FIXTURE_CODE') ? '```powershell\nGet-Location\nGet-ChildItem\n```' : request.includes('FIXTURE_STATE') ? JSON.stringify({...session, turnEffort: p.effort}) : 'Created the project scaffold and recorded the requested research plan.';
        event('item/completed', {item: {type: 'agentMessage', text}});
        event('turn/completed', {turn: {status: 'completed'}});
      }, 140);
    }
    send({id, result});
  } catch (error) { send({id, error: {message: error.message}}); }
}
