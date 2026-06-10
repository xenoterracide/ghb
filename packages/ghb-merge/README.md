<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

> **Note:** This tool was written for my own workflows. If you find it useful, great — but it comes with no guarantees of support or stability. It is also almost entirely AI-generated.

# ghb-merge

An AI-assisted PR merge workflow tool. It automates the busywork of keeping a branch up to date, generating PR descriptions with an AI engine, waiting for CI, and merging.

## Installation

```bash
npm install -g @xenoterracide/ghb-merge
```

## Usage

```bash
# Full merge workflow (default)
merge

# Dry run — show what would happen without making changes
merge --dry-run

# Use a specific AI engine for PR message generation (default is Kimi)
merge --kimi
merge --junie
merge --copilot

# Generate only the PR title/body files
merge pr-message --title-file title.txt --body-file body.txt
```

### What the full workflow does

1. Fetches and merges `origin/HEAD` into the current branch
2. Pushes the branch
3. Creates or updates the PR with an AI-generated conventional commit message
4. Waits for GitHub Actions checks to pass
5. Prompts for confirmation and squash-merges the PR

## Requirements

- Git
- GitHub CLI (`gh`) authenticated
- Node.js 24+
- One of: [Kimi CLI](https://www.kimi.com/), [Junie](https://www.jetbrains.com/junie/), or [GitHub Copilot CLI](https://github.com/github/copilot.vim)

### AI Engine Dependencies

The package declares all three AI CLIs as `optionalDependencies`. They are installed by default, but you can skip the ones you don't need:

```bash
# Install only Kimi (skip Junie and Copilot)
npm install -g @xenoterracide/ghb-merge --omit optional
npm install -g @moonshot-ai/kimi-code

# Or install them all (default)
npm install -g @xenoterracide/ghb-merge
```

## License

GPL-3.0-or-later
