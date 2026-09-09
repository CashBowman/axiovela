# Contributing

Keep changes focused, preserve the established visual design, and connect controls to real APIs. New projects must contain instructions, not example evidence.

For desktop development on a new computer, start with [Development setup](docs/development-setup.md).

Use Node 22.12+ on the 22 LTS line. From the checkout:

```sh
npm ci
npm start
```

Before opening/updating a pull request:

```sh
npm run release:check
git diff --check
git status --short
git diff --cached --stat
git diff --cached
```

Use `npm.cmd` in PowerShell. `check` is a build, not a separate lint/type-check command. Add executable behavior tests for backend changes. For UI changes, verify fresh-project, loading, failure, completed, narrow-screen, and keyboard states against a real backend. Linux CI does not prove other platforms work.

Read [SECURITY.md](SECURITY.md). Stage explicit task files, not an unreviewed whole checkout. Never commit private session prompts, credentials, internal plans, research outputs, or screenshots with personal paths. Automated scans supplement review, not guarantees.

Keep [features](docs/features.md) and user guides aligned with actual behavior. Describe limitations honestly. Use a feature branch and reviewed PR; leave repository visibility unchanged. The public example in `examples/` is intentionally separate from blank project scaffolding. See [release preparation](docs/releasing.md) for the launch checklist and [scientific integrity](docs/scientific-integrity.md) for evidence conventions.
