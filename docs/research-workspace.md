# Research workspace

Axiovela keeps the conversation, data, evidence, and writing in one local project. Open **Project** to start from an empty folder. No sample experiment results are loaded into a new project.

## Bring your data

Choose **Link dataset → Choose files** or **Choose folder**. Both chat attachment menus offer the same choices. All regular file formats are accepted, including CSV, Excel, Parquet, NumPy, PDFs, audio such as MP3, images, archives, and code. Importing stores files; it never executes code or extracts archives automatically.

There is no application file-size cap or catalog item-count cap. Browser uploads stream to disk, and desktop selections copy directly from disk without loading whole files into memory. Copies require enough free space and can take time. Desktop pickers open in the active project folder. Browser pickers use the browser's starting location, which a website cannot set to an arbitrary project path. **Import by path** remains an optional shortcut for files or folders.

Folders become a single catalog entry with their relative paths preserved. Desktop imports preserve empty subfolders; browser folder selection includes files and their parent directories, but cannot preserve empty folders. Credential/configuration paths (such as `.env`, `.git`, and `.ssh`), symbolic links, and special device files are excluded, with a skipped-item count. Do not select the project itself, an ancestor containing the project, or its existing `datasets/` directory for recursive import. This avoids copying imported data back into itself.

Copies live in `datasets/<id>/<name>`; originals remain unchanged. The catalog records only workspace-relative locations, sizes, and formats. **Preview** displays the first 64 KB of supported text; other files and folders show metadata. **Unlink** removes the catalog entry and preserves the workspace copy. Failed individual file or folder imports remove their partial copy. When selecting several independent files, completed imports remain available if a later file fails.

Both assistants receive the dataset catalog, and chat attachments include the imported workspace paths. Attaching a PDF or MP3 does not automatically give every model native document or audio understanding: analysis needs a connection with suitable file-reading or execution tools, any required libraries, and the appropriate permissions. API assistants can call `read_dataset` for a bounded preview in read-only mode. Live remote sources, automatic schema inference, and virtual links are not provided by this importer.

Data is local until a provider is asked to inspect it. A remote model receives the samples and tool output used in its conversation. Do not provide private or restricted datasets to an external provider without authorization. Dataset copies and research output folders are ignored in the application repository; review the ignore rules of your separate research repository before publishing it.

## Read the conversation

Use **New chat** above the composer to start an empty conversation, or choose an earlier chat from **Conversation**. Access sits beside the model picker below the input; chat expands into the freed space. Each assistant has its own saved conversation list; switching chats restores its messages and keeps unsent drafts and attachments separate while the app is open. Reloading restores saved history and your selected chat. One assistant task runs at a time; stop it or wait for completion before switching conversations.

Messages grow to fit their Markdown, equations, and code. Fenced code blocks have a **Copy** button that copies the code block text without Markdown fences. New prompts go to the bottom. While you read older messages, incoming content does not force you back down; **Jump to latest** resumes following. Each assistant keeps its own model selection across its conversations. The composer is disabled until initial history and connection preferences have loaded, avoiding accidental sends under a fallback model.

Every request includes a bounded current snapshot of completed/running experiments, measurements, method metadata, figures, the brief, and source filenames. A fresh writing conversation can therefore summarize experiments done in another chat. Conversation history stays separate; neither role should infer an empty project from an empty chat. Large records require reading their project files. Provider calls may transmit this metadata, but not automatically full datasets or source contents.\n\nDrag a project figure card onto either chat composer to attach its validated project-relative reference. It appears in a removable chip and persists with the sent message. This is a file reference, not a universal multimodal image upload: the connection must support inspecting that image, otherwise the assistant should use metadata and disclose that limitation.\n\nThe assistants are instructed to answer greetings conversationally, continue the existing task, and report useful progress. They should not start unsolicited experiments. Model-identity questions use the current runtime selection, and requests for command examples should return copyable code without changing project files. A failed request remains part of conversation context so a follow-up can continue it. Codex conversations archived outside the workbench are restored when resumed, preserving their native context. These are behavioral instructions, not a guarantee that every third-party model will follow them. Permissions remain the execution boundary.

## Inspect figures and experiments

Select **Enlarge** for a full-window viewer. Use previous/next buttons or arrow keys to browse, **Fit** to reset, and +/− to zoom. Scroll the canvas to pan when zoomed, or select a thumbnail in the bottom strip. Escape closes the viewer and restores keyboard focus. **Original** downloads the source image.

The write-up gallery has separate **Enlarge** and **Insert into write-up** actions. Dragging still inserts a figure. Drag the horizontal divider below the Research Assistant downward to grow chat and compress the figures panel; keyboard users can focus that divider and use Up/Down. Layout changes persist locally.

The source editor autosaves to `writeups/main.tex` or `writeups/main.md` after a 700 ms typing pause, with a three-second checkpoint during continuous typing. **All changes saved** means the backend acknowledged the disk write. **Save source** remains an immediate manual action. Writing requests and format/project switches flush pending edits first. LaTeX and Markdown have separate files; toggling does not translate an existing document. The writing assistant receives the selected format and writes that format's raw source. Clean editors pick up disk changes automatically.

Each edit also attempts to store a recovery draft in browser local storage, keyed by project and format. During active assistant tasks, automatic disk writes pause to avoid overwriting the assistant; local draft recovery continues. Conflicts stop autosave and retain the editor draft across reloads. **Export source** preserves a separate downloaded copy; **Reload disk source** discards the recovery draft only after confirmation. A browser-close warning protects pending edits. Browser storage can be unavailable or full, and clearing browser data removes recovery copies. Back up the project folder separately.

Code, exported figures, run records, and paper source are ordinary project files saved by the assistant's tools or experiment program. Instructions require incremental checkpoints; code appearing only in chat is not automatically a source file. Imported figures save immediately. PDFs are generated on Render or by the assistant, not on each keystroke. Saving does not automatically commit or push the research project's Git repository.

Raw links such as `/writeups/main.tex` and `/writeups/main.md` serve project source text. The renderer supports literal `\graphicspath{{../artifacts/figures/}}` directories and extensionless figure references while refusing paths and symlinks outside the project. Macro-generated graphics paths are not expanded by the asset importer.

**Results** pairs a study brief with a full-height figure gallery. Counts come first, followed by the question, formatted synthesis, findings, compact evidence-linked metric comparisons, and limitations. Its tables use actual run metrics, independently of the author's prose. Missing briefs get an automatic factual overview from completed run records, without paid background model calls. Assistants are instructed to finish experiments by updating the richer synthesis. The stale indicator compares valid completion timestamps as instants (including timezone offsets), not strings; running jobs alone do not make a brief stale.

**Methods** is the detailed audit view. The hypothesis/research question leads the experiment outline. Choose an experiment directly there to see its procedure, parameters, artifact paths, complete metric tables, and execution log. Project setup combines compute/tracking/versioning configuration, code inventory, and datasets. The former Evidence tab is consolidated here. Nested model dictionaries sharing metric fields render as comparison tables; scalar metadata gets a field/value table. JSON dictionary strings and simple legacy Python numeric dictionary strings are read safely without evaluation. Exact recorded values remain expandable; missing values are shown as a dash, not zero. Arrays of records and numeric matrices are tabulated, with positional row/column labels where semantic labels were not provided.

**Trials** is a compact ledger of saved experiment records, refreshed every three seconds. Select a trial to see recorded metrics, timestamps, and expandable logs, parameters, environment, and artifact paths. It shares the selection with Methods. Records depend on the experiment writing tracking data; the page does not infer live progress. Cancellation appears only for processes owned by the backend runner. Stop assistant-owned tasks in chat and externally launched trials in their originating tracker. Existing `runs/` files and API names remain compatible.

New projects default to **Markdown**, displayed before LaTeX. Saved per-project format choices remain respected. The Write-up format buttons show **Draft** for nonblank source and **Empty** otherwise, including the unselected format. Indicators follow disk updates on project refresh and local edits immediately. Switching formats preserves the existing save/conflict handling.

## Executive summaries and readable names

Panel prose uses Markdown math delimiters: write `$R^2$`, not bare `R^2`. Both assistants are instructed to format mathematical notation in briefs, findings, methods, and captions, explain it plainly, and preserve numeric metric JSON. Actual function names belong in code backticks. Existing plain-text briefs are not silently rewritten; the formatting instructions apply when the assistant next authors or revises them.

The figures column defaults to **All experiments**. Its single **Figures from** selector offers named experiment groups and, for groups with multiple runs, individual runs. Topic headers divide the visible figures, and each card identifies its linked run(s). The same controls work in Write-up. Filtering affects figures only; the study brief stays project-wide. Enlarged viewing browses the filtered figures. No files are moved or deleted by filtering.

Before computation, assistants record the plain-language `name` (trial title) and `experiment` (group) in each queued/running `run.json`. The trial ledger displays both immediately; the figure selector lists known experiments before figures exist. These labels describe planned work, not results. Older helpers can write the fields directly without changing stable run IDs.

Assistants record an optional plain-language `experiment` in each `run.json`, reusing it for parameter/model variants of the same question. Figure metadata supports `topic`, `runId`, or `runIds` for cross-run comparisons. Exact run-ledger artifact paths supply legacy associations when explicit figure links are absent. Unlinked figures remain available under All experiments and No run linked; missing topics use Figures. Grouping never guesses scientific relationships from filenames, and requires no paid background categorization call.

The backend discovers real figures and run records; it never invents study conclusions. Older projects immediately get readable names, recorded run statistics, metrics, and an explicit indication when interpretation is missing. For a richer brief, ask either assistant:

> Review the recorded experiments. Update the executive summary, explain each figure, link findings to run IDs, and identify limitations and next experiments. Do not run new experiments yet.

New research tasks receive the same instructions automatically. Use a descriptive `name` and optional `summary` in each `run.json`, while keeping the stable `id` unchanged. The Python helper accepts these without breaking older callers:

```python
run = WorkbenchRun(project_root, "baseline-01", {"seed": 7},
                   name="Logistic baseline · held-out evaluation",
                   experiment="Predicting survival")
# ... execute and record actual measurements ...
run.complete(metrics=measured_metrics, artifacts=figure_paths,
             summary="Describe the measured outcome and its scope.")
```

Write `research/summary.json` atomically with this schema:

```json
{
  "schemaVersion": "workbench.research/v1",
  "updatedAt": "2026-01-01T12:00:00Z",
  "summary": "What was tested, what was observed, and what it means.",
  "findings": [{"text": "A supported finding.", "runIds": ["baseline-01"]}],
  "limitations": ["A specific uncertainty or limitation."],
  "nextSteps": ["The next useful test."]
}
```

Results labels the brief as assistant/author synthesis and supports Markdown emphasis, lists, math, and tables in its text fields. Hypotheses, run summaries, procedures, figure captions, and interpretations use the same renderer. Titles and metric labels support inline emphasis and math; operational logs, paths, commands, and exact JSON remain literal. Missing evidence references and briefs older than subsequent runs are flagged. A link establishes traceability, not proof that a claim is correct; inspect Methods before accepting it. Old prose is not automatically rewritten or interpreted.

For a structured experiment outline, a native `run.json` may contain a `method` object with `objective`, `data`, `preprocessing`, `split`, `models`, `evaluation` (text), and `steps` (ordered strings). Record only what was performed. Older runs still expose parameters and logs, with an explicit notice when no procedure was documented. Store model metrics as nested JSON objects, never formatted dictionary strings.

Figure captions and interpretations live in `artifacts/figures/metadata.json`:

```json
{
  "schemaVersion": "workbench.figures/v1",
  "figures": [{
    "path": "artifacts/figures/baseline-diagnostic.svg",
    "title": "Baseline diagnostic",
    "caption": "Describe the axes, units, and comparison.",
    "interpretation": "Explain the observed pattern and caveat.",
    "runId": "baseline-01"
  }]
}
```

The gallery discovers up to 500 static image/PDF artifacts in bounded-depth subfolders and hides compiler intermediates. Assistants receive the [visualization guidance](visualization-guidelines.md), including honest encodings, chart selection, accessible styling, and static export inspection. Arbitrary interactive HTML is not embedded in the figure viewer. Plotly exports may need an additional renderer installation.

## Compatibility

The product is now **Axiovela**, launched with `axiovela`. The repository name, legacy `ml-workbench` alias, existing OS configuration locations, browser preference keys, and backend identifiers remain unchanged so saved projects and provider credentials continue to work. No account, cloud deployment, or desktop wrapper was introduced.

## Placing figures in the write-up

Drop an image on the source line where it should appear, including in a scrolled or wrapped editor. The figure block is inserted before that line. To place it at a specific character, click there and use the figure's **Insert** button. Source text is preserved. Markdown and LaTeX use the same placement behavior; LaTeX may still move a floating figure in the compiled PDF. If the document changes while an upload is in flight, insert the imported figure from Project figures instead of silently placing it in a changed draft.
