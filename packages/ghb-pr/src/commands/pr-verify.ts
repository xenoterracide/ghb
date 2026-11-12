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

  // remaining args (a PR number, URL, or branch) forward to gh; must be
  // declared last. Option.Proxy is unusable here: it routes every token,
  // including the named flags above, into the proxy before they can bind.
  public forward = Option.Rest();

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

    // currency and PR state are local facts; fail fast
    const failures: string[] = this.currencyFailures(run, view);
    if (view.state !== "OPEN") {
      failures.push(`state: ${view.state}`);
    }
    if (failures.length > 0) {
      this.report(failures);
      return 1;
    }

    for (;;) {
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

      // DIRTY and DRAFT never clear on their own; BLOCKED and UNSTABLE are
      // normal while checks run and settle through the poll below
      const permanent: string[] = [];
      if (view.mergeable !== "MERGEABLE") {
        permanent.push(`mergeable: ${view.mergeable}`);
      }
      if (view.mergeStateStatus === "DIRTY" || view.mergeStateStatus === "DRAFT") {
        permanent.push(`mergeStateStatus: ${view.mergeStateStatus}`);
      }
      if (permanent.length > 0) {
        this.report(permanent);
        return 1;
      }

      let checks: Check[] | undefined;
      try {
        checks = this.readChecks(run);
      } catch {
        // the runner already printed gh's stderr; not a runless head
        return 1;
      }

      if (checks === undefined) {
        // runless head: nothing more can arrive once the view is CLEAN
        if (view.mergeStateStatus !== "CLEAN") {
          if (Date.now() >= deadline) {
            console.error(`pending after ${Math.floor(timeout / 60)}m`);
            return 2;
          }
          await sleep(interval);
          continue;
        }
      } else {
        const failed = checks
          .filter((check) => check.bucket === "fail" || check.bucket === "cancel")
          .map((c) => c.name);
        if (failed.length > 0) {
          console.error(`fail: ${failed.join(", ")}`);
          return 1;
        }
        if (checks.some((check) => check.bucket === "pending")) {
          if (Date.now() >= deadline) {
            const pending = checks.filter((check) => check.bucket === "pending").map((c) => c.name);
            console.error(`pending after ${Math.floor(timeout / 60)}m: ${pending.join(", ")}`);
            return 2;
          }
          await sleep(interval);
          continue;
        }
      }

      // candidate pass: the poll may have taken minutes, so re-read the PR
      // and the currency before committing to it
      run("git", ["fetch", "--all", "--prune", "--quiet"]);
      const fresh = this.readView(run);
      if (fresh === undefined) {
        return 1;
      }
      if (fresh.state !== "OPEN") {
        console.error(`state: ${fresh.state}`);
        return 1;
      }
      if (fresh.mergeable === "UNKNOWN" || fresh.mergeStateStatus === "UNKNOWN") {
        view = fresh;
        continue;
      }
      const late: string[] = [];
      if (fresh.mergeable !== "MERGEABLE") {
        late.push(`mergeable: ${fresh.mergeable}`);
      }
      if (fresh.mergeStateStatus !== "CLEAN") {
        late.push(`mergeStateStatus: ${fresh.mergeStateStatus}`);
      }
      if (late.length > 0) {
        // a check queued after our read explains a non-CLEAN view; poll it
        // rather than fail, unless nothing is pending
        let recheck: Check[] | undefined;
        try {
          recheck = this.readChecks(run);
        } catch {
          recheck = undefined;
        }
        const hasPending = recheck?.some((check) => check.bucket === "pending") ?? false;
        if (hasPending) {
          if (Date.now() >= deadline) {
            console.error(`pending after ${Math.floor(timeout / 60)}m`);
            return 2;
          }
          await sleep(interval);
          view = fresh;
          continue;
        }
        this.report(late);
        return 1;
      }
      const currency = this.currencyFailures(run, fresh);
      if (currency.length > 0) {
        this.report(currency);
        return 1;
      }
      console.log("pass");
      return 0;
    }
  }

  private currencyFailures(run: Runner, view: PrView): string[] {
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

    return failures;
  }

  private report(failures: string[]): void {
    for (const failure of failures) {
      console.error(failure);
    }
  }

  private readView(run: Runner): PrView | undefined {
    try {
      return JSON.parse(
        run("gh", [
          "pr",
          "view",
          "--json",
          "state,mergeable,mergeStateStatus,baseRefName,headRefName",
          ...this.forwarded(),
        ]),
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
