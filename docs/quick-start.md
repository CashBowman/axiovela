# Quick start

[← Home](../README.md) · [Documentation](README.md) · [Demo](demo.md) · [Troubleshooting](troubleshooting.md)

## Desktop app: start here

Download the current [Axiovela release](https://github.com/CashBowman/axiovela/releases/latest). Choose Linux x64, Windows x64, or the Apple Silicon/Intel Mac build matching your computer. Downloads are public; no GitHub account is required.

1. Install and open Axiovela. On Mac, open the DMG and drag Axiovela into Applications. See [platform installation and signing limits](desktop.md#install-a-reviewed-build).
2. Choose **Project** to open or create a dedicated research folder. Git history is optional.
3. Connect your provider through the model selector below the chat composer, choose an appropriate access mode, and begin with a small task.

For sample results first, choose **Help → Try the example study**. Inspect Results and then **Write-up → Markdown**. The desktop app bundles its runtime; you do not need Git, Node, or npm for this first session. AI access uses your own provider account. Read the [beta notice](../BETA_NOTICE.md).

The rest of this guide covers source installation and optional research tools. Desktop users can jump to [AI and LaTeX setup](#connect-ai-and-set-up-latex); native CLIs need their own installation; the desktop app bundles Tectonic.

## Optional dependency guide

Install only the tools required for the features you use. The desktop app already bundles Node, its Markdown/math renderer, and Tectonic for LaTeX-to-PDF. A source installation bundles the Markdown/math renderer with `npm ci`, but needs a local Tectonic executable for PDF rendering. Pi and Herdr are installed separately. Provider authentication uses your own account.

| Feature | Desktop app | Source installation | Verify |
| --- | --- | --- | --- |
| Markdown, tables, and inline math | Included; no installation | Included by `node scripts/install.mjs` | Open **Write-up → Markdown** |
| LaTeX PDF | Tectonic included; first render downloads needed TeX packages/fonts | Run `node scripts/install.mjs --latex` with Conda available, or install Tectonic and set `WORKBENCH_LATEX_PATH` | Desktop: **Tools → Check installed tools**, then render a LaTeX draft. Source: `tectonic --version` |
| Pi connection | Install Node/npm and Pi separately | Install Pi separately with compatible Node | `pi --version` |
| Pi + Herdr Agentic mode | Install Pi and Herdr separately, Axiovela starts Herdr on demand | Same | `herdr status` and `herdr integration status` |

The bundled Node runtime is private to the app; it does **not** install the terminal commands `node` or `npm`. For the Pi npm installation below, install [Node.js](https://nodejs.org/en/download) **22.19 or newer on the Node 22 line**, including npm, then verify `node --version` and `npm --version`. This also satisfies Axiovela source requirements. On Windows, Pi also needs [Git Bash](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/windows.md) for its default command tool. The [Pi installation guide](https://github.com/earendil-works/pi/tree/main/packages/coding-agent#quick-start) documents alternatives.

The app does not install Python packages, GPU drivers, Docker/Podman, or experiment libraries. Add those only to the project environment that needs them. In the desktop app, use **Help → Optional tool setup…** for the same summary, **Tools → Check installed tools** to inspect discovery, and **Tools → Add tool folder…** or the executable selectors for a nonstandard location.

## Install from source

### Prerequisites

Install Git and **Node.js 22.12+ on the 22 LTS line**, including npm. Never include tokens in a clone URL.

The installer downloads the locked Node dependencies, builds the app, and adds `axiovela` to your command path. You only need to enter the application checkout for installation and updates, not for normal use.

### Windows (PowerShell)

```powershell
Set-Location $HOME
git clone https://github.com/CashBowman/axiovela.git
if ($LASTEXITCODE -ne 0) { throw "Clone failed" }
Set-Location axiovela
node scripts/install.mjs
if ($LASTEXITCODE -ne 0) { throw "Build failed" }
axiovela.cmd
```

Calling the Node installer directly avoids unsigned PowerShell wrapper restrictions without relaxing execution policy. Native Windows assistant execution still needs validation; see [limitations](troubleshooting.md#current-limitations). WSL users should follow Linux instructions entirely inside WSL, including tool installation and authentication.

### macOS (Terminal, Bash or Zsh)

```bash
cd "$HOME" &&
git clone https://github.com/CashBowman/axiovela.git &&
cd axiovela &&
node scripts/install.mjs &&
axiovela
```

### Linux (Bash)

```bash
cd "$HOME" &&
git clone https://github.com/CashBowman/axiovela.git &&
cd axiovela &&
node scripts/install.mjs &&
axiovela
```

Open **http://127.0.0.1:8787**. Leave the terminal running; **Ctrl+C** stops the server. Append `--no-open` to skip automatic browser opening. Do not expose the server to the internet.

## Create a research project

Choose **Project** in the UI and create a new dedicated folder outside the application checkout. New projects contain scaffolding and panel instructions, not experimental results. Existing projects intentionally show their previous outputs and history.

Or stop the server and run:

```bash
# macOS / Linux
axiovela new "$HOME/Research/my-first-study"
```

```powershell
# Windows
axiovela.cmd new "$HOME\Research\my-first-study"
```

Missing directories and an independent Git repository are created. A default `.gitignore` excludes credentials and assistant conversations; review datasets, logs, and exports before sharing them. Existing ignore files are preserved. Nothing is automatically published to GitHub. `new` is not a reset: use a new path to preserve existing work.

## Launch from any directory

The installer already linked the command. Use it anywhere:

```bash
axiovela new "$HOME/Research/another-study"
axiovela open "$HOME/Research/another-study"
```

```powershell
axiovela.cmd new "$HOME\Research\another-study"
axiovela.cmd open "$HOME\Research\another-study"
```

The link points to this checkout, so keep it in place. If the command is missing, reopen the terminal and check npm's global prefix with `npm config get prefix`. Put that directory on PATH on Windows, or its `bin` child on macOS/Linux. If linking requires elevated access, use a user-owned Node installation; the app itself does not require administrator access. The old `methodflow` and `ml-workbench` commands remain aliases for existing users.

## Connect AI and set up LaTeX

Use an installed, authenticated Codex, Claude Code, Gemini CLI, OpenCode, or Pi engine, or configure a direct API in the model picker. For Gemini, confirm `gemini --version`, run `gemini` once to sign in, then select **Connection → Gemini CLI** in either chat's model picker. API setup, supported models, and executable overrides are documented in the [provider guide](model-tools.md). Provider access, costs, and model availability depend on your account.

In either assistant, click the model button below the composer to choose a model and reasoning level from the installed runtime's catalog. Each assistant saves its own model preference. Use **New chat** above the composer for a fresh conversation, and **Conversation** to return to earlier chats. Project files stay shared. See [assistant configuration](model-tools.md) for supported engines and recovery.

**Read-only** is inspection-only. **Auto-approve** behavior depends on the engine; direct APIs allow file edits and Markdown rendering but not shell commands. **Full access** permits host command execution. Unsupported modes are disabled. Read the [access-mode table](model-tools.md#access-modes-are-engine-specific) and [security notes](../SECURITY.md).

### Agentic mode (optional)

Agentic mode uses Pi as the router and Herdr to run up to three independent Pi workers. Install and authenticate Pi:

```sh
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
pi
```

In Pi, use `/login` and choose your provider. Then install Herdr using one of its official platform commands:

```sh
# Linux or macOS
curl -fsSL https://herdr.dev/install.sh | sh
```

```powershell
# Windows PowerShell
powershell -ExecutionPolicy Bypass -c "irm https://herdr.dev/install.ps1 | iex"
```

Herdr also documents [manual downloads and alternative installation methods](https://herdr.dev/docs/install/). On managed devices, use an installation method approved by your administrator. Restart the terminal after installation if `herdr` is not found, then run:

```sh
herdr integration install pi
```

Automatic startup and the setup dialog are included in beta.9. With beta.7, start `herdr` in a terminal and refresh connections first.

Selecting Agentic mode checks Pi and starts an installed, stopped Herdr server automatically. It waits for readiness before enabling Pi with Full access. Missing tools or startup errors open platform-specific setup instructions with copyable commands and a retry button. No tools are downloaded automatically. A running Herdr server is reused and is not stopped when Axiovela closes.

Enable **Agentic mode** in the Experiment Chatbot header; Axiovela checks the tools, starts Herdr when needed, and selects Pi with Full access. After installing missing tools, use **Retry and enable** in the setup dialog. The router delegates only work that benefits from independent workers, so small or tightly coupled requests may correctly remain router-only. See [Pi and Herdr details](model-tools.md#agentic-mode-pi--herdr).

Markdown, tables, code blocks, and inline math work with the normal install. Desktop beta.5 and later include Tectonic for full LaTeX-to-PDF rendering; first use downloads TeX packages. Use the Tools menu for custom executable locations. For a source installation, install Conda and rerun the installer from the application checkout:

```sh
node scripts/install.mjs --latex
```

Use the same command in a Conda-enabled PowerShell window on Windows. Tectonic installs into ignored `.workbench-tools/`, not globally. Alternatively install Tectonic yourself and set the executable before launch:

```bash
export WORKBENCH_LATEX_PATH="/absolute/path/to/tectonic"
axiovela
```

```powershell
$env:WORKBENCH_LATEX_PATH = "C:\Tools\tectonic.exe"
axiovela.cmd
```

First compilation may download TeX packages. Markdown preview does not need Tectonic. Python, GPU drivers, training libraries, and Docker/Podman are experiment-specific dependencies, not requirements just to open the app.

## Updating

Stop the app and preserve your uncommitted changes. From the checkout:

```sh
git pull --ff-only
node scripts/install.mjs
axiovela
```

Use `npm.cmd` on PowerShell and stop if a command fails. Restarting avoids an old backend serving incompatible behavior. Research projects stored separately are not replaced by an application update.

## Uninstalling

Stop Axiovela. Run `npm uninstall -g ml-theory-workbench` (`npm.cmd` in PowerShell) to remove its linked commands. You can then remove the application checkout. Research projects stored separately remain available as ordinary files. To remove saved API keys, first use **Remove saved key** in each connection; environment-provided keys and native CLI logins are managed separately.
