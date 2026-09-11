import {profileInstructions} from './research-profiles.mjs';
import {execFile, spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {stopProcess} from './assistant-process.mjs';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);

const herdrCommand = () => process.env.WORKBENCH_HERDR_PATH || 'herdr';
const invokeHerdr = (args, cwd, timeout = 5000) => {
  const command = herdrCommand();
  if (path.isAbsolute(command) && !existsSync(command)) return Promise.reject(Object.assign(new Error('Herdr not found'), {code: 'ENOENT'}));
  return /\.(?:mjs|cjs|js)$/i.test(command)
    ? execFileAsync(process.execPath, [command, ...args], {cwd, timeout, maxBuffer: 1024 * 1024})
    : execFileAsync(command, args, {cwd, timeout, maxBuffer: 1024 * 1024});
};

const runKey = jobId => String(jobId || '').replace(/^assistant-/, '').replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase() || 'current';
export const agenticWorkspaceLabel = jobId => `axiovela-${runKey(jobId)}`;
export const agenticWorkerPrefix = jobId => `mf_${runKey(jobId)}_`;

const parsedResult = output => JSON.parse(String(output || '').trim() || '{}')?.result || {};
const workerStatus = value => ['idle', 'working', 'blocked', 'done'].includes(value) ? value : 'unknown';

// Schedule from completion, so a slow Herdr call cannot queue unbounded polls
// that delay task completion or cancellation. Finish drains at most one poll.
export function monitorAgenticActivity(read, update, intervalMs = 900) {
  let stopped = false, timer, flight;
  const poll = () => {
    flight = Promise.resolve().then(read).then(observed => update(observed, false)).catch(() => {});
    void flight.finally(() => { if (!stopped) timer = setTimeout(poll, intervalMs); });
  };
  poll();
  return async () => {
    stopped = true;
    clearTimeout(timer);
    await flight;
    await update(await read(), true);
  };
}

export function agenticActivityFromResults(jobId, workspaceResult = {}, agentResult = {}, checkedAt = new Date().toISOString()) {
  const workspace = (workspaceResult.workspaces || []).find(item => item.label === agenticWorkspaceLabel(jobId));
  const workers = workspace ? (agentResult.agents || [])
    .filter(item => item.workspace_id === workspace.workspace_id && String(item.agent_name || '').startsWith(agenticWorkerPrefix(jobId)))
    .slice(0, 3)
    .map(item => ({name: item.agent_name, kind: item.agent || 'pi', status: workerStatus(item.agent_status)})) : [];
  return {checkedAt, available: true, workspaceId: workspace?.workspace_id || null, workspaceSeen: Boolean(workspace), workers};
}

export async function readAgenticActivity(jobId, cwd) {
  const checkedAt = new Date().toISOString();
  try {
    const [{stdout: workspaceOutput}, {stdout: agentOutput}] = await Promise.all([
      invokeHerdr(['workspace', 'list'], cwd),
      invokeHerdr(['agent', 'list'], cwd),
    ]);
    return agenticActivityFromResults(jobId, parsedResult(workspaceOutput), parsedResult(agentOutput), checkedAt);
  } catch {
    return {checkedAt, available: false, workspaceId: null, workspaceSeen: false, workers: []};
  }
}

export function mergeAgenticActivity(previous, observed, complete = false) {
  const prior = previous || {workers: []};
  const live = new Map((observed?.workers || []).map(worker => [worker.name, worker]));
  const workers = [...live.values()];
  const workspaceDisappeared = observed?.available !== false && prior.workspaceSeen && observed?.workspaceSeen === false;
  for (const worker of prior.workers || []) {
    if (!live.has(worker.name)) workers.push({...worker, status: complete || workspaceDisappeared ? (worker.status === 'blocked' ? 'blocked' : 'done') : worker.status});
  }
  if (complete) {
    for (const worker of workers) if (['working', 'unknown', 'idle'].includes(worker.status)) worker.status = 'done';
  }
  return {
    checkedAt: observed?.checkedAt || prior.checkedAt || null,
    available: observed?.available !== false,
    workspaceId: observed?.workspaceId || prior.workspaceId || null,
    workspaceSeen: Boolean(observed?.workspaceSeen || prior.workspaceSeen),
    workers: workers.slice(0, 3),
  };
}

export const agenticWorkerModel = models => {
  const preferences = [/gpt-5\.6-luna$/i, /gpt-5\.4-mini$/i, /codex-spark$/i];
  return preferences.map(pattern => models.find(model => pattern.test(model.id))).find(Boolean)?.id || models[0]?.id || '';
};

export async function discoverAgenticMode(piRuntime, cwd, refresh = false) {
  const base = {piAvailable: Boolean(piRuntime?.available && piRuntime.models?.length), piInstalled: Boolean(piRuntime?.available), workerModelId: agenticWorkerModel(piRuntime?.models || []), requiredConnection: 'pi', requiredAccessMode: 'full', platform: process.platform, ...(refresh ? {checkedAt: new Date().toISOString()} : {})};
  try {
    const [{stdout: versionOutput}, {stdout: statusOutput}] = await Promise.all([invokeHerdr(['--version'], cwd), invokeHerdr(['status'], cwd)]);
    const running = /server:[\s\S]*status:\s*running/i.test(statusOutput);
    const compatible = running && /compatible:\s*yes/i.test(statusOutput);
    const stopped = /server:[\s\S]*status:\s*not running/i.test(statusOutput);
    return {...base, available: base.piAvailable && compatible, herdrAvailable: true, herdrReady: compatible, herdrRunning: running, canStart: stopped, version: versionOutput.trim().replace(/^herdr\s*/i, ''),
      ...(!base.piAvailable ? {error: base.piInstalled ? 'Pi has no available models. Open Pi and sign in to your provider with /login.' : 'Pi is missing or could not start. Install Pi, then sign in to your provider.'} : !compatible ? {error: stopped ? 'Herdr will start when you enable Agentic mode.' : 'Herdr is not compatible or its status could not be verified. Check herdr status and update Herdr.'} : {})};
  } catch (error) {
    return {...base, available: false, herdrAvailable: error.code !== 'ENOENT', herdrReady: false, canStart: false, error: error.code === 'ENOENT' ? 'Herdr is not installed or is not on the application’s tool path.' : 'Herdr could not be checked. Run herdr status in a terminal to diagnose it.'};
  }
}

let startingHerdr;
export async function ensureAgenticMode(piRuntime, cwd, {timeout = 15000} = {}) {
  let status = await discoverAgenticMode(piRuntime, cwd, true);
  if (status.available) return status;
  const fail = state => Object.assign(new Error(state.error || 'Herdr did not become ready. Run herdr status to diagnose startup.'), {status: 409, details: {agentic: state}});
  if (!status.piAvailable || !status.herdrAvailable || !status.canStart) throw fail(status);
  if (!startingHerdr) {
    startingHerdr = (async () => {
      // Another client may have started the shared service during discovery.
      const current = await discoverAgenticMode(piRuntime, cwd, true);
      if (current.herdrReady) return;
      if (!current.canStart) throw new Error(current.error || 'Herdr status changed. Retry setup.');
      const command = herdrCommand();
      const script = /\.(?:mjs|cjs|js)$/i.test(command);
      const child = spawn(script ? process.execPath : command, script ? [command, 'server'] : ['server'], {cwd, detached: true, windowsHide: true, stdio: 'ignore'});
      const closed = new Promise(resolve => child.once('close', resolve));
      let spawnError;
      child.on('error', error => { spawnError = error; });
      child.unref();
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        if (spawnError) throw new Error('Herdr could not start. Check its installation and tool path.');
        const observed = await discoverAgenticMode(piRuntime, cwd, true);
        if (observed.herdrReady) return;
        if (child.exitCode !== null && child.exitCode !== 0) throw new Error('Herdr exited during startup. Run herdr server in a terminal for details.');
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      // Stop only our unsuccessful child, never an existing shared server.
      if (child.exitCode === null) {
        child.ref();
        stopProcess(child);
        await closed;
      }
      throw new Error('Herdr did not become ready in time. Run herdr status or herdr server in a terminal, then retry.');
    })().finally(() => { startingHerdr = null; });
  }
  try { await startingHerdr; }
  catch (error) { throw fail({...status, error: error.message}); }
  status = await discoverAgenticMode(piRuntime, cwd, true);
  if (!status.available) throw fail(status);
  return status;
}

export function agenticOrchestratorPrompt({projectRoot, routerModelId, workerModelId, jobId, profileId}) {
  const workspaceLabel = agenticWorkspaceLabel(jobId);
  const workerPrefix = agenticWorkerPrefix(jobId);
  return `

AGENTIC MODE (authoritative): You are the only user-facing orchestrator. Use Herdr through its CLI to delegate independent implementation work to Pi workers when delegation will save time or context. You remain responsible for the plan, integration, conflict resolution, tests, and final response.

Operational contract:
- First inspect the request and repository. Do not delegate greetings, questions, tiny edits, or tightly coupled work that one agent can complete more efficiently. When the request has two or more genuinely disjoint deliverables, prefer delegating them.
- For a decomposable task, create at most 3 workers. Give each worker a disjoint file or concern boundary, a concrete deliverable, and a validation requirement. Never assign two workers to edit the same files.
- Workers use Pi model ${workerModelId || routerModelId || 'the runtime default'}; the router uses ${routerModelId || 'the selected runtime default'}. Start workers with full project tools and --no-approve.
- Create exactly one observable workspace with \`herdr workspace create --cwd ${JSON.stringify(projectRoot)} --label ${workspaceLabel} --no-focus\`. Capture the root pane and every later pane ID from Herdr JSON; never guess IDs. Create additional panes from that workspace before calling \`herdr agent start <name> --kind pi --pane <id> -- --model ${workerModelId || routerModelId || 'runtime-default'} --thinking low --no-approve --tools read,bash,edit,write,grep,find,ls\`.
- Name each worker \`${workerPrefix}<concise_concern>\` (maximum 32 characters), so Axiovela can show its purpose and live Herdr state. Do not use any other worker-name prefix for this run.
- Start all selected workers first. Submit every worker brief with \`herdr agent prompt <name> <brief>\` before waiting, so disjoint work actually runs in parallel. Then use \`herdr agent wait <name> --timeout 600000\` for each worker. Use lifecycle waits, not polling. If a worker is blocked, inspect it and report the blocker; never blindly approve an unknown action.
${profileId && profileId !== 'general' ? `- Include the following selected research requirements in every worker brief (preserving the user request and access rules):${profileInstructions(profileId)}\n` : ''}- Workers read source files directly. Send paths and acceptance criteria, not pasted repository context. Ask for concise final reports containing files changed, tests run, and blockers. Read only the final visible output or the files themselves; do not replay entire transcripts.
- After workers settle, inspect the combined diff, run the narrow tests and then the relevant project smoke gate, and fix integration issues yourself. Do not claim success from worker reports alone.
- Do not create git worktrees, commits, branches, pushes, or pull requests unless the user explicitly asks. Keep all work in the active project.
- If Herdr or a worker cannot start, continue useful work yourself and clearly report the degraded path.
- Keep the user-facing answer unified. Summarize delegation only when it materially helps verification; do not expose hidden reasoning or raw terminal transcripts.`;
}
