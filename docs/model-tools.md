# Connect your research assistants

Experiment Chatbot and the Write-up Research Assistant can use different engines, models, and reasoning settings. They share project files and `references.bib`, but keep separate conversations, inputs, attachments, and preferences.

## Choose a provider

1. Click the **Model & provider** button directly below either chat composer. Setup is available before opening a project.
2. Choose a **Connection**: a CLI engine or a direct API. Missing CLI tools show a popup section with platform-specific installation and sign-in commands. Copy each command into Terminal or PowerShell, then refresh. Direct APIs have key/endpoint fields in the same popup.
3. Select a model and supported reasoning level, then click **Use model**. The unused model-search field has been removed.
4. Open or create a project, choose an access mode, and send a small inspection task first.

Settings apply to the next message and are saved per role in `config/assistant.json`. **Model used** records reported model/effort, or the requested selection when the engine does not report it. Refresh reloads catalogs (normally cached for 60 seconds). A listed model is not a guarantee of account access.

The same setup controls cover Pi and Herdr. In the desktop app, **Locate installed …** opens a native executable picker without visiting Tools; saved locations take effect after restarting Axiovela. Setup commands are never run automatically. Pi/Herdr instructions follow their [official Pi guide](https://github.com/earendil-works/pi/tree/main/packages/coding-agent#quick-start) and [Herdr guide](https://herdr.dev/docs/install/).

### Installed CLI engines

Install and sign in using the engine's official instructions, in the same environment that launches the workbench. The dashboard uses the existing CLI login; it does not copy login files into the project.

| Connection | First-time check/login | Catalog and controls |
| --- | --- | --- |
| Codex | `codex --version`, then `codex` | Native model discovery and supported reasoning efforts |
| Claude Code | `claude --version`, then `claude` | Documented Sonnet/Opus/Haiku aliases; custom IDs; effort where supported |
| Gemini CLI | `gemini --version`, then `gemini` | Documented aliases and custom IDs; reasoning managed by Gemini CLI |
| OpenCode | `opencode --version`, then `opencode auth login` | Models from `opencode models`; provider-managed reasoning |
| Pi | `pi --version`, then `pi` | Native RPC model discovery and reasoning controls; Agentic mode also requires a running Herdr server |

To switch to Gemini: **model button → Connection → Gemini CLI → Model → Use model**. If it says setup needed, install/authenticate Gemini in a terminal and click **Refresh**. Claude/Gemini aliases are labeled as documented aliases, not account-discovered models. A custom ID is checked by the provider on use.

Executable overrides: `WORKBENCH_CODEX_PATH`, `WORKBENCH_CLAUDE_PATH`, `WORKBENCH_GEMINI_PATH`, `WORKBENCH_OPENCODE_PATH`, or `WORKBENCH_PI_PATH`. On Windows, use a native executable or the package's JavaScript entry point if its npm shim is not detected. Prompts travel over standard input, not interpolated into shell arguments. Use current CLI releases supporting the protocols linked below.

### Direct APIs and local models

Choose **OpenAI API**, **Anthropic API**, **Google Gemini API**, or **OpenAI-compatible / local API**. Expand **API connection settings**, enter a key, and click **Save connection**. Choose an explicit model. Compatible servers also need a base URL, such as `http://127.0.0.1:1234/v1`, and may use a custom model ID. They must implement model listing and chat-completions tool calling; text-only endpoints are insufficient.

Alternatively, set `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` (or `GOOGLE_API_KEY`), or `WORKBENCH_COMPATIBLE_API_KEY` before launching. API billing is separate from a CLI subscription. HTTP is allowed only on loopback; remote endpoints require HTTPS.

Saved keys stay outside the research project:

- Linux: `$XDG_CONFIG_HOME/ml-theory-workbench/providers.json` (default `~/.config/...`).
- macOS: `~/Library/Application Support/ml-theory-workbench/providers.json`.
- Windows: `%APPDATA%\ml-theory-workbench\providers.json`.

These paths describe the browser/CLI edition. The [desktop edition](desktop.md#configuration-and-privacy) uses separate OS-encrypted storage and does not silently migrate CLI keys.

The browser/CLI files are local plaintext settings, **not an OS keychain**. Files use owner-only permissions where supported; Windows protection depends on directory ACLs. Keys are never returned by the backend or saved in browser local storage. **Remove saved key** removes the app's copy, not environment variables or CLI logins. Keep machine backups private. `WORKBENCH_PROVIDER_SETTINGS_PATH` overrides the location for testing; do not point it into a repository.

## Access modes are engine-specific

The selector changes the policy sent with the next message, including resumed conversations. The stored `ask` value is labeled **Read-only** for compatibility; it does not open an approval dialog for every action. Pi has no Auto-approve mode. Agentic mode locks Pi to Full access. These controls are not a universal sandbox for external integrations; native MCP/app tools and user-installed integrations retain their own policies.

| Connection | Read-only | Auto-approve | Full access |
| --- | --- | --- | --- |
| Codex | Native read-only sandbox | Project-write sandbox + native approval reviewer | No sandbox/approval checks |
| Claude Code | Read/Glob/Grep only; MCP tools blocked | Native automatic permission classifier | Bypass native permissions |
| Gemini CLI | Native plan mode | YOLO approval inside Gemini sandbox | YOLO approval; existing CLI policy still applies |
| OpenCode | Unavailable | Unavailable | Native `run --auto`; explicit denies still apply |
| Pi | Read-only built-ins; extensions disabled | Unavailable | Built-in read/write/shell tools; extensions disabled |
| Direct APIs | Project read/list tools | Project read/write and Markdown compilation | Also shell execution and LaTeX compilation |

“Ask” means inspection-only, not a per-command approval dialog. Unsupported modes are disabled; switching engines never silently upgrades access. Native CLI configuration, hooks, and sandbox setup remain the user's responsibility. Gemini sandboxing may require Docker/Podman or platform support. Claude automatic approval is a classifier, not a filesystem sandbox. Full access is not safe for untrusted code.

Direct APIs use the workbench's tool loop: list/read/write project files, shell commands, and document compilation. File tools reject traversal, symlinks, and common credential paths. Shell execution is Full-only, runs on the host, and has a two-minute per-command limit. This is **not** an OS sandbox. Long jobs should launch a project-managed process and write progress to the run ledger. Direct API adapters do not supply native browsing or arbitrary MCP connections.

For adversarial evaluation, never run model-generated candidate commands on the host. Save candidates below `candidates/` and use `node workflows/run-isolated-command.mjs --command-file candidates/<file> --run-id <id>` with the required disposable Docker/Podman container.

## Math and documents in both chats

Replies render Markdown headings, lists, tables, fenced code, and KaTeX math. Dollar delimiters and `\(...\)` / `\[...\]` work outside code blocks. Raw HTML and trusted KaTeX commands are disabled; invalid math remains visible instead of crashing the chat.

Request a complete document in a fenced `latex`/`tex` or `markdown`/`md` block. Click **Render LaTeX PDF** or **Render Markdown document** below the reply. Raw documents beginning with `\documentclass` are also recognized. Full LaTeX needs Tectonic (`npm run setup:latex`); inline chat math does not.

Markdown exports include offline math fonts, but embedded images are placeholders. Use the main Write-up editor for figure-rich papers and BibTeX-resolved Markdown citations. Chat renderings are separate `writeups/chat-<id>.tex|md` and `exports/chat-<id>.pdf|html` files; they never replace `writeups/main.*`. API assistants can invoke the compiler through their document tool; CLI assistants use native command tools and the configured TeX executable. Neither renderer fixes arbitrary invalid LaTeX or provides full Overleaf parity.

## Conversation recovery and limitations

CLI adapters resume native sessions. API conversations retain the last 20 user/assistant messages, capped at 32,000 characters each, in `assistant/sessions/`; full tool transcripts are not replayed across turns. Each API turn retains tool results and provider-specific reasoning state while executing. Switching engines starts a new session with a visible, bounded text handoff, not a lossless transfer of hidden reasoning or tools.

**New chat** creates an empty saved conversation. Use **Conversation** above the composer to switch back to earlier chats; project files remain shared. Each assistant has its own conversation list and model preference. Archived Codex sessions are restored through the [app-server unarchive API](https://learn.chatgpt.com/docs/app-server#unarchive-a-thread) before resuming. If a native session was deleted, start a new conversation explicitly. Failed requests remain in the workbench history and recent recovery context. Failed first API requests leave recoverable empty sessions. Stop cancels the current request/process group; completed writes and independently launched background experiments are not rolled back. Only one assistant task runs at a time across both assistants.

Chat shows recognized user-facing text and short activity labels, not raw provider events, internal reasoning, or diagnostic payloads. Direct API text arrives at response/tool-round boundaries, not token-by-token. Private prompts/replies are saved in project chat records and sent to the selected provider; do not publish those records unintentionally.

## Agentic mode (Pi + Herdr)

The Experiment Chatbot has an **Agentic mode** toggle in its header. It is separate from ordinary chat: it selects Pi with Full access and uses one Pi session as the user-facing router. The router may create up to three disjoint Pi workers through the local Herdr CLI, then owns diff review and validation. Small or tightly coupled requests stay with the router. Worker selection favors a lower-cost Pi catalog entry (`gpt-5.6-luna`, then `gpt-5.4-mini`, then Codex Spark) and otherwise falls back to the first available model.

While a run is active, the chat combines the run-specific Herdr workspace state with worker lifecycle events from Pi's RPC tool stream, so short-lived workers are not missed between polls. It shows only the run's router and workers. Yellow means working, green means ready/done, red means blocked/failed, and gray means the lifecycle state is not yet known. `Router only` is explicit when no worker was launched; the UI never infers delegation from ordinary shell or file activity. Completed Pi runs record sanitized per-turn token, cache, tool-call, context, and cost totals from Pi RPC in the collapsed run details. For an Agentic run these are labeled as router usage; worker-session usage is not included. Session paths and raw transcripts are not exposed.

The orchestration contract keeps worker prompts bounded: each gets paths and acceptance criteria rather than pasted repository context, returns a concise file/test/blocker report, and edits a disjoint concern. All briefs are submitted before lifecycle waits so independent work runs concurrently. This follows the manager pattern while avoiding multi-agent overhead for tasks that do not benefit from parallel context.

Before enabling it, complete the concise [Agentic mode setup](quick-start.md#agentic-mode-optional). Verify the connection with:

```sh
pi --version
herdr --version
herdr integration install pi
herdr integration status
herdr status
```

Selecting Agentic mode checks Pi and starts an installed, stopped Herdr server automatically. It waits for readiness before enabling Pi with Full access. Missing tools or startup errors open platform-specific setup instructions with copyable commands and a retry button. No tools are downloaded automatically. A running Herdr server is reused and is not stopped when Axiovela closes.

`herdr status` must report a running, protocol-compatible server, and `herdr integration status` must report Pi as current. Axiovela's capability check verifies that Pi exposes models and that Herdr is ready; it does not spend tokens testing provider credentials. If a request reports an expired token, open interactive `pi`, run `/login`, select the provider again, and retry. Generic ACP connections remain deferred; Herdr is an orchestration runtime, not a model provider.

## References and validation

The connection → model → capability pattern follows [OpenCode providers](https://opencode.ai/docs/providers/) and [model selection](https://opencode.ai/docs/models/). Native adapters follow [Codex App Server](https://learn.chatgpt.com/docs/app-server), [Claude headless mode](https://code.claude.com/docs/en/headless), [Gemini headless mode](https://geminicli.com/docs/cli/headless/), [OpenCode CLI](https://opencode.ai/docs/cli/), and [Pi RPC](https://pi.dev/docs/latest/rpc). The manager architecture, selective delegation, and bounded worker context are also consistent with [OpenAI's practical guide to building agents](https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/), Anthropic's [multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system), and [context-engineering guidance](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents).

API protocols follow [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling), [Anthropic models](https://platform.claude.com/docs/en/api/models/list), and [Gemini function calling](https://ai.google.dev/gemini-api/docs/function-calling). Reasoning controls use capability metadata when available, otherwise documented model-family support; custom IDs use provider-managed reasoning.

Run `npm run check`, `npm run assistant:smoke`, `npm run provider:smoke`, `npm run cli-provider:smoke`, and `npm run backend:smoke`. Tests execute adapter interfaces against credential-free fixtures, including tools, permissions, failures, cancellation, and rendered artifacts. They do not validate every paid account/model or native Windows/macOS installation. Try a small real request before expensive research.

Desktop installers currently do not include Pi or Herdr. Agentic mode requires both tools, a configured Pi provider, and a running compatible Herdr server. Use Tools to inspect discovery or select their executable locations, then restart Axiovela. Removing the UI badge does not remove these requirements. Ordinary Codex chat can use its own native delegation independently of the Pi/Herdr toggle; only the root turn completes the app request.

## Locate an installed CLI

Each CLI setup panel includes a copyable path lookup and the native **Locate installed…** button. For Codex, run `command -v codex` in Mac/Linux Terminal or `(Get-Command codex -CommandType Application -ErrorAction Stop).Source` in Windows PowerShell. Paste the result into the native picker, then restart Axiovela. If the command is missing, install with `npm install -g @openai/codex` (`npm.cmd` on Windows), launch `codex` to sign in, and restart Axiovela for automatic discovery. See [official Codex CLI setup](https://learn.chatgpt.com/docs/codex/cli).
