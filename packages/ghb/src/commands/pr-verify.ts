// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { Command, Option } from "clipanion";
import { execRunner, type Runner } from "../exec.js";

interface Check {
  name: string;
  bucket: string;
}

interface PrView {
  state: string;
  mergeable: string;
  mergeStateStatus: string;
  baseRefName: string;
  headRefName: string;
}

const sleep = async (seconds: number): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, seconds * 1000);
  });
};

export class PrVerifyCommand extends Command {
  public static paths = [["pr", "verify"]];

  public static usage = Command.Usage({
    description: "Verify the current PR is current, mergeable, and green",
  });

  public interval = Option.String("--interval", "10", {
    description: "Seconds between check polls",
  });

  public timeout = Option.String("--timeout", "600", {
    description: "Seconds to wait for pending checks before giving up",
  });

  // Optional runner for testing - uses the real runner if not set
  public runner?: Runner;

  // remaining args forward to gh pr checks; must be declared last
  public forward = Option.Proxy();

  public async execute(): Promise<number> {
    const run = this.runner ?? execRunner;

    const interval = this.toSeconds(this.interval, 10);
    const timeout = this.toSeconds(this.timeout, 600);
    const deadline = Date.now() + timeout * 1000;

    run("git", ["fetch", "--all", "--prune", "--quiet"]);

    let view = this.readView(run);
    if (view === undefined) {
      // the runner already printed gh's stderr
      return 1;
    }

    const failures: string[] = [];

    const [baseLeft = "0"] = run("git", [
      "rev-list",
      "--left-right",
      "--count",
      `origin/${view.baseRefName}...HEAD`,
    ]).split("\t");
    if (Number(baseLeft) > 0) {
      failures.push(`behind base by ${baseLeft} commits`);
    }

    const [ahead = 0, behind = 0] = run("git", [
      "rev-list",
      "--left-right",
      "--count",
      `HEAD...origin/${view.headRefName}`,
    ])
      .split("\t")
      .map(Number);
    if (ahead > 0 && behind > 0) {
      failures.push(`diverged from origin/${view.headRefName}`);
    } else if (ahead > 0) {
      failures.push(`ahead of origin/${view.headRefName} by ${ahead} commits`);
    } else if (behind > 0) {
      failures.push(`behind origin/${view.headRefName} by ${behind} commits`);
    }

    if (view.state !== "OPEN") {
      failures.push(`state: ${view.state}`);
    }

    if (failures.length > 0) {
      for (const failure of failures) {
        console.error(failure);
      }
      return 1;
    }

    // mergeability is computed asynchronously after a push; let UNKNOWN settle
    while (view.mergeable === "UNKNOWN" || view.mergeStateStatus === "UNKNOWN") {
      if (Date.now() >= deadline) {
        console.error(`pending after ${Math.floor(timeout / 60)}m: mergeability`);
        return 2;
      }
      await sleep(interval);
      view = this.readView(run);
      if (view === undefined) {
        return 1;
      }
      if (view.state !== "OPEN") {
        console.error(`state: ${view.state}`);
        return 1;
      }
    }

    if (view.mergeable !== "MERGEABLE") {
      failures.push(`mergeable: ${view.mergeable}`);
    }
    if (view.mergeStateStatus !== "CLEAN") {
      failures.push(`mergeStateStatus: ${view.mergeStateStatus}`);
    }

    if (failures.length > 0) {
      for (const failure of failures) {
        console.error(failure);
      }
      return 1;
    }

    for (;;) {
      // undefined: runless head - gh reported no checks
      let checks: Check[] | undefined;
      try {
        checks = this.readChecks(run);
      } catch {
        // the runner already printed gh's stderr; not a runless head
        return 1;
      }
      if (checks === undefined) {
        if (Date.now() >= deadline) {
          console.error(`pending after ${Math.floor(timeout / 60)}m`);
          return 2;
        }
        await sleep(interval);
        continue;
      }

      const failed = checks.filter((check) => check.bucket === "fail" || check.bucket === "cancel").map((c) => c.name);
      if (failed.length > 0) {
        console.error(`fail: ${failed.join(", ")}`);
        return 1;
      }

      const pending = checks.filter((check) => check.bucket === "pending").map((c) => c.name);
      if (pending.length === 0) {
        console.log("pass");
        return 0;
      }

      if (Date.now() >= deadline) {
        console.error(`pending after ${Math.floor(timeout / 60)}m: ${pending.join(", ")}`);
        return 2;
      }
      await sleep(interval);
    }
  }

  private readView(run: Runner): PrView | undefined {
    try {
      return JSON.parse(
        run("gh", ["pr", "view", "--json", "state,mergeable,mergeStateStatus,baseRefName,headRefName"]),
      ) as PrView;
    } catch {
      return undefined;
    }
  }

  private readChecks(run: Runner): Check[] | undefined {
    try {
      const checks = JSON.parse(run("gh", ["pr", "checks", "--json", "name,bucket", ...this.forwarded()])) as Check[];
      return checks.length > 0 ? checks : undefined;
    } catch (e) {
      const message = `${e instanceof Error ? e.message : String(e)}\n${(e as { stderr?: string }).stderr ?? ""}`;
      if (/no checks reported/i.test(message)) {
        return undefined;
      }
      throw e;
    }
  }

  // before clipanion parses, an option property holds the option spec, not a value
  private forwarded(): string[] {
    return Array.isArray(this.forward) ? this.forward : [];
  }

  private toSeconds(value: string, fallback: number): number {
    const seconds = typeof value === "string" && value !== "" ? Number(value) : Number.NaN;
    return Number.isFinite(seconds) ? seconds : fallback;
  }
}
