# What Axiovela can do

These features are implemented in the current beta. Optional integrations require their corresponding tools and accounts. See [validation status](releases/0.2.0.md) for tested platforms and remaining acceptance work.

## Desktop application

- Linux, Windows, and Apple Silicon/Intel Mac builds with a bundled runtime.
- Native project-folder selection and an example study under Help.
- OS-encrypted provider settings, profile persistence, and single-instance launch.
- A quit confirmation for running tasks and durable cancellation records.
- Installers, checksums, beta notices, and documented manual upgrades.

## Projects and launch

- Blank first launch with concise guidance and no example evidence
- Open or recursively create a project at any local path
- Persist the last intentionally selected project
- Create a portable scaffold and project manifest, with optional independent Git history in the UI
- Install the cross-platform `axiovela` command and serve the built UI/API together (`methodflow` and `ml-workbench` remain aliases)

## AI research workflow

- Codex, Claude Code, Gemini CLI, OpenCode, and Pi chat adapters
- Direct OpenAI, Anthropic, Gemini, and OpenAI-compatible API connections with project tools
- Searchable connection/model/reasoning picker with explicit catalog provenance
- Local private API-key setup outside project files
- Markdown/math and copyable code blocks in both chats, plus separate full-document LaTeX/Markdown rendering
- Independent per-project chat preferences, draft inputs, and attachments
- Saved conversation picker and New chat for each assistant, native resume, archived Codex recovery, and model-used details
- Read-only, Auto-approve, and Full access, where supported by the engine
- Clean structured activity while work runs, explicit cancellation, durable history, and reload recovery
- Project creation from a natural-language `create … under … called …` request
- Instructions for code, tests, experiment ledgers, figures, citations, and paper sources
- Natural-height chat, follow-latest scrolling, and bounded API conversation history
- Shared current project evidence in both assistant roles and figure-to-chat drag attachments
- Dataset upload/local-copy import, catalog, safe text previews, and shared assistant access

- Experimental Pi + Herdr agentic mode with one router, bounded disjoint workers, lifecycle waits, and router-owned validation

## Experiments and evidence

- Durable native run records, progress, logs, cancellation, metrics, and artifacts
- Project-adaptive Results, Methods, and Trials panes
- Automatic figure/PDF discovery and metric rendering
- Responsive figure galleries and full-window zoom/browse viewer
- All-experiments figure view with one experiment/run filter, topic headers, and run labels
- Evidence-linked executive briefs, figure captions/interpretations, and stale-summary indicators
- Full-height Results gallery, formatted study brief, and separate Methods procedures/logs
- Structured metric comparison tables, safe legacy dictionary display, and exact-value inspection
- Source-informed scientific visualization instructions and static-export review guidance
- Selectable run ledger with recorded metrics, parameters, logs, and ownership-aware cancellation
- Normalized native, local MLflow, and W&B-offline adapter schema
- Local, SSH, and Slurm-over-SSH compute configuration
- Disposable Docker/Podman runner for untrusted adversarial command candidates

## Writing

- Full-height LaTeX/Markdown source and rendered preview panes
- Complete Tectonic PDF compilation with a visible Render button
- Safe drag-and-drop image import, render cache, automatic `graphicx`, and concise error diagnostics
- Markdown headings, tables, code, math, figures, and BibTeX-backed citations
- Editable shared `references.bib` and source/PDF exports
- Expandable Research Assistant and separate figure preview/insertion actions

## Product quality

- No inherited parent-repository URL or branch in project setup
- Purposeful controls, responsive single-column layout, and persisted pane sizing
- Product-specific workbench mark and no placeholder user profile
- Enforced loopback binding, Host/origin checks, bounded JSON uploads, symlink-safe project paths, and project-switch concurrency gate

- Default Git exclusions for credentials and AI conversations in new research projects
- Isolated installer regression and repository hygiene checks

## Planned, not yet enabled

- Additional native engines and general-purpose ACP adapters beyond the included providers
- Durable single-agent Workflow stages, checkpoints, and recovery

File and folder imports accept any regular file format, including PDFs and audio, without an application file-size cap. The dataset dialog and both chat attachment menus share this importer. See [Bring your data](research-workspace.md#bring-your-data) for copying, permissions, and browser differences.
