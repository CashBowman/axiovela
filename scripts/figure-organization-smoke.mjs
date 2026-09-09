import assert from 'node:assert/strict';
import {organizeFigures} from '../src/figure-organization.mjs';

const runs = [
  {id: 'first', name: 'Baseline', experiment: 'Predicting survival', artifacts: ['legacy.svg']},
  {id: 'second', name: 'More training data', experiment: ' predicting  survival '},
  {id: 'other', name: 'Fare model', experiment: 'Explaining fare'},
];
const figures = [
  {path: 'a.svg', runId: 'first', topic: 'Model performance'},
  {path: 'b.svg', runId: 'second', topic: 'model performance'},
  {path: 'compare.svg', runIds: ['first', 'other'], topic: 'Model checks'},
  {path: 'legacy.svg'},
  {path: 'unknown.svg'},
  {path: 'missing.svg', runId: 'missing', type: 'pdf'},
];
const before = JSON.stringify({runs, figures});
const all = organizeFigures(figures, runs);
assert.equal(all.visible.length, 6);
assert.equal(all.options[0].runs.length, 2);
assert.equal(all.sections[0].entries.length, 2, 'case variants share a topic');
assert.equal(all.visible[3].runLabel, 'Baseline', 'legacy association uses exact ledger path');
assert.equal(organizeFigures(figures, runs, 'experiment:predicting survival').visible.length, 4);
assert.deepEqual(organizeFigures(figures, runs, 'run:other').visible.map(x => x.artifact.path), ['compare.svg']);
assert.deepEqual(organizeFigures(figures, runs, 'unlinked').visible.map(x => x.artifact.path), ['unknown.svg']);
assert.equal(organizeFigures(figures, runs, 'run:missing').visible.length, 1, 'orphan metadata remains accessible');
assert.equal(organizeFigures(figures, runs, 'removed').active, '', 'removed filters fall back to all');
assert.deepEqual(organizeFigures([], []).sections, []);
assert.equal(JSON.stringify({runs, figures}), before, 'filtering never mutates project records');
console.log('Figure organization smoke passed: groups, runs, comparisons, topics, legacy links, unknowns, and filter recovery.');
