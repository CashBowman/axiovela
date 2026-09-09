import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {RpcProcess} from '../server/assistant-runtime.mjs';

test('closing an RPC after process exit still settles and remains repeatable', {timeout: 5000}, async () => {
  const rpc = new RpcProcess(process.execPath, ['-e', 'process.exit(0)'], {});
  await once(rpc.child, 'close');
  await rpc.close();
  await rpc.close();
});

test('closing after signal termination does not wait for an already delivered event', {timeout: 5000}, async () => {
  const rpc = new RpcProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {});
  const closed = once(rpc.child, 'close');
  rpc.child.kill('SIGTERM');
  await closed;
  await rpc.close();
});

test('RPC shutdown waits for process closure before fixture cleanup', {timeout: 5000}, async () => {
  const rpc = new RpcProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {});
  let closed = false;
  rpc.child.once('close', () => { closed = true; });
  await Promise.all([rpc.close(), rpc.close()]);
  assert.equal(closed, true);
});
