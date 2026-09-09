#!/usr/bin/env node
import {spawn, spawnSync} from 'node:child_process';
import {mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const projectRoot = path.resolve(process.env.WORKBENCH_PROJECT_ROOT || process.cwd());
const args = process.argv.slice(2);
const value = flag => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
};
let configuredIsolation = {};
try {
  const config = JSON.parse(await readFile(path.join(projectRoot, 'config', 'workbench.json'), 'utf8'));
  configuredIsolation = config.security?.adversarialExecution || {};
} catch { /* Built-in secure defaults remain active. */ }
if ((configuredIsolation.network && configuredIsolation.network !== 'none') || configuredIsolation.readOnlyRoot === false) throw new Error('Refusing an adversarial execution configuration without a read-only root and disabled network');
const policy = {
  schemaVersion: 1,
  network: 'none',
  rootFilesystem: 'read-only',
  hostMounts: [],
  capabilities: 'drop-all',
  noNewPrivileges: true,
  memory: configuredIsolation.limits?.memory || '1g',
  cpus: configuredIsolation.limits?.cpus || '1',
  pids: configuredIsolation.limits?.pids || 128,
  timeoutSeconds: configuredIsolation.limits?.timeoutSeconds || 300,
  image: process.env.WORKBENCH_ISOLATION_IMAGE || configuredIsolation.image || 'docker.io/library/debian:bookworm-slim',
};

if (args.includes('--print-policy')) {
  process.stdout.write(`${JSON.stringify(policy, null, 2)}\n`);
  process.exit(0);
}

const runId = value('--run-id') || `isolated-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}-${randomUUID().slice(0, 6)}`;
if (!/^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/.test(runId)) throw new Error('Invalid run id');
const commandArgument = value('--command-file');
if (!commandArgument) throw new Error('Use --command-file with a UTF-8 file below candidates/');
const candidateRoot = path.join(projectRoot, 'candidates');
const commandPath = path.resolve(projectRoot, commandArgument);
if (commandPath !== candidateRoot && !commandPath.startsWith(`${candidateRoot}${path.sep}`)) throw new Error('Candidate commands must be stored below candidates/');
const command = await readFile(commandPath, 'utf8');
if (!command.trim() || Buffer.byteLength(command) > 64 * 1024) throw new Error('Candidate command must contain 1 byte to 64 KB of UTF-8 text');

function availableRuntime() {
  const configured = process.env.WORKBENCH_CONTAINER_RUNTIME || (configuredIsolation.runtime === 'auto' ? null : configuredIsolation.runtime);
  const candidates = configured ? [configured] : process.platform === 'win32' ? ['docker.exe'] : ['podman', 'docker'];
  return candidates.find(candidate => spawnSync(candidate, ['--version'], {stdio: 'ignore'}).status === 0) || null;
}

async function atomicJson(destination, data) {
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`);
  await rename(temporary, destination);
}

const runtime = availableRuntime();
if (!runtime) throw new Error('No Docker or Podman runtime is available. Install one before executing adversarial candidate commands.');
const runDirectory = path.join(projectRoot, 'runs', runId);
await mkdir(runDirectory, {recursive: true});
const startedAt = new Date();
const record = {
  schemaVersion: 'workbench.run/v1',
  id: runId,
  kind: 'isolated-command-evaluation',
  source: {adapter: 'native', externalId: runId, url: null},
  status: 'running',
  progress: 5,
  startedAt: startedAt.toISOString(),
  completedAt: null,
  parameters: {commandFile: path.relative(projectRoot, commandPath).split(path.sep).join('/'), isolation: policy, runtime},
  metrics: {},
  logs: ['Starting candidate command in a disposable container.'],
  artifacts: [],
  error: null,
};
await atomicJson(path.join(runDirectory, 'run.json'), record);

const containerName = `ml-workbench-${runId.toLowerCase()}-${randomUUID().slice(0, 6)}`.slice(0, 120);
const runtimeArgs = [
  'run', '--rm', '--name', containerName, '--pull=missing',
  '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
  '--pids-limit', String(policy.pids), '--memory', policy.memory, '--cpus', policy.cpus,
  '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m', '--tmpfs', '/workspace:rw,nosuid,size=256m',
  '--workdir', '/workspace', '--env', 'HOME=/tmp',
  policy.image, '/bin/sh', '-lc', command,
];

let transcript = '';
let timedOut = false;
const child = spawn(runtime, runtimeArgs, {cwd: projectRoot, env: process.env, stdio: ['ignore', 'pipe', 'pipe']});
const append = chunk => { transcript = `${transcript}${String(chunk)}`.slice(-500_000); };
child.stdout.on('data', append);
child.stderr.on('data', append);
const timeout = setTimeout(() => {
  timedOut = true;
  child.kill('SIGTERM');
  spawn(runtime, ['rm', '-f', containerName], {stdio: 'ignore'}).unref();
}, policy.timeoutSeconds * 1000);

const exitCode = await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('close', code => resolve(code ?? 1));
}).finally(() => clearTimeout(timeout));
const completedAt = new Date();
const transcriptPath = path.join(runDirectory, 'isolated-transcript.txt');
await writeFile(transcriptPath, transcript);
const metrics = {exitCode, durationSeconds: Number(((completedAt - startedAt) / 1000).toFixed(3)), timedOut};
await atomicJson(path.join(runDirectory, 'metrics.json'), metrics);
record.status = exitCode === 0 && !timedOut ? 'complete' : 'failed';
record.progress = 100;
record.completedAt = completedAt.toISOString();
record.metrics = metrics;
record.logs.push(timedOut ? 'The isolated command exceeded its time limit.' : `The isolated command exited with code ${exitCode}.`);
record.artifacts = [`runs/${runId}/isolated-transcript.txt`, `runs/${runId}/metrics.json`];
record.error = record.status === 'failed' ? (timedOut ? 'Container timeout' : `Container exit code ${exitCode}`) : null;
await atomicJson(path.join(runDirectory, 'run.json'), record);
process.stdout.write(`${JSON.stringify({type: 'progress', progress: 100, message: record.logs.at(-1), runId, status: record.status})}\n`);
process.exit(record.status === 'complete' ? 0 : 1);
