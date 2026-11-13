// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import type { KeySelection, PublicKey, SubKey } from "./types.js";

// Field indices within a `pub`/`sub` record of `gpg --list-keys --with-colons`
// output; the fields are documented 1-based, arrays are 0-based.
const VALIDITY = 1;
const KEY_ID = 4;
const CREATED_AT = 5;
const EXPIRES_AT = 6;
const CAPABILITIES = 11;
// The `fpr` record's fingerprint field; it follows its `pub` or `sub` record.
const FINGERPRINT = 9;

function toUnixSeconds(field: string | undefined): number | null {
  if (field === undefined || field === "") return null;
  return Number.parseInt(field, 10);
}

function parseKeyRecord(fields: readonly string[]): Omit<SubKey, "fingerprint"> {
  return {
    validity: fields[VALIDITY] ?? "",
    keyId: fields[KEY_ID] ?? "",
    capabilities: fields[CAPABILITIES] ?? "",
    createdAt: toUnixSeconds(fields[CREATED_AT]) ?? 0,
    expiresAt: toUnixSeconds(fields[EXPIRES_AT]),
  };
}

interface ParseState {
  keys: PublicKey[];
  key: PublicKey | undefined;
  subkey: SubKey | undefined;
}

function startKey(state: ParseState, fields: readonly string[]): void {
  state.key = {
    ...parseKeyRecord(fields),
    fingerprint: "",
    subkeys: [],
  };
  state.keys.push(state.key);
  state.subkey = undefined;
}

function addSubkey(state: ParseState, fields: readonly string[]): void {
  if (state.key === undefined) return;
  state.subkey = { ...parseKeyRecord(fields), fingerprint: "" };
  state.key.subkeys.push(state.subkey);
}

function attachFingerprint(state: ParseState, fingerprint: string): void {
  if (state.subkey !== undefined) {
    state.subkey.fingerprint = fingerprint;
  } else if (state.key !== undefined) {
    state.key.fingerprint = fingerprint;
  }
}

function applyRecord(state: ParseState, fields: string[]): void {
  switch (fields[0]) {
    case "pub": {
      startKey(state, fields);
      break;
    }
    case "sub": {
      addSubkey(state, fields);
      break;
    }
    case "fpr": {
      attachFingerprint(state, fields[FINGERPRINT] ?? "");
      break;
    }
    default:
      break;
  }
}

/**
 * Parse `gpg --list-keys --with-colons` output into public keys with
 * their subkeys. Every record type other than `pub`, `sub`, and `fpr`
 * (for example `tru` and `uid`) is skipped.
 */
export function parseColonKeys(colonOutput: string): PublicKey[] {
  const state: ParseState = { keys: [], key: undefined, subkey: undefined };

  for (const line of colonOutput.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    applyRecord(state, trimmed.split(":"));
  }

  return state.keys;
}

/**
 * Whether the value is a full fingerprint: 40 hex characters (v4) or
 * 64 hex characters (v6), case-insensitive.
 */
export function isValidFingerprint(value: string): boolean {
  return /^[0-9a-f]{40}$|^[0-9a-f]{64}$/i.test(value);
}

// a revoked or disabled subkey can never sign again; gpg keeps `s` in its
// capabilities, so capability alone would select it. expired stays usable
// here: expiry is the condition check reports and renew extends
const unusable = (subkey: SubKey): boolean => subkey.validity === "r" || subkey.validity === "d";

/**
 * The key's signing-capable, usable subkey; among candidates, the one
 * created most recently. `s` matches case-insensitively.
 */
export function findSigningSubkey(key: PublicKey): SubKey | undefined {
  let best: SubKey | undefined;
  for (const subkey of key.subkeys) {
    if (unusable(subkey) || !subkey.capabilities.toLowerCase().includes("s")) continue;
    if (!best || subkey.createdAt > best.createdAt) best = subkey;
  }
  return best;
}

/**
 * Select a key from parsed keys: with a fingerprint, the one key whose
 * fingerprint matches case-insensitively; without one, the sole key.
 * No keys is `missing`, several is `ambiguous`, no match is `not-found`.
 */
export function selectKey(keys: PublicKey[], fingerprint?: string): KeySelection {
  if (fingerprint !== undefined) {
    const wanted = fingerprint.toLowerCase();
    const matches = keys.filter((key) => key.fingerprint.toLowerCase() === wanted);
    if (matches.length === 1) return { status: "ok", key: matches[0] };
    if (matches.length === 0) return { status: "not-found" };
    return { status: "ambiguous", keys: matches };
  }

  if (keys.length === 0) return { status: "missing" };
  if (keys.length === 1) return { status: "ok", key: keys[0] };
  return { status: "ambiguous", keys };
}
