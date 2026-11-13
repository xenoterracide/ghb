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
- **`@xenoterracide/ghb-signing`** — `signing check`, `renew`, and `export`:
  OpenPGP signing key lifecycle for CI publishing.

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the repository layout, setup, and
contributor workflow.

## Key Commands

- `npm run contribute` — bootstrap tooling (run once after clone); heals the
  toolchain through `.config/git/hooks/heal.sh`
- `pnpm check` — prettier, eslint, typecheck, and tests
- `pnpm lint` — eslint, prettier, and reuse
- `pnpm lint:eslint` — ESLint check
- `pnpm build` — build every package topologically
- `pnpm test` — vitest with coverage across the workspace

## Source of Truth

Read these files instead of trusting a copy of their contents here. Versions
and rules drift; these do not.

| For                                             | See                                                                                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Install, update, usage, contribution            | [`README.md`](./README.md), [`CONTRIBUTING.md`](./CONTRIBUTING.md)                                                             |
| Tool versions (Node, Python, shfmt, shellcheck) | [`.tool-versions`](./.tool-versions)                                                                                           |
| pnpm version and workspace layout               | `packageManager` in [`package.json`](./package.json), [`pnpm-workspace.yaml`](./pnpm-workspace.yaml)                           |
| Scripts and root Node dependencies              | [`package.json`](./package.json)                                                                                               |
| Per-package scripts and dependencies            | `packages/*/package.json`                                                                                                      |
| Python dependencies                             | [`pyproject.toml`](./pyproject.toml), [`uv.lock`](./uv.lock)                                                                   |
| Lint, format, and staged-file config            | [`eslint.config.cts`](./eslint.config.cts), [`.prettierrc.yml`](./.prettierrc.yml), [`.lintstagedrc.cjs`](./.lintstagedrc.cjs) |
| Conventional commit types                       | [`git-conventional-commits.yaml`](./git-conventional-commits.yaml)                                                             |
| Vitest and coverage configuration               | [`vitest.config.ts`](./vitest.config.ts)                                                                                       |
| Template and answers                            | [xenoterracide/base-template](https://github.com/xenoterracide/base-template), [`.copier-answers.yml`](./.copier-answers.yml)  |
| Renovate configuration                          | [`.github/renovate.json5`](./.github/renovate.json5)                                                                           |

Template updates land with `uv run --group dev copier update --trust`; conflicts
appear as `.rej` files. Hooks heal the toolchain: `.envrc`, `contribute`, and
the post hooks call `.config/git/hooks/heal.sh`. A failed heal never breaks a
checkout.

## Conventions

- **Conventional commits.** See
  [`git-conventional-commits.yaml`](./git-conventional-commits.yaml).
- **Squash merge.** Do not force push.
- **Plan tracking.** Tick a plan's checkboxes as its tasks complete; the
  committed plan is the completion record.
- **SPDX headers on every file.** `lint-staged` adds them. CI checks
  compliance. Do not remove them.
- **Shell safety.** Use `execFileSync` with argv arrays, not shell strings.
- **Secret handling.** Pass secret values via `stdin` (`input` option), never
  via argv.
- **File permissions.** Env files use `0o600`. Referenced secret files accept
  `0o400` or `0o600`.

## Maintenance

Update this file when you change the workflows, tools, or conventions it
describes. Update `README.md` for user-facing changes and `CONTRIBUTING.md` for
contributor workflow changes.
