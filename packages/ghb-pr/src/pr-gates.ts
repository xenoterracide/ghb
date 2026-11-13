// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import type { Runner } from "./exec.js";

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

export interface PrView {
  state: string;
  mergeable: string;
  mergeStateStatus: string;
  baseRefName: string;
  headRefName: string;
  statusCheckRollup?: RollupContext[] | null | undefined;
}

// gh's own bucketing: statuses carry their state, runs collapse either their
// conclusion (completed) or their status (queued, running) into one
const BUCKETS: Readonly<Record<string, Bucket>> = {
  SUCCESS: "pass",
  SKIPPED: "skipping",
  NEUTRAL: "skipping",
  ERROR: "fail",
  FAILURE: "fail",
  TIMED_OUT: "fail",
  ACTION_REQUIRED: "fail",
  STARTUP_FAILURE: "fail",
  CANCELLED: "cancel",
};

export function bucketOf(context: RollupContext): Bucket {
  const state = context.state ?? (context.status === "COMPLETED" ? context.conclusion : context.status) ?? "";
  // EXPECTED, REQUESTED, WAITING, QUEUED, PENDING, IN_PROGRESS
  return BUCKETS[state] ?? "pending";
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

// statuses group under their context, runs under their name within their
// workflow, so two workflows naming a check the same stay distinct
const groupKey = (context: RollupContext): string => {
  const hasContext = context.context !== undefined && context.context !== "";
  const name = context.name ?? context.context ?? "";
  return hasContext ? `status\0${context.context}` : `check\0${name}\0${context.workflowName ?? ""}`;
};

function foldRun(group: Group, context: RollupContext): void {
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

const toCheck = (group: Group): Check =>
  group.pending
    ? { name: group.name, bucket: "pending", started: group.pendingStarted }
    : { name: group.name, bucket: group.bucket, started: group.started };

// a stale run was superseded by a newer run of the same check; the rollup
// carries both, so the stale one contributes nothing — were it folded, its
// pending flag would outrank the newer run's verdict and a green PR would
// poll to its timeout
const superseded = (context: RollupContext): boolean =>
  context.status === "COMPLETED" && context.conclusion === "STALE";

// one Check per named group. an in-flight run wins the name — the re-queue
// it represents may still pass — otherwise the newest finished run decides,
// which is what gh's eliminateDuplicates means to do under cli/cli#14371
export function summarize(rollup: RollupContext[] | null | undefined): Check[] {
  const groups = new Map<string, Group>();

  for (const context of rollup ?? []) {
    if (superseded(context)) continue;
    const key = groupKey(context);
    let group = groups.get(key);
    if (group === undefined) {
      group = {
        name: context.name ?? context.context ?? "",
        pending: false,
        pendingStarted: true,
        bucket: "pending",
        started: false,
        newestAt: undefined,
      };
      groups.set(key, group);
    }
    foldRun(group, context);
  }

  return Array.from(groups.values(), toCheck);
}

export function stateFailure(view: PrView): string {
  return `state: ${view.state}`;
}

export function failedNames(checks: Check[]): string[] {
  return checks.filter((check) => check.bucket === "fail" || check.bucket === "cancel").map((check) => check.name);
}

export function pendingNames(checks: Check[]): string[] {
  return checks.filter((check) => check.bucket === "pending").map((check) => check.name);
}

// DIRTY and DRAFT never clear on their own; BLOCKED and UNSTABLE are
// normal while checks run and settle through the poll
export function permanentFailures(view: PrView): string[] {
  const failures: string[] = [];
  if (view.mergeable !== "MERGEABLE") {
    failures.push(`mergeable: ${view.mergeable}`);
  }
  if (view.mergeStateStatus === "DIRTY" || view.mergeStateStatus === "DRAFT") {
    failures.push(`mergeStateStatus: ${view.mergeStateStatus}`);
  }
  return failures;
}

export function lateFailures(view: PrView): string[] {
  const failures: string[] = [];
  if (view.mergeable !== "MERGEABLE") {
    failures.push(`mergeable: ${view.mergeable}`);
  }
  if (view.mergeStateStatus !== "CLEAN") {
    failures.push(`mergeStateStatus: ${view.mergeStateStatus}`);
  }
  return failures;
}

export function readView(run: Runner, forward: string[]): PrView | undefined {
  try {
    return JSON.parse(
      run("gh", [
        "pr",
        "view",
        "--json",
        "state,mergeable,mergeStateStatus,baseRefName,headRefName,statusCheckRollup",
        ...forward,
      ]),
    ) as PrView;
  } catch {
    return undefined;
  }
}

export function baseCurrency(run: Runner, view: PrView): string[] {
  const [baseLeft = "0"] = run("git", [
    "rev-list",
    "--left-right",
    "--count",
    `origin/${view.baseRefName}...HEAD`,
  ]).split("\t");
  if (Number(baseLeft) > 0) {
    return [`behind base by ${baseLeft} commits`];
  }
  return [];
}

export function headCurrency(run: Runner, view: PrView): string[] {
  const [ahead = 0, behind = 0] = run("git", [
    "rev-list",
    "--left-right",
    "--count",
    `HEAD...origin/${view.headRefName}`,
  ])
    .split("\t")
    .map(Number);
  if (ahead > 0 && behind > 0) {
    return [`diverged from origin/${view.headRefName}`];
  }
  if (ahead > 0) {
    return [`ahead of origin/${view.headRefName} by ${ahead} commits`];
  }
  if (behind > 0) {
    return [`behind origin/${view.headRefName} by ${behind} commits`];
  }
  return [];
}

export function currencyFailures(run: Runner, view: PrView): string[] {
  return [...baseCurrency(run, view), ...headCurrency(run, view)];
}
