"""Dependency-free live run tracking for Axiovela experiments."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from transformers import TrainerCallback
except ImportError:  # The run ledger itself has no third-party dependency.
    class TrainerCallback:  # type: ignore[no-redef]
        pass


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class WorkbenchRun:
    """Atomically maintain the run files that the dashboard watches."""

    def __init__(self, project_root: str | Path, run_id: str, parameters: dict[str, Any] | None = None, *, name: str | None = None, experiment: str | None = None):
        if not run_id or any(character not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-" for character in run_id):
            raise ValueError("run_id may contain only letters, numbers, underscores, and hyphens")
        self.directory = Path(project_root).resolve() / "runs" / run_id
        self.directory.mkdir(parents=True, exist_ok=True)
        self.metrics_path = self.directory / "metrics.json"
        self.record_path = self.directory / "run.json"
        self.record: dict[str, Any] = {
            "schemaVersion": "workbench.run/v1",
            "id": run_id,
            "name": name or run_id.replace("-", " ").replace("_", " "),
            "kind": "experiment",
            "status": "running",
            "progress": 0,
            "startedAt": _now(),
            "completedAt": None,
            "logs": ["Experiment started."],
            "parameters": parameters or {},
            "metrics": {},
            "artifacts": [],
            "error": None,
        }
        if experiment and experiment.strip():
            self.record["experiment"] = experiment.strip()
        self._write()

    @staticmethod
    def _atomic_json(path: Path, value: dict[str, Any]) -> None:
        temporary = path.with_suffix(path.suffix + f".{os.getpid()}.tmp")
        temporary.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
        os.replace(temporary, path)

    def _write(self) -> None:
        self._atomic_json(self.record_path, self.record)
        self._atomic_json(self.metrics_path, self.record["metrics"])

    def update(
        self,
        *,
        progress: float | None = None,
        metrics: dict[str, Any] | None = None,
        message: str | None = None,
        artifacts: list[str] | None = None,
    ) -> None:
        if progress is not None:
            self.record["progress"] = max(0, min(100, float(progress)))
        if metrics:
            self.record["metrics"].update(metrics)
        if message:
            self.record["logs"].append(message)
            self.record["logs"] = self.record["logs"][-200:]
        if artifacts is not None:
            self.record["artifacts"] = artifacts
        self._write()

    def complete(self, *, metrics: dict[str, Any] | None = None, artifacts: list[str] | None = None, summary: str | None = None) -> None:
        self.update(progress=100, metrics=metrics, artifacts=artifacts, message="Experiment completed.")
        self.record.update(status="complete", completedAt=_now(), error=None)
        if summary is not None:
            self.record["summary"] = summary
        self._write()

    def fail(self, error: BaseException | str) -> None:
        message = str(error)
        self.record.update(status="failed", completedAt=_now(), error=message)
        self.record["logs"].append(f"Experiment failed: {message}")
        self._write()


class WorkbenchTrainerCallback(TrainerCallback):
    """Hugging Face Trainer callback that streams logs and progress to the UI."""

    def __init__(self, run: WorkbenchRun):
        self.run = run

    def on_train_begin(self, args: Any, state: Any, control: Any, **kwargs: Any) -> None:
        self.run.update(progress=0, message="Training started.")

    def on_log(self, args: Any, state: Any, control: Any, logs: dict[str, Any] | None = None, **kwargs: Any) -> None:
        logs = logs or {}
        maximum = max(1, int(getattr(state, "max_steps", 1)))
        step = int(getattr(state, "global_step", 0))
        metrics = {key: value for key, value in logs.items() if isinstance(value, (int, float))}
        self.run.update(progress=100 * step / maximum, metrics=metrics, message=f"Step {step} / {maximum}")

    def on_train_end(self, args: Any, state: Any, control: Any, **kwargs: Any) -> None:
        self.run.complete()
