import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const children = [
  spawn(process.execPath, ['server/index.mjs'], {cwd: repoRoot, env: process.env, stdio: 'inherit'}),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], {cwd: repoRoot, env: process.env, stdio: 'inherit'}),
];
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 250).unref();
}

for (const child of children) {
  child.on('error', error => {
    console.error(error.message);
    stop(1);
  });
  child.on('close', code => {
    if (!stopping) stop(code || 0);
  });
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
