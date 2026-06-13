<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# ghb

GitHub Bridge — TypeScript CLI devtools and utilities for GitHub workflow automation.

## Installation

```bash
npm install -g @xenoterracide/ghb
```

Requires Node.js 24+ and the GitHub CLI (`gh`) authenticated.

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

# Sync GitHub secrets from an env file
ghb sync --env-file secrets.env
ghb sync --env-file secrets.env --repo owner/target
ghb sync --secrets API_KEY,SECRET --repo owner/target

# Update a secret value in an env file
ghb update --env-file secrets.env --key API_KEY --value env:PROD_API_KEY

# Get a secret value
ghb get --name API_KEY
```

See the package READMEs for more detail:

- [`packages/ghb-merge`](./packages/ghb-merge/README.md) — PR merge workflow
- [`packages/ghb-secrets-sync`](./packages/ghb-secrets-sync/README.md) — secrets sync

## Development

- See [`AGENTS.md`](./AGENTS.md) for guidance for AI coding agents.
- See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for human contributor guidance.

## License

[CC-BY-NC-SA-4.0](LICENSES/CC-BY-NC-SA-4.0.txt)
