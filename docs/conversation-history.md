# Conversation history

Use **History** beside **New chat** to search the current project's conversations by title or user-visible messages. Select **All conversations** to search saved projects, or choose a particular project. Results show the project, research/writing role, last activity, a short identity suffix and a matching excerpt. Opening a result opens its existing project and selects the conversation. Missing projects are reported; search never recreates them.

Use **Rename**, **Pin**, and **Archive** on conversations in the current project. Open another project's conversation before managing it. Archived conversations are available through the **Archived** filter and can be unarchived. Archiving does not cancel work, remove queued prompts, delete messages, or change experiments. An already selected archived conversation stays accessible in its selector. The selector shows up to 50 active conversations, pins first, plus the current selection. History pages contain 50 results.

## Preservation and migration

`server/assistant-conversations.mjs` maintains version 2 metadata in each project's `assistant/conversations/`. The first normal history load upgrades older metadata under a per-project serialization lock. Before replacing an existing metadata file, it saves the exact original bytes under `assistant/conversation-backups/v1/<conversation-id>.json`. Backups are never replaced by subsequent loads. An atomic write failure preserves the previous metadata file. Unsupported/corrupt metadata is surfaced rather than reset.

Only conversation metadata changes. Project manifests, experiments, datasets, manuscript sources, figures, original assistant job records and provider session transcripts are not rewritten by this migration. Job-only conversations gain metadata under their existing identities, including the existing `legacy-experiment` and `legacy-writing` IDs. No title-based merging occurs. Provider session lineage is derived from original job records beneath each logical conversation.

Old generated first-message prefixes and known boilerplate titles are repaired from the original user request where possible. Unknown titles are preserved. New titles use the first meaningful line of the actual request, never the assembled provider prompt. Ambiguous historical wrappers receive a neutral title; the app does not guess the boundary between historical messages and a new request. Manual titles are marked explicitly and survive first send, follow-ups and restarts.

To undo an older-file metadata upgrade, stop Axiovela and restore only the corresponding JSON from `assistant/conversation-backups/v1/` to `assistant/conversations/`. This restores pre-upgrade titles and organization, not experiments or messages (which were never changed). New metadata for job-only history can be removed to return to deriving that history from its original jobs. Keep backups; reopening this version will migrate old metadata again.

## Search boundaries

`server/conversation-search.mjs` reads only projects in the existing device-local catalog. Search is on demand and read-only: it does not activate projects, migrate their files, grant them access to project-specific endpoints, or inject their conversations into model context. Paths use the shared symlink and containment checks.

Search is bounded to 100 selected catalog projects, 5,000 turn records per project, 4 MB per turn, and 64 MB of turn-record reads per request. Metadata is bounded to 10,000 directory entries and 256 KB per conversation, with at most 16 MB of metadata per project. Notices report partial results, unavailable projects and corrupt files; project filters narrow the scan. These are bounded scans, not a new persistent database. Only matching excerpts and metadata are returned. Search requests are debounced and stale responses ignored.

## Provider history

Axiovela's logical conversation survives provider/profile changes; native sessions may restart with the existing historical handoff rules. Native session IDs stay beneath the same logical conversation. Axiovela does not merge or delete provider history.

Codex receives the saved Axiovela title on start/resume through `thread/name/set`, verified against the installed generated schema and the [official app-server documentation](https://learn.chatgpt.com/docs/app-server). Title failures are nonfatal and reported in connection activity. A renamed or repaired title reaches an existing external session on its next Axiovela turn; merely browsing history does not launch a provider. Codex's working directory remains the owning project directory. External sidebar grouping is controlled by the external application; Axiovela does not assume that a working directory creates a sidebar project. Other provider adapters retain their existing external-history behavior.

## Verification

- `npm run history:test`: exact backup bytes, migration idempotency, untouched research assets/transcripts, concurrent metadata edits, manual/legacy titles, stable identities, session lineage, project/path isolation and read-only cross-project search with pagination.
- `npm run history:smoke`: isolated Electron fixture with 131 conversations across two projects; title repair, message search, rename/pin/archive/reload, resume/follow-up, cross-project navigation, bounded rendering and preservation of an existing figure. Screenshots: `.local/conversation-history/`. Set `AXIOVELA_HISTORY_TEST_BINARY` to run the same checks on a packaged executable.
- `npm run assistant:smoke`: explicit Codex naming, rename on resume, unsupported-method fallback and existing protocol checks.
- Run `npm run parallel:smoke`, project/security/backend/research checks, and the desktop build/package acceptance checks for integrations.

## Codex sidebar cleanup (0.2.10)

Axiovela History and saved turn records remain authoritative. After a successful matching root `turn/completed` notification, the runtime performs best-effort native sidebar cleanup for that Axiovela-managed session only. Both thread and turn IDs must match; worker, historical, failed and canceled completions cannot trigger it. Native archiving never sets Axiovela's `archived` flag, removes messages, or changes the follow-up queue.

The adapter reads `thread/read` with `includeTurns: false`, requires the matching root ID and an `idle` or `notLoaded` status, and skips provider-reported `pinned`/`isPinned` threads. It then requests `thread/loaded/list` with `limit: 2`. Another loaded thread, a continuation cursor, malformed data, cancellation or any request failure prevents archiving. This deliberately conservative check protects descendants that archiving could unload. Each cleanup request has a 1.5-second timeout; cleanup errors cannot reject the completed turn. No background sweep or bulk archive is performed.

Follow-ups resume the saved native ID. Only an explicit archived-session rejection allows unarchiving and one retry; accepted turns are never replayed. Existing fresh-session/profile and historical-handoff rules remain intact, and titles still come from saved manual titles or actual user requests. Active sessions can appear temporarily in Codex Recents. Sessions skipped for safety or unsupported APIs may remain there. An already-running app must restart to load an installed update.

Compatibility was checked using `codex-cli 0.153.4 app-server generate-json-schema --experimental`: `thread/read`, `thread/loaded/list`, `thread/archive`, `thread/unarchive`, `thread/resume`, and `thread/name/set`. The generated Thread schema does not currently expose a pin field; optional provider-reported pin flags are respected when present, but unavailable pin information cannot be independently verified. Loaded-thread checks describe the connected app-server's view, not an atomic lock across external clients. See [official protocol documentation](https://learn.chatgpt.com/docs/app-server).

`npm run codex:sidebar:test` covers conservative cleanup, timeouts/errors, retained native transcripts, repeated resume, accepted-turn counts, active workers, cancellation and unmanaged sessions. The History packaged smoke verifies the unchanged logical and native IDs across three turns and separate native/app archive state. `npm run parallel:smoke` exercises concurrent chats, follow-up queues, errors, Stop and reload in isolated fixtures. No real provider credentials or user projects are used.
