<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# Project Overview

This is **ghb** (GitHub Bridge), a TypeScript CLI devtools repository that provides:

1. **AI-assisted PR merge workflows** - Automated PR creation, message generation, and merging using AI tools (Kimi, Junie, GitHub Copilot).
2. **Secrets sync** - CLI tool for syncing GitHub secrets to repositories.
3. **License compliance** - REUSE specification compliance for copyright and licensing.

The project is a Yarn workspace monorepo with three packages. It uses Yarn Plug'n'Play (PnP) instead of `node_modules`, and Python is kept minimal for REUSE license tooling only.

## Technology Stack

- **Node.js**: 24.16.0+ (managed via `asdf`, see `.tool-versions`)
- **Yarn**: 4.16.0 with Plug'n'Play (PnP) workspaces
- **TypeScript**: 6.0+
- **Python**: 3.12+ (managed via `uv`, see `.python-version`)
- **CLI framework**: `clipanion`
- **Test runner**: `vitest` with `@vitest/coverage-v8`
- **Linter**: `eslint` with `typescript-eslint` (strict type-checked configs)
- **Formatter**: `prettier` with plugins for XML, Properties, Java, and TOML
- **License compliance**: `reuse` (Python tool)
- **Git hooks**: Custom shell scripts in `.share/git/hooks/`

## Project Structure

```text
.
├── packages/                   # Yarn workspaces
│   ├── ghb/                    # Root CLI package (published as @xenoterracide/ghb)
│   │   ├── src/cli.ts          # Entry point: composes commands from other packages
│   │   ├── test/
│   │   ├── tsconfig.json
│   │   └── package.json
│   ├── ghb-merge/              # AI-assisted merge workflow (published as @xenoterracide/ghb-merge)
│   │   ├── merge.ts            # Main implementation: commands, AI message generation, git/gh workflows
│   │   ├── logger.ts           # Simple debug/info/warn/error logger
│   │   ├── *.test.ts           # Unit tests
│   │   ├── tsconfig.json
│   │   └── package.json
│   └── ghb-secrets-sync/       # GitHub secrets sync CLI (published as @xenoterracide/ghb-secrets-sync)
│       ├── src/
│       │   ├── cli.ts          # CLI entry point
│       │   ├── index.ts        # Public API exports
│       │   ├── types.ts        # Shared interfaces (CommandRunner, EnvEntry, SetSecretOptions)
│       │   ├── env.ts          # Env file parsing and secret value resolution
│       │   ├── github.ts       # gh CLI wrappers for repo/secret operations
│       │   ├── errors.ts       # UserError class for user-facing errors
│       │   ├── fs-utils.ts     # File permission helpers (secure 0o600)
│       │   ├── logger.ts       # ANSI-colored structured logger
│       │   └── commands/
│       │       ├── sync.ts     # Sync secrets to repos
│       │       ├── update.ts   # Update secrets in local env files
│       │       └── get.ts      # Resolve and print a secret value
│       ├── test/
│       ├── tsconfig.json
│       └── package.json
├── .share/git/hooks/           # Custom git hooks
│   ├── commit-msg              # Conventional commits validation
│   ├── post-checkout           # Auto-install deps on branch switch if lockfiles changed
│   ├── post-merge              # Auto-install deps after merge if lockfiles changed
│   └── pre-commit              # lint-staged runner
├── .github/workflows/          # GitHub Actions
│   ├── test.yml                # Runs yarn test via reusable workflow
│   ├── pre-commit.yml          # License and prettier checks
│   └── devtools-regression.yml # Node CLI regression tests
├── .github/renovate.json5      # Renovate configuration
├── eslint.config.cts           # Root ESLint configuration (strict TS rules)
├── vitest.config.ts            # Root Vitest workspace configuration
├── tsconfig.eslint.json        # TypeScript project for ESLint type-aware rules
├── .lintstagedrc.cjs           # lint-staged: reuse annotate + prettier per file type
├── git-conventional-commits.yaml # Conventional commits config
├── pyproject.toml              # Python project configuration (PEP 621)
├── package.json                # Root Node.js workspace configuration
└── REUSE.toml                  # REUSE license annotations for generated/lock files
```

## Package Architecture

### `ghb` (root CLI)

- **Purpose**: Aggregates all subcommands into a single `ghb` binary.
- **Entry**: `src/cli.ts` exports `createCli()` which registers `MergeCommand`, `PrMessageCommand`, `SyncCommand`, `UpdateCommand`, `GetCommand`.
- **Dependencies**: Both workspace packages (`ghb-merge`, `ghb-secrets-sync`) and `clipanion`.
- **Published as**: `@xenoterracide/ghb` with binary `dist/cli.js`.

### `ghb-merge`

- **Purpose**: AI-assisted PR merge workflow.
- **Entry**: `merge.ts` (single-file module).
- **Key exports**:
  - `MergeCommand` - Full workflow: fetch/merge origin/HEAD, push, create/update PR, wait for checks, interactive squash merge.
  - `PrMessageCommand` - Generate PR title/body files using an AI engine.
  - `resolveEngine()`, `generateMessage()`, `createOrUpdatePR()`, `waitForChecks()`, `findMainRepoRoot()`.
- **AI Engines**: Supports `kimi`, `junie`, `copilot`. Only `kimi` is installed by default as an optional dependency; `junie` and `copilot` must be installed separately. Defaults to `kimi` if none specified.
- **Security**: Uses `execFileSync` with argv arrays to avoid shell injection. Secret values passed via stdin.
- **Published as**: `@xenoterracide/ghb-merge`.

### `ghb-secrets-sync`

- **Purpose**: Sync GitHub repository secrets from environment variables or env files.
- **Entry**: `src/cli.ts` for standalone use; `src/index.ts` for programmatic API.
- **Commands**:
  - `secrets sync` - Sync secrets to one or more repos (by name, label/topic, or current repo).
  - `secrets update` - Add/update a key in a local env file with `0o600` permissions.
  - `secrets get` - Resolve and print a secret value.
- **Env File Protocols**: Values in env files use prefixes:
  - `val:` - literal value
  - `env:` - reference to another environment variable
  - `file:` - read value from a file path
- **Security**: `setSecret` passes values via stdin to `gh secret set` (never via argv). Env files enforce `0o600` permissions.
- **Published as**: `@xenoterracide/ghb-secrets-sync`.

## Build and Test Commands

### Root-level commands

```bash
# Setup development environment (run once after clone)
yarn contribute

# Run all tests across workspaces with coverage
yarn test

# Run all checks in parallel (eslint, typecheck, test)
yarn check

# Linting
yarn lint              # All: eslint + prettier + reuse
yarn lint:eslint       # ESLint only
yarn lint:prettier     # Prettier check only
yarn lint:reuse        # REUSE license compliance

# Build all packages topologically
yarn build

# Type-check all workspaces
yarn typecheck
```

### Workspace-level commands

Each package supports:

```bash
yarn workspace @xenoterracide/ghb run test        # vitest run + tsc --noEmit
yarn workspace @xenoterracide/ghb run build       # tsc
yarn workspace @xenoterracide/ghb run typecheck   # tsc --noEmit
```

Same pattern for `@xenoterracide/ghb-merge` and `@xenoterracide/ghb-secrets-sync`.

### Python (uv)

```bash
# Sync dependencies (only dev group has reuse)
uv sync --frozen

# Sync with dev dependencies
uv sync --frozen --group dev
```

## Code Style Guidelines

### EditorConfig (`.editorconfig`)

- **Charset**: UTF-8
- **Line endings**: LF
- **Indent**: 2 spaces
- **Final newline**: Required

### Prettier (`.prettierrc.cjs`)

- **Print width**: 120 characters
- **XML whitespace sensitivity**: ignore
- **Plugins**: XML, Properties, Java, TOML

### ESLint (`eslint.config.cts`)

- TypeScript files use `strictTypeChecked` and `stylisticTypeChecked` configs.
- Enforces explicit return types, member accessibility, consistent type imports/exports, strict boolean expressions, and switch exhaustiveness.
- Packages receive relaxed rules for `no-unsafe-*`, `strict-boolean-expressions`, and `no-unnecessary-condition` due to PnP resolution behavior.
- CLI entrypoints (`cli.ts`, `merge.ts`, `commands/*.ts`) are exempt from `no-console`.

### File Type Conventions

| File Type                              | License          | Formatter            |
| -------------------------------------- | ---------------- | -------------------- |
| `*.ts`, `*.java`                       | GPL-3.0-or-later | Prettier             |
| `*.js`, `*.cjs`, `*.yml`               | MIT              | Prettier             |
| `package.json`                         | MIT              | Prettier             |
| `*.json` (non-package)                 | CC0-1.0          | Prettier             |
| `*.md`, `*.adoc`                       | CC-BY-NC-SA-4.0  | Prettier             |
| `*.xml`, `*.yaml`, `*.toml`, `*.json5` | CC0-1.0          | Prettier             |
| Shell scripts                          | MIT              | shfmt (python style) |

### Licensing

All files MUST have SPDX license headers. The project uses:

- **REUSE specification** for license compliance.
- **lint-staged** automatically adds headers via `reuse annotate`.
- The `REUSE.toml` file annotates generated files and lockfiles that cannot carry inline headers.

## Testing Instructions

### Test Framework

- **Vitest** with `globals: true` and `environment: "node"`.
- Root `vitest.config.ts` defines three workspace projects (`ghb`, `ghb-merge`, `ghb-secrets-sync`).
- Coverage thresholds: **28%** minimum for statements, branches, functions, and lines.

### Running Tests

```bash
# All workspaces with coverage
yarn test

# Individual workspace
yarn workspace @xenoterracide/ghb-secrets-sync run test
```

### Testing Patterns

- **Dependency injection via `CommandRunner`**: Tests pass fake `runArgv` implementations instead of calling real `gh` or `git` binaries.
- **Filesystem isolation**: Tests that write files use `mkdtempSync` under `os.tmpdir()` and clean up in `afterEach`.
- **Process env isolation**: Tests mutate `process.env` but restore the original in `afterEach`.
- **Mocking**: Uses `vi.fn()` from vitest for spies and mocks.

## Git Workflow

### Git Hooks

The project uses custom git hooks (configured via `git config core.hooksPath .share/git/hooks`):

1. **pre-commit**: Runs `lint-staged` to format and add license headers.
2. **commit-msg**: Validates conventional commit format via `git-conventional-commits`.
3. **post-checkout**: Auto-runs `yarn install --immutable` or `uv sync --frozen` if lockfiles changed.
4. **post-merge**: Same as post-checkout.

All hooks exit early in CI environments (`[ -n "$CI" ]`).

### Conventional Commits

Allowed types (from `git-conventional-commits.yaml`):

- `ci`, `feat`, `fix`, `perf`, `refactor`, `style`, `test`
- `build`, `ops`, `docs`, `chore`, `merge`, `revert`

### Merge Workflow

The `ghb pr merge` command provides AI-assisted PR workflows:

```bash
# Generate PR message and merge using different AI engines
yarn merge:kimi      # Uses Kimi CLI
yarn merge:junie     # Uses Junie CLI
yarn merge:copilot   # Uses GitHub Copilot CLI
```

#### AI Engine Dependencies

The `ghb-merge` package declares only Kimi as an `optionalDependency`. Junie and Copilot are supported engines but must be installed separately because their npm packages are too large for the default install graph:

| Engine  | npm Package              | Binary    | Installed by default? |
| ------- | ------------------------ | --------- | --------------------- |
| Kimi    | `@moonshot-ai/kimi-code` | `kimi`    | Yes (optional)        |
| Junie   | `@jetbrains/junie`       | `junie`   | No                    |
| Copilot | `@github/copilot`        | `copilot` | No                    |

To install Kimi only:

```bash
npm install -g @xenoterracide/ghb --omit optional
npm install -g @moonshot-ai/kimi-code
```

To use Junie or Copilot, install them globally:

```bash
npm install -g @jetbrains/junie
npm install -g @github/copilot
```

If an engine binary is not found, the merge script will fail with a clear error when you try to use it.

The merge script:

1. Fetches and merges `origin/HEAD`.
2. Pushes the current branch.
3. Creates/updates PR with AI-generated conventional commit message.
4. Waits for CI checks via `gh pr checks --watch`.
5. Interactive squash merge prompt (`[Y/n]`).

## Security Considerations

1. **CI Detection**: All git hooks check `[ -n "$CI" ]` and exit early in CI environments.
2. **GitHub CLI**: Requires `gh` CLI authenticated for PR and secret operations.
3. **Lockfile Integrity**:
   - `yarn install --immutable` ensures `yarn.lock` is not modified unexpectedly.
   - `uv sync --frozen` ensures `uv.lock` is not modified unexpectedly.
4. **Path Security**: Scripts use `execFileSync` with arrays to prevent command injection. Never concatenate user input into shell commands.
5. **Secret Handling**: `gh secret set` receives values via `stdin` (using `input` option) so secrets never appear in process arguments.
6. **File Permissions**: Env files and secret files are checked/enforced to `0o600`. Warnings are emitted if files are overly permissive.
7. **Submodule Awareness**: `findMainRepoRoot()` walks up past submodules to find the true repository root, preventing operations in the wrong git context.

## Development Setup

1. Install prerequisites: `asdf install` (reads `.tool-versions`).
2. Setup environment: `yarn contribute`
   - Creates `.venv` if missing.
   - Syncs Python virtual environment.
   - Installs Node.js dependencies.
   - Configures git hooks path.

## Dependency Management

### Renovate Configuration

Automatic dependency updates via Renovate (`.github/renovate.json5`):

- **npm/asdf/pyenv/pep621/github-actions**: Auto-merge enabled with rebase strategy.
- **xenoterracide org GitHub Actions**: Pinned to commit SHAs for reproducibility.
- **Ignored paths**: `.share/**`, `.agents/**` (subtree-managed).

### Key Files

- `uv.lock` - Python dependency lock.
- `yarn.lock` - Node.js dependency lock (managed by Yarn PnP).
- Changes to these trigger automatic sync via git hooks.
