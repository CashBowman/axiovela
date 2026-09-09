---
name: axiovela-biology
description: Physical, life, and earth sciences and engineering research, including experimental design, measurement, numerical simulation, quality control, and visualization.
license: MIT
---

# Science & engineering

Adapt to the system, research question, and user's expertise: physics, chemistry, biology, earth/environmental science, or engineering. Distinguish measured observations, simulation outputs, and theoretical predictions. Explain modeling choices in the domain's terms and make an initial useful result before adding complexity.

1. Establish the hypothesis, outcome, experimental unit, units of measurement, controls, independent versus repeated measurements, and batch or temporal structure. For life-science studies, distinguish biological from technical replicates. For physical or engineered systems, specify initial/boundary conditions, operating regimes, and measurement resolution. Inspect a small sample and schema before loading large data. Preserve raw inputs; document exclusions, missingness, transformations, and data provenance.
2. Choose the smallest suitable toolchain. Reuse an existing Python or R environment. Consider NumPy/SciPy for numerical models and differential equations, Scanpy/AnnData for single-cell data, Biopython for sequence work, SciPy/statsmodels for general models, and ggplot2 or Matplotlib for figures. Check installed versions and their documentation before using an API. A profile does not install these libraries. If dependencies are missing, explain the project-local setup and respect the current access mode. Do not require a GPU when a practical CPU workflow exists.
3. Make quality-control plots before fitting models. Check measurement calibration, units, dimensional consistency, and relevant conservation laws. For simulations, examine discretization error, convergence with step size or mesh refinement, numerical stability, and agreement with analytic limits or benchmark measurements. For single-cell work, distinguish raw counts, normalized data, and embeddings; report filtering and batch assumptions. Keep donor-level replication explicit and avoid treating cells or technical replicates as independent biological samples. For other assays, use the appropriate observation model and measurement scale.
4. Fit an interpretable baseline, then justify complexity. Split held-out data by independent experimental unit, time, or location when appropriate. Report effect sizes and uncertainty, diagnostic checks, sensitivity to preprocessing, and multiple-testing handling for families of hypotheses. Separate exploratory patterns from confirmatory results and causal claims.
5. Create figures with units, sample sizes, legible text, color-accessible palettes, and clear definitions of error bars. Distinguish observations from fitted predictions. Save reproducible plotting source and an appropriate PNG/PDF/SVG artifact; include a caption linked to the actual dataset and run. Never create illustrative data that could be mistaken for observed results.
6. Name experiments and trials before execution, record seeds and environment versions, and save results through the project's existing workflow. For a write-up, use recorded evidence and the selected Markdown/LaTeX format. Report limitations and unresolved checks plainly.

For delegated work, pass these requirements and the study's experimental unit or simulation assumptions to every worker. Separate data/QC, modeling, and visualization only when their file ownership and dependencies permit it.

References: [Scanpy tutorials](https://scanpy.readthedocs.io/en/stable/tutorials/index.html), [Biopython documentation](https://biopython.org/wiki/Documentation), [Matplotlib documentation](https://matplotlib.org/stable/).
