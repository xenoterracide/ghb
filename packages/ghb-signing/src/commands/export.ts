// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { Command, Option } from "clipanion";

import { isValidFingerprint, selectKey } from "../colon.js";
import { exportSecretKey, listKeys } from "../gpg.js";
import { readPassphrase } from "../passphrase.js";
import type { CommandRunner } from "../types.js";

export class ExportCommand extends Command {
  public static paths = [["signing", "export"]];

  public static usage = Command.Usage({
    description: "Export the armored secret key",
    details: "Print the armored secret key of the primary key to stdout; pipe it to a file, never to a terminal.",
  });

  public key = Option.String("--key,-k", {
    description: "Full fingerprint of the primary key to export",
  });

  public runner?: CommandRunner;

  public passphrase?: string;

  public async execute(): Promise<number> {
    return this.exportKey();
  }

  private async exportKey(): Promise<number> {
    const keyOption = typeof this.key === "string" ? this.key : undefined;
    if (keyOption !== undefined && keyOption !== "" && !isValidFingerprint(keyOption)) {
      process.stderr.write(`Error: --key must be a full fingerprint; got "${keyOption}"\n`);
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

    const passphrase = this.passphrase ?? (await readPassphrase(process.stdin));

    let armor;
    try {
      armor = exportSecretKey(key.fingerprint, { runner: this.runner, passphrase });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      process.stderr.write(`Error: ${msg}\n`);
      return 1;
    }

    process.stdout.write(armor + "\n");
    return 0;
  }
}
