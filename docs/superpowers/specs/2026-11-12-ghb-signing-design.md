<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# ghb signing: key lifecycle and secret resolution

Date: 2026-11-12
Status: proposed

## Intent

The Maven Central signing key is required to publish. Its lifecycle — generate,
expire, extend, export, back up, restore — lives in one person's memory. Reminders
do not work, because dismissing one costs nothing. The fix is a command that
contains the procedure and surfaces at the point of use.

## Goals

- `ghb signing check` reports the expiry of the signing subkey and exits non-zero
  inside a warning window.
- `ghb signing renew` extends the primary and the signing subkey, then makes the
  new key available to sync.
- `ghb secrets` exports the signing key from `gpg` at sync time. Keyring reads
  wait for a store backend.
- CI receives the current key on every sync.

## Non-goals

- Local commit signing. The key is CI-only.
- Bitwarden in CI. Bitwarden is personal offsite backup.
- Topic-wide distribution of the private key.
- A vault inside ghb.
- Playwright or any UI automation for PATs.

## Anti-goals

- Writing a secret to a file.
- Passing a secret in argv.
- Extending expiry silently.

## Constraints

- GitHub secrets are write-only. Values come from outside GitHub.
- Maven Central accepts OpenPGP only. GitHub Packages needs none.
- One key, one job.
- The passphrase source is unsettled. This machine runs COSMIC: no Secret Service
  daemon is running, `gnome-keyring-daemon` is installed but has corrupted on
  updates, `keepassxc-cli` is available, and `systemd-creds --with-key=tpm2` fails
  here. A credential store is not a v1 dependency.
- LUKS covers disk theft. A keyring covers readers that do not speak to it. Neither
  covers a process inside the user's session.

## Approaches

1. Check and renew only.
2. Full lifecycle: init, backup, restore-test, publish, install-ci.
3. Port the zsh distribution script.

Pick: 1 now. 2 follows once 1 has been lived with. 3 no: it spreads the private
key across every topic repo.

## Design

### `ghb signing`

- `check [--key FPR] [--days N]` — parse `gpg --list-keys --with-colons`, find the
  `sub:` line with capability `s`, report its expiry. Exit 1 inside the window and
  print the renew command. Exit 2 when the key is missing.
- `renew [--key FPR] [--duration 1y]` — `gpg --quick-set-expire` for the primary and
  the signing subkey, then print the next step.
- `export [--key FPR]` — armored secret key to stdout. Never to a file. The
  passphrase comes from stdin when piped, otherwise from pinentry. The command it
  wraps is:

```bash
gpg --batch --pinentry-mode loopback --passphrase-fd 0 \
    --armor --export-secret-keys <fpr>
```

### `ghb secrets` resolvers

- `gpg:<fpr>` — export the armored secret key during sync. Full fingerprints
  only.
- `keyring:<service>/<account>` — deferred with the store backends.
- `val:` and `file:` remain; both are deprecated for secrets.

### Scoping

- The publishing repo only. No topic fan-out for credentials.
- GitHub Packages publishes with `GITHUB_TOKEN`, so it needs no secret.

## Calls

- TypeScript, in `packages/ghb-signing`, composed into `packages/ghb`. If Java wins,
  this is the pilot port.
- One CI key. No personal signing key.
- No credential store in v1. The passphrase arrives on stdin or through pinentry.
  Store backends come later, if at all: `secret-tool`, `keepassxc-cli`, or a 0600
  file.

## Spike results

Verified against a throwaway `GNUPGHOME`, with no TTY, no session bus, and no
passphrase in argv:

- generated a primary `ed25519 cert 1y` plus a `sign` subkey
- exported the armor with `--passphrase-fd 0`
- `--quick-set-expire <primary-fpr> 2y <subkey-fpr>` moved the subkey expiry
- imported the armor into a fresh `GNUPGHOME`, signed a blob, verified `Good
signature`

Two rules come out of it:

- Parse `fpr:` records for full fingerprints. The key ID in field 5 is not enough;
  `--quick-set-expire` rejects it.
- The signing subkey's expiry is set separately from the primary's. Watch the
  subkey.

## Open

- GitHub Environments on the publishing repo, or repo secrets.
- Credential store backend, if any. `gnome-keyring` has burned you; `keepassxc-cli`
  is installed.
- Bitwarden automation: `restore-test` only, or automated backup.
