// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { Command, Option } from "clipanion";
import {
  currencyFailures,
  failedNames,
  lateFailures,
  pendingNames,
  permanentFailures,
  readChecks,
  readView,
  somePending,
  stateFailure,
} from "../pr-gates.js";
import type { Check, PrView } from "../pr-gates.js";
import { execRunner, type Runner } from "../exec.js";

// the fixed facts of one verification run: how to run commands and how
// long polling may take
interface Polling {
  run: Runner;
  interval: number;
  timeout: number;
  deadline: number;
}

// a poll step returns an exit code, or the view to continue polling with;
// undefined means the step passed and the next stage should run
type Outcome = PrView | number | undefined;

const sleep = async (seconds: number): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, seconds * 1000);
  });
};

function expired(polling: Polling): boolean {
  return Date.now() >= polling.deadline;
}

function pendingExit(polling: Polling, detail = ""): number {
  const suffix = detail === "" ? "" : `: ${detail}`;
  console.error(`pending after ${Math.floor(polling.timeout / 60)}m${suffix}`);
  return 2;
}

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
    const timeout = this.toSeconds(this.timeout, 600);
    const polling: Polling = {
      run,
      interval: this.toSeconds(this.interval, 10),
      timeout,
      deadline: Date.now() + timeout * 1000,
    };
    run("git", ["fetch", "--all", "--prune", "--quiet"]);
    const view = readView(run, this.forwarded());
    if (view === undefined) {
      // the runner already printed gh's stderr
      return 1;
    }
    const exit = this.failFast(run, view);
    if (exit !== undefined) {
      return exit;
    }
    return await this.poll(polling, view);
  }

  // currency and PR state are local facts; fail fast
  private failFast(run: Runner, view: PrView): number | undefined {
    const failures = currencyFailures(run, view);
    if (view.state !== "OPEN") {
      failures.push(stateFailure(view));
    }
    if (failures.length > 0) {
      this.report(failures);
      return 1;
    }
    return undefined;
  }

  private async poll(polling: Polling, view: PrView): Promise<number> {
    let current = view;
    for (;;) {
      const settled = await this.settleMergeability(polling, current);
      if (typeof settled === "number") {
        return settled;
      }
      const outcome = await this.settleChecks(polling, settled);
      if (typeof outcome === "number") {
        return outcome;
      }
      if (outcome !== undefined) {
        current = outcome;
        continue;
      }
      const confirmed = await this.confirmPass(polling);
      if (typeof confirmed === "number") {
        return confirmed;
      }
      current = confirmed;
    }
  }

  // mergeability is computed asynchronously after a push; let UNKNOWN settle
  private async settleMergeability(polling: Polling, view: PrView): Promise<PrView | number> {
    let current = view;
    while (current.mergeable === "UNKNOWN" || current.mergeStateStatus === "UNKNOWN") {
      if (expired(polling)) {
        return pendingExit(polling, "mergeability");
      }
      await sleep(polling.interval);
      const next = readView(polling.run, this.forwarded());
      if (next === undefined) {
        return 1;
      }
      if (next.state !== "OPEN") {
        console.error(stateFailure(next));
        return 1;
      }
      current = next;
    }
    return current;
  }

  private async settleChecks(polling: Polling, view: PrView): Promise<Outcome> {
    const permanent = permanentFailures(view);
    if (permanent.length > 0) {
      this.report(permanent);
      return 1;
    }
    let checks: Check[] | undefined;
    try {
      checks = readChecks(polling.run, this.forwarded());
    } catch {
      // the runner already printed gh's stderr; not a runless head
      return 1;
    }
    if (checks === undefined) {
      return this.settleRunless(polling, view);
    }
    const failed = failedNames(checks);
    if (failed.length > 0) {
      console.error(`fail: ${failed.join(", ")}`);
      return 1;
    }
    return this.settlePending(polling, checks, view);
  }

  // runless head: nothing more can arrive once the view is CLEAN
  private async settleRunless(polling: Polling, view: PrView): Promise<Outcome> {
    if (view.mergeStateStatus === "CLEAN") {
      return undefined;
    }
    if (expired(polling)) {
      return pendingExit(polling);
    }
    await sleep(polling.interval);
    return view;
  }

  private async settlePending(polling: Polling, checks: Check[], view: PrView): Promise<Outcome> {
    const pending = pendingNames(checks);
    if (pending.length === 0) {
      return undefined;
    }
    if (expired(polling)) {
      return pendingExit(polling, pending.join(", "));
    }
    await sleep(polling.interval);
    return view;
  }

  // candidate pass: the poll may have taken minutes, so re-read the PR and
  // the currency before committing to it
  private async confirmPass(polling: Polling): Promise<PrView | number> {
    polling.run("git", ["fetch", "--all", "--prune", "--quiet"]);
    const fresh = readView(polling.run, this.forwarded());
    if (fresh === undefined) {
      return 1;
    }
    if (fresh.state !== "OPEN") {
      console.error(stateFailure(fresh));
      return 1;
    }
    if (fresh.mergeable === "UNKNOWN" || fresh.mergeStateStatus === "UNKNOWN") {
      return fresh;
    }
    const late = lateFailures(fresh);
    if (late.length > 0) {
      return this.handleLate(polling, late, fresh);
    }
    return this.currencyExit(polling.run, fresh);
  }

  // a check queued after our read explains a non-CLEAN view; poll it
  // rather than fail, unless nothing is pending
  private async handleLate(polling: Polling, late: string[], fresh: PrView): Promise<PrView | number> {
    let recheck: Check[] | undefined;
    try {
      recheck = readChecks(polling.run, this.forwarded());
    } catch {
      recheck = undefined;
    }
    if (somePending(recheck)) {
      if (expired(polling)) {
        return pendingExit(polling);
      }
      await sleep(polling.interval);
      return fresh;
    }
    this.report(late);
    return 1;
  }

  private currencyExit(run: Runner, fresh: PrView): number {
    const failures = currencyFailures(run, fresh);
    if (failures.length > 0) {
      this.report(failures);
      return 1;
    }
    console.log("pass");
    return 0;
  }

  private report(failures: string[]): void {
    for (const failure of failures) {
      console.error(failure);
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
