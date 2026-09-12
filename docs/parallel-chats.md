# Parallel research and writing

Axiovela 0.2.2 runs independent assistant conversations concurrently. Start an experiment, switch to Write-up to work with the writing assistant, or open a different project tab and send another prompt. Switching views does not cancel or pause a task.

Choose **New chat** to start an independent conversation while an existing one works. Send a follow-up in a busy conversation to queue it. Follow-ups retain their submitted model, access, and research settings and start in order, including while that chat is hidden. Each conversation has its own draft and task state.

The header shows running tasks across projects. **Stop task** affects only the selected chat and pauses its queued follow-ups. Failures also pause the queue without deleting prompts. Queued messages appear next to the composer with Edit and Remove controls. Editing holds that message and later messages in order; Save keeps its original model, access, attachment, and Agentic settings. Editing a queued message does not replace the separate composer draft.

Queues and their edits are saved locally. Reopening restores them paused; choose **Resume queue** after reviewing the conversation. A failed or interrupted submission is retained for review instead of being silently retried. Reloading reconnects to active backend tasks. Unsubmitted composer drafts remain in renderer memory. If local queue persistence fails, the UI reports that messages are only retained in the current window.

Activity shows observed provider events, including Pi streaming progress and tool completion. A quiet command or provider wait can still be running. Pi retry and context-preparation states remain active until the native session settles; intermediate WebSocket errors do not abort Pi’s recovery. Exhausted provider failures are shown truthfully. A slow status request in one chat does not block status or queued work in another.

## Working effectively

Give concurrent assistants distinct outputs when they share a project, for example an experiment script and a manuscript section. They share project files; separate chats do not create isolated Git worktrees or resolve simultaneous edits to the same file. Separate projects have independent request context and file-operation gates.

Provider account limits, available compute, and external tools can constrain throughput. Parallel chatting requires no tmux or Herdr setup. Experimental Pi + Herdr Agentic mode is a separate option for delegated workers.

## Verification

`npm run parallel:smoke` exercises simultaneous tasks across projects, independent cancellation, ordered background follow-ups, native session continuity, reload recovery, and responsiveness during a stalled upload/status request. `npm run cli-provider:smoke` checks Pi activity events with credential-free fixtures.

The activity display distinguishes a quiet provider or running tool from a failed status connection. Pi message/tool deltas and observed worker-state changes refresh task activity; successful polls alone do not. Agentic worker monitoring waits for each Herdr check to finish before scheduling another, so slow checks cannot build up a cancellation backlog. `node scripts/pi-activity-smoke.mjs` covers the Full-access Pi route, quiet worker waits, connection recovery, and slow-monitor cancellation with isolated fixtures.
