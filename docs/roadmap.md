# Roadmap

The [feature inventory](features.md) describes implemented functionality. This roadmap is directional and does not promise dates.

## Launch preparation

- Record a short end-to-end demo using the reproducible example; the README already includes reviewed screenshots.
- Present the workflow to computational researchers and the maintainer's research lab, then prioritize observed friction.
- Complete downloaded-installer, live-provider, keychain, upgrade/uninstall, and optional LaTeX acceptance on ordinary machines. The packaged CI matrix already passes; see [beta status](releases/0.2.0.md).
- Review brand clearance, distribution hosting, source/history privacy, and release artifacts before any public launch. Axiovela is the chosen name; current distribution remains an invited beta.

## Next product work

- Add a `axiovela doctor` command and a first-run connection checklist: Node/npm/Git versions, writable project/state locations, port conflicts, provider availability, and optional Tectonic. Diagnostics should be safe to paste without keys or home paths.
- Add a reviewed project-sharing export that previews included files and excludes credentials, assistant transcripts, raw datasets, and machine-specific metadata by default.
- Simplify installation and updating while preserving existing project files and command compatibility.
- Add durable single-agent workflow stages, checkpoints, and recovery. Show the last validated step and require an explicit resume after interruption so experiments are not silently rerun.
- Improve onboarding based on first-run feedback from computational researchers and small labs.

Additional engines and generic orchestration remain deferred directions. The Experiment Chatbot now includes an experimental, opt-in Pi + Herdr path for bounded parallel implementation work; the ordinary single-agent workflow remains the default.

Prioritize onboarding and recovery over additional engines or broader orchestration. Validate improvements with first-time researchers; the current hypothesis → experiment → evidence → manuscript workflow is already substantial.
