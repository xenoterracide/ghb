<!--
SPDX-FileCopyrightText: Copyright © 2015-2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# ghb

GitHub Bridge — TypeScript CLI devtools and utilities for GitHub workflow automation.

## Installation

```bash
npm install -g @xenoterracide/ghb
```

Requires Node.js 24+ and the [GitHub CLI](https://cli.github.com/) (`gh`)
authenticated.

Until the first npm publish, the registry install above does not work —
install a local build instead; see
[Local Build](CONTRIBUTING.md#local-build) in CONTRIBUTING.

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
ghb pr verify [--interval SECONDS] [--timeout SECONDS] [PR NUMBER | URL | BRANCH]

# Sync GitHub secrets from an env file
ghb secrets sync --env-file secrets.env
ghb secrets sync --env-file secrets.env --repo owner/target
ghb secrets sync --secrets API_KEY,SECRET --repo owner/target

# Update a secret value in an env file
ghb secrets update --file secrets.env --key API_KEY --value env:PROD_API_KEY

# Get a secret value
ghb secrets get API_KEY
```

See the package READMEs for more detail:

- [`packages/ghb`](./packages/ghb/README.md) — the `ghb` CLI
- [`packages/ghb-pr`](./packages/ghb-pr/README.md) — `pr sync` and `pr verify`
- [`packages/ghb-secrets-sync`](./packages/ghb-secrets-sync/README.md) — secrets sync

## Development

- See [`AGENTS.md`](./AGENTS.md) for guidance for AI coding agents.
- See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for human contributor guidance.

## License

[CC-BY-NC-SA-4.0](LICENSES/CC-BY-NC-SA-4.0.txt)
