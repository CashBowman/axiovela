/*
MIT License

Copyright (c) 2026 Cash Bowman

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
import {mkdir, mkdtemp, writeFile, readFile, copyFile, rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import os from 'node:os';

export const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;

export function fitLine(rows) {
  if (rows.length < 2) throw new Error('At least two training observations are required.');
  const mx = mean(rows.map(row => row.x));
  const my = mean(rows.map(row => row.y));
  const denominator = rows.reduce((sum, row) => sum + (row.x - mx) ** 2, 0);
  if (!(denominator > 0)) throw new Error('Training x must have nonzero variance.');
  const slope = rows.reduce((sum, row) => sum + (row.x - mx) * (row.y - my), 0) / denominator;
  return {slope, intercept: my - slope * mx};
}

export function simulate(seed = 7) {
  // Fixed 32-bit LCG plus Box-Muller: independent x and Gaussian noise draws.
  let state = seed >>> 0;
  const uniform = () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return (state + .5) / 4294967296; };
  return Array.from({length: 120}, (_, index) => {
    const x = 4 * uniform() - 2;
    const noise = Math.sqrt(-2 * Math.log(uniform())) * Math.cos(2 * Math.PI * uniform());
    return {split: index < 80 ? 'train' : 'test', x, y: 2 * x + 1 + noise};
  });
}

export function evaluate(rows) {
  const train = rows.filter(row => row.split === 'train');
  const test = rows.filter(row => row.split === 'test');
  if (!test.length) throw new Error('Held-out observations are required.');
  const model = fitLine(train);
  const baseline = mean(train.map(row => row.y));
  const predict = x => model.intercept + model.slope * x;
  const mse = prediction => mean(test.map(row => (row.y - prediction(row.x)) ** 2));
  const metrics = {ols_test_mse: mse(predict), baseline_test_mse: mse(() => baseline), slope: model.slope, intercept: model.intercept, baseline_prediction: baseline, n_train: train.length, n_test: test.length};
  if (!Object.values(metrics).every(Number.isFinite)) throw new Error('Nonfinite experiment result.');
  return {metrics, predictions: rows.map(row => ({...row, ols_prediction: predict(row.x), baseline_prediction: baseline}))};
}

export function figureSvg(metrics) {
  const upper = Math.max(metrics.ols_test_mse, metrics.baseline_test_mse) * 1.2 || 1;
  const start = 230, width = 530;
  const ticks = Array.from({length: 5}, (_, i) => {
    const x = start + i * width / 4;
    return '<line x1="' + x + '" x2="' + x + '" y1="115" y2="280" stroke="#dce3e9"/><text x="' + x + '" y="313" text-anchor="middle">' + (upper * i / 4).toFixed(1) + '</text>';
  }).join('');
  const bars = [['Mean baseline', metrics.baseline_test_mse, '#b97e25'], ['Fitted line (OLS)', metrics.ols_test_mse, '#357799']].map(([name, score, color], i) => {
    const y = 145 + i * 85;
    const barWidth = score / upper * width;
    return '<text x="210" y="' + (y + 23) + '" text-anchor="end">' + name + '</text><rect x="230" y="' + y + '" width="' + barWidth + '" height="34" fill="' + color + '"/><text x="' + (start + barWidth + 12) + '" y="' + (y + 23) + '">' + score.toFixed(3) + '</text>';
  }).join('');
  return '<svg xmlns="http://www.w3.org/2000/svg" width="920" height="410" viewBox="0 0 920 410" role="img" aria-labelledby="title desc"><title id="title">Held-out prediction error</title><desc id="desc">Mean squared error for a fitted line and training-mean baseline on 40 synthetic held-out observations. Lower is better. One seed; no uncertainty interval.</desc><rect width="920" height="410" fill="white"/><g font-family="Arial, sans-serif" font-size="19" fill="#203040"><text x="40" y="46" font-size="28" font-weight="700">Held-out prediction error</text><text x="40" y="80" fill="#536575">Synthetic linear signal · 80 training / 40 test observations</text>' + ticks + bars + '<text x="495" y="355" text-anchor="middle">Mean squared error (response units²; lower is better)</text><text x="40" y="389" font-size="16" fill="#536575">Seed 7 · One synthetic sample · No uncertainty interval</text></g></svg>\n';
}

export async function createExample(destination) {
  let root;
  if (destination) {
    root = path.resolve(destination);
    await mkdir(path.dirname(root), {recursive: true});
    // Exclusive creation: never replace existing user output or follow a destination symlink.
    await mkdir(root);
  } else {
    root = await mkdtemp(path.join(os.tmpdir(), 'axiovela-example-'));
  }
  const sourcePath = fileURLToPath(import.meta.url);
  const runId = 'ols-seed-7';
  const figurePath = 'artifacts/figures/test-mse.svg';
  const json = async (relative, value) => {
    const target = path.join(root, relative);
    await writeFile(target + '.tmp', JSON.stringify(value, null, 2) + '\n');
    await rename(target + '.tmp', target);
  };
  for (const directory of ['workflows', 'datasets', 'runs/' + runId, 'artifacts/figures', 'research', 'writeups']) await mkdir(path.join(root, directory), {recursive: true});
  const startedAt = new Date().toISOString();
  const run = {schemaVersion: 'workbench.run/v1', id: runId, name: 'Fitted line vs mean baseline', experiment: 'Predicting a synthetic linear signal', status: 'running', progress: 0, startedAt, source: {adapter: 'native', externalId: runId}, parameters: {seed: 7, n_train: 80, n_test: 40, noise_sd: 1}, metrics: {}, artifacts: [], logs: ['Hypothesis and evaluation split recorded before fitting.'], environment: {node: process.version, platform: process.platform, arch: process.arch}, method: {objective: 'Compare held-out mean squared error for OLS and a mean-only baseline.', data: '120 synthetic observations: x uniform on [-2, 2], y = 2x + 1 + standard-normal noise.', preprocessing: 'None.', split: 'First 80 independent draws train both models; last 40 are held out.', models: 'OLS with intercept; training-outcome mean baseline.', evaluation: 'MSE on the same 40 test observations; no uncertainty interval.', steps: ['Generate seeded synthetic observations.', 'Fit both models using training rows only.', 'Evaluate on held-out rows.', 'Save measurements, figure, and manuscript.']}};
  await json('workbench.project.json', {schemaVersion: 1, name: 'A line or a constant?', researchQuestion: 'Does fitting a line beat the training-mean baseline on noisy linear data?', hypothesis: 'OLS has lower held-out MSE for this linear data-generating process.', phase: 'experiment', entrypoints: ['workflows/reproduce.mjs'], createdAt: startedAt});
  await json('runs/' + runId + '/run.json', run);
  try {
    await copyFile(sourcePath, path.join(root, 'workflows/reproduce.mjs'));
    const source = await readFile(sourcePath);
    run.environment.sourceSha256 = createHash('sha256').update(source).digest('hex');
    await writeFile(path.join(root, 'LICENSE'), source.toString().replace(/\r\n/g, '\n').match(/^\/\*\n([\s\S]*?)\n\*\//)[1] + '\n');
    const {metrics, predictions} = evaluate(simulate());
    run.metrics = metrics;
    run.progress = 70;
    run.logs.push('Generated 120 rows; fitted both models on 80 training observations.');
    await json('runs/' + runId + '/metrics.json', metrics);
    await json('runs/' + runId + '/run.json', run);
    const columns = ['split', 'x', 'y', 'ols_prediction', 'baseline_prediction'];
    await writeFile(path.join(root, 'datasets/observations.csv'), [columns.join(','), ...predictions.map(row => columns.map(key => row[key]).join(','))].join('\n') + '\n');
    await writeFile(path.join(root, figurePath), figureSvg(metrics));
    const result = 'On 40 held-out synthetic observations, OLS MSE was ' + metrics.ols_test_mse.toFixed(6) + ' and baseline MSE was ' + metrics.baseline_test_mse.toFixed(6) + ' (lower is better).';
    const limitation = 'One synthetic sample and seed with a correctly specified linear model; no confidence interval or significance claim. This does not establish performance on real or nonlinear data.';
    await json('artifacts/figures/metadata.json', {schemaVersion: 'workbench.figures/v1', figures: [{path: figurePath, title: 'Held-out prediction error', topic: 'Model performance', caption: result, interpretation: limitation, runId, runIds: [runId]}]});
    const report = [
      '# A line or a constant?', '',
      '## Hypothesis', '', 'OLS will predict a noisy linear signal more accurately than a training-mean baseline.', '',
      '## Methods', '', 'Generate 120 synthetic observations with a fixed seed (7): $x$ is uniform on $[-2, 2]$ and $y = 2x + 1 + \\epsilon$, where $\\epsilon$ is standard-normal noise. Fit an intercept and slope by ordinary least squares on the first 80 observations. Fit the baseline using the mean training response. Evaluate both models on the same remaining 40 observations, without using their outcomes during fitting.', '',
      'The empirical outcome is held-out MSE: the average squared prediction error over the 40 test observations. It measures prediction error for this sample and data-generating process.', '',
      '## Results', '', result, '',
      'The fitted slope was ' + metrics.slope.toFixed(6) + ' and intercept was ' + metrics.intercept.toFixed(6) + '.', '',
      '![Held-out prediction error](../' + figurePath + ')', '',
      'Inspect full-precision scores and the procedure in Axiovela’s Methods view, or open `runs/' + runId + '/metrics.json` and `runs/' + runId + '/run.json` from the project root.', '',
      '## Conclusion and limitations', '', metrics.ols_test_mse < metrics.baseline_test_mse ? 'The observed comparison supports the hypothesis for this sample.' : 'The observed comparison does not support the hypothesis for this sample.', '', limitation, '',
      'Next: repeat independent seeds, estimate uncertainty, and test nonlinear or shifted data.', '',
      '## Reproduce', '', 'Run `node workflows/reproduce.mjs --out ../another-regression-demo` from the project root, choosing a new destination. Inspect `datasets/observations.csv` and the source hash in the run record. The SVG uses the same metrics as the manuscript.', '',
      'This synthetic demonstration contains no external literature claims or citations. It demonstrates the file workflow, not AI research quality.', ''
    ].join('\n');
    await writeFile(path.join(root, 'writeups/main.md'), report);
    await writeFile(path.join(root, 'references.bib'), '% No external citations are used in this synthetic demonstration.\n');
    await writeFile(path.join(root, 'README.md'), '# Axiovela regression example\n\nOpen writeups/main.md for the report and runs/ols-seed-7/metrics.json for measured scores.\n\nReproduce into a new project: node workflows/reproduce.mjs --out ../another-regression-demo\n');
    run.status = 'complete'; run.progress = 100; run.completedAt = new Date().toISOString(); run.summary = result;
    run.artifacts = [figurePath, 'datasets/observations.csv', 'writeups/main.md'];
    run.logs.push('Evaluated 40 held-out observations and saved the figure and manuscript.', result);
    await writeFile(path.join(root, 'runs/' + runId + '/output.log'), run.logs.join('\n') + '\n');
    await json('runs/' + runId + '/run.json', run);
    await json('research/summary.json', {schemaVersion: 'workbench.research/v1', updatedAt: new Date().toISOString(), summary: result, findings: [{text: result, runIds: [runId]}], limitations: [limitation], nextSteps: ['Repeat independent seeds and estimate uncertainty.', 'Compare performance on nonlinear or shifted data.']});
    await json('workbench.project.json', {schemaVersion: 1, name: 'A line or a constant?', researchQuestion: 'Does fitting a line beat the training-mean baseline on noisy linear data?', hypothesis: 'OLS has lower held-out MSE for this linear data-generating process.', phase: 'analysis', entrypoints: ['workflows/reproduce.mjs'], createdAt: startedAt});
    return {root, metrics};
  } catch (error) {
    run.status = 'failed'; run.completedAt = new Date().toISOString(); run.error = error.message;
    await json('runs/' + runId + '/run.json', run);
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--out' || !args[1])) {
    console.error('Usage: node run.mjs [--out NEW_DIRECTORY]'); process.exitCode = 1;
  } else {
    try {
      const {root, metrics} = await createExample(args[1]);
      console.log('Example project: ' + root);
      console.log(JSON.stringify(metrics, null, 2));
      console.log('Open in Axiovela: axiovela open "' + root + '"');
    } catch (error) {
      console.error(error.code === 'EEXIST' ? 'Destination already exists. Choose a new directory; no files were replaced.' : error.message);
      process.exitCode = 1;
    }
  }
}
