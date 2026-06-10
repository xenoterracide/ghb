<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

> **Note:** This tool was written for my own workflows. If you find it useful, great — but it comes with no guarantees of support or stability. It is also almost entirely AI-generated.

# ghb

GitHub Bridge — a unified CLI for GitHub workflow automation.

## Installation

```bash
npm install -g @xenoterracide/ghb
```

## Usage

```bash
# Show help
ghb --help

# AI-assisted PR merge workflow
ghb merge
ghb merge --dry-run
ghb merge --kimi
ghb merge --junie
ghb merge --copilot

# Generate PR title/body files
ghb pr-message --title-file title.txt --body-file body.txt

# Sync GitHub secrets
ghb sync --env-file secrets.env
ghb sync --secrets API_KEY --repo owner/target

# Update secrets in an env file
ghb update --env-file secrets.env --key API_KEY --value env:PROD_API_KEY

# Get a secret value
ghb get --name API_KEY
```

## License

GPL-3.0-or-later
