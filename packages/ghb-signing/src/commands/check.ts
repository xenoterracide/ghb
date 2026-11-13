// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { Command, Option } from "clipanion";

import { findSigningSubkey, isValidFingerprint, selectKey } from "../colon.js";
import { listKeys } from "../gpg.js";
import type { CommandRunner } from "../types.js";

export class CheckCommand extends Command {
  public static paths = [["signing", "check"]];

  public static usage = Command.Usage({
    description: "Check signing subkey expiry",
    details: "Report the signing subkey expiry and warn when it is inside the renewal window.",
  });

  public key = Option.String("--key,-k", {
    description: "Full fingerprint of the primary key to check",
  });

  public days = Option.String("--days,-d", "30", {
    description: "Renewal window in days",
  });

  public runner?: CommandRunner;

  // eslint-disable-next-line @typescript-eslint/require-await -- clipanion requires a Promise even for synchronous commands.
  public async execute(): Promise<number> {
    return this.check();
  }

  private check(): number {
    const keyOption = typeof this.key === "string" ? this.key : undefined;
    if (keyOption !== undefined && keyOption !== "" && !isValidFingerprint(keyOption)) {
      process.stderr.write(`Error: --key must be a full fingerprint; got "${keyOption}"\n`);
      return 1;
    }

    const daysOption = typeof this.days === "string" ? this.days : "30";
    if (!/^\d+$/.test(daysOption)) {
      process.stderr.write(`Error: --days must be a number; got "${daysOption}"\n`);
      return 1;
    }
    const windowDays = Number.parseInt(daysOption, 10);

    const keys = listKeys({ runner: this.runner });
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

    if (subkey.expiresAt === null) {
      process.stdout.write(`signing subkey ${subkey.fingerprint} never expires\n`);
      return 0;
    }

    const now = Math.floor(Date.now() / 1000);
    const days = Math.floor((subkey.expiresAt - now) / 86400);
    const date = new Date(subkey.expiresAt * 1000).toISOString().slice(0, 10);

    if (days < 0) {
      process.stderr.write(`Error: signing subkey ${subkey.fingerprint} expired ${date} (${-days} days ago)\n`);
      process.stderr.write(`Run: ghb signing renew --key ${key.fingerprint}\n`);
      return 1;
    }

    if (days <= windowDays) {
      process.stderr.write(
        `Error: signing subkey ${subkey.fingerprint} expires ${date} (${days} days; within ${windowDays} days)\n`,
      );
      process.stderr.write(`Run: ghb signing renew --key ${key.fingerprint}\n`);
      return 1;
    }

    process.stdout.write(`signing subkey ${subkey.fingerprint} expires ${date} (${days} days)\n`);
    return 0;
  }
}
