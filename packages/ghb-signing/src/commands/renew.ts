// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { Command, Option } from "clipanion";

import { findSigningSubkey, isValidFingerprint, selectKey } from "../colon.js";
import { listKeys, setExpiry } from "../gpg.js";
import { readPassphrase } from "../passphrase.js";
import type { CommandRunner } from "../types.js";

function formatDate(seconds: number | null): string {
  if (seconds === null) return "never";
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

export class RenewCommand extends Command {
  public static paths = [["signing", "renew"]];

  public static usage = Command.Usage({
    description: "Renew signing subkey expiry",
    details: "Extend the primary key and the signing subkey expiry, then print both before/after dates.",
  });

  public key = Option.String("--key,-k", {
    description: "Full fingerprint of the primary key to renew",
  });

  public duration = Option.String("--duration", "1y", {
    description: "New expiry duration, e.g. 30d, 4w, 6m, 2y",
  });

  public runner?: CommandRunner;

  public passphrase?: string;

  public async execute(): Promise<number> {
    return this.renew();
  }

  private async renew(): Promise<number> {
    const keyOption = typeof this.key === "string" ? this.key : undefined;
    if (keyOption !== undefined && keyOption !== "" && !isValidFingerprint(keyOption)) {
      process.stderr.write(`Error: --key must be a full fingerprint; got "${keyOption}"\n`);
      return 1;
    }

    const durationOption = typeof this.duration === "string" ? this.duration : "1y";
    if (!/^\d+[dwmy]$/.test(durationOption) || Number.parseInt(durationOption, 10) === 0) {
      process.stderr.write(`Error: --duration must be <n>d, <n>w, <n>m, or <n>y; got "${durationOption}"\n`);
      return 1;
    }

    let keys;
    try {
      keys = listKeys({ runner: this.runner });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      process.stderr.write(`Error: ${msg}\n`);
      return 1;
    }

    const selected = selectKey(keys, keyOption);

    if (selected.status === "missing") {
      process.stderr.write("Error: no keys in the keyring\n");
      return 2;
    }

    if (selected.status === "ambiguous") {
      process.stderr.write("Error: multiple keys in the keyring; pass --key with one of:\n");
      for (const key of selected.keys) {
        process.stderr.write(`${key.fingerprint}\n`);
      }
      return 2;
    }

    if (selected.status === "not-found") {
      process.stderr.write(`Error: key ${keyOption} not found\n`);
      return 2;
    }

    const { key } = selected;
    const subkey = findSigningSubkey(key);
    if (subkey === undefined) {
      process.stderr.write(`Error: key ${key.fingerprint} has no signing subkey\n`);
      return 2;
    }

    const passphrase = this.passphrase ?? (await readPassphrase(process.stdin));

    let afterKeys;
    try {
      setExpiry(key.fingerprint, durationOption, undefined, { runner: this.runner, passphrase });
      setExpiry(key.fingerprint, durationOption, subkey.fingerprint, { runner: this.runner, passphrase });
      afterKeys = listKeys({ runner: this.runner });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      process.stderr.write(`Error: ${msg}\n`);
      return 1;
    }

    const afterSelected = selectKey(afterKeys, key.fingerprint);
    if (afterSelected.status !== "ok") {
      process.stderr.write(`Error: key ${key.fingerprint} disappeared after renew\n`);
      return 1;
    }

    const afterSubkey = findSigningSubkey(afterSelected.key);
    if (afterSubkey === undefined) {
      process.stderr.write(`Error: key ${key.fingerprint} has no signing subkey after renew\n`);
      return 1;
    }

    process.stdout.write(
      `primary ${key.fingerprint} expires ${formatDate(afterSelected.key.expiresAt)} (was ${formatDate(key.expiresAt)})\n`,
    );
    process.stdout.write(
      `signing subkey ${subkey.fingerprint} expires ${formatDate(afterSubkey.expiresAt)} (was ${formatDate(subkey.expiresAt)})\n`,
    );
    process.stdout.write(
      "Next: ghb secrets sync --env-file <env-file> --repo <owner/repo>  # push the renewed key to CI\n",
    );
    process.stdout.write("Next: back up the key to Bitwarden\n");
    return 0;
  }
}
