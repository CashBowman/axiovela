import {profileSkillPath} from './research-profiles.mjs';
import {collectProcess, commandFor} from './assistant-process.mjs';
import {RpcProcess} from './assistant-runtime.mjs';
import {randomUUID} from 'node:crypto';

export const cliProviders = {
  claude: {name: 'Claude Code', modes: ['ask', 'auto', 'full'], setup: 'Install Claude Code and run claude once in a terminal to sign in.'},
  gemini: {name: 'Gemini CLI', modes: ['ask', 'auto', 'full'], setup: 'Install Gemini CLI and run gemini once to sign in. Auto-approve requires Gemini sandbox support.'},
  opencode: {name: 'OpenCode', modes: ['full'], setup: 'Install OpenCode and connect providers with opencode auth login. This adapter requires Full access.'},
  pi: {name: 'Pi', modes: ['ask', 'full'], setup: 'Install Pi and configure providers with pi. Auto-approve is unavailable because this adapter has no project sandbox.'},
};
const modelEntry = (id, name, provider, efforts = []) => ({id, name, provider, efforts, defaultEffort: ''});
function piConnect(cwd, mode = 'ask', sessionId, env, profile) {
  const skill = profileSkillPath(profile);
  // Do not pass --offline: OAuth-backed providers may need to refresh an expired
  // access token before the first request. Resource discovery remains disabled.
  return new RpcProcess(commandFor('pi'), ['--mode', 'rpc', '--no-extensions', '--no-skills', ...(skill ? ['--skill', skill] : []), '--no-prompt-templates', '--no-themes', '--no-approve', '--tools', mode === 'full' ? 'read,bash,edit,write,grep,find,ls' : 'read,grep,find,ls', ...(sessionId ? ['--session-id', sessionId] : ['--no-session'])], {cwd, env, protocol: 'pi'});
}
export async function discoverCli(id, cwd) {
  const spec = cliProviders[id];
  let rpc;
  try {
    let models, defaultModelId = '', defaultEffort = '', catalogStatus = 'documented aliases; availability depends on account';
    if (id === 'pi') {
      rpc = piConnect(cwd);
      const result = await rpc.request('get_available_models');
      models = (result.models || []).map(m => ({...modelEntry(`${m.provider}/${m.id}`, m.name || m.id, m.provider, m.reasoning ? ['off', 'minimal', 'low', 'medium', 'high'] : []), nativeId: m.id}));
      const state = await rpc.request('get_state');
      defaultModelId = state.model ? `${state.model.provider}/${state.model.id}` : '';
      defaultEffort = state.thinkingLevel || ''; catalogStatus = 'runtime-reported';
    } else {
      await collectProcess(id, ['--version'], {cwd});
      if (id === 'claude') models = ['sonnet', 'opus', 'haiku'].map(m => modelEntry(m, `${m[0].toUpperCase()}${m.slice(1)} (CLI alias)`, 'anthropic', m === 'haiku' ? [] : ['low', 'medium', 'high']));
      if (id === 'gemini') models = ['auto', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-3-pro-preview', 'gemini-3-flash-preview'].map(m => modelEntry(m, m, 'google'));
      if (id === 'opencode') {
        const output = await collectProcess(id, ['models'], {cwd});
        models = output.split('\n').map(s => s.trim()).filter(s => /^[\w.-]+\/[\w./:-]+$/.test(s)).map(m => modelEntry(m, m, m.split('/')[0]));
        catalogStatus = 'runtime-reported';
      }
    }
    return {id, ...spec, available: true, models, defaultModelId, defaultEffort, catalogStatus, customModel: ['claude', 'gemini'].includes(id), type: 'cli'};
  } catch (error) { return {id, ...spec, type: 'cli', available: false, models: [], error: error.message}; }
  finally { await rpc?.close(); }
}

export async function runCli(options, model) {
  const {selection, cwd, mode, prompt, sessionId, signal, onSession, onEffective, onOutput, onEvent, env} = options;
  const id = selection.adapterId;
  if (id === 'pi') return runPi(options, model);
  let args;
  if (id === 'claude') args = ['-p', '--output-format', 'stream-json', '--verbose', '--permission-mode', mode === 'full' ? 'bypassPermissions' : mode === 'auto' ? 'auto' : 'dontAsk', ...(mode === 'ask' ? ['--tools', 'Read,Glob,Grep', '--disallowedTools', 'mcp__*'] : []), ...(selection.effort ? ['--effort', selection.effort] : [])];
  if (id === 'gemini') args = ['--output-format', 'stream-json', '--approval-mode', mode === 'ask' ? 'plan' : 'yolo', ...(mode === 'auto' ? ['--sandbox'] : [])];
  if (id === 'opencode') args = ['run', '--format', 'json', '--auto'];
  if (selection.modelId) args.push('--model', selection.modelId);
  if (sessionId) args.push(id === 'opencode' ? '--session' : '--resume', sessionId);
  let output = '', failed = false, terminal = false, reportedModel = false;
  const persistence = [];
  onEvent({kind: 'connection', label: sessionId ? 'Resuming conversation' : 'Connecting to provider', status: 'running'});
  await collectProcess(id, args, {cwd, env, input: prompt, signal, timeout: 30 * 60 * 1000, onEvent: e => {
    const sid = e.session_id || e.sessionID;
    if (sid) persistence.push(Promise.resolve(onSession(sid)).catch(() => { failed = true; }));
    if (e.type === 'init' || (e.type === 'system' && e.subtype === 'init')) { reportedModel = true; onEffective({modelId: e.model || selection.modelId || null, effort: selection.effort || null, provider: id}); }
    if (id === 'claude' && e.type === 'assistant') output = (e.message?.content || []).filter(p => p.type === 'text').map(p => p.text).join('\n');
    if (id === 'gemini' && e.type === 'message' && e.role === 'assistant') output = e.delta ? output + (e.content || '') : (e.content || output);
    if (id === 'opencode' && e.type === 'text') output += e.part?.text || '';
    if (e.type === 'result') { terminal = true; failed ||= Boolean(e.is_error || e.status === 'error' || e.error); output = e.result || output; }
    if (id === 'opencode' && e.type === 'step_finish') terminal = true;
    if (e.type === 'error' && e.severity !== 'warning') failed = true;
    if (['tool_use', 'tool_result', 'tool'].includes(e.type) || e.message?.content?.some(p => p.type === 'tool_use')) onEvent({kind: 'tool', label: 'Working with project tools', status: 'running'});
    if (output) { onOutput(output); onEvent({kind: 'writing', label: 'Composing response', status: 'running'}); }
  }});
  await Promise.all(persistence);
  if (failed || !terminal || !output.trim()) throw new Error(`${cliProviders[id].name} did not complete successfully. Check model access, permissions, and local CLI authentication.`);
  if (!reportedModel) onEffective({modelId: selection.modelId || null, effort: selection.effort || null, provider: id});
  return output;
}

const numeric = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const usageDelta = (value, baseline) => Math.max(0, numeric(value) - numeric(baseline));
const publicPiUsage = (stats, baseline = {}) => ({
  userMessages: usageDelta(stats?.userMessages, baseline?.userMessages),
  assistantMessages: usageDelta(stats?.assistantMessages, baseline?.assistantMessages),
  toolCalls: usageDelta(stats?.toolCalls, baseline?.toolCalls),
  toolResults: usageDelta(stats?.toolResults, baseline?.toolResults),
  tokens: {
    input: usageDelta(stats?.tokens?.input, baseline?.tokens?.input),
    output: usageDelta(stats?.tokens?.output, baseline?.tokens?.output),
    cacheRead: usageDelta(stats?.tokens?.cacheRead, baseline?.tokens?.cacheRead),
    cacheWrite: usageDelta(stats?.tokens?.cacheWrite, baseline?.tokens?.cacheWrite),
    total: usageDelta(stats?.tokens?.total, baseline?.tokens?.total),
  },
  cost: usageDelta(stats?.cost, baseline?.cost),
  contextUsage: stats?.contextUsage ? {
    tokens: numeric(stats.contextUsage.tokens),
    contextWindow: numeric(stats.contextUsage.contextWindow),
    percent: numeric(stats.contextUsage.percent),
  } : null,
});

const herdrAgentPattern = /\bherdr\s+agent\s+(start|prompt|wait|read)\s+([a-z][a-z0-9_-]{0,31})\b/g;
export function herdrAgentActions(command = '') {
  return [...String(command).matchAll(herdrAgentPattern)].map(match => ({action: match[1], name: match[2]}));
}

function piToolLabel(event, command, actions) {
  if (/\bherdr\s+workspace\s+create\b/.test(command)) return 'Preparing the agent workspace';
  const starts = actions.filter(item => item.action === 'start');
  if (starts.length) return `Starting ${starts.length} Pi worker${starts.length === 1 ? '' : 's'}`;
  if (actions.some(item => item.action === 'prompt')) return 'Delegating work to Pi workers';
  if (actions.some(item => item.action === 'wait')) return 'Waiting for Pi workers to finish';
  if (actions.some(item => item.action === 'read')) return 'Reviewing worker results';
  const toolName = String(event.toolName || event.tool_name || event.name || '').toLowerCase();
  if (['edit', 'write'].includes(toolName)) return 'Updating project files';
  if (toolName === 'read' && /\.(?:png|jpe?g|webp|svg|pdf)\b/i.test(String(event.args?.path || event.input?.path || ''))) return 'Inspecting generated figures';
  if (toolName === 'read' || toolName === 'grep' || toolName === 'find' || toolName === 'ls') return 'Inspecting the project';
  if (/\b(?:py_compile|pytest|json\.tool|git\s+diff\s+--check|npm\s+(?:test|run\s+\S*smoke))\b/i.test(command)) return 'Validating project outputs';
  if (/\bpython(?:3)?\b[^\n]*(?:experiments|workflows)\//i.test(command)) return 'Running the experiment';
  return command ? 'Running a project command' : 'Working with project tools';
}

async function runPi({selection, cwd, mode, prompt, sessionId, signal, onSession, onEffective, onOutput, onEvent, onActivity, onUsage, onAgentActivity, env}, model) {
  const rpc = piConnect(cwd, mode, sessionId || randomUUID(), env, selection.profileId);
  let output = '', rejectDone;
  const herdrCalls = new Map();
  const reportAgents = updates => {
    if (!onAgentActivity || !updates.length) return;
    Promise.resolve(onAgentActivity(updates)).catch(() => {});
  };
  const done = new Promise((resolve, reject) => {
    rejectDone = reject;
    rpc.on('failure', reject);
    rpc.on('event', e => {
      // Count real provider progress, including deltas that do not change the
      // public timeline. RPC responses to our own requests are not activity.
      if (['agent_start', 'agent_end', 'turn_start', 'turn_end', 'message_start', 'message_update', 'message_end', 'tool_execution_start', 'tool_execution_update', 'tool_execution_end'].includes(e.type)) onActivity?.();
      if (e.type === 'message_update' && ['text_start', 'text_delta', 'thinking_start', 'thinking_delta'].includes(e.assistantMessageEvent?.type)) {
        onEvent({kind: 'status', label: 'Composing response', status: 'running'});
      }
      if (e.type === 'message_end' && e.message?.role === 'assistant') {
        if (e.message.stopReason === 'error') {
          const detail = typeof e.message.errorMessage === 'string' && e.message.errorMessage.length <= 300 ? e.message.errorMessage : '';
          const loginHint = /(?:auth|token).*(?:expir|invalid)|(?:expir|invalid).*(?:auth|token)/i.test(detail) ? ' Open pi in a terminal and run /login openai-codex, then retry.' : '';
          return reject(new Error(detail ? `Pi provider request failed: ${detail}${loginHint}` : 'Pi provider request failed. Check model access and login.'));
        }
        output = (e.message.content || []).filter(p => p.type === 'text').map(p => p.text).join('\n'); onOutput(output);
      }
      if (e.type === 'tool_execution_start') {
        const command = String(e.args?.command || e.input?.command || '');
        const actions = herdrAgentActions(command);
        const callId = e.toolCallId || e.tool_call_id || e.id;
        if (callId && actions.length) herdrCalls.set(callId, actions);
        reportAgents(actions.map(item => ({name: item.name, status: item.action === 'start' ? 'unknown' : 'working'})));
        onEvent({kind: 'tool', label: piToolLabel(e, command, actions), status: 'running'});
      }
      if (e.type === 'tool_execution_end') {
        const callId = e.toolCallId || e.tool_call_id || e.id;
        const actions = herdrCalls.get(callId) || [];
        if (callId) herdrCalls.delete(callId);
        reportAgents(actions.map(item => ({name: item.name, status: e.isError || e.error ? 'failed' : item.action === 'wait' ? 'done' : item.action === 'start' ? 'idle' : 'working'})));
        onEvent({kind: 'tool', label: e.isError || e.error ? 'Project tool reported an error' : 'Project tool finished', status: 'complete'});
      }
      if (e.type === 'agent_end') output.trim() ? resolve(output) : reject(new Error('Pi returned no user-facing response.'));
    });
  });
  done.catch(() => {});
  const abort = () => { rejectDone(new Error('Task canceled.')); rpc.close(); };
  signal.addEventListener('abort', abort, {once: true});
  try {
    if (signal.aborted) throw new Error('Task canceled.');
    if (model) await rpc.request('set_model', {provider: model.provider, modelId: model.nativeId});
    if (selection.effort) await rpc.request('set_thinking_level', {level: selection.effort});
    const state = await rpc.request('get_state');
    await onSession(state.sessionId);
    onEffective({modelId: state.model ? `${state.model.provider}/${state.model.id}` : null, effort: state.thinkingLevel, provider: state.model?.provider});
    const startingStats = onUsage ? await rpc.request('get_session_stats').catch(() => null) : null;
    await rpc.request('prompt', {message: prompt});
    const result = await done;
    if (onUsage) {
      const stats = await rpc.request('get_session_stats').catch(() => null);
      if (stats) await onUsage(publicPiUsage(stats, startingStats || {}));
    }
    return result;
  } finally { signal.removeEventListener('abort', abort); await rpc.close(); }
}
