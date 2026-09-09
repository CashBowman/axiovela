# Mac distribution preparation and acceptance

The default remains an ad-hoc-signed development/beta candidate. It is not automatically trusted by macOS. These optional release controls do not enroll an Apple account, install certificates, or approve distribution.

## Local verification

```sh
npm run desktop:test
npm run release:check
npm run desktop:package
AXIOVELA_TEST_LATEX=1 npm run desktop:smoke -- --packaged
npm run desktop:recovery:smoke
```

These use isolated fixtures and copied apps. Recovery smoke kills only the test app's renderer, verifies the recovery dialog/reload, retains browser state, checks the backend and tests blank startup/quit. The ordinary smoke exercises the example, real PNG/PDF generation, permissions, saving, reopen and cancellation. Linux results do not substitute for macOS results.

## Optional Developer ID build on a Mac

Provision a Developer ID Application certificate in the build account's keychain and notarization credentials outside the repository. A stored notarytool keychain profile is preferred. The configuration also accepts the existing `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` environment variables.

Set `AXIOVELA_MAC_SIGN=1`, `AXIOVELA_MAC_SIGN_IDENTITY` to the full installed `Developer ID Application: …` certificate name, and `AXIOVELA_MAC_NOTARIZE=1`. Set `AXIOVELA_MAC_NOTARY_PROFILE` to the stored profile if using one. `HYPOTERA_MAC_*` and `METHODFLOW_MAC_*` aliases remain supported, with Axiovela taking precedence.

Run `npm run desktop:make` on each native architecture. Configuration fails early if notarization is requested with ad-hoc signing, a missing identity, or missing credentials. Forge signs/notarizes the application before creating its ZIP. DMG staging uses a fresh temporary directory and preserves relative symlinks. The final DMG is signed, submitted, and stapled only after accepted submission and log results with no issues. Logs are retained under `out/make/notary`. Checksums are calculated after these operations, so they describe the final bytes. No installer is approved merely because creation succeeded.

## Mandatory distribution gate

On a Mac with the completed DMG in `out/make`, run:

```sh
npm run desktop:verify:mac
```

This command does not need signing credentials when assessing an already built DMG. It mounts and copies the actual installer, ejects it, removes the original build copy, and tests native loading and the full app/recovery suites. It requires successful installed and quarantined-copy signature, identity, Gatekeeper and system-policy results, plus DMG integrity, signature and staple checks. The identity must show Developer ID, timestamp and hardened runtime. Missing tools, timeouts and failed checks fail the gate. Normal app use must preserve its seal; a modified disposable resource must be specifically rejected.

Reports are written before the gate can fail. `automatedDistributionPassed: true` is set only after every automated stage completes; it does not certify physical-machine acceptance. Plain `node scripts/desktop-dmg-smoke.mjs` without notarization configuration remains an integrity/execution test and explicitly grants no distribution approval.

Finally test browser download → Finder mount/copy → eject → Applications launch in fresh standard accounts on physical Apple Silicon (including the reported M3 when available) and Intel. Record the exact DMG hashes, OS versions, offline first launch, Keychain prompts, saved-project upgrade and the remaining [audit acceptance checks](mac-installation.md). Do not clear quarantine or disable Gatekeeper to obtain a pass. Resolve policy/XProtect errors before sending the release.

Apple's [packaging procedure](https://developer.apple.com/documentation/xcode/packaging-mac-software-for-distribution) and [trusted-execution diagnostics](https://developer.apple.com/forums/thread/706442) are the reference for final-container and clean-machine testing. Electron documents [asynchronous Keychain access](https://www.electronjs.org/docs/latest/api/safe-storage); real upgrade/signature continuity remains a separate Mac acceptance test.
