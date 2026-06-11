<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# Project Overview

**ghb** (GitHub Bridge) is a TypeScript CLI devtools monorepo. It ships three
packages:

1. **`@xenoterracide/ghb`** — a single aggregated `ghb` CLI that exposes every
   subcommand from the other two packages.
2. **`@xenoterracide/ghb-merge`** — AI-assisted PR creation/merge workflows
   using Kimi, Junie, or GitHub Copilot to generate conventional-commit PR
   messages.
3. **`@xenoterracide/ghb-secrets-sync`** — sync GitHub repository secrets from
   environment variables or local env files.

The repository is also a REUSE-compliant project: every file must carry an SPDX
license header, and license compliance is checked in CI and via local linting.

## Technology Stack

| Tool        | Version / Requirement | Notes                                                             |
| ----------- | --------------------- | ----------------------------------------------------------------- |
| Node.js     | `>=24`                | See `package.json` `engines`; pinned in `.tool-versions`          |
| Yarn        | See `package.json`    | Plug'n'Play (PnP) workspaces; declared in `packageManager` fields |
| TypeScript  | See `package.json`    | `NodeNext` module resolution, ES2022 target                       |
| Python      | `>=3.12`              | See `pyproject.toml`; pinned in `.tool-versions`                  |
| `uv`        | See `.tool-versions`  | Used for the Python virtualenv and `reuse`                        |
| `asdf`      | See `.tool-versions`  | `asdf install` is run by `.envrc`                                 |
| `clipanion` | See `package.json`    | CLI framework used by all packages                                |
| `vitest`    | See `package.json`    | Test runner with `@vitest/coverage-v8`                            |
| `eslint`    | See `package.json`    | TypeScript-aware strict config                                    |
| `prettier`  | See `package.json`    | With XML, Properties, Java, and TOML plugins                      |
| `reuse`     | See `pyproject.toml`  | Python REUSE compliance tool (dev dependency only)                |

Python is kept minimal: it exists only to run `reuse` for license compliance.

## Project Structure

```text
.
├── packages/
│   ├── ghb/                    # Aggregated CLI (published as @xenoterracide/ghb)
│   │   ├── src/
│   │   │   └── cli.ts          # createCli() registers all commands
│   │   ├── test/
│   │   │   └── cli.test.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── ghb-merge/              # AI-assisted merge workflow
│   │   ├── merge.ts            # Main implementation + standalone CLI
│   │   ├── logger.ts           # Debug/info/warn/error logger
│   │   ├── *.test.ts           # Unit tests
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── ghb-secrets-sync/       # GitHub secrets sync CLI
│       ├── src/
│       │   ├── cli.ts          # Standalone CLI entry point
│       │   ├── index.ts        # Public API exports
│       │   ├── types.ts        # CommandRunner, EnvEntry, SetSecretOptions
│       │   ├── env.ts          # Env file parsing and secret resolution
│       │   ├── github.ts       # gh CLI wrappers
│       │   ├── errors.ts       # UserError
│       │   ├── fs-utils.ts     # 0o600 permission helpers
│       │   ├── logger.ts       # ANSI-colored logger
│       │   └── commands/
│       │       ├── sync.ts
│       │       ├── update.ts
│       │       └── get.ts
│       ├── test/
│       │   ├── env.test.ts
│       │   ├── github.test.ts
│       │   └── commands/
│       │       ├── sync.test.ts
│       │       └── update.test.ts
│       ├── package.json
│       └── tsconfig.json
├── .share/git/hooks/           # Custom git hooks
│   ├── commit-msg              # Conventional commits validation
│   ├── post-checkout           # Auto-install on lockfile changes
│   ├── post-merge              # Auto-install on lockfile changes
│   └── pre-commit              # lint-staged runner
├── .github/workflows/          # GitHub Actions
│   ├── test.yml                # Reusable yarn test workflow
│   ├── pre-commit.yml          # License + prettier reusable workflows
│   ├── devtools-regression.yml # Node CLI regression reusable workflow
│   └── ai-engines.yml          # Installs Copilot/Junie and tests ghb-merge
├── .github/renovate.json5      # Renovate configuration
├── eslint.config.cts           # Root ESLint configuration
├── vitest.config.ts            # Root Vitest workspace configuration
├── tsconfig.eslint.json        # TypeScript project for ESLint type-aware rules
├── .lintstagedrc.cjs           # lint-staged: reuse annotate + format per file type
├── git-conventional-commits.yaml # Conventional commit types
├── pyproject.toml              # Python project (only for reuse)
├── package.json                # Root Yarn workspace configuration
├── REUSE.toml                  # REUSE annotations for generated/lock files
├── .tool-versions              # asdf tool versions
├── .python-version             # uv/Python version hint
└── .envrc                      # direnv: asdf install + PATH + hooks warning
```

## Package Architecture

### `ghb` (root CLI)

- **Package:** `@xenoterracide/ghb`
- **Entry:** `packages/ghb/src/cli.ts`
- **Published binary:** `dist/cli.js`
- **Role:** Composes commands from both workspace packages into a single `ghb`
  binary.
- **Commands registered:**
  - `ghb pr merge`
  - `ghb pr message`
  - `ghb secrets sync`
  - `ghb secrets update`
  - `ghb secrets get`
- The CLI can be exercised locally via `yarn ghb` (runs `tsx src/cli.ts`).

### `ghb-merge`

- **Package:** `@xenoterracide/ghb-merge`
- **Entry:** `packages/ghb-merge/merge.ts`
- **Published entry:** `dist/merge.js` / `dist/merge.d.ts`
- **Role:** AI-assisted PR merge workflow.
- **Key exports:**
  - `MergeCommand` — full workflow
  - `PrMessageCommand` — generate PR title/body files only
  - `resolveEngine()`, `generateMessage()`, `createOrUpdatePR()`,
    `waitForChecks()`, `findMainRepoRoot()`
  - `CommandRunner` interface and `EngineResolutionError`
- **AI engines:**
  - `kimi` — declared as an `optionalDependency` (`@moonshot-ai/kimi-code`)
  - `junie` — supported, must be installed separately (`@jetbrains/junie`)
  - `copilot` — supported, must be installed separately (`@github/copilot`)
  - Defaults to `kimi` when no engine flag is passed.
- The merge workflow:
  1. Resolves the chosen engine.
  2. Fetches and merges `origin/HEAD`.
  3. Pushes the current branch.
  4. Creates or updates the PR with an AI-generated conventional-commit message.
  5. Waits for `gh pr checks --watch`.
  6. Prompts interactively for squash merge (`[Y/n]`).
- Special care is taken to strip Yarn PnP loader flags from `NODE_OPTIONS` before
  spawning AI engine binaries (see `cleanNodeOptions` in `merge.ts`).

### `ghb-secrets-sync`

- **Package:** `@xenoterracide/ghb-secrets-sync`
- **Entry:** `packages/ghb-secrets-sync/src/cli.ts`
- **Public API:** `packages/ghb-secrets-sync/src/index.ts`
- **Published entry:** `dist/index.js` / `dist/index.d.ts`
- **Commands:**
  - `secrets sync` — sync secrets to repos by name, topic/label, or current repo.
  - `secrets update` — add/update a key in a local env file with `0o600` permissions.
  - `secrets get` — resolve and print a secret value.
- **Env file value protocols:**
  - `val:<value>` — literal value
  - `env:<VAR>` — reference to another environment variable
  - `file:<path>` or `file://<path>` — read value from a file
- Values are resolved in priority order:
  1. Explicit `--value` / `--secrets` value
  2. Matching entry from `--env-file`
  3. Environment variable matching the secret name

## Build, Test, and Release Commands

### Root-level scripts

```bash
# One-time setup (creates .venv, syncs Python deps, installs Node deps, sets hooks path)
yarn contribute

# Run all checks in parallel: eslint, typecheck, tests
yarn check

# Tests across all workspaces with coverage
yarn test

# Build all packages topologically (ghb is excluded because it depends on built workspaces)
yarn build

# Type-check all workspaces (after building them)
yarn typecheck

# Linting
yarn lint            # eslint + prettier + reuse
yarn lint:eslint     # ESLint only
yarn lint:prettier   # Prettier check only
yarn lint:reuse      # REUSE license compliance

# Convenience wrappers for the merge workflow
yarn merge:kimi      # yarn ghb pr merge --kimi
yarn merge:junie     # yarn ghb pr merge --junie
yarn merge:copilot   # yarn ghb pr merge --copilot

# Convenience wrapper for secrets commands
yarn secrets         # yarn ghb secrets
```

### Workspace-level scripts

Every package supports:

```bash
yarn workspace @xenoterracide/<pkg> run build       # tsc
yarn workspace @xenoterracide/<pkg> run typecheck   # tsc --noEmit
yarn workspace @xenoterracide/<pkg> run test        # vitest run && tsc --noEmit
```

### Python commands

```bash
uv sync --frozen              # sync base (none)
uv sync --frozen --group dev  # sync reuse
```

### Publishing

Each package has a `prepack` script that runs `yarn build`, so publishing
produces fresh `dist/` artifacts. Packages are published as public npm packages
under the `@xenoterracide` scope.

## Code Style Guidelines

### EditorConfig

- Charset: UTF-8
- Line endings: LF
- Indent: 2 spaces
- Final newline: required

### Prettier

- Print width: 120 characters
- XML whitespace sensitivity: `ignore`
- Plugins: XML, Properties, Java, TOML
- Run check with `yarn lint:prettier`; write with `prettier --cache --write`.

### ESLint

- TypeScript files use `typescript-eslint` `strictTypeChecked` and
  `stylisticTypeChecked` configs.
- Required for TS source:
  - explicit function return types
  - explicit member accessibility
  - consistent type imports/exports
  - strict boolean expressions (root config)
  - switch exhaustiveness
- `packages/**/*.ts` receives relaxed `no-unsafe-*`, `strict-boolean-expressions`,
  and `no-unnecessary-condition` rules due to Yarn PnP resolution behavior.
- CLI entrypoints (`cli.ts`, `merge.ts`, `commands/*.ts`) are exempt from
  `no-console` because they interact with the user via the terminal.

### File licensing and formatting

`lint-staged` (`.lintstagedrc.cjs`) formats files and adds SPDX headers with
`reuse annotate`. The effective mapping is:

| File type                                              | License          | Formatter                      |
| ------------------------------------------------------ | ---------------- | ------------------------------ |
| `*.ts`, `*.mts`, `*.cts`, `*.java`                     | GPL-3.0-or-later | Prettier                       |
| `*.js`, `*.cjs`, `*.yml`                               | MIT              | Prettier                       |
| `package.json`                                         | MIT              | Prettier                       |
| `*.json` (non-package)                                 | CC0-1.0          | Prettier                       |
| `*.md`, `*.adoc`                                       | CC-BY-NC-SA-4.0  | Prettier                       |
| `*.xml`, `*.yaml`, `*.properties`, `*.toml`, `*.json5` | CC0-1.0          | Prettier                       |
| shell scripts                                          | MIT              | `shfmt --write --style python` |

`REUSE.toml` annotates generated files and lockfiles that cannot carry inline
headers (`.gitmodules`, `*.lockfile`, `yarn.lock`, `uv.lock`, `.tool-versions`,
`.python-version`).

## Testing Strategy

### Framework and configuration

- **Runner:** `vitest` configured in `vitest.config.ts`.
- **Workspace projects:**
  - `ghb` — root `./packages/ghb`, includes `**/*.test.ts`
  - `ghb-merge` — root `./packages/ghb-merge`, includes `**/*.test.ts`
  - `ghb-secrets-sync` — root `./packages/ghb-secrets-sync`, includes
    `test/**/*.test.ts`
- **Coverage:** `@vitest/coverage-v8` with thresholds configured in
  `vitest.config.ts`.
- Tests explicitly import `describe`, `it`, `expect`, `vi`, etc. from `vitest`.

### Testing patterns

- **Dependency injection via `CommandRunner`:** production code accepts a
  `runArgv` implementation so tests can pass fake `gh`/`git` runners instead of
  invoking real binaries.
- **Filesystem isolation:** tests that write files use `mkdtempSync` under
  `os.tmpdir()` and clean up in `afterEach`.
- **Process env isolation:** tests that mutate `process.env` restore/delete the
  variables in `afterEach`.
- **Spies/mocks:** use `vi.fn()` from `vitest`.

## Git Workflow

### Git hooks

Hooks live in `.share/git/hooks` and are configured by `yarn contribute` via
`git config core.hooksPath .share/git/hooks`.

- **pre-commit:** runs `lint-staged` (format + SPDX headers).
- **commit-msg:** validates conventional commit format with
  `git-conventional-commits commit-msg-hook`.
- **post-checkout:** on branch checkouts, runs `yarn install --immutable` and/or
  `uv sync --frozen` if `yarn.lock` or `uv.lock` changed.
- **post-merge:** same as post-checkout using `HEAD@{1}` as the previous state.

All hooks exit early in CI (`[ -n "$CI" ]`).

### Conventional Commits

Allowed types from `git-conventional-commits.yaml`:

```text
ci, feat, fix, perf, refactor, style, test, build, ops, docs, chore, merge, revert
```

Changelog types are `feat`, `fix`, `perf`, and `merge`. Commits matching `^WIP `
are ignored.

## CI/CD and Automation

All workflows trigger on `push`.

| Workflow                  | Purpose                                                                                 |
| ------------------------- | --------------------------------------------------------------------------------------- |
| `test.yml`                | Runs the reusable `xenoterracide/github/.github/workflows/yarn.yml` workflow            |
| `pre-commit.yml`          | Runs reusable `license.yml` and `prettier.yml` workflows                                |
| `devtools-regression.yml` | Runs reusable `node-cli.yml` regression workflow                                        |
| `ai-engines.yml`          | Installs `@github/copilot` and `@jetbrains/junie` globally, then runs `ghb-merge` tests |

Reusable workflows are pinned to commit SHAs (see `.github/workflows/*.yml`).

### Renovate

`.github/renovate.json5` enables automatic rebasing and auto-merge for npm,
GitHub Actions, asdf, pyenv, pep621, and maven dependencies. Xenoterracide org
GitHub Actions are pinned to commit SHAs. `.share/**` and `.agents/**` are
ignored because they are managed as subtrees.

## Security Considerations

1. **Shell command safety:** wherever possible the code uses `execFileSync` with
   argv arrays instead of shell strings to avoid injection. `CommandRunner.runArgv`
   is the preferred interface.
2. **Secret handling:** `gh secret set` always receives the secret value via the
   `input` option (stdin), never via command-line arguments.
3. **File permissions:** env files and referenced secret files are checked and
   forced to `0o600` when created or updated. Warnings are emitted for overly
   permissive files.
4. **Submodule awareness:** `findMainRepoRoot()` walks up past submodules
   (detected by a parent `.gitmodules`) so git operations run in the true repo
   root.
5. **Lockfile integrity:**
   - `yarn install --immutable` prevents unexpected `yarn.lock` changes.
   - `uv sync --frozen` prevents unexpected `uv.lock` changes.
6. **CI detection:** all git hooks and the setup script skip behavior when `$CI`
   is set.
7. **PnP isolation:** before spawning AI engine Node processes, `NODE_OPTIONS` is
   scrubbed of Yarn PnP loader flags to prevent module-resolution failures in
   globally installed engines.

## Development Setup

1. Ensure `asdf` and `direnv` are installed and allowed.
2. Run `asdf install` (or let `.envrc` run it).
3. Run `yarn contribute` to create `.venv`, sync Python deps, install Node
   dependencies, and configure git hooks.
4. Run `yarn check` to confirm the repo builds, lints, and tests cleanly.
