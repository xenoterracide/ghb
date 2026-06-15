<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

> **Note:** This tool was written for my own workflows. If you find it useful, great — but it comes with no guarantees of support or stability. It is also almost entirely AI-generated.

# ghb-merge

An AI-assisted PR merge workflow tool. It automates the busywork of keeping a branch up to date, generating PR descriptions with an AI engine, waiting for CI, and merging.

This package is a subcommand of `ghb` and is not intended to be used standalone.

## Usage

```bash
# Full merge workflow (default)
ghb merge

# Dry run — show what would happen without making changes
ghb merge --dry-run

# Use a specific AI engine for PR message generation (default is Kimi)
ghb merge --kimi
ghb merge --junie
ghb merge --copilot

# Generate only the PR title/body files
ghb pr-message --title-file title.txt --body-file body.txt
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
- For the Kimi engine: a Moonshot API key configured via the Kimi Code CLI config file (`~/.kimi-code/config.toml`), `--key-file`, or the `KIMI_API_KEY` environment variable
- For Junie or Copilot engines: their respective CLIs

### AI Engine Dependencies

- `ghb merge --kimi` now uses the Vercel AI SDK to call the Moonshot API directly; no `kimi` CLI is required.
- `ghb merge --junie` and `ghb merge --copilot` still require their respective CLIs.

```bash
# Override the Kimi model
ghb merge --kimi --model kimi-latest

# Provide a key file instead of using the Kimi CLI config
# (the file must have permissions 0o600)
ghb merge --kimi --key-file ~/.keys/kimi.txt
```

## License

GPL-3.0-or-later
