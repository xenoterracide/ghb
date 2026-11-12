// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { Command, Option } from "clipanion";
import { execRunner, type Runner } from "../exec.js";

export type Bucket = "pass" | "skipping" | "fail" | "cancel" | "pending";

export interface RollupContext {
  name?: string; // CheckRun
  context?: string; // StatusContext name
  state?: string; // StatusContext: EXPECTED ERROR FAILURE PENDING SUCCESS
  status?: string; // CheckRun: QUEUED IN_PROGRESS COMPLETED
  conclusion?: string; // CheckRun: SUCCESS FAILURE ERROR TIMED_OUT ACTION_REQUIRED CANCELLED SKIPPED NEUTRAL
  startedAt?: string | null;
  workflowName?: string;
}

export interface Check {
  name: string; // CheckRun name, StatusContext context
  bucket: Bucket;
  started: boolean; // every in-flight run of this name started on a runner
}

// gh's own bucketing: statuses carry their state, runs collapse either their
// conclusion (completed) or their status (queued, running) into one
export function bucketOf(context: RollupContext): Bucket {
  const state = context.state ?? (context.status === "COMPLETED" ? context.conclusion : context.status) ?? "";
  switch (state) {
    case "SUCCESS":
      return "pass";
    case "SKIPPED":
    case "NEUTRAL":
      return "skipping";
    case "ERROR":
    case "FAILURE":
    case "TIMED_OUT":
    case "ACTION_REQUIRED":
      return "fail";
    case "CANCELLED":
      return "cancel";
    default:
      // EXPECTED, REQUESTED, WAITING, QUEUED, PENDING, IN_PROGRESS, STALE
      return "pending";
  }
}

// when a run reached its runner; a run that never did has no startedAt, and
// an unparseable timestamp must not outrank a real one
const startOf = (context: RollupContext): number => {
  if (context.startedAt === undefined || context.startedAt === null) {
    return Number.NEGATIVE_INFINITY;
  }
  const at = Date.parse(context.startedAt);
  return Number.isNaN(at) ? Number.NEGATIVE_INFINITY : at;
};

// every run of one check name, folded as the rollup is read
interface Group {
  name: string;
  pending: boolean; // a run in flight may still pass, so it outranks finished runs
  pendingStarted: boolean; // every in-flight run reached a runner, not just the queue
  bucket: Bucket; // newest finished run's verdict, pending until one exists
  started: boolean; // whether the newest finished run reached a runner
  newestAt: number | undefined; // its startedAt, so a later finish supersedes it
}

// one Check per named group: statuses group under their context, runs under
// their name within their workflow, so two workflows naming a check the same
// stay distinct. an in-flight run wins the name — the re-queue it represents
// may still pass — otherwise the newest finished run decides, which is what
// gh's eliminateDuplicates means to do under cli/cli#14371
export function summarize(rollup: RollupContext[] | null | undefined): Check[] {
  const groups = new Map<string, Group>();

  for (const context of rollup ?? []) {
    // nul can never appear in a GitHub name, so the nul-separated keys cannot
    // collide across the status and check namespaces
    const hasContext = context.context !== undefined && context.context !== "";
    const name = context.name ?? context.context ?? "";
    const key = hasContext ? `status\0${context.context}` : `check\0${name}\0${context.workflowName ?? ""}`;

    let group = groups.get(key);
    if (group === undefined) {
      group = {
        name,
        pending: false,
        pendingStarted: true,
        bucket: "pending",
        started: false,
        newestAt: undefined,
      };
      groups.set(key, group);
    }

    const bucket = bucketOf(context);
    const at = startOf(context);
    if (bucket === "pending") {
      group.pending = true;
      group.pendingStarted &&= at !== Number.NEGATIVE_INFINITY;
    } else if (group.newestAt === undefined || at > group.newestAt) {
      group.newestAt = at;
      group.bucket = bucket;
      group.started = at !== Number.NEGATIVE_INFINITY;
    }
  }

  const checks: Check[] = [];
  for (const group of groups.values()) {
    checks.push(
      group.pending
        ? { name: group.name, bucket: "pending", started: group.pendingStarted }
        : { name: group.name, bucket: group.bucket, started: group.started },
    );
  }
  return checks;
}

interface PrView {
  state: string;
  mergeable: string;
  mergeStateStatus: string;
  baseRefName: string;
  headRefName: string;
  statusCheckRollup?: RollupContext[] | null | undefined;
}

// the poll timeout names what held out: checks that reached a runner first,
// then any that never left the queue; a runless head names nothing
const pendingLine = (timeout: number, pending: Check[]): string => {
  const started = pending.filter((check) => check.started).map((check) => check.name);
  const queued = pending.filter((check) => !check.started).map((check) => check.name);
  const segments: string[] = [];
  if (started.length > 0) {
    segments.push(started.join(", "));
  }
  if (queued.length > 0) {
    segments.push(`queued: ${queued.join(", ")}`);
  }
  const listed = segments.length > 0 ? `: ${segments.join("; ")}` : "";
  return `pending after ${Math.floor(timeout / 60)}m${listed}`;
};

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

    // the seconds after a push: GitHub creates check runs asynchronously, so
    // the rollup can read empty while the view already reads CLEAN. a runless
    // CLEAN view is only trusted once three straight reads see it; any poll
    // that sees anything else restarts the count
    let cleanRuns = 0;

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

      // one read per poll: the rollup rides in the view
      const checks = summarize(view.statusCheckRollup);
      const failed = checks
        .filter((check) => check.bucket === "fail" || check.bucket === "cancel")
        .map((check) => check.name);
      if (failed.length > 0) {
        console.error(`fail: ${failed.join(", ")}`);
        return 1;
      }

      const pending = checks.filter((check) => check.bucket === "pending");
      const runless = checks.length === 0;
      cleanRuns = runless && view.mergeStateStatus === "CLEAN" ? cleanRuns + 1 : 0;

      // queued and running checks, a runless view that is not yet CLEAN, and
      // a runless CLEAN view inside its grace are all waited out alike
      if (pending.length > 0 || (runless && cleanRuns < 3)) {
        if (Date.now() >= deadline) {
          console.error(pendingLine(timeout, pending));
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
        continue;
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
        // a check queued after our read explains a non-CLEAN fresh view, and
        // an empty rollup may only mean runs do not exist yet; poll both, and
        // fail only once the fresh rollup is terminal
        const freshChecks = summarize(fresh.statusCheckRollup);
        const freshPending = freshChecks.filter((check) => check.bucket === "pending");
        if (freshPending.length > 0 || freshChecks.length === 0) {
          if (Date.now() >= deadline) {
            console.error(pendingLine(timeout, freshPending));
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
          "state,mergeable,mergeStateStatus,baseRefName,headRefName,statusCheckRollup",
          ...this.forwarded(),
        ]),
      ) as PrView;
    } catch {
      return undefined;
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
