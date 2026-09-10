# Parallel research and writing

Axiovela 0.2.2 runs independent assistant conversations concurrently. Start an experiment, switch to Write-up to work with the writing assistant, or open a different project tab and send another prompt. Switching views does not cancel or pause a task.

Choose **New chat** to start an independent conversation while an existing one works. Send a follow-up in a busy conversation to queue it. Follow-ups retain their submitted model, access, and research settings and start in order, including while that chat is hidden. Each conversation has its own draft and task state.

The header shows running tasks across projects. **Stop task** affects the selected chat and clears its queued follow-ups. Reloading the window reconnects to active backend tasks. Unsent drafts and queued follow-ups are held in renderer memory and do not survive a full reload or application exit.

Activity shows observed provider events, including Pi streaming progress and tool completion. “No new provider activity” means no event has arrived recently; a quiet command or provider wait can still be running. A slow status request in one chat does not block status or queued work in another.

## Working effectively

Give concurrent assistants distinct outputs when they share a project, for example an experiment script and a manuscript section. They share project files; separate chats do not create isolated Git worktrees or resolve simultaneous edits to the same file. Separate projects have independent request context and file-operation gates.

Provider account limits, available compute, and external tools can constrain throughput. Parallel chatting requires no tmux or Herdr setup. Experimental Pi + Herdr Agentic mode is a separate option for delegated workers.

## Verification

`npm run parallel:smoke` exercises simultaneous tasks across projects, independent cancellation, ordered background follow-ups, native session continuity, reload recovery, and responsiveness during a stalled upload/status request. `npm run cli-provider:smoke` checks Pi activity events with credential-free fixtures.
