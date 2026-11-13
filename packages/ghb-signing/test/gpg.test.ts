// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { execFileSync, spawnSync } from "child_process";
import { rmSync, writeFileSync } from "fs";
import { join } from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { findSigningSubkey } from "../src/colon.js";
import { exportSecretKey, listKeys, setExpiry } from "../src/gpg.js";
import type { CommandRunner, PublicKey, SubKey } from "../src/types.js";
import { createGnupgHome, generateSigningKey } from "./gnupg.js";

// Real `gpg --list-keys --with-colons` output, captured from gpg 2.4.9
// (an ed25519 `cert` primary plus an ed25519 `sign` subkey).
const FIXTURE = `tru::1:1794537422:1826073421:3:1:5
pub:u:255:22:32BF5B09B5329853:1794537421:1826073421::u:::cSC:::::ed25519:::0:
fpr:::::::::E2161DBFFA7E2C4ED8A6DC8032BF5B09B5329853:
uid:u::::1794537421::13D53EB7B1B52BD56CEF553F7EED2E413F86F513::Plan Test <plan@example.invalid>::::::::::0:
sub:u:255:22:C3C46C6F2A3408CC:1794537422:1826073422:::::s:::::ed25519::
fpr:::::::::C17EB30E70FBD586F5794285C3C46C6F2A3408CC:`;

const PRIMARY_FPR = "E2161DBFFA7E2C4ED8A6DC8032BF5B09B5329853";
const SUBKEY_FPR = "C17EB30E70FBD586F5794285C3C46C6F2A3408CC";

interface RecordedCall {
  cmd: string;
  args: string[];
  opts?: { cwd?: string; env?: Record<string, string>; input?: string };
}

function createFakeRunner(responses: readonly string[]): CommandRunner & { calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  return {
    calls,
    runArgv(
      cmd: string,
      args: string[],
      opts?: { cwd?: string; env?: Record<string, string>; input?: string },
    ): string {
      calls.push({ cmd, args, opts });
      return responses[calls.length - 1] ?? "";
    },
  };
}

function firstKey(keys: PublicKey[]): PublicKey {
  const [key] = keys;
  return key;
}

function signingSubkey(key: PublicKey): SubKey {
  const subkey = findSigningSubkey(key);
  if (subkey === undefined) {
    throw new Error("expected a signing subkey");
  }
  return subkey;
}

describe("gpg unit", () => {
  it("exports with a passphrase using loopback argv and fd0 input", () => {
    const runner = createFakeRunner(["-----BEGIN PGP PRIVATE KEY BLOCK-----"]);
    exportSecretKey(PRIMARY_FPR, { runner, passphrase: "secret" });
    expect(runner.calls).toHaveLength(1);
    expect(runner.calls[0]).toEqual({
      cmd: "gpg",
      args: [
        "--batch",
        "--pinentry-mode",
        "loopback",
        "--passphrase-fd",
        "0",
        "--armor",
        "--export-secret-keys",
        PRIMARY_FPR,
      ],
      opts: { input: "secret" },
    });
  });

  it("exports without a passphrase and omits loopback flags", () => {
    const runner = createFakeRunner(["-----BEGIN PGP PRIVATE KEY BLOCK-----"]);
    exportSecretKey(PRIMARY_FPR, { runner });
    expect(runner.calls).toHaveLength(1);
    expect(runner.calls[0]).toEqual({
      cmd: "gpg",
      args: ["--armor", "--export-secret-keys", PRIMARY_FPR],
      opts: undefined,
    });
  });

  it("throws when the runner returns empty armor", () => {
    const runner = createFakeRunner([""]);
    expect(() => exportSecretKey(PRIMARY_FPR, { runner })).toThrow(
      "Failed to export secret key E2161DBFFA7E2C4ED8A6DC8032BF5B09B5329853: gpg exported no key",
    );
  });

  it("setExpiry moves the primary only", () => {
    const runner = createFakeRunner([""]);
    setExpiry(PRIMARY_FPR, "2y", undefined, { runner, passphrase: "secret" });
    expect(runner.calls[0]?.args).toEqual([
      "--batch",
      "--pinentry-mode",
      "loopback",
      "--passphrase-fd",
      "0",
      "--quick-set-expire",
      PRIMARY_FPR,
      "2y",
    ]);
  });

  it("setExpiry appends subkey fingerprint", () => {
    const runner = createFakeRunner([""]);
    setExpiry(PRIMARY_FPR, "2y", SUBKEY_FPR, { runner, passphrase: "secret" });
    expect(runner.calls[0]?.args).toEqual([
      "--batch",
      "--pinentry-mode",
      "loopback",
      "--passphrase-fd",
      "0",
      "--quick-set-expire",
      PRIMARY_FPR,
      "2y",
      SUBKEY_FPR,
    ]);
  });

  it("listKeys parses the fake runner output", () => {
    const runner = createFakeRunner([FIXTURE]);
    const keys = listKeys({ runner });
    expect(keys).toHaveLength(1);
    expect(keys[0]?.fingerprint).toBe(PRIMARY_FPR);
  });

  it("listKeys returns an empty array for an empty keyring", () => {
    const runner = createFakeRunner([""]);
    const keys = listKeys({ runner });
    expect(keys).toEqual([]);
  });
});

describe("gpg integration", () => {
  const PASS = "correct horse battery staple";
  let home: string;

  beforeEach(() => {
    home = createGnupgHome();
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  it("lists the generated key and its signing subkey", () => {
    const { primaryFpr, subkeyFpr } = generateSigningKey(home, PASS);
    const keys = listKeys({ env: { GNUPGHOME: home } });
    expect(firstKey(keys).fingerprint).toBe(primaryFpr);
    expect(signingSubkey(firstKey(keys)).fingerprint).toBe(subkeyFpr);
  });

  it("exports an armored key that still signs after import", () => {
    const { primaryFpr } = generateSigningKey(home, PASS);
    const armored = exportSecretKey(primaryFpr, { env: { GNUPGHOME: home }, passphrase: PASS });
    expect(armored).toContain("BEGIN PGP PRIVATE KEY BLOCK");

    const home2 = createGnupgHome();
    try {
      execFileSync("gpg", ["--batch", "--pinentry-mode", "loopback", "--import"], {
        encoding: "utf8",
        env: { ...process.env, GNUPGHOME: home2 },
        input: armored,
      });

      const blob = join(home2, "blob.txt");
      const sig = join(home2, "blob.txt.sig");
      writeFileSync(blob, "hello world");

      execFileSync(
        "gpg",
        [
          "--batch",
          "--pinentry-mode",
          "loopback",
          "--passphrase-fd",
          "0",
          "--detach-sign",
          "-u",
          primaryFpr,
          "--output",
          sig,
          blob,
        ],
        {
          encoding: "utf8",
          env: { ...process.env, GNUPGHOME: home2 },
          input: PASS,
        },
      );

      const verifyResult = spawnSync("gpg", ["--verify", sig, blob], {
        encoding: "utf8",
        env: { ...process.env, GNUPGHOME: home2 },
      });
      expect(verifyResult.status).toBe(0);
      expect(verifyResult.stderr).toContain("Good signature");
    } finally {
      rmSync(home2, { recursive: true, force: true });
    }
  });

  it("setExpiry moves the primary only, then the subkey", () => {
    const { primaryFpr, subkeyFpr } = generateSigningKey(home, PASS, "5y");
    const env = { GNUPGHOME: home };

    const initialKeys = listKeys({ env });
    const initialPrimaryExpires = firstKey(initialKeys).expiresAt;
    const initialSubkeyExpires = signingSubkey(firstKey(initialKeys)).expiresAt;

    setExpiry(primaryFpr, "2y", undefined, { env, passphrase: PASS });
    let keys = listKeys({ env });
    expect(firstKey(keys).expiresAt).not.toBe(initialPrimaryExpires);
    expect(signingSubkey(firstKey(keys)).expiresAt).toBe(initialSubkeyExpires);

    setExpiry(primaryFpr, "2y", subkeyFpr, { env, passphrase: PASS });
    keys = listKeys({ env });
    expect(signingSubkey(firstKey(keys)).expiresAt).not.toBe(initialSubkeyExpires);
  });

  it("a wrong passphrase throws", () => {
    const { primaryFpr } = generateSigningKey(home, PASS);
    expect(() => exportSecretKey(primaryFpr, { env: { GNUPGHOME: home }, passphrase: "wrong" })).toThrow(
      "Failed to export secret key",
    );
  });
});
