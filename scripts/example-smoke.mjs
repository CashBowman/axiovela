import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {createExample, fitLine, simulate, evaluate} from '../examples/linear-regression/run.mjs';
import {researchView} from '../src/research-model.mjs';

const temporary = await mkdtemp(path.join(os.tmpdir(), 'axiovela-example-test-'));
try {
  assert.deepEqual(fitLine([{x: 0, y: 1}, {x: 1, y: 3}, {x: 2, y: 5}]), {slope: 2, intercept: 1});
  assert.throws(() => fitLine([{x: 1, y: 0}, {x: 1, y: 2}]), /variance/);
  const original = evaluate(simulate()).metrics;
  const shifted = evaluate(simulate().map(row => row.split === 'test' ? {...row, y: row.y + 100} : row)).metrics;
  for (const key of ['slope', 'intercept', 'baseline_prediction']) assert.equal(shifted[key], original[key], 'Held-out outcomes must not affect fitting.');
  assert.notEqual(shifted.ols_test_mse, original.ols_test_mse);
  const first = await createExample(path.join(temporary, 'first'));
  const second = await createExample(path.join(temporary, 'second'));
  assert.deepEqual(first.metrics, second.metrics);
  // Windows checkouts can contain CRLF. The standalone copied workflow must
  // still extract its license and produce the same complete experiment.
  const windowsSource = path.join(temporary, 'windows-checkout.mjs');
  await writeFile(windowsSource, (await readFile(new URL('../examples/linear-regression/run.mjs', import.meta.url), 'utf8')).replace(/\r?\n/g, '\r\n'));
  const windowsExample = await (await import(pathToFileURL(windowsSource))).createExample(path.join(temporary, 'windows-example'));
  assert.deepEqual(windowsExample.metrics, first.metrics);
  assert.match(await readFile(path.join(windowsExample.root, 'LICENSE'), 'utf8'), /MIT License/);
  assert.match(await readFile(path.join(first.root, 'LICENSE'), 'utf8'), /Copyright \(c\) 2026 Cash Bowman/);
  for (const relative of ['datasets/observations.csv', 'artifacts/figures/test-mse.svg', 'writeups/main.md']) {
    assert.equal(await readFile(path.join(first.root, relative), 'utf8'), await readFile(path.join(second.root, relative), 'utf8'));
  }
  const csv = (await readFile(path.join(first.root, 'datasets/observations.csv'), 'utf8')).trim().split('\n');
  const rows = csv.slice(1).map(line => { const [split, x, y, ols, baseline] = line.split(','); return {split, x: +x, y: +y, ols: +ols, baseline: +baseline}; });
  const train = rows.filter(row => row.split === 'train');
  const test = rows.filter(row => row.split === 'test');
  assert.equal(train.length, 80); assert.equal(test.length, 40);
  const baseline = train.reduce((sum, row) => sum + row.y, 0) / 80;
  assert.ok(rows.every(row => row.baseline === baseline));
  for (const model of ['ols', 'baseline']) {
    const independentMse = test.reduce((sum, row) => sum + (row.y - row[model]) ** 2, 0) / 40;
    assert.equal(first.metrics[model + '_test_mse'], independentMse);
  }
  const json = async relative => JSON.parse(await readFile(path.join(first.root, relative), 'utf8'));
  const run = await json('runs/ols-seed-7/run.json');
  assert.equal(run.status, 'complete'); assert.equal(run.progress, 100);
  assert.deepEqual(run.metrics, await json('runs/ols-seed-7/metrics.json'));
  assert.equal(run.environment.sourceSha256, createHash('sha256').update(await readFile(path.join(first.root, 'workflows/reproduce.mjs'))).digest('hex'));
  const research = await json('research/summary.json');
  const metadata = await json('artifacts/figures/metadata.json');
  assert.equal(metadata.figures[0].runId, run.id);
  assert.equal(researchView({runs: [run], research}).findings[0].missingEvidence, false);
  assert.equal(researchView({runs: [run], research}).stale, false);
  for (const relative of run.artifacts) await readFile(path.join(first.root, relative));
  const report = await readFile(path.join(first.root, 'writeups/main.md'), 'utf8');
  for (const key of ['ols_test_mse', 'baseline_test_mse']) assert.ok(report.includes(first.metrics[key].toFixed(6)));
  const before = await readFile(path.join(first.root, 'workbench.project.json'), 'utf8');
  await assert.rejects(createExample(first.root), {code: 'EEXIST'});
  assert.equal(await readFile(path.join(first.root, 'workbench.project.json'), 'utf8'), before);
  console.log('Example smoke passed: exact fit, independent scores, repeatable artifacts, linked evidence, and destination protection.');
} finally {
  await rm(temporary, {recursive: true, force: true});
}
