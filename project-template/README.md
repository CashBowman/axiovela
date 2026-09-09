# Axiovela project

This directory is the backend-managed project root. The service creates `artifacts/`, `runs/`, `assistant/`, `writeups/`, `exports/`, `prompts/`, `config/`, `workflows/`, and `candidates/`, plus the canonical `references.bib` bibliography and `workbench.project.json` manifest.

Run outputs are durable and relative to this root. Figures belong in `artifacts/figures/`; each run gets `runs/<run-id>/metrics.json` and an artifact manifest. Write-up drafts live in `writeups/` and exported source copies in `exports/`. The local runner workflow is allowlisted by the backend and does not use the network.

AI-written Python experiments can import `WorkbenchRun` or `WorkbenchTrainerCallback` from `workflows/workbench_tracking.py`. They atomically update the same run files the dashboard polls, including Hugging Face Trainer step progress and numeric log metrics.

Use `\\citep{key}`/`\\citet{key}` in LaTeX and `[@key]` in Markdown. Both resolve against `references.bib`. Project infrastructure lives in `config/workbench.json`: Git is the collaboration transport, compute profiles may be local, SSH, or Slurm over SSH, and native/MLflow/W&B run records normalize to `workbench.run/v1`. Authentication remains in the operating system or tracker CLI, never in this project file.

The supplied `.gitignore` excludes credentials, assistant conversations, and caches. Review datasets, run logs, figures, and exports before committing or sharing them. Keep existing ignore rules; opening a project never replaces its `.gitignore`.
