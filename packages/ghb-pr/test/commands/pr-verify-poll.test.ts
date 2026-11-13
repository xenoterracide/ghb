// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, describe, expect, it, vi } from "vitest";
import { PrVerifyCommand } from "../../src/commands/pr-verify.js";
import type { Runner } from "../../src/exec.js";

vi.mock("../../src/exec.js", () => ({ execRunner: vi.fn() }));

const greenView = JSON.stringify({
  state: "OPEN",
  mergeable: "MERGEABLE",
  mergeStateStatus: "CLEAN",
  baseRefName: "develop",
  headRefName: "topic",
});

// GitHub reports BLOCKED while a required check is pending, not CLEAN
const blockedView = JSON.stringify({
  state: "OPEN",
  mergeable: "MERGEABLE",
  mergeStateStatus: "BLOCKED",
  baseRefName: "develop",
  headRefName: "topic",
});

const unknownView = JSON.stringify({
  state: "OPEN",
  mergeable: "UNKNOWN",
  mergeStateStatus: "UNKNOWN",
  baseRefName: "develop",
  headRefName: "topic",
});

const closedView = JSON.stringify({
  state: "CLOSED",
  mergeable: "MERGEABLE",
  mergeStateStatus: "CLEAN",
  baseRefName: "develop",
  headRefName: "topic",
});

const conflictingView = JSON.stringify({
  state: "OPEN",
  mergeable: "CONFLICTING",
  mergeStateStatus: "CLEAN",
  baseRefName: "develop",
  headRefName: "topic",
});

const passingChecks = JSON.stringify([{ name: "build", bucket: "pass" }]);
const pendingChecks = JSON.stringify([{ name: "build", bucket: "pending" }]);
const noChecks = new Error("no checks reported on the 'topic' branch");

const polling = { interval: "0" };

const blockedThenGreen = ["", blockedView, "0\t1", "0\t0", pendingChecks, passingChecks, "", greenView, "0\t1", "0\t0"];

const blockedAfterChecks = ["", greenView, "0\t1", "0\t0", passingChecks, "", blockedView, passingChecks];

const runlessCycle = ["", greenView, "0\t1", "0\t0", noChecks, "", greenView, "0\t1", "0\t0"];

const unknownSettles = ["", unknownView, "0\t1", "0\t0", greenView, passingChecks, "", greenView, "0\t1", "0\t0"];

const queuedCheck = [
  "",
  greenView,
  "0\t1",
  "0\t0",
  passingChecks,
  "",
  blockedView,
  pendingChecks,
  passingChecks,
  "",
  greenView,
  "0\t1",
  "0\t0",
];

const finalUnknown = [
  "",
  greenView,
  "0\t1",
  "0\t0",
  passingChecks,
  "",
  unknownView,
  greenView,
  passingChecks,
  "",
  greenView,
  "0\t1",
  "0\t0",
];

interface VerifyOptions {
  interval?: string;
  timeout?: string;
}

interface VerifyResult {
  exit: number;
  logs: string[];
  errors: string[];
}

function fakeRunner(script: (string | Error)[]): Runner {
  let next = 0;
  return () => {
    const step = script[next] ?? "";
    next += 1;
    if (step instanceof Error) {
      throw step;
    }
    return step;
  };
}

function captureConsole(): { logs: string[]; errors: string[] } {
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

async function runVerify(script: (string | Error)[], options: VerifyOptions = {}): Promise<VerifyResult> {
  const { logs, errors } = captureConsole();
  const command = new PrVerifyCommand();
  command.runner = fakeRunner(script);
  Object.assign(command, options);
  const exit = await command.execute();
  return { exit, logs, errors };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PrVerifyCommand", () => {
  it("pends through pending checks while the view reports BLOCKED", async () => {
    const { exit, logs } = await runVerify(blockedThenGreen, polling);

    expect(exit).toBe(0);
    expect(logs).toEqual(["pass"]);
  });

  it("fails when the view is still BLOCKED after the checks pass", async () => {
    const { exit, errors } = await runVerify(blockedAfterChecks, polling);

    expect(exit).toBe(1);
    expect(errors.join("\n")).toContain("mergeStateStatus: BLOCKED");
  });
});

describe("PrVerifyCommand", () => {
  it("re-checks currency before passing", async () => {
    const { exit, errors } = await runVerify(
      ["", greenView, "0\t1", "0\t0", passingChecks, "", greenView, "1\t0"],
      polling,
    );

    expect(exit).toBe(1);
    expect(errors.join("\n")).toContain("behind base by 1 commits");
  });

  it("passes a runless head when the view is CLEAN", async () => {
    const { exit, logs } = await runVerify(runlessCycle, polling);

    expect(exit).toBe(0);
    expect(logs).toEqual(["pass"]);
  });
});

describe("PrVerifyCommand", () => {
  it("pends a runless head while the view is BLOCKED", async () => {
    const { exit, errors } = await runVerify(["", blockedView, "0\t1", "0\t0", noChecks], {
      interval: "0",
      timeout: "0",
    });

    expect(exit).toBe(2);
    expect(errors.join("\n")).toContain("pending after 0m");
  });

  it("polls a check that queues after the checks read", async () => {
    const { exit, logs } = await runVerify(queuedCheck, polling);

    expect(exit).toBe(0);
    expect(logs).toEqual(["pass"]);
  });
});

describe("PrVerifyCommand", () => {
  it("pends through UNKNOWN mergeability to pass", async () => {
    const { exit, logs } = await runVerify(unknownSettles, polling);

    expect(exit).toBe(0);
    expect(logs).toEqual(["pass"]);
  });

  it("times out on UNKNOWN mergeability", async () => {
    const { exit, errors } = await runVerify(["", unknownView, "0\t1", "0\t0"], { interval: "0", timeout: "0" });

    expect(exit).toBe(2);
    expect(errors.join("\n")).toContain("pending after 0m: mergeability");
  });
});

describe("PrVerifyCommand", () => {
  it("times out with the pending check names", async () => {
    const { exit, errors } = await runVerify(["", greenView, "0\t1", "0\t0", pendingChecks, pendingChecks], {
      interval: "0",
      timeout: "0",
    });

    expect(exit).toBe(2);
    expect(errors.join("\n")).toContain("pending after 0m: build");
  });

  it("fails when the PR closes during the poll", async () => {
    const { exit, errors } = await runVerify(["", greenView, "0\t1", "0\t0", passingChecks, "", closedView], polling);

    expect(exit).toBe(1);
    expect(errors.join("\n")).toContain("state: CLOSED");
  });
});

describe("PrVerifyCommand", () => {
  it("re-settles when the final view is UNKNOWN", async () => {
    const { exit, logs } = await runVerify(finalUnknown, polling);

    expect(exit).toBe(0);
    expect(logs).toEqual(["pass"]);
  });

  it("fails when the runner errors at the final gate", async () => {
    const script = ["", greenView, "0\t1", "0\t0", passingChecks, "", new Error("gh died")];
    const { exit } = await runVerify(script, polling);

    expect(exit).toBe(1);
  });
});

describe("PrVerifyCommand", () => {
  it("fails at the final gate on a conflicting PR", async () => {
    const script = ["", greenView, "0\t1", "0\t0", passingChecks, "", conflictingView, passingChecks];
    const { exit, errors } = await runVerify(script, polling);

    expect(exit).toBe(1);
    expect(errors.join("\n")).toContain("mergeable: CONFLICTING");
  });

  it("falls back to the default interval on a non-numeric value", async () => {
    const { exit } = await runVerify(["", blockedView, "0\t1", "0\t0", noChecks], { interval: "abc", timeout: "0" });

    expect(exit).toBe(2);
  });
});

describe("PrVerifyCommand", () => {
  it("falls back to the default interval on an empty value", async () => {
    const { exit } = await runVerify(["", blockedView, "0\t1", "0\t0", noChecks], { interval: "", timeout: "0" });

    expect(exit).toBe(2);
  });
});
