// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import type { Runner } from "./exec.js";

export interface Check {
  name: string;
  bucket: string;
}

export interface PrView {
  state: string;
  mergeable: string;
  mergeStateStatus: string;
  baseRefName: string;
  headRefName: string;
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

export function somePending(checks: Check[] | undefined): boolean {
  return checks?.some((check) => check.bucket === "pending") ?? false;
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
      run("gh", ["pr", "view", "--json", "state,mergeable,mergeStateStatus,baseRefName,headRefName", ...forward]),
    ) as PrView;
  } catch {
    return undefined;
  }
}

export function readChecks(run: Runner, forward: string[]): Check[] | undefined {
  try {
    const checks = JSON.parse(run("gh", ["pr", "checks", "--json", "name,bucket", ...forward])) as Check[];
    return checks.length > 0 ? checks : undefined;
  } catch (e) {
    const message = `${e instanceof Error ? e.message : String(e)}\n${(e as { stderr?: string }).stderr ?? ""}`;
    if (/no checks reported/i.test(message)) {
      return undefined;
    }
    throw e;
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
