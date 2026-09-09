# From hypothesis to evidence: linear regression

This small synthetic study demonstrates Axiovela's complete file-based workflow. It uses only Node's standard library, runs in seconds, and requires no AI account, GPU, Python environment, or network access.

**Question:** does fitting a line predict a noisy linear signal better than always predicting the training-set mean?

**Hypothesis:** ordinary least squares (OLS) will have lower held-out mean squared error (MSE) than the mean-only baseline when data follow `y = 2x + 1 + noise`.

## Run

From the Axiovela repository root, with Node 22.12+ on Node 22:

```sh
node examples/linear-regression/run.mjs
```

The command creates a uniquely named temporary project and prints its location, measured scores, and an app-launch command. Temporary directories may be cleaned by the operating system. To keep the result, supply a **new, nonexistent** destination outside the application checkout:

```sh
node examples/linear-regression/run.mjs --out ../axiovela-regression-demo
```

Existing destinations are refused, so rerunning cannot replace a research project. Choose a different destination for each reproduction. The same seed reproduces the data, fitted coefficients, metrics, figure, and manuscript on the same runtime. Across runtimes, allow floating-point differences; timestamps and recorded runtime/platform may also differ. The copied source and generated project include the MIT notice.

With the default seed, the observed test MSE is approximately **1.250808 for OLS** and **6.994619 for the baseline**. These are measured outputs from this example, not universal performance claims.

## Inspect in Axiovela

Install and build Axiovela once (`npm ci`, then `npm run build`). Run the launcher with the output directory, as printed by the example:

```sh
axiovela open ../axiovela-regression-demo
```

The app's Results, Methods, Runs, and Write-up views can read the generated records. Select Markdown in Write-up. You can also inspect every file without the app:

- `workbench.project.json`: question, hypothesis, and source entrypoint.
- `workflows/reproduce.mjs`: a standalone copy of the exact experiment source.
- `datasets/observations.csv`: synthetic data, train/test membership, and predictions.
- `runs/ols-seed-7/run.json`: status, method, seed, sample counts, source hash, environment, metrics, logs, and artifact links.
- `runs/ols-seed-7/metrics.json`: full-precision measurements.
- `artifacts/figures/test-mse.svg`: a labeled, zero-based comparison of the observed scores.
- `artifacts/figures/metadata.json`: caption and run association.
- `research/summary.json`: measured finding, supporting run, limitation, and next steps.
- `writeups/main.md`: concise methods, results, and limitations with the figure.

To reproduce from the generated project itself, run `node workflows/reproduce.mjs --out ../another-regression-demo`. The experiment source travels with its evidence.

## Design and limitations

A fixed seeded generator produces 120 independent synthetic observations with `x` uniform on [-2, 2] and standard-normal additive noise. The first 80 observations train both models; the remaining 40 are held out. Neither model uses the test outcomes during fitting. MSE is the average squared prediction error over those same 40 test observations; lower is better.

This is one synthetic sample with a correctly specified linear model. No confidence interval or significance test is claimed. The result does not establish performance on real datasets or nonlinear problems. Suggested follow-ups are repeated independent seeds, explicit uncertainty estimation, and nonlinear or shifted data. There are no external scientific citations to verify for this illustrative workflow.

The SVG uses only standard vector shapes so this example has no plotting-library installation step. All plotted lengths and labels are computed from the saved metrics. The script is a deterministic demonstration, not an AI-generated discovery or an assessment of provider performance.

## Verify

```sh
npm run example:smoke
```

This checks an exact-fit case, independently recomputes MSE from saved predictions, reproduces the outputs in two isolated folders, verifies evidence associations, and confirms existing destinations are protected. The example is MIT-licensed with Axiovela.
