<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# Contributing

Thank you for your interest in improving `ghb`. This repository is a TypeScript
monorepo managed with Yarn 4 PnP workspaces.

## Repository Overview

- **`packages/ghb/`** — aggregated CLI entrypoint.
- **`packages/ghb-merge/`** — AI-assisted PR merge workflow.
- **`packages/ghb-secrets-sync/`** — GitHub secrets sync utilities.
- **`.share/`** — shared tooling imported as a git subtree; see
  [`.share/CONTRIBUTING.md`](./.share/CONTRIBUTING.md) for subtree conventions.
- **`.github/workflows/`** — CI workflows.

## Setup

1. Ensure `asdf` and `direnv` are installed and allowed.
2. Run `asdf install` (or let `.envrc` run it).
3. Run `yarn contribute` to create `.venv`, sync Python deps, install Node
   dependencies, and configure git hooks.

## Build, Test, and Lint

```bash
# Run all checks
yarn check

# Individual commands
yarn test              # tests with coverage
yarn build             # build packages topologically
yarn typecheck         # build, then typecheck all workspaces
yarn lint              # eslint + prettier + reuse
yarn lint:eslint
yarn lint:prettier
yarn lint:reuse
```

## Pull Requests

- Follow the project's [conventional commit
  conventions](git-conventional-commits.yaml).
- Use squash merge. Do not force push.
- Update `README.md` for user-facing behavior changes.
- Update `AGENTS.md` for build processes, tools, or agent workflows.
- Update `CONTRIBUTING.md` for contributor-facing commands or workflows.
- Ensure every file has an SPDX license header.
- Ensure all GitHub checks pass before requesting review.

## License

By contributing, you agree to license your work under the project's
[CC-BY-NC-SA-4.0](LICENSES/CC-BY-NC-SA-4.0.txt) license.
