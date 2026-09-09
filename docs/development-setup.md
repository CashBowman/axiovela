# Develop Axiovela on a new computer

Clone `main` to develop Axiovela on Linux, Windows, or macOS. For a packaged app, use the [installation guide](beta-start-here.txt).

## Prerequisites

Install [Git](https://git-scm.com/downloads) and [Node.js 22](https://nodejs.org/en/download), version 22.12 or newer within the 22 series. Reopen your terminal after installation. Use the native architecture for both Node and your terminal. On an M-series Mac, `node -p process.arch` should print `arm64`; on Intel Mac and Windows x64 it should print `x64`.

The desktop requires macOS 13 or newer; the complete Mac distribution verification requires macOS 14 or newer. Windows packaging currently targets Windows 10/11 x64. A machine too old for the required OS cannot validate the current app. Confirm the exact hardware and OS before choosing a build machine.

The source repository is public. No account is needed to clone it. Clone into an ordinary local folder outside cloud-synced storage.

## Mac: Terminal

```sh
git clone --branch main https://github.com/CashBowman/axiovela.git
cd axiovela
node --version
node -p process.arch
npm ci
npm run desktop:tools
mkdir -p .local/desktop-profile
AXIOVELA_DESKTOP_PROFILE="$PWD/.local/desktop-profile" npm run desktop:start
```

For packaging, install Apple's Command Line Tools with `xcode-select --install` if they are missing. Build Apple Silicon on an Apple Silicon Mac and Intel on an Intel Mac for the simplest native workflow. Building on one architecture does not establish that the other works.

## Windows: PowerShell

```powershell
git clone --branch main https://github.com/CashBowman/axiovela.git
cd axiovela
node --version
node -p process.arch
npm.cmd ci
npm.cmd run desktop:tools
New-Item -ItemType Directory -Force .local/desktop-profile | Out-Null
$env:AXIOVELA_DESKTOP_PROFILE = Join-Path (Get-Location).Path '.local/desktop-profile'
npm.cmd run desktop:start
```

Use `npm.cmd` to avoid PowerShell script-policy issues. Run Windows packaging and tests in native Windows, not WSL. WSL follows the Linux workflow and produces Linux output. The profile environment variable applies to this PowerShell session; use a new terminal or `Remove-Item Env:AXIOVELA_DESKTOP_PROFILE` to clear it.

## Linux: Terminal

Follow the Mac clone/run commands on Linux x64. A graphical desktop is needed for interactive Electron use. On Debian/Ubuntu, packaging also requires `sudo apt-get install fakeroot rpm`; headless smoke tests require `xvfb` and should be prefixed with `xvfb-run -a`. Use a supported, unlocked system keyring to test encrypted credential storage.

## Make and test locally

Close the development app first. The explicit development profile above keeps settings separate from an installed copy. Automated smoke tests use isolated fixtures; never substitute your own research project or live credentials. The `desktop:tools` step downloads the verified bundled tools, including Tectonic. First PDF compilation needs internet to fetch its TeX resources. Python, GPU libraries, and provider CLIs remain optional [research dependencies](quick-start.md#connect-ai-and-set-up-latex).

Run these in the checkout, using `npm.cmd` in PowerShell:

```sh
npm run desktop:test
npm run release:check
npm run install:smoke
npm run desktop:make
npm run desktop:smoke -- --packaged
npm run desktop:recovery:smoke
```

Enable the real PDF test with `AXIOVELA_TEST_LATEX=1 npm run desktop:smoke -- --packaged` on Mac/Linux. In PowerShell set `$env:AXIOVELA_TEST_LATEX = '1'` before running the command. An offline TeX download failure is not a passing PDF test.

Installers and handoff files are generated under `out/make/`. Check the actual generated filename, architecture, version, and checksum. On Mac, also run `node scripts/desktop-dmg-smoke.mjs` to test the actual DMG. For automatic-trust distribution, follow [Mac signing and acceptance](mac-distribution.md) and run `npm run desktop:verify:mac`. Default builds use ad-hoc signing and do not satisfy that distribution gate.

Before resending installers, test the final downloaded file in a fresh standard account:

- **Mac:** matching ARM/Intel DMG → drag to Applications → eject → launch from Applications. Check Gatekeeper, Keychain, project save/reopen, example PNG/PDF, recovery, and upgrade behavior on both architectures, including the reported M3/Tahoe configuration when available.
- **Windows:** download the x64 `Setup.exe` → install → launch from Start. Check installation, SmartScreen/device-policy behavior, save/reopen, encrypted credentials, PNG/PDF, recovery, upgrade, and uninstall. Extract the entire portable ZIP before using it.
- **Linux:** install the matching DEB/RPM through the package manager → launch from the app menu. Check dependencies, keyring, save/reopen, PNG/PDF, and removal. Keep all files together when using the portable ZIP.

Record results against the exact source commit and final installer hashes. A clean source test or native CI run does not replace installation testing. Review [validation status](releases/0.2.0.md) and [remaining Mac acceptance](mac-installation.md) before declaring a release ready. Assign a new version before producing a replacement release so users can identify the exact tested binaries.

## GitHub and build costs

Work on a feature branch, commit reviewed files, and open a pull request following [Contributing](../CONTRIBUTING.md). The **Build** and **Desktop beta** Actions workflows are manual only. To use one later, open GitHub → Actions → the workflow → Run workflow, choose a branch and a single platform. Selecting `all` expands Build to three jobs or Desktop beta to four build jobs plus two Tahoe verification jobs. Check your Actions budget before dispatching.

The Linux verification and security workflows remain automatic; the security workflow also has its scheduled run. Local commands above do not start GitHub Actions. No installer is published automatically by these manual workflows.

## Private continuation notes

The repository ignores its root `.local/` directory. Keep private work notes in `.local/DEVELOPMENT-HANDOFF.md`; this folder also holds the isolated development profile above. The installer allowlist excludes it, and the repository check rejects it if accidentally staged. Never use `git add -f` on it.

A leading dot only hides a file in some file browsers. It does not make a tracked file private. Ignored notes will not upload to GitHub, appear in source archives, or arrive with a clone. Transfer the note separately through a private channel and place it at the same relative path on each development machine. Transfer only the Markdown note, not credential or profile files. Before publishing, inspect `git status` and staged changes; never put secrets in any version-controlled file.
