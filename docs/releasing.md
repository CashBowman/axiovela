# Release preparation

## Distribution

For the Electron edition, follow [desktop builds and signing](desktop.md). `npm run desktop:make` produces installer candidates; passing source tests alone does not certify those binaries.

Axiovela source is licensed under MIT; see [LICENSE](../LICENSE). Dependencies retain their own licenses. The repository's visibility is a separate GitHub setting. Keep `private: true` in `package.json` until an npm publishing workflow and package identity are deliberately chosen.

Before public release, review the [branding and compatibility note](branding.md), current tracked files, full Git history, Git author metadata, assets, and dependency notices. A clean current-tree scan cannot certify that history or external copies contain no private material. Publish only material the project has the right to distribute.

## Verify a release candidate

Use Node 22.12+ within Node 22:

```sh
npm ci
npm run release:check
npm run install:smoke
npm audit --audit-level=moderate
git diff --check
git status --short
```

`release:check` runs repository privacy/link checks, the production build, security boundaries, backend, assistant, direct-provider, CLI-provider, research/UI-contract, Markdown rendering, and reproducible-example smoke tests. `install:smoke` additionally installs a clean copy into a private temporary prefix, tests paths with spaces, launches the UI, and tests occupied-port handling. The suites use isolated temporary projects and credential-free fixtures. The build is not a separate lint/type check. The example check verifies numerical correctness, repeatability, and project evidence links.

CI tests the full suite on Linux at the minimum Node version; the build and isolated installer workflow targets current Node 22 on Linux, Windows, and macOS. A configured matrix is not evidence of a passing run: record its results before claiming platform support. Separately review fresh-project and populated-project UI states with the [UI checklist](ui-regression-checklist.md). Native Windows/macOS validation must be recorded separately before claiming parity.

## GitHub presentation

Suggested repository description:

> Axiovela: a local AI workspace for hypotheses, reproducible experiments, evidence-backed analysis, and publication-ready manuscripts.

Topics: `ai-for-science`, `research-tools`, `reproducible-research`, `experiment-tracking`, `latex`, `local-first`, `scientific-computing`.

Upload [axiovela-social.png](assets/axiovela-social.png) in repository Settings → General → Social preview. The editable source is [axiovela-social.svg](assets/axiovela-social.svg); run `npm run social:render` after editing it. It depicts the workflow and does not claim to be an application screenshot.

The README and demo guide include reviewed screenshots of the reproducible example. Add a reviewed 60–90 second video when available. Use the [example](../examples/linear-regression/README.md), inspect all captured paths/text for personal information, and show a recorded metric, a limitation, and the corresponding report. Use the same demo on the product website and for the research-lab introduction.

## Publish

Use the [current release notes](releases/0.2.0.md). Tag the tested source and
publish matching installers, validation records, and checksums. Axiovela's
public source starts with the refined 0.2.0 snapshot; earlier development history
is preserved in a private archive. Never push the archive's branches or tags to
the public repository. Application changes require a new version and native checks.
Documentation-only changes do not recertify existing binaries.

The website repository checks public stable releases every six hours and proposes
an update for review using its built-in Actions token. No cross-repository
personal token is needed. Merging a website update and deploying the hosted site
are separate steps.

## Ongoing maintenance

The Security workflow checks the dependency lockfile and scans complete fetched history with a checksum-pinned Gitleaks binary on pushes, pull requests, and weekly. Dependabot proposes dependency and Actions updates. `npm run repository:check` catches known local authentication filenames, machine-specific home paths, and broken local documentation links in the current source tree. These checks supplement manual history and asset review.

Require the verify, build/installer matrix, and Security jobs in branch protection or a ruleset when the repository plan supports it. Keep workflow token permissions read-only.
