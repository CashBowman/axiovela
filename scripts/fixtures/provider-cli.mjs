// Local protocol fixture; no model calls, credentials, or shell execution.
import readline from 'node:readline';
import {randomUUID} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
const args = process.argv.slice(2);
const value = flag => args[args.indexOf(flag) + 1];
const send = e => process.stdout.write(`${JSON.stringify(e)}\n`);
if (args.includes('--version')) { console.log('fixture 1.0'); process.exit(0); }
if (args[0] === 'models') { console.log('fixture/model'); process.exit(0); }
if (args.includes('rpc')) {
  const state = {sessionId: args.includes('--session-id') ? value('--session-id') : randomUUID(), model: {id: 'model', provider: 'fixture'}, thinkingLevel: 'off'};
  let promptCount = 0;
  for await (const line of readline.createInterface({input: process.stdin})) {
    const request = JSON.parse(line); let data = {};
    if (request.type === 'get_available_models') data = {models: [{id: 'model', provider: 'fixture', reasoning: true}]};
    if (request.type === 'get_state') data = state;
    if (request.type === 'get_session_stats') data = {userMessages: promptCount, assistantMessages: promptCount, toolCalls: promptCount * 2, toolResults: promptCount * 2, totalMessages: promptCount * 6, tokens: {input: promptCount * 1200, output: promptCount * 300, cacheRead: promptCount * 5000, cacheWrite: 0, total: promptCount * 6500}, cost: promptCount * 0.012, contextUsage: {tokens: promptCount * 1800, contextWindow: 128000, percent: promptCount * 1.4}};
    if (request.type === 'set_model') state.model = {provider: request.provider, id: request.modelId};
    if (request.type === 'set_thinking_level') state.thinkingLevel = request.level;
    send({id: request.id, type: 'response', success: true, data});
    if (request.type === 'prompt') {
      promptCount += 1;
      state.lastPrompt = request.message;
      if (request.message.includes('HANG')) continue;
      if (request.message.includes('PI_AGENTIC_HOLD')) {
        const fixturePath = process.env.AXIOVELA_PI_ACTIVITY_FIXTURE;
        const prefix = request.message.match(/mf_[a-f0-9]{8}_/)?.[0] || 'mf_12345678_';
        const config = JSON.parse(await readFile(fixturePath, 'utf8'));
        await writeFile(fixturePath, JSON.stringify({...config, prefix, workspace: `axiovela-${prefix.slice(3, -1)}`}));
        send({type: 'tool_execution_start', toolCallId: 'held-worker', toolName: 'bash', args: {command: `herdr agent wait ${prefix}analysis --timeout 600000`}});
        const timer = setInterval(async () => {
          const state = await readFile(fixturePath, 'utf8').then(JSON.parse).catch(() => ({}));
          if (state.pulse) send({type: 'tool_execution_update', toolCallId: 'held-worker', partialResult: {content: [{type: 'text', text: 'private worker output'}]}});
          if (state.finish) {
            clearInterval(timer);
            send({type: 'tool_execution_end', toolCallId: 'held-worker', isError: false});
            send({type: 'message_end', message: {role: 'assistant', content: [{type: 'text', text: 'Worker result verified.'}]}});
            send({type: 'agent_end'});
          }
        }, 100);
        continue;
      }
      if (request.message.includes('PI_PROGRESS')) {
        send({type: 'tool_execution_start', toolCallId: 'progress', toolName: 'bash', args: {command: 'fixture-command'}});
        send({type: 'tool_execution_update', toolCallId: 'progress', partialResult: {content: [{type: 'text', text: 'private command output'}]}});
        send({type: 'tool_execution_end', toolCallId: 'progress', isError: false});
        send({type: 'message_update', assistantMessageEvent: {type: 'thinking_delta', contentIndex: 0, delta: 'private reasoning'}});
        send({type: 'message_update', assistantMessageEvent: {type: 'text_delta', contentIndex: 1, delta: 'Answer'}});
        send({type: 'message_update', assistantMessageEvent: {type: 'text_delta', contentIndex: 1, delta: ' continues'}});
      }
      if (request.message.includes('HERDR_ACTIVITY')) {
        send({type: 'tool_execution_start', toolCallId: 'start-workers', toolName: 'bash', args: {command: 'herdr agent start mf_12345678_linear && herdr agent start mf_12345678_sine'}});
        send({type: 'tool_execution_end', toolCallId: 'start-workers', isError: false});
        send({type: 'tool_execution_start', toolCallId: 'prompt-workers', toolName: 'bash', args: {command: 'herdr agent prompt mf_12345678_linear brief && herdr agent prompt mf_12345678_sine brief'}});
        send({type: 'tool_execution_end', toolCallId: 'prompt-workers', isError: false});
        send({type: 'tool_execution_start', toolCallId: 'wait-workers', toolName: 'bash', args: {command: 'herdr agent wait mf_12345678_linear --timeout 600000 && herdr agent wait mf_12345678_sine --timeout 600000'}});
        send({type: 'tool_execution_update', toolCallId: 'wait-workers', partialResult: {content: [{type: 'text', text: 'private worker output'}]}});
        send({type: 'tool_execution_update', toolCallId: 'wait-workers', partialResult: {content: [{type: 'text', text: 'private worker output'}]}});
        send({type: 'tool_execution_end', toolCallId: 'wait-workers', isError: false});
      }
      send({type: 'message_end', message: {role: 'assistant', stopReason: request.message.includes('FAIL') ? 'error' : 'stop', ...(request.message.includes('FAIL') ? {errorMessage: 'Fixture authentication expired.'} : {}), content: [{type: 'text', text: JSON.stringify({args, ...state})}]}});
      send({type: 'agent_end'});
    }
  }
} else {
  let prompt = ''; for await (const chunk of process.stdin) prompt += chunk;
  const sessionId = args.includes('--resume') ? value('--resume') : args.includes('--session') ? value('--session') : randomUUID();
  const text = JSON.stringify({args, sessionId, prompt});
  console.log('ignored diagnostic noise');
  send({type: args[0] === 'run' ? 'step_start' : 'init', session_id: sessionId, sessionID: sessionId, model: 'reported-model'});
  if (prompt.includes('HANG')) { setInterval(() => {}, 1000); }
  else if (prompt.includes('FAIL')) { send({type: 'error', severity: 'error', error: {message: 'private fixture details'}}); process.exitCode = 1; }
  else {
    send({type: 'assistant', message: {content: [{type: 'text', text}]}});
    send({type: 'message', role: 'assistant', content: text});
    send({type: 'text', part: {text}});
    send({type: 'result', result: text});
  }
}
