# Security and privacy

## Local does not mean sandboxed or offline

Projects are stored locally and the service requires a loopback address. Host checks reject DNS rebinding, browser origins are checked for reads and writes, and request bodies require JSON. These checks do not authenticate other processes on your computer. There is no hosted login or multi-user authorization layer. Do not expose it through a tunnel or reverse proxy.

AI requests use your selected CLI or direct API and may transmit prompts, attachments, and project context to its provider. Prompts and responses persist in `assistant/<job-id>/job.json`; API conversation context also lives in `assistant/sessions/`. Logs, documents, exports, and Git remote URLs can contain private information.

- **Read-only:** read-only inspection, not an interactive approval queue.
- **Auto-approve:** engine-specific automatic work; direct APIs permit file tools and Markdown compilation, not shell commands. See the [access-mode table](docs/model-tools.md#access-modes-are-engine-specific).
- **Full access:** permits host command execution and may bypass native approvals/sandboxing. Commands can affect outside-project files and access credentials available to the process.

Prompt instructions and ignored files are not security boundaries. Use the isolated candidate runner in a disposable environment for untrusted model-produced commands, never direct host execution.

## What belongs in Git

Commit application code, reusable templates, tests, lockfiles, and product documentation. Keep research projects outside this checkout. Internal plans, tool state, builds, caches, authentication, environment files, and personal research outputs do not belong here.

New research projects receive a `.gitignore` excluding credentials, assistant conversations, and local caches. An existing `.gitignore` is preserved. Ignore rules are defense in depth: already tracked files stay tracked and `git add -f` bypasses ignores. Review staged diffs before every push, including datasets, run logs, figures, and exports, which may contain private research data.

Ordinary backend and direct API file operations reject symlinks below the selected project root and known credential paths. This protects against accidental or project-authored path escapes, but is not an OS sandbox against concurrent hostile local processes. Native CLIs and Full access retain their documented host access.

Never commit CLI login state, API tokens, private keys, cloud credentials, browser profiles, or package-manager authentication. In the browser/CLI edition, direct API keys entered in the UI are stored as plaintext in private OS app configuration outside projects. The desktop edition encrypts its separate provider settings with Electron safeStorage and refuses Linux plaintext fallback; see [desktop privacy](docs/desktop.md#configuration-and-privacy). File mode is owner-only where supported; protect Windows directory ACLs and backups. Keys are not returned to the browser. Use placeholders in examples.

## Privacy and history

Repository visibility is a hosting setting. `private: true` in package.json prevents accidental npm publication, not GitHub exposure. Review tracked content, history, collaborators, and integrations before a public release. Private repositories are not secret vaults. The distribution posture is documented in [release preparation](docs/releasing.md).

Removing a file from the latest revision does not remove history, Git author metadata, PR diffs, or copies. Scans cannot prove the absence of every secret. If credentials were committed, revoke/rotate first and coordinate history cleanup; do not silently rewrite shared history.

## Suspected exposure

Stop sharing the material. Contact the maintainer through an existing private channel with file/commit location and credential type, **not its value**. Rotate affected credentials and inspect provider access logs. Treat assistant history and exported diagnostics as sensitive even without API keys.
