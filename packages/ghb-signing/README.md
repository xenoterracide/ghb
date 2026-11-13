<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

> **Note:** This tool was written for my own workflows. If you find it useful, great — but it comes with no guarantees of support or stability. It is also almost entirely AI-generated.

# ghb-signing

The `signing` command family for the `ghb` CLI: check the signing subkey
expiry, renew it, and export the secret key for CI.

This package is a subcommand of `ghb` and is not intended to be used standalone.

## Usage

```bash
# Check the signing subkey expiry
# Prints the subkey fingerprint, expiry date, and days remaining
# Exits 0 when healthy, 1 when expired, inside the renewal window, or a flag
# is invalid, 2 when the key is missing (empty keyring, ambiguous, not found,
# or no signing subkey)
ghb signing check [--key FINGERPRINT] [--days 30]

# Extend the primary key and the signing subkey expiry
# Prints before/after dates for both, then the next step
# Exits 0 on success, 1 on a validation or gpg failure, 2 when the key is
# missing (same forms as check)
ghb signing renew [--key FINGERPRINT] [--duration 1y]

# Export the armored secret key to stdout — pipe it to a file, never to a terminal
printf '%s' "$PASSPHRASE" | ghb signing export > key.asc
# Exits 0 on success, 1 on failure, 2 when the key is missing
ghb signing export [--key FINGERPRINT]
```

## Rules

- `--key` takes a full 40-character fingerprint. Key IDs are rejected.
- The passphrase is read from stdin when piped. On a terminal, `gpg` falls
  back to pinentry.
- `GNUPGHOME` is respected; commands inherit your environment.
- Run `ghb signing check` first in a release workflow; it fails before any
  publish attempt when the subkey is expired or near expiry.
- The exported key belongs in the publishing repo's secrets only. No topic
  fan-out.

## Requirements

- `gpg` on `PATH`
- Node.js 24+

## License

GPL-3.0-or-later
