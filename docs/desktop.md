# Axiovela desktop beta

For a new development machine, follow [Mac, Windows, and Linux development setup](development-setup.md).

The Electron edition opens Axiovela in its own window and can be pinned to a taskbar, Dock, or Linux application launcher. It bundles the browser, Node runtime, and Tectonic LaTeX engine (from beta.5). End users do not need Git, Node, npm, a terminal, or a GitHub account for the example study and basic project management.

This is an invited beta with unsigned installers and manual updates. It is not a general-availability production release. Keep the [source installation](quick-start.md) available for contributors and advanced users.

## Install a reviewed build

- **Fedora and related Linux distributions:** open the `.rpm` in your software installer. It installs a Axiovela application-menu entry that can be pinned.
- **Debian/Ubuntu:** open the `.deb` in your software installer.
- **Other Linux distributions:** extract the Linux ZIP into a permanent folder and open `axiovela`. Keep the entire extracted folder together. The ZIP does not install an application-menu entry automatically.
- **Windows x64:** run the `Setup.exe` installer. Launch Axiovela from Start and pin it to the taskbar. The ZIP is a portable alternative.
- **macOS:** open the DMG, drag Axiovela into Applications, and pin it to the Dock. Choose the Apple Silicon (`arm64`) or Intel (`x64`) download matching your Mac.

Unsigned test builds may be blocked by OS or institutional policy. Do not disable system-wide protections or bypass an institution's policy. Unsigned distribution is an intentional project decision. Test the documented per-app approval on each target OS before expanding invitations; some managed devices cannot run these builds. GitHub hosting does not change OS trust checks. Only download a build from the agreed release location; checksums detect corruption but do not replace a trusted publisher signature.

For the release coordinator: [Mac installer handoff and tester acknowledgment](mac-installation.md).

## First session

1. Open Axiovela into the blank workspace. Choose **Project** to select a research folder, and connect your provider through the model selector below the chat composer.
2. To explore sample results first, use **Help → Try the example study**.
3. Choose where to save it. The app creates a new uniquely named folder and runs the bundled synthetic regression using its own runtime.
4. Inspect Results, Methods, figures, and the Markdown write-up.
5. Choose **Project → Browse folders…** to select or create a research folder. Git history is optional and unchecked by default.
6. Connect an AI provider through the model selector when needed. AI access and billing remain with your chosen provider.

LaTeX compilation uses bundled Tectonic 0.17.0. The first render needs internet to download the required TeX packages and fonts; later renders reuse the OS user cache. A new package can require another download. No Conda or terminal installation is needed for desktop LaTeX. Markdown, math rendering, bibliography parsing, image conversion, PDF preview, and the Node-only example are also included.

Use **Tools → Check installed tools** to inspect discovery. The desktop searches its inherited PATH plus common Homebrew, local-bin, Conda, and Windows npm/Scoop locations. Use **Tools → Add tool folder…** for a custom environment's executable directory (for example a Conda environment, Python bin/Scripts folder, or an NVM version's bin folder). Use the executable selectors for Tectonic, Herdr, and native assistant CLIs. Quit and reopen after changing locations. Settings live in the OS profile, not in research projects or Git. **Reset tool locations** returns to automatic discovery and the bundled engine.

Python packages, GPU runtimes, Git, native assistant CLIs, SSH/Slurm, and containers remain external, as in the browser edition. Choose the environment required by the research project; the application does not install arbitrary research dependencies globally. API providers do not require a native assistant CLI. The LaTeX integration supports Tectonic; selecting pdfLaTeX or another executable with incompatible flags is not supported.

Before opening an upgraded build, fully quit the old application. Axiovela is single-instance: starting a new installer’s executable while an older copy runs focuses that older copy. Check Help → About Axiovela to confirm the version.

Closing the application stops its local service. If it knows of running tasks, it asks before stopping them. Save write-up edits before leaving; the editor also maintains local draft recovery. Already recorded results stay in the project directory.

The bundled **Help → License and beta notice** explains AI limitations, tool access, provider charges, and the unchanged MIT disclaimer. See [Beta notice](../BETA_NOTICE.md).

## Configuration and privacy

Desktop configuration lives in Electron's OS user-data directory named MethodFlow (retained for compatibility). Projects remain in the folders you choose, outside the application installation. Updating/replacing the application does not replace project folders. Uninstalling the application leaves research and the user profile in place; remove those separately only if you intend to erase them.

The desktop UI uses the stable `methodflow://app` origin. Its local service binds an ephemeral loopback port and accepts a per-launch credential held by the main process. That credential is not exposed to the renderer, command-line arguments, project files, or environment. The renderer is sandboxed, has no Node access, denies unexpected navigation/permissions, and proxies only to the fixed local service. External links open in the system browser. Fonts ship with the app.

Desktop provider settings are encrypted with Electron `safeStorage`, backed by the OS facilities. Linux requires an unlocked supported keyring; plaintext fallback is refused. CLI settings are kept compatible and still use the documented private plaintext configuration. Desktop does not silently import, rewrite, or delete CLI credentials. Re-enter a key in the desktop UI if needed. Environment-provided keys remain available to the backend. OS encryption does not protect against a compromised account or tools running with your own permissions.

## Build and test (developers)

Use Node 22.12+ on Node 22 for the build tools. The desktop runtime is the pinned Electron version, with its own bundled Node version.

```sh
npm ci
npm run desktop:test
npm run desktop:start
npm run desktop:package
npm run desktop:smoke -- --packaged
npm run desktop:make
```

Artifacts are in `out/make/`, with per-platform SHA-256 lists. `out/Axiovela-<platform>-<arch>/` contains the runnable application. Linux makers require `dpkg`, `fakeroot`, and `rpm` build tools; CI installs them. Build each platform on its own runner. On headless Linux run smoke tests with `xvfb-run -a npm run desktop:smoke -- --packaged`.

Set `AXIOVELA_TEST_LATEX=1` when running desktop smoke to also compile a real PDF with math and an SVG figure through the packaged service. This test uses an isolated profile and TeX cache and requires network access for first-use packages. CI enables it on every platform.

The desktop CI matrix builds and tests Linux x64, Windows x64, macOS arm64, and macOS x64. Successful packaging is distinct from testing OS installation, publisher trust, keychain prompts, and live research tools on beta machines. CI uploads private workflow artifacts, not a public release.

For a per-user Linux development install after `desktop:package`, run `npm run desktop:install:linux`. This copies the packaged build into your local data directory and adds a Axiovela Beta application-menu entry, without administrator access. It prints the application and launcher paths for removal. Any pre-existing launcher is backed up with `.before-desktop-beta` once.

The upstream RPM maker is incompatible with RPM 6's changed build-directory layout (including Fedora 44 build hosts). Use the Ubuntu CI-produced RPM for distribution. On these development hosts, use the per-user installer above or build a ZIP with `npx electron-forge make --skip-package --targets @electron-forge/maker-zip` after packaging. This limitation concerns building RPMs, not running the application on Fedora.

`forge.config.cjs` explicitly includes only runtime files. ASAR is disabled so the existing Node service, native image library, subprocess workflows, and templates operate on real packaged files. Production dependencies are pruned; source-control history and developer state are excluded. `scripts/desktop-icons.mjs` regenerates the PNG/ICO/ICNS icons from the approved PNG.

Forge's packaging dependencies are pinned through overrides to avoid vulnerable archive extractors. Packager 18 retains the callback hooks Forge 7 requires; newer Packager versions are incompatible with those hooks. The maintained Electron ZIP extractor replaces its deprecated predecessor. Revalidate package and maker tests when changing these pins.

## Signing and updates

Electron is [MIT-licensed and free](https://www.electronjs.org/docs/latest/why-electron). No Electron subscription is required. macOS Developer ID/notarization normally requires an [Apple Developer Program membership](https://developer.apple.com/support/compare-memberships/) (currently USD 99/year, subject to local pricing or eligible waivers). Windows trusted signing may also have a separate cost. No paid services are provisioned by the build.

The default Mac artifacts now receive ad-hoc signatures to seal bundle integrity. They are not Developer ID-signed or notarized and are not automatically trusted by Gatekeeper. See [Mac trust validation](mac-trust.md). Optional macOS signing requires `AXIOVELA_MAC_SIGN=1` and an explicit `AXIOVELA_MAC_SIGN_IDENTITY` (Developer ID Application certificate name). Notarization additionally requires `AXIOVELA_MAC_NOTARIZE=1` and a stored `AXIOVELA_MAC_NOTARY_PROFILE`, or the existing Apple credential environment variables. Final DMG notarization/stapling and `npm run desktop:verify:mac` are described in the [Mac distribution procedure](mac-distribution.md). Signing identity/certificates must be installed on that runner. Do not put signing credentials in source files. Windows builds also remain unsigned; SmartScreen and Smart App Control can limit installation. Do not advertise compatibility with a device policy that rejects unsigned software.

This beta uses manual updates: **Help → Downloads and release notes**, quit, and install the reviewed newer version. Automatic download/install is intentionally deferred until a signed release channel and update/rollback tests exist.

For upgrades from a MethodFlow beta, see [branding and compatibility](branding.md#existing-installations-and-projects). The stored profile and credentials retain their original identity.
