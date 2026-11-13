// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { Command, Option } from "clipanion";

import { exportSecretKey } from "../gpg.js";
import { readPassphrase } from "../passphrase.js";
import { writeError, selectPrimary } from "../select.js";
import type { CommandRunner, PublicKey } from "../types.js";

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

  private writeArmor(key: PublicKey, passphrase: string | undefined): number {
    let armor;
    try {
      armor = exportSecretKey(key.fingerprint, { runner: this.runner, passphrase });
    } catch (e) {
      writeError(e instanceof Error ? e.message : String(e));
      return 1;
    }
    process.stdout.write(armor + "\n");
    return 0;
  }

  private async exportKey(): Promise<number> {
    const selection = selectPrimary(this.keyOption(), this.runner);
    if (selection.status === "fail") return selection.exit;

    const passphrase = this.passphrase ?? (await readPassphrase(process.stdin));
    return this.writeArmor(selection.key, passphrase);
  }

  // Tests construct the command without clipanion's parser, so unset
  // options hold the Option marker, not a string.
  private keyOption(): string | undefined {
    return typeof this.key === "string" ? this.key : undefined;
  }
}
