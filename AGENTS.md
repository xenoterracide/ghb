<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# share (template-main)

Shared configuration and tooling repository. Uses Node.js-based developer tools
(Prettier, lint-staged, git-conventional-commits) managed via Yarn PnP, with
Python scripting via `uv`.

## Build and Test

- Lint/format: `yarn lint`
- Prettier check: `yarn lint:prettier`
- REUSE compliance: `yarn lint:reuse`
- Setup after clone: `yarn contribute`

## Source of Truth

- Tool versions → `.tool-versions`
- Node scripts and dev dependencies → `package.json`
- Python dependencies → `pyproject.toml`, `uv.lock`
- Conventional commit types → `git-conventional-commits.yaml`
- Renovate configuration → `.github/renovate.json5`

## Conventions

- All files MUST have SPDX license headers.
- lint-staged + git hooks enforce formatting and license annotation.
- Git hooks live in `git/hooks/` and are enabled by `yarn contribute`.

## Maintenance

Update this file when you change workflows or conventions it describes.
