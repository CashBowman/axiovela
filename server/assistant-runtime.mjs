import {profileId} from './research-profiles.mjs';
import {spawn} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {cliProviders, discoverCli, runCli} from './assistant-cli.mjs';
import {apiProviders} from './provider-settings.mjs';
import {discoverApi, runApi} from './assistant-api.mjs';
import {commandFor, stopProcess} from './assistant-process.mjs';
export const connectionIds = ['codex', ...Object.keys(cliProviders), ...Object.keys(apiProviders)];

// Invoke Node-based Windows shims without a shell (prompts never become shell text).
function executable(command, args, env = process.env) {
  if (/\.(?:mjs|cjs|js)$/i.test(command)) return [process.execPath, [command, ...args]];
  if (process.platform === 'win32' && /\.cmd$/i.test(command)) {
    const locations = path.isAbsolute(command) ? [path.dirname(command)] : (env.PATH || env.Path || '').split(path.delimiter);
    const entries = ['@openai/codex/bin/codex.js', '@mariozechner/pi-coding-agent/dist/cli.js', '@earendil-works/pi-coding-agent/dist/cli.js'].filter(entry => path.basename(command).startsWith('codex') ? entry.includes('/codex/') : entry.includes('/pi-coding-agent/'));
    for (const dir of locations) for (const entry of entries) {
      const candidate = path.join(dir, 'node_modules', entry);
      if (existsSync(candidate)) return [process.execPath, [candidate, ...args]];
    }
    throw new Error('Set the runtime path to its JavaScript entry point or native executable on Windows.');
  }
  return [command, args];
}

export class RpcProcess extends EventEmitter {
  constructor(command, args, {cwd, env = process.env, protocol = 'codex'} = {}) {
    super();
    this.pending = new Map();
    this.protocol = protocol;
    this.sequence = 0;
    this.buffer = '';
    const [file, argv] = executable(command, args, env);
    this.child = spawn(file, argv, {cwd, env, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe']});
    this.closePromise = new Promise(resolve => this.child.once('close', resolve));
    this.child.stderr.on('data', () => {}); // Provider diagnostics may contain private context.
    this.child.stdin.on('error', error => this.fail(error));
    this.child.on('error', error => this.fail(new Error(`Unable to start assistant: ${error.code || 'process error'}`)));
    this.child.on('close', code => this.fail(new Error(`Assistant connection closed (${code ?? 'signal'}).`)));
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', chunk => {
      this.buffer += chunk.toString();
      if (this.buffer.length > 8 * 1024 * 1024) { this.fail(new Error('Assistant event exceeded the size limit.')); this.close(); return; }
      let end;
      while ((end = this.buffer.indexOf('\n')) !== -1) {
        const line = this.buffer.slice(0, end); this.buffer = this.buffer.slice(end + 1);
        let value; try { value = JSON.parse(line); } catch { continue; }
        if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
        const pending = this.pending.get(String(value.id));
        if (pending && !value.method) {
          this.pending.delete(String(value.id)); clearTimeout(pending.timer);
          if (value.error || value.success === false) pending.reject(new Error(typeof value.error === 'string' ? value.error : value.error?.message || 'Assistant request failed.'));
          else pending.resolve(this.protocol === 'pi' ? value.data : value.result);
        } else if (value.method && value.id != null) {
          // Native auto-review handles Codex command approvals. Interactive questions
          // must never hang indefinitely in a headless client or be silently approved.
          this.write({id: value.id, error: {code: -32601, message: 'Interactive input is unavailable in this connection. Return the question in chat.'}});
          this.emit('notice', 'The assistant requested interactive input; ask it to return the question in chat.');
        } else this.emit('event', value);
      }
    });
  }
  write(value) { if (!this.closed) this.child.stdin.write(`${JSON.stringify(value)}\n`); }
  request(method, params = {}, timeout = 30000) {
    if (this.closed) return Promise.reject(new Error('Assistant connection is closed.'));
    const id = String(++this.sequence);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Assistant ${method} timed out.`)); }, timeout);
      this.pending.set(id, {resolve, reject, timer});
      this.write(this.protocol === 'pi' ? {id, type: method, ...params} : {id, method, params});
    });
  }
  fail(error) {
    if (this.closed) return;
    this.closed = true;
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(error); }
    this.pending.clear(); this.emit('failure', error);
  }
  close() {
    this.fail(new Error('Assistant connection closed.'));
    stopProcess(this.child);
    return this.closePromise;
  }
}

export function runtimeCommand(id) {
  if (id === 'codex') return process.env.WORKBENCH_CODEX_PATH || (process.platform === 'win32' ? 'codex.cmd' : 'codex');
  throw new Error('Unknown assistant connection.');
}

async function connect(id, cwd, sessionId, mode = 'ask', env) {
  const args = ['app-server'];
  const rpc = new RpcProcess(runtimeCommand(id), args, {cwd, env});
  try {
    if (id === 'codex') {
      await rpc.request('initialize', {clientInfo: {name: 'ml_theory_workbench', version: '0.1.0'}, capabilities: {experimentalApi: true}});
      rpc.write({method: 'initialized', params: {}});
    }
    return rpc;
  } catch (error) { await rpc.close(); throw error; }
}

const cache = new Map();
export async function discoverRuntime(id, cwd, refresh = false) {
  if (apiProviders[id] || cliProviders[id]) {
    const key = `${id}:${cwd}:${apiProviders[id] ? 'api' : commandFor(id)}`;
    if (!refresh && cache.get(key)?.expires > Date.now()) return cache.get(key).value;
    const value = apiProviders[id] ? await discoverApi(id) : await discoverCli(id, cwd);
    cache.set(key, {expires: Date.now() + 60000, value});
    return value;
  }
  const key = `${id}:${runtimeCommand(id)}:${cwd}`;
  if (!refresh && cache.get(key)?.expires > Date.now()) return cache.get(key).value;
  let rpc;
  try {
    rpc = await connect(id, cwd);
    let models = [], defaultModelId = '', defaultEffort = '';
    if (id === 'codex') {
      let cursor;
      do {
        const result = await rpc.request('model/list', {limit: 100, includeHidden: false, ...(cursor ? {cursor} : {})});
        models.push(...(result.data || []).map(m => ({id: m.model || m.id, name: m.displayName || m.model || m.id, provider: 'openai', efforts: (m.supportedReasoningEfforts || []).map(e => e.reasoningEffort), defaultEffort: m.defaultReasoningEffort || '', isDefault: Boolean(m.isDefault)})));
        cursor = result.nextCursor;
      } while (cursor && models.length < 1000);
      const config = await rpc.request('config/read', {includeLayers: false}).catch(() => ({}));
      defaultModelId = config.config?.model || models.find(m => m.isDefault)?.id || '';
      defaultEffort = config.config?.model_reasoning_effort || models.find(m => m.id === defaultModelId)?.defaultEffort || '';
    }
    const value = {id, type: 'cli', name: 'Codex', available: true, models, defaultModelId, defaultEffort, modes: ['ask', 'auto', 'full'], catalogStatus: 'runtime-reported', fetchedAt: new Date().toISOString()};
    cache.set(key, {expires: Date.now() + 60000, value}); return value;
  } catch (error) {
    return {id, type: 'cli', name: 'Codex', available: false, models: [], modes: [], setup: 'Install Codex and run codex once in a terminal to sign in, then refresh connections.', error: error.message};
  } finally { await rpc?.close(); }
}

export async function validateSelection(selection, cwd) {
  const selectedProfile = profileId(selection?.profileId);
  const adapterId = selection?.adapterId || 'codex';
  if (!connectionIds.includes(adapterId)) throw new Error('Select a supported assistant connection.');
  const runtime = await discoverRuntime(adapterId, cwd);
  if (!runtime.available) throw new Error(runtime.error);
  const modelId = selection?.modelId || '';
  if (typeof modelId !== 'string' || modelId.length > 200 || (modelId && !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/.test(modelId))) throw new Error('Invalid model ID.');
  const model = runtime.models.find(m => m.id === (modelId || runtime.defaultModelId)) || (runtime.customModel && modelId ? {id: modelId, name: modelId, efforts: []} : null);
  if (runtime.type === 'api' && !modelId) throw new Error('Choose an explicit model for this API connection.');
  if (modelId && !model) throw new Error('That model is no longer in the runtime catalog. Refresh the model picker.');
  const effort = selection?.effort || '';
  if (effort && (!model || !model.efforts.includes(effort))) throw new Error('That reasoning level is not supported by the selected model.');
  return {selection: {adapterId, modelId, effort, profileId: selectedProfile}, runtime, model};
}

export async function runAssistant(options) {
  const {selection, mode, cwd, prompt, sessionId, env, onSession, onEvent, onOutput, onEffective, signal} = options;
  const {runtime, model} = await validateSelection(selection, cwd);
  if (!runtime.modes.includes(mode)) throw new Error(`This connection supports these access modes: ${runtime.modes.join(', ')}. Choose a supported mode explicitly.`);
  if (signal.aborted) throw new Error('Task canceled.');
  if (runtime.type === 'api') return runApi(options, model);
  if (cliProviders[selection.adapterId]) return runCli(options, model);
  const rpc = await connect(selection.adapterId, cwd, sessionId, mode, env);
  const effort = selection.effort || (selection.modelId ? model?.defaultEffort : runtime.defaultEffort) || null;
  let turnId, threadId, settled = false;
  let resolveDone, rejectDone;
  const done = new Promise((resolve, reject) => { resolveDone = resolve; rejectDone = reject; });
  done.catch(() => {});
  const abort = () => {
    if (selection.adapterId === 'codex' && threadId && turnId) rpc.request('turn/interrupt', {threadId, turnId}, 1000).catch(() => {});
    rejectDone(new Error('Task canceled.')); rpc.close();
  };
  signal.addEventListener('abort', abort, {once: true});
  rpc.on('failure', error => { if (!settled) rejectDone(error); });
  rpc.on('notice', label => onEvent({kind: 'input', label, status: 'running'}));
  let output = '';
  const pendingEvents = [];
  const handleEvent = event => {
    if (settled) return;
    if (selection.adapterId === 'codex') {
      const p = event.params || {}, item = p.item || {};
      // Workers and resumed historical turns share the notification stream.
      // Only our submitted root turn may update output or complete this job.
      if (!threadId || p.threadId !== threadId) return;
      if (!turnId) { if (pendingEvents.length < 256) pendingEvents.push(event); return; }
      if ((p.turnId || p.turn?.id) !== turnId) return;
      if (event.method === 'item/completed' && item.type === 'agentMessage') { output = item.text || output; onOutput(output); }
      if (event.method === 'item/agentMessage/delta') onEvent({kind: 'writing', label: 'Composing response', status: 'running'});
      if (['item/started', 'item/completed'].includes(event.method) && item.type !== 'agentMessage' && item.type !== 'reasoning' && item.type !== 'userMessage') {
        const labels = {commandExecution: 'Running a project command', fileChange: 'Updating project files', webSearch: 'Researching sources', mcpToolCall: 'Using a research tool'};
        onEvent({kind: 'tool', label: labels[item.type] || 'Working on the task', status: event.method === 'item/completed' ? 'complete' : 'running'});
      }
      if (event.method === 'turn/completed') {
        settled = true;
        if (p.turn?.status === 'completed') resolveDone(output);
        else rejectDone(new Error(p.turn?.error?.message || `Assistant turn ${p.turn?.status || 'failed'}.`));
      }
    }
  };
  rpc.on('event', handleEvent);
  try {
    if (signal.aborted) { abort(); throw new Error('Task canceled.'); }
    if (selection.adapterId === 'codex') {
      const permission = {sandbox: mode === 'full' ? 'danger-full-access' : mode === 'auto' ? 'workspace-write' : 'read-only', approvalPolicy: mode === 'auto' ? 'on-request' : 'never', approvalsReviewer: mode === 'auto' ? 'auto_review' : 'user'};
      const options = {cwd, ...permission, ...(model ? {model: model.id} : {}), ...(effort ? {config: {model_reasoning_effort: effort}} : {})};
      let restored = false;
      const recoverArchive = async (error, nativeId) => {
        if (restored || !nativeId || !/\b(?:session|thread)\b.*\barchived\b/i.test(error.message) || signal.aborted) throw error;
        restored = true;
        await rpc.request('thread/unarchive', {threadId: nativeId});
        onEvent({kind: 'connection', label: 'Archived conversation restored', status: 'complete'});
      };
      let thread;
      try { thread = await rpc.request(sessionId ? 'thread/resume' : 'thread/start', {...options, ...(sessionId ? {threadId: sessionId} : {ephemeral: false})}); }
      catch (error) {
        await recoverArchive(error, sessionId);
        thread = await rpc.request('thread/resume', {...options, threadId: sessionId});
      }
      threadId = thread.thread.id;
      await onSession(threadId);
      onEffective({modelId: thread.model || model?.id || null, effort: effort || thread.reasoningEffort || null, provider: thread.modelProvider || 'openai'});
      onEvent({kind: 'connection', label: sessionId ? 'Conversation resumed' : 'New conversation started', status: 'complete'});
      const startTurn = () => rpc.request('turn/start', {threadId, input: [{type: 'text', text: prompt}], ...(effort ? {effort} : {})});
      let result;
      try { result = await startTurn(); }
      catch (error) {
        // Retry only a rejected start, never a failed/partially executed turn.
        await recoverArchive(error, threadId);
        await rpc.request('thread/resume', {...options, threadId});
        result = await startTurn();
      }
      turnId = result.turn.id;
      for (const event of pendingEvents.splice(0)) handleEvent(event);
    }
    return await done;
  } finally { settled = true; signal.removeEventListener('abort', abort); await rpc.close(); }
}
