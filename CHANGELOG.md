# Changelog

## 0.2.5

- Figure edit requests now instruct assistants to reuse existing plotting source and recorded results, replace the same export and metadata entry, and keep recovery copies outside the gallery. New experiments and explicitly requested variants retain separate figures.
- Replacing a figure refreshes its gallery preview and an already-open viewer, including captions and download links, without adding a duplicate card.
- The 0.2.5 downloads were refreshed to include these figure fixes. Existing 0.2.5 users must download again and reinstall; same-version updates are not automatically offered.

- Restore Agentic mode per conversation, matching running tasks and follow-up settings after reopening.
- Keep Pi sessions alive through intermediate provider/WebSocket errors, retries, and context recovery; report completion only after settling, with a legacy idle check for older Pi.
- Show queued prompts beside the composer with in-place editing, preserving separate drafts and submitted settings. Pause and retain follow-ups after failure/Stop, preserve ordering during edits, and restore saved queues paused after reopening.
- Preserve a message when delivery cannot be confirmed; never silently resubmit an ambiguous request.

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
