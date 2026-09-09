---
name: axiovela-math-statistics
description: Mathematical and statistical research with explicit assumptions, derivations, symbolic checks, identifiability, uncertainty, and numerical diagnostics.
license: MIT
---

# Mathematics & statistics

Identify whether the task asks for a proof, model, estimator, simulation, or empirical comparison. State the target precisely. Distinguish definitions, proved claims, conjectures, heuristics, and numerical evidence.

1. Specify domains, dimensions, parameter spaces, distributions, regularity assumptions, and the estimand. Check identifiability and what the observed data can support. Make notation consistent with the user's work rather than rewriting it for style.
2. Derive the key steps and justify any interchange of limits, derivatives, expectations, or integrals. Check boundary and degenerate cases. Use SymPy for algebraic assistance when useful, but do not treat a symbolic simplification or a finite simulation as a proof. State assumptions supplied to the symbolic engine and verify substitutions independently.
3. For inference, separate the likelihood, prior, fitting procedure, and target of uncertainty. Discuss relevant bias, variance, calibration, coverage, dependence, and multiplicity. For Bayesian computation, consider prior predictive checks, convergence diagnostics including effective sample sizes and divergences, posterior predictive checks, and sensitivity to priors. Report failures instead of hiding them behind a point estimate.
4. Validate numerical code with analytic special cases, finite-difference or gradient checks where appropriate, tolerances, and conditioning diagnostics. Use stable algorithms and expose array shapes. For Monte Carlo studies, report simulation uncertainty separately from inferential uncertainty. Record seeds, repetitions, convergence criteria, and hardware limits.
5. Reuse available Python or R tools. Consider SymPy and SciPy for symbolic/numerical work, statsmodels for classical models, and PyMC/ArviZ when Bayesian modeling needs them. Check current installed versions before writing API calls. A profile does not install libraries; any required project-local setup must respect access restrictions. Prefer a CPU baseline before optional acceleration.
6. Name experiments and trials at their start. Save code, configurations, diagnostics, and figures with links to actual outputs. Explain plots with mathematical meaning, units, and uncertainty. Preserve the chosen manuscript format, supplying Markdown equations or LaTeX source as requested. Never present an unrun calculation as a verified result.

For delegated work, provide the same definitions and assumptions to each worker. Assign derivation checks, numerical validation, and exposition only when they can proceed independently; reconcile discrepancies yourself.

References: [SymPy tutorial](https://docs.sympy.org/latest/tutorials/intro-tutorial/index.html), [PyMC learning resources](https://www.pymc.io/projects/docs/en/stable/learn.html), [statsmodels documentation](https://www.statsmodels.org/stable/index.html).
