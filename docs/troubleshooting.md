# Troubleshooting and limits

[← Home](../README.md) · [Quick start](quick-start.md)

## Desktop startup and updates

**macOS blocks opening:** check [the Mac handoff guide](mac-installation.md). Invited beta builds lack Developer ID signing/notarization. Do not bypass malware/damage warnings or institutional policies.

**Old name or old version opens:** fully quit the previous app, then open Axiovela from its new launcher. Builds share the legacy profile and a single-instance lock. See [upgrade compatibility](branding.md#existing-installations-and-projects).

**A saved key cannot be unlocked:** unlock the OS keyring and restart. Linux requires a supported secure keyring; plaintext fallback is intentionally refused. On macOS, an updated unsigned build may prompt for Keychain access. Do not delete your profile to troubleshoot this.

## Common problems

**Clone denied:** check the repository URL and whether access is still invite-only. Authenticate Git if required. Never paste tokens into URLs or issues.

**Build fails on Node version:** use Node 22.12+ on the 22 LTS line, matching `package.json` and CI, then rerun `npm ci`.

**Port busy, stale UI, or API offline:** stop the old launcher/development terminal with Ctrl+C and restart. The browser/source app uses 8787; development uses 5173 plus 8787. The desktop app uses its own private local port, so quit and reopen it instead. `npm run preview` alone is not the complete app. To choose another production port:

```bash
WORKBENCH_PORT=8788 axiovela
```

```powershell
$env:WORKBENCH_PORT = "8788"
axiovela
```

**Chat fails or stalls:** check the active project is writable and the selected CLI is installed/authenticated, or the direct API connection is configured. Read-only mode is inspection-only; other modes depend on the selected connection. Open the model picker and Refresh if a model is unavailable; choose only a supported reasoning level. Inspect the final error, redacting sensitive data before sharing. Restart-interrupted jobs are reported failed rather than automatically replayed; the next message resumes native conversation context when available. If native session files were removed, select New conversation in the picker. Try a small inspection task before expensive training. Native interactive tool questions are not yet supported; ask the assistant to return its question in chat.

**Agentic mode is unavailable:** run `pi --version`, `herdr integration status`, and `herdr status`. Pi must be authenticated, its Herdr integration must be current, and the Herdr server must report `compatible: yes`. Restart Axiovela and refresh connections afterward. Agentic mode intentionally uses Pi with Full access. A completed router-only task is not itself an error; the router skips workers when delegation would add overhead.

**Empty results:** verify the project and output paths. Trials needs structured records, not arbitrary terminal output. Remote results must be copied back or made available to configured local adapters. Empty new-project panels are intentional.

**LaTeX error:** install Tectonic or set `WORKBENCH_LATEX_PATH`. Read the source line and diagnostic. The renderer adds `graphicx` to render-only source when needed, but cannot fix every invalid macro, missing class, package, or figure. Use a full document with `\documentclass`, `\begin{document}`, and `\end{document}`. First render may need package downloads.

**Launcher not found:** follow [PATH setup](quick-start.md#launch-from-any-directory). The linked command requires the original checkout to remain in place. Rebuild after updates.

## Current limitations

- Local single-user software, not an authenticated internet service or real-time collaborative editor.
- The beta passed the source installer matrix and all four packaged desktop targets. Live provider authentication, downloaded-installer trust, keychain behavior, and optional LaTeX/CLI discovery still need ordinary-machine acceptance. See [recorded beta validation](releases/0.2.0.md). WSL is a separate environment.
- Assistant execution depends on CLI version/flags, account access, and model behavior. Scaffolding does not guarantee an arbitrary training stack will work.
- Read-only mode is inspection-only, not an interactive approve-every-command queue. Full access is host access, not containment.
- AI-created experiments must maintain run records. Stopping remote scheduler jobs or orphaned descendants may require separate inspection.
- Compute profiles guide assistant-driven SSH/Slurm, not a managed remote service. Trackers import local native/MLflow/W&B-offline output, not hosted dashboards.
- Full LaTeX documents are supported, but not full Overleaf parity or every package/toolchain. Markdown and LaTeX are separate sources, not lossless round trips.
- Containerized candidate execution reduces risk but is not a security certification. Do not use valuable host credentials or data for untrusted execution.

## Reporting a problem

Include OS and architecture, app version from **Help → About Axiovela**, action, expected/actual behavior, and a minimal sanitized example. Source users should also include Node version and commit (`git rev-parse --short HEAD`). Never attach entire projects, assistant history, environment files, or authentication state. Report suspected credential exposure privately, without including secret values.
