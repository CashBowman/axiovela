---
name: axiovela-data-science
description: Reproducible data science workflows with leakage-safe validation, simple baselines, model comparison, diagnostics, and visual communication.
license: MIT
---

# Data science & machine learning

Start from the decision or research question. Define the target, observation unit, intended population, available features at prediction time, and metric before choosing a model. Match explanation depth to the user.

1. Inspect schema, types, units, duplicate entities, missing values, class balance, and dataset size. Record input provenance. Identify grouped, temporal, and spatial dependence before selecting a split. For text, images, signals, or multimodal data, check provenance, preprocessing, and near-duplicate contamination. Preserve an untouched test set where appropriate.
2. Reuse the project's Python or R environment. Prefer pandas, scikit-learn, and Matplotlib for ordinary tabular work; add other frameworks only for a concrete need. Inspect installed versions and supported CPU/GPU backends. Missing libraries require a project-local setup compatible with the selected access mode; this profile itself installs nothing. Avoid assuming CUDA on Apple Silicon, Intel Macs, or Windows.
3. Put imputation, scaling, feature selection, and dimensionality reduction inside a training-only pipeline. Fit preprocessing separately in each validation fold. Use group-aware or time-aware validation when the data require it. Tune without inspecting final test outcomes. State where leakage could still occur.
4. Compare a simple baseline with the proposed method using the same splits and metrics. Include sample size, effect magnitude, uncertainty, resource cost, and failure slices. For unsupervised or generative tasks, justify the evaluation protocol, check failure cases, and separate objective metrics from human judgments. For probabilities, assess calibration; for regression, inspect residuals and error by subgroup or range. Distinguish predictive performance from causal effects.
5. Save executable training and evaluation steps, split definitions, seeds, fitted preprocessing, hyperparameters, and library versions. Name experiments and trials before execution. Run a small end-to-end example first, then scale within the machine's memory and compute budget. Report which reproducibility properties are actually verified.
6. Generate clear distributions, comparison plots, and diagnostics with labeled axes and units. Save plotting code with figures and link findings to actual runs. Describe failed experiments and limitations. Write evidence-grounded Markdown by default when the user has not selected another format.

For delegated work, give workers the same split and metric contract. Keep held-out labels out of feature engineering and tuning briefs. Separate pipeline, evaluation, and reporting work only when ownership is disjoint.

References: [scikit-learn common pitfalls](https://scikit-learn.org/stable/common_pitfalls.html), [pandas user guide](https://pandas.pydata.org/docs/user_guide/index.html).
