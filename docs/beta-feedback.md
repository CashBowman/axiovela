# Beta feedback improvements

Project tabs sit above the main toolbar. They remember opened projects on the
same device; switching restores that project's unsent chat drafts during the
current app session. Switching waits for the active assistant to finish. This
release still serializes assistant tasks; independent concurrent worktrees are
not implemented.

Chat drafts grow up to 300 pixels before scrolling. Sent long prompts collapse
with a Show full prompt control. Both prompt and response text can be copied.
Messages entered during a run queue for the same project and conversation.
Queued messages can be edited or removed, and dispatch when that conversation
is active using its current settings. Stop or failure clears the queue. Queues
are in memory, so close/reload discards them. This is follow-up queueing, not
in-flight native model steering. Activity shows real provider events and the
elapsed wait since the latest event, without inventing progress.

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
`node scripts/beta-feedback-smoke.mjs`, and the existing release and desktop
gates. Setup tests never install real providers or use real credentials. Run
native Mac/Windows installer acceptance before marking new installers ready.
