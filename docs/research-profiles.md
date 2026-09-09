# Research profiles and Pi integration

Axiovela includes three research profiles, plus General research. Choose **Research focus** below either chat. Profiles are saved separately for the experiment and writing chats in each project. They do not choose a model, grant permissions, create accounts, or install a scientific computing environment.

- **Science & engineering:** physical, life, and earth sciences plus engineering, covering experimental design, measurement quality, simulation convergence, interpretable models, uncertainty, and figures with provenance. Scanpy and Biopython are useful candidates for single-cell and sequence work; Python/R remain suitable for broader biology. See the [Scanpy tutorials](https://scanpy.readthedocs.io/en/stable/tutorials/index.html).
- **Data science & machine learning:** schema inspection, preprocessing inside validation folds, held-out evaluation, simple baselines, calibration, and reproducible artifacts. pandas/scikit-learn are the default candidates for ordinary tabular work. The workflow follows the leakage and preprocessing concerns in [scikit-learn's guidance](https://scikit-learn.org/stable/common_pitfalls.html).
- **Mathematics & statistics:** explicit assumptions, derivations, identifiability, symbolic checks, numerical stability, and uncertainty diagnostics. SymPy/SciPy/statsmodels are useful candidates; PyMC/ArviZ suit Bayesian problems. See [SymPy](https://docs.sympy.org/latest/tutorials/intro-tutorial/index.html) and [PyMC learning resources](https://www.pymc.io/projects/docs/en/stable/learn.html).

These are original, bundled workflow skills. Scientific libraries remain optional project dependencies, selected for the actual data and computer. Model output still requires verification: loading a skill does not establish scientific accuracy.

## What Pi packages actually provide

Pi is an agent runtime connected to an AI provider. Skills supply task instructions and references; extensions add executable tools and interface behavior. Packages distribute combinations of those resources. Axiovela talks to Pi through its local RPC interface. Herdr supplies coordination for optional Pi workers. The research profiles work with direct API connections and other supported engines as well.

Pi supports explicitly loading a selected skill with `--skill` while disabling ordinary discovery with `--no-skills`. Axiovela uses that combination for its Pi router. The same profile text is included in each request for other engines, and the Herdr orchestration contract requires it in every worker brief. Switching profiles begins a fresh native session with a visible handoff of recent conversation context. Existing conversation history remains available. See [Pi skills](https://pi.dev/docs/latest/skills) and [Pi packages](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md).

## Ecosystem candidates reviewed, September 8, 2026

1. **pi-scientific-skills** is the closest off-the-shelf candidate. It ports a broad scientific collection to Pi and offers field profiles, including genomics and scientific ML. Its `/sci` picker and search tool are implemented by a Pi extension; those terminal controls do not automatically become Axiovela UI. Its README also describes filtered-skill edge cases in RPC steering/follow-up. Reviewed repository snapshot: `34680c71fa450d377b29f012857152371076f0c9`; no GitHub release was returned by the release API at review time. We have not executed or certified its helper scripts. [Project documentation](https://github.com/danieldoesbio/pi-scientific-skills).
2. **K-Dense scientific-agent-skills** is the broader upstream collection. It is a candidate for selectively importing deeper domain references later, with pinned sources, license attribution, and dependency review. Its latest published release at review time was v2.66.0 (September 2), with documentation/version updates. It is not a separate AI model or ready-made Axiovela environment. [Release notes](https://github.com/K-Dense-AI/scientific-agent-skills/releases/tag/v2.66.0).
3. **badlogic/pi-skills** provides general utilities such as browser/search and service integrations. It is useful as a complementary toolbox, but does not itself supply the three requested scientific specializations. Several tools require separate accounts, API keys, or installations. Reviewed snapshot: `90bb51cae36515a648515b633a81c0c6efc8c74d`; no GitHub release returned at review time. [Project documentation](https://github.com/badlogic/pi-skills).

Decision: ship three small, inspectable Axiovela profiles now. None of these third-party collections is automatically installed or enabled. A future package manager should expose selected skills and dependencies in Axiovela, support pinned versions and removal, and distinguish successful installation from validated scientific behavior.

Pi v0.85.1 was the current release reviewed and tested. It fixes an SDK import regression introduced in v0.85.0 and retains the supported local SDK/stdio RPC paths. The in-app installation command pins 0.85.1; existing Pi installations are not silently replaced. [Pi release notes](https://github.com/earendil-works/pi/releases/tag/v0.85.1).

## Connections and setup

1. Open or create a project, then select a research focus below the chat.
2. Open the **Model & provider** button. For a direct API, select its provider, enter the key, save the connection, select a model, and choose **Use model**. Keys stay in private local app configuration, outside the research project.
3. For a CLI subscription, choose its engine and follow the platform-specific install/sign-in steps in the same dialog. Pi signs in through its own `/login`; an Axiovela API key does not sign into Pi or Herdr. **Connect an API key instead** opens the direct API form without requiring those tools.
4. For multiple workers, set up Pi and Herdr and then enable **Agentic mode** in the experiment chat. The missing-tool dialog uses the same setup component as connection settings. Retry checks setup and enables Full access; profile selection alone never does so. See [Herdr installation](https://herdr.dev/docs/install/).

The app copies installation commands and can locate installed executables through a native file picker. It does not execute arbitrary shell commands from a renderer setup button. Third-party OAuth sign-in still happens in the provider's CLI. Editing custom research profiles in the app remains future work.

## Validation and maintenance

`npm run release:check` covers profile validation, persistence, role isolation, native-session transitions, inherited worker guidance, and CLI permission flags using isolated fixtures. `npm run desktop:smoke -- --packaged` exercises the dropdown, reload persistence, shared setup, API-key form, and profile changes across Agentic mode. The packaged app contains all three skill files under `server/research-skills`.

`npm run pi:smoke` is an optional credential-free check against an installed Pi; set `WORKBENCH_PI_PATH` to its executable or JavaScript entry to test a specific installation. It sends only the RPC command-discovery request.

During implementation, a separate temporary installation of real Pi 0.85.1 loaded each profile through `get_commands`, using both its normal bundle entry and legacy JavaScript entry. No model request or user credentials were used. This verifies loading and protocol compatibility, not a paid provider round-trip or scientific results. Fresh Mac/Windows installer acceptance and scientific evaluation with representative datasets remain separate from Linux verification.

The Linux per-user installer registers the Axiovela search keyword and refreshes KDE's application cache. Existing generated legacy launchers point to the same version but remain hidden from search. Quit an older running version before opening the new one, because desktop single-instance behavior otherwise focuses that existing process. [Desktop entry keyword specification](https://specifications.freedesktop.org/desktop-entry/latest/recognized-keys.html).

## Initial write-up format

The three-dot button beside Markdown/LaTeX selects the default for initial experiment write-ups. It is saved on this device across projects; Markdown is the fallback. The experiment assistant receives this preference separately from the open editor format. Initial write-ups use the chosen editable source after authorized experiments; explicit format requests take precedence. Existing manuscripts are preserved. Switching the visible editor tab does not change the default. The Research Assistant continues to use the currently selected editor format when asked to write or revise a document.
