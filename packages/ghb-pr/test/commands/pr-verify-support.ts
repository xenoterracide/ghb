// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { PrVerifyCommand } from "../../src/commands/pr-verify.js";
import type { RollupContext } from "../../src/pr-gates.js";
import type { Runner } from "../../src/exec.js";
import { vi } from "vitest";

export const emptyRollup: RollupContext[] = [];

export const passingRollup: RollupContext[] = [
  {
    name: "build",
    status: "COMPLETED",
    conclusion: "SUCCESS",
    startedAt: "2026-11-11T19:00:00Z",
    workflowName: "test",
  },
];

export const queuedRollup: RollupContext[] = [
  { name: "build", status: "QUEUED", startedAt: null, workflowName: "test" },
];

export const runningRollup: RollupContext[] = [
  { name: "build", status: "IN_PROGRESS", startedAt: "2026-11-11T19:00:00Z", workflowName: "test" },
];

export const failingRollup: RollupContext[] = [
  {
    name: "build",
    status: "COMPLETED",
    conclusion: "FAILURE",
    startedAt: "2026-11-11T19:00:00Z",
    workflowName: "test",
  },
];

export const twoChecksRollup: RollupContext[] = [
  ...passingRollup,
  {
    name: "lint",
    status: "COMPLETED",
    conclusion: "SUCCESS",
    startedAt: "2026-11-11T19:00:00Z",
    workflowName: "test",
  },
];

export const mixedRollup: RollupContext[] = [
  ...runningRollup,
  { name: "lint", status: "QUEUED", startedAt: null, workflowName: "test" },
];

export const requeuedRollup: RollupContext[] = [
  {
    name: "build",
    status: "COMPLETED",
    conclusion: "FAILURE",
    startedAt: "2026-11-11T18:00:00Z",
    workflowName: "test",
  },
  { name: "build", status: "QUEUED", startedAt: null, workflowName: "test" },
];

export const rerunRollup: RollupContext[] = [
  {
    name: "build",
    status: "COMPLETED",
    conclusion: "FAILURE",
    startedAt: "2026-11-11T18:00:00Z",
    workflowName: "test",
  },
  {
    name: "build",
    status: "COMPLETED",
    conclusion: "SUCCESS",
    startedAt: "2026-11-11T19:00:00Z",
    workflowName: "test",
  },
];

export const statusContext = (context: string, state: string): RollupContext => ({ context, state });

export interface ViewSpec {
  state?: string;
  mergeable?: string;
  mergeStateStatus?: string;
  rollup?: RollupContext[];
}

export const view = (spec: ViewSpec = {}): string =>
  JSON.stringify({
    state: spec.state ?? "OPEN",
    mergeable: spec.mergeable ?? "MERGEABLE",
    mergeStateStatus: spec.mergeStateStatus ?? "CLEAN",
    baseRefName: "develop",
    headRefName: "topic",
    statusCheckRollup: spec.rollup ?? emptyRollup,
  });

export interface FakeRunResult {
  run: Runner;
  calls: string[];
}

export function fakeRunner(script: (string | Error)[]): FakeRunResult {
  const calls: string[] = [];
  let next = 0;
  const run: Runner = (cmd, args) => {
    calls.push(`${cmd} ${args.join(" ")}`);
    const step = script[next] ?? "";
    next += 1;
    if (step instanceof Error) {
      throw step;
    }
    return step;
  };
  return { run, calls };
}

export interface CapturedConsole {
  logs: string[];
  errors: string[];
}

export function captureConsole(): CapturedConsole {
  const logs: string[] = [];
  const errors: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.join(" "));
  });
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errors.push(args.join(" "));
  });
  return { logs, errors };
}

export interface VerifyOptions {
  interval?: string;
  timeout?: string;
  forward?: string[];
}

export interface VerifyResult extends CapturedConsole {
  exit: number;
  calls: string[];
}

export async function runVerify(script: (string | Error)[], options: VerifyOptions = {}): Promise<VerifyResult> {
  const { run, calls } = fakeRunner(script);
  const { logs, errors } = captureConsole();
  const command = new PrVerifyCommand();
  command.runner = run;
  Object.assign(command, options);
  const exit = await command.execute();
  return { exit, logs, errors, calls };
}

export const realGreenRunner = (cmd: "git" | "gh", args: string[]): string => {
  if (cmd === "gh") {
    return view({ rollup: passingRollup });
  }
  if (args[0] === "rev-list") {
    return args.includes("origin/develop...HEAD") ? "0\t1" : "0\t0";
  }
  return "";
};
