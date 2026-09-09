# Axiovela branding and compatibility

Axiovela is the chosen product name, replacing Hypotera and the earlier MethodFlow. Its descriptor is “The AI research workbench.” Its description is: “A local AI workspace for turning hypotheses into reproducible experiments, evidence-backed analysis, and publication-ready manuscripts.”

The interface, page title, menus, installers, documentation, and GitHub repository use Axiovela. The repository is `CashBowman/axiovela`. Existing GitHub links redirect from `CashBowman/hypotera` and the original `CashBowman/machine-learning-research-dashboard`; update existing checkouts with:

```sh
git remote set-url origin https://github.com/CashBowman/axiovela.git
```

## Existing installations and projects

The primary CLI is `axiovela`; `hypotera`, `methodflow`, and `ml-workbench` remain aliases. Run `npm run setup` in an updated source checkout to register the new command. The private `ml-theory-workbench` npm identifier, `WORKBENCH_*` environment variables, service/provider IDs, project filenames, and `workbench.*` schemas remain stable.

Desktop builds deliberately retain the internal Electron application name `MethodFlow`, the OS profile directory named `MethodFlow`, the `methodflow://app` origin, and the macOS bundle identifier `org.methodflow.desktop`. This preserves the existing encryption identity, saved projects, browser storage, and drafts without copying credentials. The internal preload bridge and session header also keep their names. OS credential prompts may consequently mention MethodFlow. macOS can request Keychain access again for unsigned or differently signed builds; see [Electron safeStorage documentation](https://www.electronjs.org/docs/latest/api/safe-storage).

Linux per-user installation creates `axiovela.desktop`. Existing generated `hypotera.desktop` and `methodflow.desktop` launchers become hidden compatibility aliases pointing to Axiovela, preserving old pins without adding a duplicate application-menu entry. Their prior contents are backed up once as `.before-axiovela`; custom launchers are left alone. Quit the old application before opening the new build; both intentionally share a profile and a single-instance lock. Windows and Linux system installers now use the Axiovela package name: install the new beta, remove the old application through the OS installer, and pin Axiovela again if necessary. On macOS install `Axiovela.app`, quit and remove the old `Hypotera.app` or `MethodFlow.app` to avoid launching it accidentally. Do not delete the shared profile when removing an old build.

New test/signing environment variables use `AXIOVELA_*`; the corresponding `HYPOTERA_*` and `METHODFLOW_*` variables remain supported as aliases. `private: true` prevents accidental npm publication; it does not contradict the MIT source license.

## Compass mark

The approved mark is a slightly stylized antique mathematical drafting compass, with a curved adjustment brace, brass legs, and pale steel tips on a slate navy tile. `public/workbench-mark.png` is the authoritative transparent raster asset, selected and refined by the maintainer using OpenAI image generation. Its palette follows the application's slate, brass, and steel colors. The previous vector mark is preserved in Git history.

The header, browser icon, README, and desktop icons share this source. Regenerate platform assets with `node scripts/desktop-icons.mjs` and the social card with `npm run social:render`. The social SVG references the same PNG; its renderer embeds the pixels when exporting the card.

Earlier design concepts are retained privately. Design provenance and the choice of Axiovela do not establish worldwide uniqueness or trademark clearance.
