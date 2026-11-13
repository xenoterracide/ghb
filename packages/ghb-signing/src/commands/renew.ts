// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { Command, Option } from "clipanion";

import { findSigningSubkey, selectKey } from "../colon.js";
import { listKeys, setExpiry } from "../gpg.js";
import { readPassphrase } from "../passphrase.js";
import { writeError, selectSigning } from "../select.js";
import type { CommandRunner, PublicKey, SubKey } from "../types.js";

function formatDate(seconds: number | null): string {
  if (seconds === null) return "never";
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

function writeRenewal(before: KeyPair, after: KeyPair): void {
  process.stdout.write(
    `primary ${before.key.fingerprint} expires ${formatDate(after.key.expiresAt)} (was ${formatDate(before.key.expiresAt)})\n`,
  );
  process.stdout.write(
    `signing subkey ${before.subkey.fingerprint} expires ${formatDate(after.subkey.expiresAt)} (was ${formatDate(before.subkey.expiresAt)})\n`,
  );
  process.stdout.write(
    "Next: ghb secrets sync --env-file <env-file> --repo <owner/repo>  # push the renewed key to CI\n",
  );
  process.stdout.write("Next: back up the key to Bitwarden\n");
}

interface KeyPair {
  key: PublicKey;
  subkey: SubKey;
}

interface Renewal {
  duration: string;
  passphrase: string | undefined;
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

  private parseDuration(): string | undefined {
    const option = typeof this.duration === "string" ? this.duration : "1y";
    if (!/^\d+[dwmy]$/.test(option) || Number.parseInt(option, 10) === 0) {
      writeError(`--duration must be <n>d, <n>w, <n>m, or <n>y; got "${option}"`);
      return undefined;
    }
    return option;
  }

  private extend(key: PublicKey, subkey: SubKey, renewal: Renewal): number {
    const opts = { runner: this.runner, passphrase: renewal.passphrase };
    try {
      setExpiry(key.fingerprint, renewal.duration, undefined, opts);
      setExpiry(key.fingerprint, renewal.duration, subkey.fingerprint, opts);
      const afterKeys = listKeys(opts);
      return this.reportRenewed(key, subkey, afterKeys);
    } catch (e) {
      writeError(e instanceof Error ? e.message : String(e));
      return 1;
    }
  }

  private reportRenewed(key: PublicKey, subkey: SubKey, afterKeys: PublicKey[]): number {
    const afterSelected = selectKey(afterKeys, key.fingerprint);
    if (afterSelected.status !== "ok") {
      writeError(`key ${key.fingerprint} disappeared after renew`);
      return 1;
    }

    const afterSubkey = findSigningSubkey(afterSelected.key);
    if (afterSubkey === undefined) {
      writeError(`key ${key.fingerprint} has no signing subkey after renew`);
      return 1;
    }

    writeRenewal({ key, subkey }, { key: afterSelected.key, subkey: afterSubkey });
    return 0;
  }

  private async renew(): Promise<number> {
    const duration = this.parseDuration();
    if (duration === undefined) return 1;

    const selection = selectSigning(this.keyOption(), this.runner);
    if (selection.status === "fail") return selection.exit;

    const passphrase = this.passphrase ?? (await readPassphrase(process.stdin));
    return this.extend(selection.key, selection.subkey, { duration, passphrase });
  }

  // Tests construct the command without clipanion's parser, so unset
  // options hold the Option marker, not a string.
  private keyOption(): string | undefined {
    return typeof this.key === "string" ? this.key : undefined;
  }
}
