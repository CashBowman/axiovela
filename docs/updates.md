# Application updates

Version 0.2.4 provides **guided updates** with signed, verified downloads. Installation remains manual. Versions through 0.2.2 have no pinned update key, and withdrawn 0.2.3 has a GitHub discovery header error: install 0.2.4 manually once to bootstrap verification.
Packaging, signing defaults, application IDs, aliases, and research formats are
unchanged. Do not describe it as a production-ready cross-platform automatic
updater: native installer upgrades and recovery have not been validated by this
change. Existing 0.2.0 builds contain no updater and need one manual bootstrap
installation. Merely publishing a new release cannot add an updater to them.

## What users get

Packaged desktop apps quietly check public GitHub releases 30 seconds after
startup and every six hours. **Help → Check for updates…** also opens the small
update panel. Checks do not download application files. Background failures do
not open dialogs. **Later** dismisses a notice for that version for the current
session. Source launches, CI, and isolated profile overrides do not check
automatically. There is no browser/CLI updater.

Stable is the default even when the running app is a beta. Beta is an explicit
choice in the update panel, saved in `MethodFlow/updates.json`. Beta includes
stable releases too. Semantic version ordering rejects older versions; switching
back to stable waits for a newer stable release and never downgrades the app.
Discovery considers the newest 100 GitHub release records and picks the highest
eligible version. Maintainers must keep the current channel releases within
that window. Version tags are `vX.Y.Z` or `vX.Y.Z-beta.N`; build metadata is not
supported. The original `0.2.0` must be followed by a greater version, e.g.
`0.2.1-beta.1`, not `0.2.0-beta.20`.

The panel shows the version and plain-text notes (no executable HTML). With the 0.2.4 pinned public key and matching signed release metadata,
**Download update** streams the chosen platform/architecture/format with progress,
**Cancel download**, and retry. Cancellation/failure removes that operation's
partial file; retries start from zero. Concurrent checks/downloads/channel changes
are serialized. A one-hour download deadline and 30-second metadata deadlines
bound operations. **Show downloaded update** reveals the file in the OS file
manager. It never runs the file. Users save their work, finish tasks/exports,
quit normally, and use the existing installer or package manager.

The app never offers **Restart and update** in this release. There is no native
installation path, unattended installation, install-on-quit, updater subprocess,
privilege elevation, or automatic rollback. Consequently checks and downloads
cannot terminate experiments, assistant jobs, exports, or unsaved editors.
Normal quit retains the existing task and unsaved-edit protections. An external
installer is outside those protections; the guidance says to finish work first.

## Distribution support and prerequisites

| Existing installation | Implemented route | Native installation status |
| --- | --- | --- |
| macOS DMG / ZIP | Download matching DMG or ZIP; Finder replacement after quitting | Blocked: current ad-hoc releases do not establish Developer ID publisher trust; signed/notarized matching bundles and real upgrade validation required |
| Windows Squirrel Setup | Download Setup.exe; user runs existing installer after quitting | Blocked: no validated authenticated Squirrel installation integration; current installers unsigned |
| Windows portable ZIP | Extract to a new application directory; retain old copy | Guided only; do not treat portable ZIP as Squirrel-installed |
| Linux DEB / RPM | Choose original package format; open in graphical package installer or organization Software Center | No in-app replacement; package ownership and elevation remain with the system |
| Linux ZIP / per-user development installer | Extract to a new application directory; open new executable | Guided only; existing launcher may still point to old version and needs repinning/replacement |
| Source / CLI aliases | Release page and existing source installation documentation | No automatic source checkout/npm modification |

Linux users explicitly choose their original installation format. There is no
assumption that all Linux installs are DEB, and no shell-based package-manager
detection or root command. Some desktop environments lack a graphical local
package installer; those installations require their administrator's Software
Center/support path. There is currently no maintained Axiovela APT/RPM repository
to configure for unattended package updates.

The existing Electron Forge makers are ZIP, Squirrel.Windows, DEB, and RPM;
`scripts/desktop-artifacts.mjs` additionally makes Mac DMGs. Keep those formats.
Electron's built-in updater uses Squirrel.Mac for Mac, Squirrel.Windows for our
installed Windows format, and has no built-in Linux updater. Its documented API
downloads on check and applies staged updates on a later launch. It does not
provide the requested cancellable, progress-reporting download phase. Dropping
in `update-electron-app` would therefore not satisfy this policy. Changing to
electron-builder/NSIS/AppImage/MSIX would be a separate packaging migration.

Before adding native installation, require a separately reviewed adapter with
safe quiescence of backend tasks, renderer drafts and in-flight exports; durable
workspace handoff; no install on ordinary quit; native signature verification;
and failed-install recovery on each actual supported format. macOS requires
appropriate Developer ID signing/notarization and the existing final-DMG trust
gate, with compatible signing identity across upgrades. Windows requires a
reviewed publisher-signing policy and Squirrel RELEASES/full.nupkg feed handling
(Setup.exe alone is not a native update feed). Do not buy certificates, enroll
accounts, enable billable runners, or replace the packaging toolchain implicitly.

Official references, consulted September 9, 2026:

- [Electron autoUpdater platform support and install semantics](https://www.electronjs.org/docs/latest/api/auto-updater)
- [Electron update hosting options](https://www.electronjs.org/docs/latest/tutorial/updates)
- [Forge Squirrel.Windows artifacts](https://www.electronforge.io/config/makers/squirrel.windows)
- [Forge ZIP maker and Mac update metadata](https://www.electronforge.io/config/makers/zip)

## Integrity, authenticity and hosting

`desktop/update-config.json` pins the repository and Ed25519 public keys. Its
public-key list is deliberately empty until the maintainer provisions a real
release identity. With no key, notices and the release-page fallback work;
verified in-app downloads are unavailable. No test key is a production trust root.

The signed envelope `axiovela-update.json` contains the exact UTF-8 `payload`
string and a base64 Ed25519 `signature`. The payload includes schema, exact tag
and version, issue/expiry times, notes, `dataCompatibility: "0.2.0"`, and an
explicit platform/CPU/format/file/size/SHA-256 inventory. Expiration is at most
31 days from issue (the publishing script uses 30). Expired metadata requires
renewal or a new release; it never permits downloading unsigned bytes. Release
notices can remain visible from GitHub metadata when verification is unavailable.
The manifest's compatibility claim is a maintainer attestation, not an automated
proof that arbitrary application code preserves data.

Downloads reject invalid signatures, mismatched release identity, unsupported
schema/compatibility, wrong architecture, unsafe names, duplicate target entries,
oversized/short/corrupt bytes and expired metadata. Only fixed GitHub HTTPS API,
release, and asset redirect hosts are allowed. Neither renderer URLs nor manifest
URLs are executed or trusted as download endpoints. Metadata is size bounded.
Files are not extracted. A signed digest establishes the publishing key's
authorization; it does **not** substitute for Gatekeeper, SmartScreen, Authenticode,
or distro package trust. The app never disables those protections.

Public GitHub Releases host metadata and files without a new server/service.
An unauthenticated repository API check on September 9, 2026 returned HTTP 200
and `visibility: public` for `CashBowman/axiovela`. Release 0.2.4 publishes signed metadata for its exact artifacts; public repository visibility alone does not enable verification in older builds.
Checks disclose the ordinary network IP and user agent to GitHub, plus a fixed
repository request, not project paths, credentials, or research. No GitHub token
is shipped or read by the updater. A private repository, draft release, offline
network, rate limit or inaccessible asset produces a retry/fallback state.
Do not change repository visibility implicitly. If public releases are not
available, authenticated distribution hosting is a separate prerequisite.

## Data boundary and recovery

The update service writes only `updates.json` and uniquely created
`update-downloads/session-*` directories inside the existing OS `MethodFlow`
profile. Metadata verification and downloads never write app files, project
files, credentials, conversations, settings from another feature, or datasets.
Cancelled/failed downloads delete only their own `.partial` file. Complete files
and crash leftovers remain inert; nothing installs or resumes on startup. Old
session directories can be removed manually when no longer needed. There is no
recursive research/profile cleanup or cache retention sweep.

The profile remains `%APPDATA%/MethodFlow` on Windows,
`~/Library/Application Support/MethodFlow` on macOS, and Electron's appData
`MethodFlow` directory on Linux (normally `$XDG_CONFIG_HOME/MethodFlow`, otherwise
`~/.config/MethodFlow`). It retains `state.json`, `tools.json`, `window.json`,
`provider-settings.encrypted`, Chromium local storage and the `methodflow://app`
origin. The backend state remembers the selected project; local storage retains
project tabs, layout, format preferences, conversation selections and draft
recovery where already implemented. CLI configuration in ML Theory Workbench /
`ml-theory-workbench` is untouched, as are `hypotera`, `methodflow`,
`ml-workbench` and `axiovela` command aliases. Projects stay at user-selected paths.

This update makes no data migrations or schema changes. The download policy
rejects other compatibility values. A future format change needs its own
versioned migration, pre-migration backup, crash recovery, and minimum-reader
guard before opening data. A signed compatibility field alone cannot implement
those requirements, and an old already-shipped 0.2.0 cannot be retroactively
taught to reject future data formats.

If downloading fails, keep working and retry; the current installation remains
untouched. If a **manual external installation** fails, leave research/profile
data intact and reinstall the same compatible reviewed app version through its
original installer. Portable users retain the old application folder. Do not
delete the profile, restore old research snapshots, or automatically launch an
older application. Never open newly migrated data in an older build; recovery
must use a compatible reader or an explicit, separately restored backup. Native
installer failure/rollback behavior is not established by these download tests.

## Exact maintainer publication procedure (no GitHub build)

1. Keep the existing build formats and native platform release gates. Choose a
   version greater than 0.2.0 and set the matching package/lockfile version in the
   ordinary release preparation. Existing users first install one bootstrap
   build containing this updater and its pinned public key manually.
2. Provision an Ed25519 key **outside the repository** using your approved key
   management process (for example `openssl genpkey -algorithm ED25519 -out
   /private/axiovela-update-key.pem`, then `openssl pkey -in
   /private/axiovela-update-key.pem -pubout -out /private/axiovela-update-public.pem`).
   Restrict the private file to the maintainer account and keep a secure backup.
   Put only the complete public PEM string into `publicKeys` in
   `desktop/update-config.json` before building. Never commit the private key,
   store it in a project, package it, or use the test key. Rotate by shipping a
   release signed by the old key that pins both keys before switching signers.
3. Produce and validate reviewed artifacts with the existing local native build
   procedure. Do not dispatch the GitHub Build/Desktop workflows. Stage the
   final files under unique, flat filenames in a private release directory.
   Complete OS signature/notarization gates separately as applicable. Sign
   metadata only for those final bytes, after packaging/signing is complete.
4. Create `release.json` alongside the staged files, for example (use the actual
   current package version and all reviewed target files):

   ```json
   {
     "tag": "v0.2.1",
     "version": "0.2.1",
     "dataCompatibility": "0.2.0",
     "notes": "Concise, user-facing changes.",
     "assets": [
       {"name": "Axiovela-0.2.1-linux-x64.zip", "platform": "linux", "arch": "x64", "format": "zip"}
     ]
   }
   ```

   Add the actual DMG/Setup/ZIP/DEB/RPM entries for each supported CPU. Never
   relabel one CPU's file as another. Squirrel nupkg/RELEASES can be uploaded as
   ordinary release artifacts separately; they are not used by this guided flow.
5. Create a **draft** GitHub release with the exact tag, marking beta versions
   as prereleases. With maintainer `gh` authentication on the local machine, run:

   ```sh
   npm run updates:publish -- /absolute/staging/release.json /private/axiovela-update-key.pem --upload-draft
   ```

   This local automation hashes the staged files, signs and validates the
   metadata against the pinned public key, and uploads files and metadata to
   the existing draft. It does not build, dispatch Actions, create a runner,
   upload the key, overwrite existing assets, or publish the draft. Omit
   `--upload-draft` to generate only the signed file and upload through GitHub's
   browser UI. `axiovela-update.json` is created exclusively; move the previous
   metadata aside before explicitly regenerating. If an upload fails partway,
   review the draft and upload missing files through the browser; do not clobber
   existing release bytes blindly.
6. Review the draft, signatures, final artifact hashes, release channel, notes,
   and platform evidence. Publish the release explicitly in GitHub. Verify the
   public asset URLs and exercise **Check for updates** from the pinned bootstrap
   app using an isolated profile. Private/draft release files are not discoverable
   by the unauthenticated production updater. Public release publication may
   trigger the repository's existing website notification workflow; this change
   adds no Actions workflow or paid build trigger.
7. Before metadata expires, publish a newer compatible release or explicitly
   renew the signed metadata for the same unchanged reviewed bytes. Archive the
   superseded signed metadata and preserve original artifact hashes; changing
   published binary bytes under an existing version is prohibited.

## Validation and outstanding acceptance

Run `npm run updates:test`, `npm run desktop:test`, `npm run desktop:package`,
`npm run desktop:smoke -- --packaged`, `npm run updates:smoke -- --packaged`, and
`npm run desktop:recovery:smoke` locally. UI smokes use disposable homes, OS
profiles and fixture providers, never live credentials. On headless Linux a
working display or `xvfb-run -a` is needed. New publisher tests use ephemeral
Ed25519 keys; production keys are never involved.

The updater tests populate a disposable 0.2.0-shaped profile and project with
settings, fake encrypted credential bytes, datasets, runs, manuscripts,
conversations, exports, and recovery state, and compare their bytes after
operations. These are preservation tests, **not an upgrade of a real 0.2.0
installer**. UI tests exercise real IPC and offline signed downloads while a
fixture assistant task runs and the editor/composer contain unsaved text, then
reopen the saved workspace. The existing desktop/recovery tests cover normal
experiments, document rendering/export and renderer recovery separately.

Outstanding before production claims: actual 0.2.0 → bootstrap installer upgrade
on Mac/Windows/Linux package formats; native installation failures and interrupted
installation recovery; OS publisher trust on final artifacts; experiments and
exports concurrent with native installation gating (not implemented); native
restart handoff; These cannot be proved
by mocking installers on Linux. Do not mark them passed because packaging and
download tests pass, and do not start billable CI to fill the gap without an
explicit request.

### Local validation record, September 9, 2026

Linux x64, Node 22.23.1, existing Electron 44.2.0 packaging:

- `desktop:test`: 31 tests passed, including ten updater/publisher tests.
- `updates:test`: ten tests passed again after the final publisher change.
- `desktop:package`: passed locally with unchanged Forge makers and signing defaults.
- `updates:smoke`: passed from source and from the packaged application, including
  verified offline download, cancellation/retry during an active fixture task,
  preserved unsaved editor/composer text, postponement and saved workspace reopen.
- `desktop:smoke -- --packaged`: passed, including isolation, packaged dependencies,
  example project, relaunch persistence, task quit guard and cancellation.
- `desktop:recovery:smoke`: passed with an actual Linux renderer crash and recovery.
- `beta:feedback:smoke`: passed, including native Markdown PDF export, queued
  assistant tasks, project draft isolation and setup boundaries.
- `repository:check` and `git diff --check`: passed.

Logs are in `.local/update-*.log`; the reviewed UI screenshot is
`.local/update-evidence/ready.png`. Pre-edit backups of the main application,
preload, renderer entry and package manifest are in `.local/update-backup/`.
Other tracked edits are reversible through the existing Git baseline. Unrelated
README/demo edits were preserved. No user installation, real credentials,
research project, production signing key, published release, or GitHub workflow
was changed or used by these regression tests. No Mac/Windows installer upgrade
or Linux DEB/RPM installation was run; these results do not establish native
update or failed-installer recovery support.
