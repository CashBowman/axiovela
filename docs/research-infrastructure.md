# Research infrastructure

Axiovela stays local-first and uses existing research infrastructure instead of introducing another hosted account.

## Collaboration

Git is the collaboration transport. A project may use GitHub, GitLab, a self-hosted forge, or a filesystem remote without changing dashboard data. Branches and pull requests carry code, `references.bib`, `config/workbench.json`, write-up sources, and selected run manifests. Large datasets, credentials, and disposable tracker caches should remain outside Git or use the team's existing large-file/object-store policy.

The dashboard reads current branch, remote, and dirty/clean status. Its guarded push endpoint remains disabled unless `WORKBENCH_ENABLE_GIT_PUSH=1`; Auto-approve and Full access assistant modes may use the installed Git CLI according to their permission descriptions.

## Compute profiles

Profiles live in `config/workbench.json`. The default is local. Remote profiles use host aliases from the user's OpenSSH configuration, so keys, proxy jumps, and MFA stay outside the repository.

```json
{
  "id": "gpu-box",
  "label": "Lab GPU workstation",
  "type": "ssh",
  "host": "gpu-box",
  "projectRoot": "/srv/research/my-project"
}
```

Academic clusters use Slurm over SSH:

```json
{
  "id": "campus-slurm",
  "label": "Campus Slurm",
  "type": "slurm-ssh",
  "host": "campus-login",
  "projectRoot": "/work/my-group/my-project",
  "partition": "gpu",
  "account": "my-group",
  "time": "02:00:00"
}
```

The CLI research assistant receives these profiles as project context. Ask it to synchronize reviewed code, submit a job with `sbatch`, monitor it with `squeue`/`sacct`, and copy normalized results back into the project. No password, token, or private-key field is accepted or required.

## Experiment adapters

All runs presented by the dashboard normalize to `workbench.run/v1`; see `docs/workbench-run.schema.json`.

- `native` reads `<configured-path>/<run-id>/run.json` plus `metrics.json` (`runs/` by default).
- `mlflow` reads local file-store runs under `mlruns/<experiment-id>/<run-id>/`, including final metric values.
- `wandb` reads W&B offline run summaries under `wandb/*run-*/files/wandb-summary.json`.

Adapter paths must be relative and remain inside the active project. Hosted sync and authentication remain responsibilities of the MLflow/W&B SDK or CLI. This makes import useful offline and keeps secrets out of the dashboard.
