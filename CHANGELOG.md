# Changelog

## 0.2.4

- Fix GitHub update discovery returning HTTP 415 by requesting the release list as JSON, while retaining binary headers for installer downloads.
- Supersedes withdrawn 0.2.3. Install 0.2.4 manually once to bootstrap working verified updates.

## 0.2.3 (withdrawn)

- Enable signed update downloads with a pinned release key and select only available formats for each architecture. Older installations require a manual bootstrap update.
- Distinguish quiet Pi/tool/worker waits from an actual status connection failure.
- Prevent slow Herdr monitoring from accumulating checks that delay completion or cancellation.
- Record worker-state changes without treating unchanged status polls as provider progress.


## 0.2.2 (2026-09-10)

- Run experiment and writing conversations concurrently across project tabs.
- Keep follow-up queues ordered per conversation and active in background tabs.
- Isolate status polling, project requests, and cancellation so one task does not block another.
- Report Pi streaming progress and tool completion accurately.
- Simplify the header with flat section navigation and visible background task counts.
- Expand native build coverage to Linux and Windows ARM64 alongside x64 and both Mac architectures.
- See [release notes](docs/releases/0.2.2.md).

## 0.2.0 (2026-09-09)

- Add top-level project tabs, expanding chat drafts, collapsible prompts, message copying, and queued follow-ups.
- Retrieve relevant project evidence on demand while preserving research profiles and instructions.
- Add native provider setup launch buttons and clearer activity feedback.
- Move bibliography to the write-up controls and offer source/PDF exports, including Markdown PDFs.
- Preserve legacy CLI aliases, saved project formats, and OS credential identity.
- See [release notes](docs/releases/0.2.0.md) for downloads and platform validation.
