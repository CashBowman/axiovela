import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as pause} from 'node:timers/promises';
import {monitorAgenticActivity} from '../server/agentic-mode.mjs';

test('slow worker monitoring never queues polls and finish drains only the active check', async () => {
  let release, calls = 0;
  const updates = [];
  const held = new Promise(resolve => { release = resolve; });
  const finish = monitorAgenticActivity(async () => {
    calls++;
    if (calls === 1) await held;
    return {calls};
  }, (result, complete) => updates.push({...result, complete}), 5);
  await pause(60);
  assert.equal(calls, 1, 'a stalled check cannot accumulate a poll backlog');
  const finished = finish();
  release();
  await finished;
  await pause(30);
  assert.equal(calls, 2, 'only one final snapshot follows the in-flight check');
  assert.deepEqual(updates, [{calls: 1, complete: false}, {calls: 2, complete: true}]);
});

test('one stalled task does not block another monitor; transient failure recovers', async () => {
  let release, calls = 0, recovered;
  const observed = new Promise(resolve => { recovered = resolve; });
  const stalled = new Promise(resolve => { release = resolve; });
  const stopFirst = monitorAgenticActivity(() => stalled, () => {}, 5);
  const stopSecond = monitorAgenticActivity(async () => {
    if (++calls === 1) throw new Error('temporary monitor failure');
    return {};
  }, () => recovered(), 5);
  await observed;
  await stopSecond();
  release({});
  await stopFirst();
  assert.ok(calls >= 2);
});
