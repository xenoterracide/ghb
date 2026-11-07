<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# ghb

GitHub Bridge: a TypeScript CLI devtools monorepo.

- **`@xenoterracide/ghb`** — aggregated `ghb` CLI. Composes subcommands from
  the other packages.
- **`@xenoterracide/ghb-pr`** — `pr sync` and `pr verify`: keep a PR branch
  current and prove it is mergeable and green.
- **`@xenoterracide/ghb-secrets-sync`** — GitHub repository secret sync from
  environment variables or local env files.

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the repository layout, setup, and
contributor workflow.

## Key Commands

Run `yarn check` for eslint, typecheck, and tests. Run `yarn lint` for eslint,
prettier, and reuse. See [`package.json`](./package.json) for other scripts.

## Conventions

- **Conventional commits.** See
  [`git-conventional-commits.yaml`](./git-conventional-commits.yaml).
- **Squash merge.** Do not force push.
- **SPDX headers on every file.** `lint-staged` adds them. CI checks
  compliance. Do not remove them.
- **Shell safety.** Use `execFileSync` with argv arrays, not shell strings.
- **Secret handling.** Pass secret values via `stdin` (`input` option), never
  via argv.
- **File permissions.** Env files use `0o600`. Referenced secret files accept
  `0o400` or `0o600`.

## Source of Truth

- Tool versions → [`.tool-versions`](./.tool-versions)
- Scripts and Node dependencies → [`package.json`](./package.json)
- Python dependencies → [`pyproject.toml`](./pyproject.toml),
  [`uv.lock`](./uv.lock)
- Lint, format, and staged-file config → [`eslint.config.cts`](./eslint.config.cts),
  [`.prettierrc.cjs`](./.prettierrc.cjs), [`.lintstagedrc.cjs`](./.lintstagedrc.cjs)
- Conventional commit types →
  [`git-conventional-commits.yaml`](./git-conventional-commits.yaml)
- Vitest and coverage configuration → [`vitest.config.ts`](./vitest.config.ts)
- Renovate configuration → [`.github/renovate.json5`](./.github/renovate.json5)

## Maintenance

Update this file when you change the workflows, tools, or conventions it
describes. Update `README.md` for user-facing changes and `CONTRIBUTING.md` for
contributor workflow changes.
