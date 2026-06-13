<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# Contributing

This repository is shared configuration and tooling. Most changes affect
linting, formatting, licensing, or automation across multiple projects.

## Repository overview

- **Git hooks** in `git/hooks/` for conventional commits, lint-staged, and
  automatic dependency syncing.
- **Formatting and linting** via Prettier and REUSE.
- **Conventional commit validation** via `git-conventional-commits`.
- **GitHub Actions workflows** for license, prettier, and node-cli checks.
- **Renovate configuration** for automated dependency updates.

## Setup

```bash
# Install Node.js, Python, and other tools listed in .tool-versions
asdf install

# Install Node dependencies, sync Python environment, and configure git hooks
yarn contribute
```

## Build, Test, and Lint

```bash
# Run all checks (prettier + REUSE)
yarn lint

# Check formatting only
yarn lint:prettier

# Check REUSE license compliance
yarn lint:reuse
```

## Pull Requests

- Follow the project's [conventional commit
  conventions](git-conventional-commits.yaml).
- Update `README.md` if user-facing behavior changes.
- Update `AGENTS.md` if build processes, tools, or agent workflows change.
- Update `CONTRIBUTING.md` if contributor-facing commands or workflows change.
- Ensure all GitHub checks pass before requesting review.

## License

By contributing, you agree to license your work under the project's
[CC-BY-NC-SA-4.0](LICENSES/CC-BY-NC-SA-4.0.txt) license.
