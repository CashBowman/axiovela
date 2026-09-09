import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';

export function commandFor(id) {
  return process.env[`WORKBENCH_${id.toUpperCase()}_PATH`] || `${id}${process.platform === 'win32' ? '.cmd' : ''}`;
}
export function spawnAssistant(id, args, {cwd, env = process.env} = {}) {
  let command = commandFor(id);
  if (/\.(mjs|cjs|js)$/.test(command)) { args = [command, ...args]; command = process.execPath; }
  else if (process.platform === 'win32' && command.endsWith('.cmd')) {
    const entry = {gemini: '@google/gemini-cli/dist/index.js', claude: '@anthropic-ai/claude-code/cli.js', pi: '@earendil-works/pi-coding-agent/dist/cli.js', opencode: 'opencode-ai/bin/opencode'}[id];
    const dirs = path.isAbsolute(command) ? [path.dirname(command)] : (env.PATH || env.Path || '').split(path.delimiter);
    const entries = id === 'pi' ? [entry, '@mariozechner/pi-coding-agent/dist/cli.js'] : [entry];
    const found = dirs.flatMap(dir => entries.filter(Boolean).map(item => path.join(dir, 'node_modules', item))).find(file => existsSync(file));
    if (!found) throw new Error(`Set WORKBENCH_${id.toUpperCase()}_PATH to the native executable or JavaScript entry point on Windows.`);
    command = process.execPath; args = [found, ...args];
  }
  return spawn(command, args, {cwd, env, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe']});
}
export function stopProcess(child) {
  if (child.exitCode !== null || child.signalCode !== null || !child.pid) return;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {stdio: 'ignore'});
    killer.on('error', () => child.kill());
  } else {
    try { process.kill(-child.pid, 'SIGTERM'); } catch {}
    const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 1500);
    timer.unref(); child.once('close', () => clearTimeout(timer));
  }
}
export async function collectProcess(id, args, {cwd, env, input = '', signal, onEvent, timeout = 15000} = {}) {
  const child = spawnAssistant(id, args, {cwd, env});
  return new Promise((resolve, reject) => {
    let output = '', buffer = '', settled = false, terminationError = null;
    const end = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); error ? reject(error) : resolve(value); };
    const terminate = error => {
      if (settled || terminationError) return;
      terminationError = error;
      if (child.exitCode !== null) end(error);
      else stopProcess(child);
    };
    const abort = () => terminate(new Error('Task canceled.'));
    const timer = setTimeout(() => terminate(new Error(`${id} timed out. Check its installation and authentication in a terminal.`)), timeout);
    signal?.addEventListener('abort', abort, {once: true});
    child.stderr.on('data', () => {});
    child.stdin.on('error', () => {});
    child.on('error', e => end(terminationError || new Error(`Cannot start ${id}: ${e.code || 'process error'}. Install and authenticate the CLI, then refresh.`)));
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      output += chunk; buffer += chunk;
      if (output.length > 8_000_000) { terminate(new Error('CLI output exceeded the size limit.')); return; }
      let index;
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
        try { const e = JSON.parse(line); if (e && typeof e === 'object') onEvent?.(e); } catch {}
      }
    });
    child.on('close', code => {
      if (buffer.trim()) { try { onEvent?.(JSON.parse(buffer)); } catch {} }
      end(terminationError || (code === 0 ? null : new Error(`${id} exited with code ${code}. Check login, model access, and CLI version.`)), output);
    });
    if (signal?.aborted) abort(); else child.stdin.end(input);
  });
}
