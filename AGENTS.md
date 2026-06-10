<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-4.0
SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# Project Overview

This is **ghb** (GitHub Bridge), a TypeScript CLI devtools repository that provides:

1. **AI-assisted PR merge workflows** - Automated PR creation, message generation, and merging using AI tools (Kimi, Junie, GitHub Copilot)
2. **Secrets sync** - CLI tool for syncing GitHub secrets to repositories
3. **License compliance** - REUSE specification compliance for copyright and licensing

The project uses Node.js with Yarn workspaces for package management. Python is kept minimal for REUSE license tooling only.

## Technology Stack

- **Python**: 3.12+ (managed via `uv`)
- **Node.js**: 24.11.1 (managed via `yarn` 4.12.0 with Plug'n'Play)
- **TypeScript**: For tooling scripts (executed via `tsx`)
- **Git**: With custom hooks for workflow automation

## Project Structure

```text
.
├── git/hooks/                  # Custom git hooks
│   ├── commit-msg              # Conventional commits validation
│   ├── post-checkout           # Auto-install deps on branch switch
│   ├── post-merge              # Auto-install deps after merge
│   └── pre-commit              # Lint-staged runner
├── packages/                   # Yarn workspaces
│   ├── ghb/                    # GitHub Bridge root CLI
│   │   ├── src/
│   │   └── package.json
│   ├── ghb-merge/              # AI-assisted merge workflow tool
│   │   ├── merge.ts            # Main TypeScript implementation
│   │   └── package.json
│   └── ghb-secrets-sync/       # GitHub secrets sync CLI
│       ├── src/
│       └── package.json
├── .github/workflows/          # GitHub Actions
├── .share/                     # Symlink to project root (for git hooks path)
├── pyproject.toml              # Python project configuration (PEP 621)
├── package.json                # Root Node.js configuration
├── Makefile                    # Additional workflow commands
└── git-conventional-commits.yaml  # Conventional commits config
```

## Build and Test Commands

```bash
# Run all tests across workspaces
yarn test

# Linting (all)
yarn lint

# Prettier formatting check
yarn lint:prettier

# REUSE license compliance check
yarn lint:reuse

# Setup development environment (run once after clone)
yarn contribute
```

### Python (uv)

```bash
# Sync dependencies
uv sync --frozen

# Install with dev dependencies
uv sync --frozen --group dev
```

### Node.js (yarn)

```bash
# Install dependencies (immutable)
yarn install --immutable

# Update all dependencies
yarn up
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

- **REUSE specification** for license compliance
- **lint-staged** automatically adds headers via `reuse annotate`

## Testing Instructions

1. **TypeScript type checking**: `yarn workspace @xenoterracide/ghb-merge run test` (runs `tsc --noEmit`)
2. **All workspace tests**: `yarn test`
3. **License compliance**: `yarn lint:reuse`
4. **Formatting**: `yarn lint:prettier`

## Git Workflow

### Git Hooks

The project uses custom git hooks (configured via `git config core.hooksPath .share/git/hooks`):

1. **pre-commit**: Runs `lint-staged` to format and add license headers
2. **commit-msg**: Validates conventional commit format via `git-conventional-commits`
3. **post-checkout**: Auto-runs `yarn install` or `uv sync` if lockfiles changed
4. **post-merge**: Same as post-checkout

### Conventional Commits

Allowed types (from `git-conventional-commits.yaml`):

- `ci`, `feat`, `fix`, `perf`, `refactor`, `style`, `test`
- `build`, `ops`, `docs`, `chore`, `merge`, `revert`

### Merge Workflow

The `packages/ghb-merge` tool provides AI-assisted PR workflows:

```bash
# Generate PR message and merge using different AI engines
yarn merge:kimi      # Uses Kimi CLI
yarn merge:junie     # Uses Junie CLI
yarn merge:copilot   # Uses GitHub Copilot CLI
```

#### AI Engine Dependencies

The merge tool declares all three AI CLIs as `optionalDependencies` in
`packages/ghb-merge/package.json`:

| Engine  | npm Package              | Binary    |
| ------- | ------------------------ | --------- |
| Kimi    | `@moonshot-ai/kimi-code` | `kimi`    |
| Junie   | `@jetbrains/junie`       | `junie`   |
| Copilot | `@github/copilot`        | `copilot` |

Optional dependencies are installed by default, but you can skip the ones you
don't need to save disk space and install time:

```bash
# Install only Kimi (skip Junie and Copilot)
npm install -g @xenoterracide/ghb-merge --omit optional
npm install -g @moonshot-ai/kimi-code

# Or with yarn
yarn global add @xenoterracide/ghb-merge --json | jq '.[].name'
# Then add only the engine you want
yarn global add @moonshot-ai/kimi-code
```

If an engine binary is not found, the merge script will fail with a clear error
when you try to use it.

The merge script:

1. Fetches and merges `origin/HEAD`
2. Pushes current branch
3. Creates/updates PR with AI-generated conventional commit message
4. Waits for CI checks
5. Interactive squash merge prompt

### Makefile Commands

```bash
make merge          # Full merge workflow (fetch, push, PR, merge)
make create-pr      # Create/update PR with AI-generated message
make merge-head     # Fetch and merge origin/HEAD
make push           # Push to remote
make watch-full     # Watch GitHub Actions workflow
```

## Security Considerations

1. **CI Detection**: All git hooks check `[ -n "$CI" ]` and exit early in CI environments
2. **GitHub CLI**: Requires `gh` CLI authenticated for PR operations
3. **Lockfile Integrity**: `--immutable` flag ensures lockfiles are not modified unexpectedly
4. **Path Security**: Scripts use `execFileSync` with arrays to prevent command injection

## Development Setup

1. Install prerequisites: `asdf install` (reads `.tool-versions`)
2. Setup environment: `yarn contribute`
   - Installs Node.js dependencies
   - Syncs Python virtual environment
   - Configures git hooks path

## Dependency Management

### Renovate Configuration

Automatic dependency updates via Renovate (`.github/renovate.json5`):

- **npm/asdf**: Weekly on Wednesday (minor/patch auto-merge)
- **pip-compile**: Daily at 03:00 UTC
- **Gradle**: Major updates at 04:00 UTC, settings plugins at 05:00 UTC Wednesday
- **GitHub Actions**: Auto-merge enabled

### Key Files

- `uv.lock` - Python dependency lock
- `yarn.lock` - Node.js dependency lock
- Changes to these trigger automatic sync via git hooks
