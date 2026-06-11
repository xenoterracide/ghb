<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# Project Overview

**ghb** (GitHub Bridge) is a TypeScript CLI devtools monorepo with three
packages:

1. **`@xenoterracide/ghb`** — aggregated `ghb` CLI that composes subcommands from
   the other packages.
2. **`@xenoterracide/ghb-merge`** — AI-assisted PR creation/merge workflow
   (Kimi, Junie, Copilot).
3. **`@xenoterracide/ghb-secrets-sync`** — sync GitHub repository secrets from
   environment variables or local env files.

The repository is REUSE-compliant: every file must carry an SPDX license header.
`lint-staged` adds headers automatically; compliance is checked in CI.

## Project Layout

```text
.
├── packages/
│   ├── ghb/                    # Aggregated CLI
│   ├── ghb-merge/              # AI-assisted merge workflow
│   └── ghb-secrets-sync/       # GitHub secrets sync CLI
├── .share/git/hooks/           # Custom git hooks
├── .github/workflows/          # GitHub Actions
└── root config files           # eslint, vitest, prettier, reuse, etc.
```

## Technology Stack

- **Node.js** `>=24`, **Yarn** 4 PnP workspaces, **TypeScript** 6 — see
  `package.json` and `.tool-versions` for exact versions.
- **Python** `>=3.12` is used only for the `reuse` compliance tool.
- **Testing:** vitest with coverage (see `vitest.config.ts`).
- **Linting/formatting:** eslint, prettier, shfmt — see their config files.

## Key Commands

```bash
# One-time setup
yarn contribute

# Run all checks: eslint, typecheck, tests
yarn check

# Individual commands
yarn test              # tests with coverage
yarn build             # build packages topologically
yarn typecheck         # tsc --noEmit
yarn lint              # eslint + prettier + reuse
yarn lint:eslint
yarn lint:prettier
yarn lint:reuse
```

## Conventions Agents Should Know

- **Conventional commits** are required; see `git-conventional-commits.yaml`.
- **Squash merge** is used. Do not force push.
- **SPDX headers** are required on every file. Do not remove them.
- **Shell safety:** use `execFileSync` with argv arrays, not shell strings.
- **Secret handling:** pass secret values via `stdin` (`input` option), never via
  argv.
- **File permissions:** env files and referenced secret files must be `0o600`.
- **Yarn PnP isolation:** strip PnP loader flags from `NODE_OPTIONS` before
  spawning external Node.js tools (e.g., AI engine binaries).
- **Submodule awareness:** `findMainRepoRoot()` walks up past submodules so git
  operations run in the true repo root.

## Development Setup

1. Ensure `asdf` and `direnv` are installed and allowed.
2. Run `asdf install` (or let `.envrc` run it).
3. Run `yarn contribute` to create `.venv`, sync Python deps, install Node
   dependencies, and configure git hooks.
4. Run `yarn check` to confirm the repo builds, lints, and tests cleanly.
