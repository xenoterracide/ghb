<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# secrets-sync

A CLI tool for syncing GitHub secrets to repositories.

## Installation

```bash
yarn install
```

## Usage

```bash
# Sync all secrets from env file to current repo
yarn secrets sync --env-file secrets.env

# Sync to specific repo
yarn secrets sync --env-file secrets.env --repo owner/target-repo

# Sync to multiple repos
yarn secrets sync --env-file secrets.env --repo owner/target-1,owner/target-2

# Sync to all repos with a label/topic
yarn secrets sync --env-file secrets.env --label auto-updated

# Sync specific secrets only (from env or env vars)
yarn secrets sync --secrets API_KEY,SECRET --repo owner/target

# Use environment variables directly
export API_KEY="secret-value"
yarn secrets sync --secrets API_KEY
```

## Env File Format

All values **must** use a protocol prefix:

```bash
# Read from environment variable
API_KEY=env:PROD_API_KEY
DATABASE_URL=env:DATABASE_URL

# Read from file (for multi-line values like GPG keys)
GPG_SIGNING_KEY=file:./keys/signing-key.asc
GPG_PUBLIC_KEY=file:///home/user/keys/public.asc

# Literal value
DEBUG_MODE=val:true
PASSWORD=val:my-secret-123
```

### Why require prefixes?

Without prefixes, a password like `pass:word` is ambiguous - is it a `pass` protocol or a literal value? Explicit protocols remove all ambiguity:

```bash
# ERROR: no protocol prefix
PASSWORD=my-secret

# OK: explicit val protocol
PASSWORD=val:my-secret

# OK: explicit file protocol (even if value contains colons)
PASSWORD=val:pass:word
```

### File References

For multi-line secrets like GPG keys, use `file:` with a relative or absolute path:

```bash
# Relative to env file location
GPG_SIGNING_KEY=file:./keys/signing-key.asc

# Absolute path
GPG_PUBLIC_KEY=file:///home/user/.gnupg/public.asc
```

Armored GPG keys are multi-line PEM-like blocks that don't fit well in `.env` files:

```text
-----BEGIN PGP PUBLIC KEY BLOCK-----
...
-----END PGP PUBLIC KEY BLOCK-----
```

Using `file:` references keeps the env file clean and makes it easier to manage keys.

## How It Works

### Important: GitHub Doesn't Allow Reading Secret Values

GitHub's API (and `gh` CLI) only allows listing secret **names** - you cannot read the values back. This means you must provide secret values via:

- Environment variables (matching the secret name)
- `--env-file` with `env:`, `file:`, or `val:` protocols

### Value Resolution Priority

For each secret, values are resolved in this order:

1. **From env file entry:**
   - `env:VAR_NAME` - Read from environment variable
   - `file:./path` or `file:///absolute/path` - Read from file
   - `val:literal` - Use as-is
2. **Environment variable matching secret name**

## Requirements

- GitHub CLI (`gh`) authenticated
- Node.js 24+
- Yarn 4+

## License

GPL-3.0-or-later
