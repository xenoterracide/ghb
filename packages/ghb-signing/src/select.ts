// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { findSigningSubkey, isValidFingerprint, selectKey } from "./colon.js";
import { listKeys } from "./gpg.js";
import type { CommandRunner, PublicKey, SubKey } from "./types.js";

export type PrimarySelection = { status: "ok"; key: PublicKey } | { status: "fail"; exit: number };
export type SigningSelection = { status: "ok"; key: PublicKey; subkey: SubKey } | { status: "fail"; exit: number };

export function writeError(message: string): void {
  process.stderr.write(`Error: ${message}\n`);
}

function fail(exit: number): { status: "fail"; exit: number } {
  return { status: "fail", exit };
}

function writeAmbiguous(keys: PublicKey[]): void {
  writeError("multiple keys in the keyring; pass --key with one of:");
  for (const key of keys) {
    process.stderr.write(`${key.fingerprint}\n`);
  }
}

function primaryFromKeys(keys: PublicKey[], key: string | undefined): PrimarySelection {
  const selected = selectKey(keys, key);

  if (selected.status === "missing") {
    writeError("no keys in the keyring");
    return fail(2);
  }
  if (selected.status === "ambiguous") {
    writeAmbiguous(selected.keys);
    return fail(2);
  }
  if (selected.status === "not-found") {
    // selectKey answers not-found only for a fingerprint that was given
    writeError(`key ${String(key)} not found`);
    return fail(2);
  }
  return { status: "ok", key: selected.key };
}

/**
 * Resolve the primary key a signing command operates on: validate the
 * `--key` fingerprint, list the keyring, apply the selection rules. A
 * `fail` result has already written its error to stderr.
 */
export function selectPrimary(rawKey: string | undefined, runner?: CommandRunner): PrimarySelection {
  // only an omitted --key reads as absent; an explicit empty string is an
  // invalid fingerprint, so `--key "$UNSET_VAR"` can never silently select
  // the sole key in the keyring
  if (rawKey !== undefined && !isValidFingerprint(rawKey)) {
    writeError(`--key must be a full fingerprint; got "${rawKey}"`);
    return fail(1);
  }

  let keys;
  try {
    keys = listKeys({ runner });
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e));
    return fail(1);
  }
  return primaryFromKeys(keys, rawKey);
}

/**
 * As `selectPrimary`, but also resolves the signing subkey; commands
 * that renew or report expiry need the subkey, whose expiry is the one
 * that gates CI signing.
 */
export function selectSigning(rawKey: string | undefined, runner?: CommandRunner): SigningSelection {
  const primary = selectPrimary(rawKey, runner);
  if (primary.status === "fail") {
    return primary;
  }

  // gpg disables a key with D in the primary's capabilities (field 12)
  // while the subkeys keep their own validity; the whole key cannot sign
  if (primary.key.capabilities.toUpperCase().includes("D")) {
    writeError(`key ${primary.key.fingerprint} is disabled`);
    return fail(2);
  }

  const subkey = findSigningSubkey(primary.key);
  if (subkey === undefined) {
    writeError(`key ${primary.key.fingerprint} has no signing subkey`);
    return fail(2);
  }
  return { status: "ok", key: primary.key, subkey };
}
