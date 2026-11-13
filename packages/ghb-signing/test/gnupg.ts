// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { execFileSync } from "child_process";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { findSigningSubkey, parseColonKeys } from "../src/colon.js";

export function createGnupgHome(): string {
  return mkdtempSync(join(tmpdir(), "ghb-signing-"));
}

export function generateSigningKey(
  home: string,
  passphrase: string,
  expiry = "1y",
): { primaryFpr: string; subkeyFpr: string } {
  const uid = `Ghb Signing Test <test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid>`;
  const loopbackArgs = ["--batch", "--pinentry-mode", "loopback", "--passphrase-fd", "0"];
  const env = { ...process.env, GNUPGHOME: home };

  execFileSync("gpg", [...loopbackArgs, "--quick-generate-key", uid, "ed25519", "cert", expiry], {
    encoding: "utf8",
    env,
    input: passphrase,
  });

  const [primaryKey] = parseColonKeys(execFileSync("gpg", ["--list-keys", "--with-colons"], { encoding: "utf8", env }));
  const primaryFpr = primaryKey.fingerprint;

  execFileSync("gpg", [...loopbackArgs, "--quick-add-key", primaryFpr, "ed25519", "sign", expiry], {
    encoding: "utf8",
    env,
    input: passphrase,
  });

  const keysAfterSubkey = parseColonKeys(
    execFileSync("gpg", ["--list-keys", "--with-colons"], { encoding: "utf8", env }),
  );
  const subkey = findSigningSubkey(keysAfterSubkey[0]);
  if (subkey === undefined) {
    throw new Error("signing subkey missing after key generation");
  }
  const subkeyFpr = subkey.fingerprint;

  return { primaryFpr, subkeyFpr };
}
