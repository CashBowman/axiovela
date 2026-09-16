# Projects and connections

Use **Projects** beside the open tabs to search saved folders by name, path or research question. Pinned folders appear first, then recently opened projects. Selecting a project opens or activates its existing tab. Closing a tab does not remove the project from this list. **Open or create…** adds another folder through the existing project picker.

**Connections & manage** opens an occasional-use view. Select a project for its local neighborhood; **All items** shows the indexed projects and experiments. Select a node and choose **Open project/experiment in tab** to continue working. Click an edge, or focus it and press Enter/Space, to read its explanation. Escape closes the view. Search, tab navigation, pan and zoom remain available.

Connections come from three sources:

- Recorded experiment membership, with the location of its run record.
- Exact shared Library references (DOI, arXiv identity, canonical URL or identical uploaded PDF hash). These are symmetric associations, not scientific agreement or causality. Identical titles alone never establish a connection.
- User-authored relationships: related-to, extends, supports, contradicts, uses, tests or motivates. **Add connection** requires two existing endpoints and an explanation. Select that edge to edit or remove it.

Unrelated projects remain independent. No model calls are made by browsing, indexing or editing these connections, and other project contents are not injected into chat. In-project scientific connections continue to live in Library.

## Storage and boundaries

`server/project-catalog.mjs` stores schema version 1 in `projects.json` next to the existing application `state.json`. It is device-local, separate from project files and credentials. Existing open tabs and retained composer-draft project identities are migrated without activating projects. Folders not previously recorded must be added explicitly. This is not a filesystem-wide search or cloud sync.

The index keeps stable project IDs, canonical paths, display names, pins and last-opened times. Manual edges use stable `project:<id>` or `experiment:<id>:<encoded-run-directory>` endpoints. Writes are serialized and atomic. Unsupported/corrupt catalogs are reported rather than silently reset. The regular app-origin and desktop-session checks protect the API. Indexed folders do not become authorized roots for other endpoints until explicitly opened.

Missing folders remain visible. **Locate** reconnects a moved folder without changing the saved project ID; the selected folder must contain an existing project manifest. It does not silently create a replacement. **Remove from list** hides the catalog entry; it does not delete project files, tabs or saved relationships. Reopening that folder restores its identity and relationships. Hidden records are retained for this reversible behavior.

Reads are limited to the project manifest, native `runs/*/run.json` and `library/catalog.json`; descendant symlinks and oversized metadata are rejected. The list avoids loading graph data. The graph bounds experiments to 200 per project and 300 overall, shared-source pairs to 1000, Library entries to 1000 per project, and the visible project index to 500 folders. Index notices explain truncation or unavailable metadata. External MLflow/W&B runs stay in their owning project's existing Results view; this cross-project view currently indexes native run records.

Removing a derived connection requires changing its source record; derived edges cannot be presented as user edits. Saved manual edges with unavailable endpoints are retained and reported. The index is refreshed on opening its UI or pressing Refresh, without background scanning or network fetching.

## Design references

The visible Projects label and remembered names support recognition rather than recall ([NN/g usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/)). Search and project switching are immediately available; the larger map and maintenance controls appear only when requested ([progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/)). Local neighborhoods, filters and a separate overview follow [Obsidian's graph view](https://obsidian.md/help/plugins/graph). These principles inform the design; the projects and connection explanations remain Axiovela-specific.

## Verification

`npm run projects:test` tests canonical identity, concurrent updates, source matches, stale/missing paths, relocation, persistence, corruption and safe removal. `npm run projects:smoke` runs an isolated Electron fixture with no live credentials. Set `AXIOVELA_PROJECT_TEST_BINARY` to test a packaged executable and `AXIOVELA_PROJECT_EVIDENCE` to choose its screenshot directory. Run the existing parallel, annotation, security and desktop suites when changing these integrations.
