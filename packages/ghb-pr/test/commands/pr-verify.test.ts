// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, describe, expect, it, vi } from "vitest";
import { PrVerifyCommand } from "../../src/commands/pr-verify.js";
import { execRunner, type Runner } from "../../src/exec.js";

vi.mock("../../src/exec.js", () => ({ execRunner: vi.fn() }));

const greenView = JSON.stringify({
  state: "OPEN",
  mergeable: "MERGEABLE",
  mergeStateStatus: "CLEAN",
  baseRefName: "develop",
  headRefName: "topic",
});

const dirtyView = JSON.stringify({
  state: "OPEN",
  mergeable: "MERGEABLE",
  mergeStateStatus: "DIRTY",
  baseRefName: "develop",
  headRefName: "topic",
});

const passingChecks = JSON.stringify([
  { name: "build", bucket: "pass" },
  { name: "lint", bucket: "pass" },
]);

const failingChecks = JSON.stringify([{ name: "build", bucket: "fail" }]);

// one full pass: fetch, view, currency, checks, then the re-read before passing
const passingCycle = ["", greenView, "0\t1", "0\t0", passingChecks, "", greenView, "0\t1", "0\t0"];

interface VerifyOptions {
  interval?: string;
  timeout?: string;
  forward?: string[];
}

interface VerifyResult {
  exit: number;
  logs: string[];
  errors: string[];
  calls: string[];
}

function fakeRunner(script: (string | Error)[]): { run: Runner; calls: string[] } {
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
  const { run, calls } = fakeRunner(script);
  const { logs, errors } = captureConsole();
  const command = new PrVerifyCommand();
  command.runner = run;
  Object.assign(command, options);
  const exit = await command.execute();
  return { exit, logs, errors, calls };
}

const realGreenRunner = (cmd: "git" | "gh", args: string[]): string => {
  if (cmd === "gh") {
    return args[1] === "view" ? greenView : passingChecks;
  }
  if (args[0] === "rev-list") {
    return args.includes("origin/develop...HEAD") ? "0\t1" : "0\t0";
  }
  return "";
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PrVerifyCommand", () => {
  it("prints pass when open, current, mergeable, and every check passes", async () => {
    const { exit, logs, errors, calls } = await runVerify(passingCycle);

    expect(exit).toBe(0);
    expect(logs).toEqual(["pass"]);
    expect(errors).toEqual([]);
    expect(calls).toContain("gh pr checks --json name,bucket");
  });

  it("fails behind base without polling checks", async () => {
    const { exit, errors, calls } = await runVerify(["", greenView, "3\t0", "0\t0"]);

    expect(exit).toBe(1);
    expect(errors.join("\n")).toContain("behind base by 3 commits");
    expect(calls.some((call) => call.startsWith("gh pr checks"))).toBe(false);
  });
});

describe("PrVerifyCommand", () => {
  it("fails on mergeStateStatus without polling", async () => {
    const { exit, errors, calls } = await runVerify(["", dirtyView, "0\t1", "0\t0"]);

    expect(exit).toBe(1);
    expect(errors.join("\n")).toContain("mergeStateStatus: DIRTY");
    expect(calls.some((call) => call.startsWith("gh pr checks"))).toBe(false);
  });

  it("fails on a fail bucket despite gh exiting 0", async () => {
    const { exit, errors } = await runVerify(["", greenView, "0\t1", "0\t0", failingChecks]);

    expect(exit).toBe(1);
    expect(errors.join("\n")).toContain("fail: build");
  });
});

describe("PrVerifyCommand", () => {
  it("fails fast on a gh error that is not a runless head", async () => {
    const script = ["", greenView, "0\t1", "0\t0", new Error("gh: Not logged in")];
    const { exit } = await runVerify(script, { interval: "0", timeout: "0" });

    expect(exit).toBe(1);
  });

  it("fails when local is ahead of the remote head", async () => {
    const { exit, errors } = await runVerify(["", greenView, "0\t1", "1\t0"]);

    expect(exit).toBe(1);
    expect(errors.join("\n")).toContain("ahead of origin/topic by 1 commits");
  });
});

describe("PrVerifyCommand", () => {
  it("fails when local is behind the remote head", async () => {
    const { exit, errors } = await runVerify(["", greenView, "0\t1", "0\t2"]);

    expect(exit).toBe(1);
    expect(errors.join("\n")).toContain("behind origin/topic by 2 commits");
  });

  it("fails when local has diverged from the remote head", async () => {
    const { exit, errors } = await runVerify(["", greenView, "0\t1", "1\t2"]);

    expect(exit).toBe(1);
    expect(errors.join("\n")).toContain("diverged from origin/topic");
  });
});

describe("PrVerifyCommand", () => {
  it("forwards the PR selector to both gh calls", async () => {
    const { exit, calls } = await runVerify(passingCycle, { forward: ["585"] });

    expect(exit).toBe(0);
    expect(calls).toContain("gh pr view --json state,mergeable,mergeStateStatus,baseRefName,headRefName 585");
    expect(calls).toContain("gh pr checks --json name,bucket 585");
  });

  it("uses the real runner when none is injected", async () => {
    vi.mocked(execRunner).mockImplementation(realGreenRunner);
    const { logs } = captureConsole();

    const exit = await new PrVerifyCommand().execute();

    expect(exit).toBe(0);
    expect(logs).toEqual(["pass"]);
  });
});
