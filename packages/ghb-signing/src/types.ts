// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Interface for executing external commands.
 * Allows for dependency injection in tests.
 */
export interface CommandRunner {
  runArgv: (
    cmd: string,
    args: string[],
    opts?: { cwd?: string; env?: Record<string, string>; input?: string },
  ) => string;
}

/**
 * A subkey parsed from `gpg --list-keys --with-colons` output.
 */
export interface SubKey {
  /** colon field 2: u n m f r e d i (- for unknown) */
  validity: string;
  /** colon field 5 */
  keyId: string;
  /** fpr record, field 10 */
  fingerprint: string;
  /** colon field 12: e s c a */
  capabilities: string;
  /** colon field 6, unix seconds */
  createdAt: number;
  /** colon field 7; null = never expires */
  expiresAt: number | null;
}

/**
 * A primary key parsed from `gpg --list-keys --with-colons` output,
 * with its subkeys.
 */
export interface PublicKey {
  validity: string;
  keyId: string;
  fingerprint: string;
  capabilities: string;
  createdAt: number;
  expiresAt: number | null;
  subkeys: SubKey[];
}

/**
 * Result of selecting a key from a list of parsed keys.
 */
export type KeySelection =
  | { status: "ok"; key: PublicKey }
  | { status: "missing" }
  | { status: "ambiguous"; keys: PublicKey[] }
  | { status: "not-found" };
