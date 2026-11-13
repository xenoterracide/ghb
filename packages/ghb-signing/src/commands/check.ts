// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { Command, Option } from "clipanion";

import { writeError, selectSigning } from "../select.js";
import type { CommandRunner, PublicKey, SubKey } from "../types.js";

function formatDate(seconds: number): string {
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

function daysUntil(expiresAt: number): number {
  const now = Math.floor(Date.now() / 1000);
  return Math.floor((expiresAt - now) / 86400);
}

interface ExpiryReport {
  subkey: SubKey;
  date: string;
  days: number;
  windowDays: number;
  primaryFpr: string;
}

function reportExpired(report: ExpiryReport): number {
  writeError(`signing subkey ${report.subkey.fingerprint} expired ${report.date} (${-report.days} days ago)`);
  process.stderr.write(`Run: ghb signing renew --key ${report.primaryFpr}\n`);
  return 1;
}

function reportWithinWindow(report: ExpiryReport): number {
  writeError(
    `signing subkey ${report.subkey.fingerprint} expires ${report.date} (${report.days} days; within ${report.windowDays} days)`,
  );
  process.stderr.write(`Run: ghb signing renew --key ${report.primaryFpr}\n`);
  return 1;
}

function reportExpiry(key: PublicKey, subkey: SubKey, windowDays: number): number {
  if (subkey.expiresAt === null) {
    process.stdout.write(`signing subkey ${subkey.fingerprint} never expires\n`);
    return 0;
  }

  const report: ExpiryReport = {
    subkey,
    date: formatDate(subkey.expiresAt),
    days: daysUntil(subkey.expiresAt),
    windowDays,
    primaryFpr: key.fingerprint,
  };

  if (report.days < 0) {
    return reportExpired(report);
  }
  if (report.days <= windowDays) {
    return reportWithinWindow(report);
  }

  process.stdout.write(`signing subkey ${subkey.fingerprint} expires ${report.date} (${report.days} days)\n`);
  return 0;
}

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

  private parseWindowDays(): number | undefined {
    const option = typeof this.days === "string" ? this.days : "30";
    if (!/^\d+$/.test(option)) {
      writeError(`--days must be a number; got "${option}"`);
      return undefined;
    }
    return Number.parseInt(option, 10);
  }

  private check(): number {
    const windowDays = this.parseWindowDays();
    if (windowDays === undefined) return 1;

    const selection = selectSigning(this.keyOption(), this.runner);
    if (selection.status === "fail") return selection.exit;

    return reportExpiry(selection.key, selection.subkey, windowDays);
  }

  // Tests construct the command without clipanion's parser, so unset
  // options hold the Option marker, not a string.
  private keyOption(): string | undefined {
    return typeof this.key === "string" ? this.key : undefined;
  }
}
