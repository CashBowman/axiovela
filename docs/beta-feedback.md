# Beta feedback improvements

Project tabs share the top strip with the Axiovela brand. Flat section navigation
sits below, with dataset and layout actions on the right. Long project names
stay on one line. Activity dots mark projects with running assistant tasks.

Projects and conversations can run concurrently. Switching projects or sections
does not stop a task. Experiment and writing assistants have independent task
state, and New chat is available while another conversation runs. Stop affects
only the visible conversation. A running project's tab cannot be closed.
These conversations share their project's files; this is not worktree isolation
or automatic merging of competing edits. Editor drafts retain their existing
recovery and disk-conflict checks.

Chat drafts grow up to 300 pixels before scrolling. Sent long prompts collapse
with a Show full prompt control. Both prompt and response text can be copied.
Messages entered during a run queue for that conversation, retaining the model,
access mode, research profile and attachment selected when submitted. Follow-ups
continue while another conversation or project is visible. Edit or remove them
in their owning conversation. Stop or failure pauses only that conversation’s queue, retaining its prompts. Queues and in-place edits are saved locally and restored paused after reopening; Resume queue is explicit. Running jobs reconnect after renderer reload. This is follow-up queueing, not in-flight
native model steering. Activity reports real provider events and elapsed quiet
time, with repeated events refreshing the activity timestamp. Polling and
cancellation remain available during unrelated filesystem operations. Provider limits still apply.

Both assistants retrieve project evidence with their file tools as needed.
Every turn retains permissions, research profiles, tracking/presentation rules,
and manuscript conventions. Run metrics, figure inventories, dataset catalogs,
and infrastructure configuration are no longer injected automatically. Attached
figure references still receive validated metadata. Narrow manuscript edits
and format conversions explicitly avoid unrelated experiments. Existing native
session history remains intact; use New chat to start without old context.

This design follows [Anthropic's context engineering guidance](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents).
Reduced input size is verified by fixture prompts; live model latency has not
been benchmarked and remains provider/model dependent.

Bibliography is in the write-up source header. Source and PDF export are
separate choices in the preview and for fenced chat documents. LaTeX uses
Tectonic. Desktop Markdown PDFs use Electron printing; the browser edition uses
the system print dialog (choose Save as PDF). Local figures and math are
included; external images are not fetched automatically.

Desktop setup offers fixed install, sign-in, Herdr integration, and tool detection
actions. Commands open in Terminal/PowerShell rather than requiring copy/paste.
Node/npm and any provider-specific prerequisites must already be installed;
authentication and installer prompts remain with the provider/system terminal.
Axiovela never accepts arbitrary renderer command text. Refresh connections
after setup; custom locations can still use the executable picker.

Verification: `node --test scripts/provider-setup.test.mjs`,
`node scripts/beta-feedback-smoke.mjs`, `npm run parallel:smoke`, and the existing release and desktop
gates. Setup tests never install real providers or use real credentials. Run
native Mac/Windows installer acceptance before marking new installers ready.


The 0.2.2 concurrency work follows React’s guidance on
[preserving state outside removed UI](https://react.dev/learn/preserving-and-resetting-state)
and Electron’s guidance on
[keeping long-running work off the UI thread](https://www.electronjs.org/docs/latest/tutorial/performance).
Task ownership stays outside the visible chat pane; providers run in independent
processes while the renderer polls their real activity.
