# Passage feedback and Library

Annotations are always available. Click a sentence or drag a passage in a summary,
rendered write-up, Library article/PDF or other readable panel. Dragging leaves native
selection intact: Ctrl/Cmd+C copies exactly the selection, without saving feedback.
The compact popover omits a repeated quote and shortcut caption. Click the feedback field to
type or paste; desktop right-click menus provide the standard Copy/Paste commands.

Only **Add to message** saves a note and adds an unsent blurb above the composer.
Edit a blurb by clicking it, or remove it from this message with ×. Removing a blurb
does not delete the saved annotation. Combine notes and normal instructions, then
use ordinary **Send**. Escape, Cancel, an outside left-click, or changing workspaces
or conversations dismisses temporary feedback. Right-click preserves it. Alt+M opens
feedback for a keyboard selection. Enter in the feedback field adds an unsent note;
Shift+Enter inserts a newline. Input-method composition never submits. Ctrl/Cmd+Enter
remains available. Only ordinary Send starts the assistant.

Numbered margin markers reopen saved notes. Highlights are separate overlays, keeping
text, links, and Markdown double-click source navigation intact. Geometry follows
scrolling, resizing, PDF zoom and reader fullscreen. The PDF reader scrolls all pages,
with page arrows, fit width, pinch and symmetric Ctrl/Cmd +/- shortcuts. Fullscreen
uses one compact title/actions row and a slim PDF toolbar. Open original sits beside
the title. Entering/leaving fullscreen retains the reading anchor and mounted pages.

Images have a small bottom-right feedback control in the gallery, enlarged viewer,
and rendered documents. Normal image clicks retain their existing behavior. Saved
figure feedback references the image path and byte revision; replacement makes it stale.

## Routing and persistence

Axiovela has two assistant roles. Manuscript notes use the writing conversation
(Research Assistant); Library, study brief and experimental evidence use the experiment
conversation (Experiment Chatbot). Each project/conversation retains its own composer
text, data attachments, annotation attachments and running/queued turns. Queued messages
snapshot feedback text. Sending is validated again at admission, including after a wait.

Saved notes are individual project files in `annotations/`. Sources use canonical
identities and SHA-256 revisions: summary text from `research/summary.json`, the selected
write-up plus `references.bib`, Library article snapshots or PDF bytes, and generated
PDF documents. Other panels are explicitly labelled selected snapshots with bounded
context. Old notes remain on disk, but a changed document blocks sending them. No
fuzzy relocation is performed. Quotes are untrusted data, distinct from user feedback.

A manuscript feedback turn uses a fresh read-only provider session without changing
the conversation's saved access setting. A complete fenced proposal appears behind
**Review proposed revision**. **Apply revision** checks both source and bibliography
again, backs up the source in `writeups/backups/`, and updates only the selected format.
Research annotations retain the normal access setting. Existing editor conflict
protection remains in force.

## Library

Library sits between Trials and Write-up. Paste an arXiv URL/identifier, PDF link or
web URL in the search/import field to import; ordinary text filters local sources.
Upload PDFs using the small upload control. Sources and research items have separate section dividers. Combine the item-type
filter with Any status, Unread or Read. Pale checkboxes with a blue tick track reading. Source metadata and the original link remain with the project.
Unavailable web previews show the retrieval error, Retry preview and Open original.

PDFs are stored under `library/papers/`; article snapshots and metadata are in
`library/catalog.json`. The importer preserves article math, headings, links, lists,
code and supported raster figures. It converts inert HTML to Markdown, never executes
scripts, and pins public DNS addresses with checks at every redirect. Images are fetched
only when referenced by a saved source. Local/private network destinations are rejected.

Identity matching uses IDs, canonical URLs, arXiv identities, DOI and file hashes.
Titles and filenames alone never merge sources. Read state, notes, citation keys and
aliases survive merges. Consolidations of existing records save the old catalog under
`library/backups/`. Original PDF files are retained. Citation entries join the existing
`references.bib` workflow; verify bibliographic fields that a source does not supply.

The assistant can add URLs to `research/library-sources.json`, save PDFs in `papers/`,
or cite external sources in its response. These are indexed without starting a new
model turn; **Refresh imports** also runs discovery. Assistant imports are labelled
“AI added source.” Source selection provides local context without sending a message.

Connections reads `research/connections.json`. The Library lists and filters sources,
recorded experiments, claims, hypotheses, questions, methods, findings, assumptions,
design decisions, limitations and arguments. The same records appear in Connections. Links require existing
endpoints, a recognized relationship and supporting description; incomplete links show
a warning. The map provides distinct shapes, a legend, pan/zoom, keyboard controls,
reset and local neighborhoods. Select a node for source notes and relationship evidence.
Click an edge or focus it and press Enter/Space to reveal its endpoints, direction,
Markdown/math explanation, source location, evidence, assumptions and open gaps.
Thin edges have larger invisible click targets and a visible keyboard focus state.
Connections express interpretations, never proof or causal validation.

## Structured science and engineering results

For substantial research with editing access, the assistant is instructed to maintain
`research/connections.json` automatically alongside the existing summary/run artifacts.
This applies to project framing, literature synthesis, analysis, methods and engineering
design. It is part of the current task and does not start a second model call. Greetings,
narrow explanations and unrelated edits do not need new records. Read-only conversations
cannot save this outline or claim the Library was updated. Providers still need to follow
the instructions and perform actual file writes; this is not a guarantee of model success.

Nodes use stable `id`, `kind`, readable `title`, Markdown `text`, optional `mainResult:true`,
`status`, `assumptions`, `obligations`, `evidence` and `provenance`. See the shared vocabulary
in `shared/research-outline.mjs`. Legacy `description` remains supported. Preserve exact
values, units and provenance; the run ledger owns actual executed measurements. Node
roles and assistant-assigned status never confer independent validation. No theorem,
lemma or proof roles are required for Axiovela's science and engineering workflow.

Links use `from`, `to`, `type`, `description` (or legacy `reason`), `location`, `evidence`,
`assumptions` and `gaps`. `A depends-on B` means A requires B; `A supports B` means A
supplies evidence for B. Reuse existing IDs, read immediately before editing, preserve
unrelated records and write atomically. The app polls saved artifacts and displays updates
without manufacturing findings. Selecting a research item provides its identity, text and
relationships only when the user next sends a message. Result annotations are canonical
revision-bound anchors to `research/connections.json`, not chat snapshots.

## Limits and validation

English sentence segmentation is a convenience, including across paragraphs. Mathematical
notation and abbreviations can be ambiguous. PDF text selections are within one page;
scanned documents require OCR, which is not supplied here. Annotations are app metadata,
not edits embedded into the PDF. A request accepts at most 20 notes and 24,000 characters
of note data; manuscript review accepts up to 100,000 source characters. Popover text
is temporary until Add to message. Dynamic or access-controlled websites can remain
link-only. Physical trackpad behavior remains device-dependent.

Run `npm run annotations:test` and `npm run annotations:smoke` for fixture-only backend
and actual Electron UI acceptance. Set `AXIOVELA_ANNOTATION_TEST_BINARY` to validate a
packaged executable. Tests isolate profiles/projects and use no paid providers.
Also run the normal release, parallel-conversation and desktop regression checks.

The implementation adapts Axiovela Math's annotation, article extraction, PDF reader and
Connections patterns. Primary implementation references: [PDF.js rendering](https://mozilla.github.io/pdf.js/examples/),
[Electron native menu roles](https://www.electronjs.org/docs/latest/tutorial/menus), and
[accessible dialogs](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

## Interaction rendering

Passage capture measures one text projection and carries the final line's viewport
rectangle with the draft. Figure capture measures the image immediately. Missing
geometry keeps the popover hidden until measured; saved notes use their visible pin.
Feedback focuses with `preventScroll`, and dragging retains native selection.

`MarkdownPreview` memoizes the rendered tree from content and display/image mapping
dependencies; event callbacks stay current through refs. Annotation arrays/configs
are stable between content changes, and overlay-only mutations do not remeasure
the document. Polling compares complete assistant snapshots, including errors and
activity freshness. The activity timer remains active only during replies.

Run `npm run interaction:smoke` for rendering invalidation/callback contracts, and
`PERF_LABEL=local PERF_ASSERT=1 npm run interaction:perf` for the isolated long-text
benchmark. `AXIOVELA_PERF_BINARY` selects a packaged executable; `PERF_EVIDENCE`
sets the CPU profile, JSON and screenshot directory. Timings describe entire typing
sequences, not field INP. See the 0.2.7 release notes for recorded measurements.
