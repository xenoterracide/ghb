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

# Sync the current branch with its remote and the default branch
# Prints one line: merged N commits, reset to remote, or up to date
# Exits 1 when local and remote diverged, or on a merge conflict
ghb pr sync

# Verify the current PR is current, mergeable, and every check passes
# Prints pass, or one line per failed dimension
# Exits 0 on pass, 1 on failure, 2 when checks stay pending past the timeout
ghb pr verify

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
