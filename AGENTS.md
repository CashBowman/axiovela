# Project agent memory

Product branding is Axiovela. Keep the `hypotera`, `methodflow`, and `ml-workbench` command aliases, backend IDs, and legacy OS/browser configuration keys compatible unless implementing an explicit migration.

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.

## Project notes

- Guided updates: `desktop/updates.cjs` and `docs/updates.md`. Native installation is intentionally unavailable with the current signing/distribution constraints. Never add install-on-quit or an unattended replacement path. `npm run updates:test` and `npm run updates:smoke` use isolated fixtures; local `updates:publish` uploads to an existing GitHub draft without dispatching builds. Provision a real pinned public key before claiming verified downloads work in shipped builds.

- Final Mac bundles need a fresh signature after packaging; ad-hoc integrity is separate from Gatekeeper trust. `scripts/mac-trust-report.mjs` and `scripts/desktop-dmg-smoke.mjs` preserve policy failures and check the installed seal. A passing desktop job is not distribution approval when the saved policy assessment rejects the app. `npm run desktop:verify:mac` is the separate mandatory distribution gate; see `docs/mac-distribution.md`.

- macOS DMG staging must preserve framework symlinks verbatim (`scripts/desktop-bundle.mjs`); Node's default `cp` rewrites relative links to build-host paths. Packaged-directory smoke tests do not validate the final DMG; verify the installed DMG on a Mac before handoff.

- Stage Mac DMGs in the system temporary directory, outside synced checkouts. File Provider can attach `com.apple.FinderInfo` to a staged `.app`, invalidating its seal after a metadata-preserving install. The DMG smoke uses `ditto` for installation so Node's metadata-dropping copy cannot hide this defect.

- Windows desktop test profiles must create the standard AppData/Local and AppData/Roaming directories under the temporary USERPROFILE; Tectonic uses Windows known-folder APIs, so arbitrary APPDATA overrides alone fail. Keep TECTONIC_CACHE_DIR isolated.

- Desktop entry/configuration: `desktop/main.cjs`, `forge.config.cjs`, and `docs/desktop.md`. Run `npm run desktop:test` plus `npm run desktop:package` and `npm run desktop:smoke -- --packaged`; also run `npm run desktop:recovery:smoke` for window/credential changes. Smoke tests isolate all user/project state. Never test writes or provider logins against a user's profile. Desktop Node is bundled by Electron; CLI compatibility remains Node 22.

- Run `npm run install:smoke` for an isolated clean install/link/launch check (uses a temporary npm prefix). `npm run security:smoke` covers HTTP and project filesystem boundaries; shared path rules live in `server/project-paths.mjs`.

- Run `npm run release:check` for the publication gate, including the standalone Node-only example in `examples/linear-regression/`. Release and branding compatibility notes are in `docs/releasing.md` and `docs/branding.md`.

- Run `npm run research:smoke` for dataset, evidence metadata, and legacy-link regressions. The optional `node scripts/research-smoke.mjs --serve` opens an isolated credential-free UI fixture on port 8896; never test writes against a user's research project. Presentation contracts are in `docs/research-workspace.md`.

- The local Node service is `server/index.mjs`; endpoint contracts and safety rules are documented in `docs/runner-backend.md`. Run `npm run backend:smoke` for an end-to-end runner check.
- The backend-managed default project root is intentionally ignored (`ml-theory-workbench-project/`); use `project-template/` for committed workflow, prompt, and model-role sources.
- Native assistant protocol code lives in `server/assistant-runtime.mjs`. Run `npm run assistant:smoke` for credential-free session/model regression tests; supported engines and permission limitations are documented in `docs/model-tools.md`.
- Multi-provider protocol tests are `npm run provider:smoke` and `npm run cli-provider:smoke`. API keys live in OS user configuration, not project files; never use live credentials in regression tests.

- On Windows, cancellation and timeout paths must not report completion until their child process tree has exited; otherwise isolated profile cleanup can fail with `EBUSY`. Playwright-attached Windows renderers may ignore process-kill crash simulations, so the recovery smoke emits Electron's `render-process-gone` event there while Mac/Linux retain a real forced renderer crash.

- Desktop distribution defaults to ad-hoc signing on Mac and unsigned Windows installers, without Apple enrollment. Use `docs/releases/0.2.2.md` for release validation limits; `scripts/desktop-artifacts.mjs` includes cross-platform handoff files. Keep real-machine acceptance distinct from native CI.

- New-machine setup is in `docs/development-setup.md`. Build and Desktop beta workflows are manual to control cost. If present, consult `.local/DEVELOPMENT-HANDOFF.md` for private continuation notes; never commit or package `.local/`. Ignored notes must be transferred separately from Git.

- Provider setup is shared by `src/ConnectionSetup.jsx` and the model/Agentic dialogs. The renderer may only request an allowlisted native tool picker, never arbitrary shell execution. Experiment/trial labels belong in the initial run record, before computation; `WorkbenchRun` accepts `name` and `experiment`. Preserve saved format choices. `src/WriteupFormatMenu.jsx` stores a device-wide initial write-up default (Markdown fallback); experiment requests send `defaultWriteupFormat` separately from the active editor format. Never convert existing drafts merely to match the default.

- Research profiles are allowlisted in `server/research-profiles.mjs`; bundled skills under `server/research-skills` must ship with the backend. Pi receives an explicit `--skill` alongside `--no-skills`; other engines receive the same text, and worker briefs inherit it. Profile changes require a new native session with conversation handoff, preserving model/access choices. See `docs/research-profiles.md`.

- Beta chat/navigation/export contracts: `docs/beta-feedback.md`; run `npm run beta:feedback:smoke` in addition to desktop checks. Assistant evidence is retrieved on demand, not injected per turn. Desktop provider setup accepts only fixed tool/action IDs in `desktop/provider-setup.cjs`, never renderer command text.

- Parallel conversations: `src/useParallelAssistant.js` owns task polling and per-conversation follow-up queues. `server/index.mjs` captures request roots with AsyncLocalStorage; preserve `x-axiovela-project` through the desktop bridge. Keep job reads/cancellation scoped and admit only one turn per conversation. Run `npm run parallel:smoke` for overlapping roles/projects, hidden queues, stalled status/upload isolation and reload recovery. Keep activity freshness separate from timeline deduplication. This is shared-project concurrency, not worktree isolation.
