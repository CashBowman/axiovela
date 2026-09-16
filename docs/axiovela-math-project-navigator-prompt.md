# Prompt: port Axiovela's project navigator to Axiovela Math

Implement the same Projects switcher and explained cross-project Connections view as Axiovela 0.2.6-beta.3. Work only in Axiovela Math. Read its current AGENTS.md and preserve unrelated changes. Back up edited files first. Do not publish, push, or dispatch GitHub builds. Produce local candidates only when explicitly requested.

Reference implementation, read-only:

`<axiovela-checkout>`

Read these files before editing:

- `src/ProjectNavigator.jsx`, `src/project-navigator.css`, and its integration in `src/main.jsx`
- `src/ConnectionsGraph.jsx` (`catalog` presentation, keyboard edges, explanation/action slots, unique SVG markers)
- `server/project-catalog.mjs`, registration and `/api/projects` routes in `server/index.mjs`
- `docs/project-navigator.md`
- `scripts/project-catalog.test.mjs`, `scripts/project-navigator-smoke.mjs`

Inspect Math's current `server/projects.mjs`, store/revision API, `server/index.mjs`, desktop storage, project/tab UI, `ConnectionsGraph`, Library, conversations, and project-specific draft persistence. At the time of this handoff Math uses a workspace project store plus `project-folders.json`, not Axiovela's `workbench.project.json` manifest. Adapt those reads and IDs to Math's existing authoritative store; do not copy Axiovela's manifest requirement or create a competing registry. In particular, Math's `Projects.root()` currently creates directories: do not call this mutating path resolver from a read-only index or when checking a missing folder.

## Exact interaction contract

1. Add a small labeled **Projects** dropdown beside the existing project tabs. Keep header height, typography and colors. Search names, paths and research questions; show pinned projects first, then recency. Show paths to disambiguate duplicate names. Opening a saved project activates its existing tab or creates one without duplicating it. Closing a tab keeps its history entry. Do not add a permanent sidebar or a second tab system.
2. Import the existing workspace project registry, open-tab history and other already-recorded project identities. Do not recursively crawl home directories. Missing folders remain visible and disabled for opening. Add-folder uses the existing native picker. Reopening or inspecting a missing project must not initialize an empty replacement.
3. **Connections & manage** opens a modal with a searchable saved-project list and an on-demand map, local neighborhood by default, overview available. Selecting a project or experiment exposes its identity and an explicit Open in tab action. Preserve the user's current reader scroll/zoom, native selection, composer drafts, annotation attachments, running turns, follow-up queues and current panel when dismissing the modal.
4. Derived edges explain recorded project membership and exact shared references (DOI/arXiv/canonical URL/PDF hash). Do not equate titles or broad topics, infer proof relationships, or fabricate links to connect every node. Shared-source edges are symmetric. Mathematical verification status must not change because of an edge. Existing claim/research maps remain authoritative within each project.
5. Allow explicit user links between projects and experiments. Require endpoints, relation and explanation. Use stable IDs, support editing and removing links, preserve inaccessible endpoints for recovery, and distinguish user links from derived links. Relations may include the same general relations as Axiovela; do not label a project-level relation a formal proof or certification.
6. Mouse click, Tab then Enter/Space on an edge reveal the full explanation, evidence and source locations. Close restores focus. Escape dismisses the modal. Give the graph a bounded height so explanations remain visible. Support pan/zoom and a readable relationships list. Use unique SVG IDs and visibly focused controls.
7. **Pin**, **Locate**, and **Remove from list** have the same semantics: locate preserves identity; remove only hides history and does not delete folders, tabs, claims, documents, conversations or links. Reopening restores hidden records. Explain unavailable folders and partial indexes. Do not treat missing metadata as an empty authoritative scientific state.

## State, access and compatibility

Use Math's existing atomic persistence and revision conflict checks. Preserve independent state across projects/conversations. Bound metadata reads and graph size, disclose truncation, reject descendant symlinks/path traversal and corrupted data without silently overwriting it. Derive the list cheaply; only load graph detail when requested. No network fetching/model calls/background crawls for this feature. Indexed roots do not grant cross-project write permissions. Quoted metadata is data, not instructions, and other-project data must not be automatically attached to a model turn.

Keep Math project IDs and its folder registry stable. Represent manual endpoints and origins explicitly in the persisted schema, and document mappings to Axiovela's `project:<id>` and `experiment:<id>:<encoded-run-directory>` shape. Do not make the two applications write a single shared profile file concurrently: this port provides matching behavior within Math, not unimplemented cross-app synchronization. If cross-app links are later requested, use an explicit import/export contract carrying application identity and immutable origin IDs.

## Validation and handoff

Use temporary profiles/projects and fixture providers only. Test closed-tab reopening, deduplication and aliases, duplicate names, pins/search/keyboard, project migration, isolated drafts/attachments/running turns, no model call on navigation, manual link create/edit/remove, derived edges and false-match rejection, missing/moved folders, reload, conflict handling, corruption/symlinks, narrow layout and no extra header height. Inspect actual rendered UI and test a packaged desktop app. Rerun Math's annotation, Library, parallel-conversation and revision-review safeguards. Never test writes against real research projects or live paid credentials.

Report changed files, tests, limitations, backup location and artifact paths. Preserve the reference repository. Do not claim Mac/Windows native installation was tested from Linux; local packaging and device acceptance are separate.
