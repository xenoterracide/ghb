// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, describe, expect, it, vi } from "vitest";
import { Cli } from "clipanion";
import { PrVerifyCommand, bucketOf, summarize, type RollupContext } from "../../src/commands/pr-verify.js";
import { execRunner, type Runner } from "../../src/exec.js";

vi.mock("../../src/exec.js", () => ({ execRunner: vi.fn() }));

const passingRollup = [
  {
    name: "build",
    status: "COMPLETED",
    conclusion: "SUCCESS",
    startedAt: "2026-11-11T19:00:00Z",
    workflowName: "test",
  },
];
const queuedRollup = [{ name: "build", status: "QUEUED", startedAt: null, workflowName: "test" }];
const emptyRollup: RollupContext[] = [];

// real data keeps every run of a name: a completed failure plus the queue
// waiting to replace it, then both completions once the re-run finishes
const requeuedRollup = [
  {
    name: "build",
    status: "COMPLETED",
    conclusion: "FAILURE",
    startedAt: "2026-11-11T18:00:00Z",
    workflowName: "test",
  },
  { name: "build", status: "QUEUED", startedAt: null, workflowName: "test" },
];
const rerunRollup = [
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
const runningRollup = [
  { name: "build", status: "IN_PROGRESS", startedAt: "2026-11-11T19:00:00Z", workflowName: "test" },
];
const failingRollup = [
  {
    name: "build",
    status: "COMPLETED",
    conclusion: "FAILURE",
    startedAt: "2026-11-11T19:00:00Z",
    workflowName: "test",
  },
];
const twoChecksRollup = [
  ...passingRollup,
  {
    name: "lint",
    status: "COMPLETED",
    conclusion: "SUCCESS",
    startedAt: "2026-11-11T19:00:00Z",
    workflowName: "test",
  },
];

const statusContext = (context: string, state: string): RollupContext => ({ context, state });

// one poll's single gh pr view read: the PR state and its check rollup
const view = (
  spec: { state?: string; mergeable?: string; mergeStateStatus?: string; rollup?: RollupContext[] } = {},
): string =>
  JSON.stringify({
    state: spec.state ?? "OPEN",
    mergeable: spec.mergeable ?? "MERGEABLE",
    mergeStateStatus: spec.mergeStateStatus ?? "CLEAN",
    baseRefName: "develop",
    headRefName: "topic",
    statusCheckRollup: spec.rollup ?? emptyRollup,
  });

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

describe("summarize", () => {
  it("maps CheckRun states", () => {
    expect(bucketOf({ status: "COMPLETED", conclusion: "SUCCESS" })).toBe("pass");
    expect(bucketOf({ status: "COMPLETED", conclusion: "SKIPPED" })).toBe("skipping");
    expect(bucketOf({ status: "COMPLETED", conclusion: "NEUTRAL" })).toBe("skipping");
    expect(bucketOf({ status: "COMPLETED", conclusion: "FAILURE" })).toBe("fail");
    expect(bucketOf({ status: "COMPLETED", conclusion: "ERROR" })).toBe("fail");
    expect(bucketOf({ status: "COMPLETED", conclusion: "TIMED_OUT" })).toBe("fail");
    expect(bucketOf({ status: "COMPLETED", conclusion: "ACTION_REQUIRED" })).toBe("fail");
    expect(bucketOf({ status: "COMPLETED", conclusion: "CANCELLED" })).toBe("cancel");
    expect(bucketOf({ status: "QUEUED" })).toBe("pending");
    expect(bucketOf({ status: "IN_PROGRESS" })).toBe("pending");
  });

  it("maps StatusContext states", () => {
    expect(bucketOf({ state: "SUCCESS" })).toBe("pass");
    expect(bucketOf({ state: "PENDING" })).toBe("pending");
    expect(bucketOf({ state: "EXPECTED" })).toBe("pending");
    expect(bucketOf({ state: "FAILURE" })).toBe("fail");
    expect(bucketOf({ state: "ERROR" })).toBe("fail");
  });

  it("returns no checks for an empty or null rollup", () => {
    expect(summarize([])).toEqual([]);
    expect(summarize(null)).toEqual([]);
    expect(summarize(undefined)).toEqual([]);
  });

  it("names a status by its context and marks started runs", () => {
    expect(summarize([statusContext("codespell", "PENDING")])).toEqual([
      { name: "codespell", bucket: "pending", started: false },
    ]);
  });

  it("prefers a pending run over the completed run it re-queues", () => {
    const rollup = [
      {
        name: "build",
        status: "COMPLETED",
        conclusion: "FAILURE",
        startedAt: "2026-11-11T19:00:00Z",
        workflowName: "test",
      },
      { name: "build", status: "QUEUED", startedAt: null, workflowName: "test" },
    ];
    expect(summarize(rollup)).toEqual([{ name: "build", bucket: "pending", started: false }]);
  });

  it("keeps one entry per name and reports a lone completed failure", () => {
    const rollup = [
      {
        name: "pnpm / check",
        status: "COMPLETED",
        conclusion: "SUCCESS",
        startedAt: "2026-11-11T19:00:00Z",
        workflowName: "test",
      },
    ];
    expect(summarize(rollup)).toEqual([{ name: "pnpm / check", bucket: "pass", started: true }]);
  });

  it("fails a group whose newest verdict is failure with no run in flight", () => {
    const rollup = [
      {
        name: "build",
        status: "COMPLETED",
        conclusion: "SUCCESS",
        startedAt: "2026-11-11T18:00:00Z",
        workflowName: "test",
      },
      {
        name: "build",
        status: "COMPLETED",
        conclusion: "FAILURE",
        startedAt: "2026-11-11T19:00:00Z",
        workflowName: "test",
      },
    ];
    expect(summarize(rollup)).toEqual([{ name: "build", bucket: "fail", started: true }]);
  });

  it("clears a failed group whose re-run passed", () => {
    const rollup = [
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
    expect(summarize(rollup)).toEqual([{ name: "build", bucket: "pass", started: true }]);
  });

  it("keeps runs of different workflows apart when they share a name", () => {
    const rollup = [
      {
        name: "build",
        status: "COMPLETED",
        conclusion: "SUCCESS",
        startedAt: "2026-11-11T18:00:00Z",
        workflowName: "test",
      },
      {
        name: "build",
        status: "COMPLETED",
        conclusion: "FAILURE",
        startedAt: "2026-11-11T19:00:00Z",
        workflowName: "release",
      },
    ];
    expect(summarize(rollup)).toEqual([
      { name: "build", bucket: "pass", started: true },
      { name: "build", bucket: "fail", started: true },
    ]);
  });

  it("marks a group in flight on a runner as started", () => {
    const rollup = [
      {
        name: "build",
        status: "COMPLETED",
        conclusion: "SUCCESS",
        startedAt: "2026-11-11T18:00:00Z",
        workflowName: "test",
      },
      { name: "build", status: "IN_PROGRESS", startedAt: "2026-11-11T19:00:00Z", workflowName: "test" },
    ];
    expect(summarize(rollup)).toEqual([{ name: "build", bucket: "pending", started: true }]);
  });

  it("marks a pending group started only when every in-flight run started", () => {
    const running = { name: "build", status: "IN_PROGRESS", startedAt: "2026-11-11T19:00:00Z", workflowName: "test" };
    const queued = { name: "build", status: "QUEUED", startedAt: null, workflowName: "test" };
    const unparseable = { name: "build", status: "IN_PROGRESS", startedAt: "not a timestamp", workflowName: "test" };
    expect(summarize([running, queued])).toEqual([{ name: "build", bucket: "pending", started: false }]);
    expect(summarize([queued, running])).toEqual([{ name: "build", bucket: "pending", started: false }]);
    expect(summarize([running, unparseable])).toEqual([{ name: "build", bucket: "pending", started: false }]);
  });
});

describe("PrVerifyCommand", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints pass when open, current, mergeable, and every check passes", async () => {
    const { run, calls } = fakeRunner([
      "",
      view({ rollup: twoChecksRollup }),
      "0\t1",
      "0\t0",
      "",
      view({ rollup: twoChecksRollup }),
      "0\t1",
      "0\t0",
    ]);
    const { logs, errors } = captureConsole();

    const command = new PrVerifyCommand();
    command.runner = run;
    const exit = await command.execute();

    expect(exit).toBe(0);
    expect(logs).toEqual(["pass"]);
    expect(errors).toEqual([]);
    expect(calls).toContain(
      "gh pr view --json state,mergeable,mergeStateStatus,baseRefName,headRefName,statusCheckRollup",
    );
  });

  it("fails behind base without polling checks", async () => {
    const { run, calls } = fakeRunner(["", view({ rollup: passingRollup }), "3\t0", "0\t0"]);
    const { errors } = captureConsole();

    const command = new PrVerifyCommand();
    command.runner = run;
    const exit = await command.execute();

    expect(exit).toBe(1);
    expect(errors.join("\n")).toContain("behind base by 3 commits");
    expect(calls.some((call) => call.startsWith("gh pr checks"))).toBe(false);
  });

  it("fails on mergeStateStatus without polling", async () => {
    const { run, calls } = fakeRunner(["", view({ mergeStateStatus: "DIRTY", rollup: passingRollup }), "0\t1", "0\t0"]);
    const { errors } = captureConsole();

    const command = new PrVerifyCommand();
    command.runner = run;
    const exit = await command.execute();

    expect(exit).toBe(1);
    expect(errors.join("\n")).toContain("mergeStateStatus: DIRTY");
    expect(calls.some((call) => call.startsWith("gh pr checks"))).toBe(false);
  });

  it("fails on a fail bucket despite gh exiting 0", async () => {
    const { run } = fakeRunner(["", view({ rollup: failingRollup }), "0\t1", "0\t0"]);
    const { errors } = captureConsole();

    const command = new PrVerifyCommand();
    command.runner = run;
    const exit = await command.execute();

    expect(exit).toBe(1);
    expect(errors.join("\n")).toContain("fail: build");
  });

  it("pends through pending checks while the view reports BLOCKED", async () => {
    const { run } = fakeRunner([
      "",
      view({ mergeStateStatus: "BLOCKED", rollup: runningRollup }),
      "0\t1",
      "0\t0",
      view({ rollup: passingRollup }),
      "",
      view({ rollup: passingRollup }),
      "0\t1",
      "0\t0",
    ]);
    const { logs } = captureConsole();

    const command = new PrVerifyCommand();
    command.runner = run;
    command.interval = "0";
    const exit = await command.execute();

    expect(exit).toBe(0);
    expect(logs).toEqual(["pass"]);
  });

  it("sees a re-queued run as pending and passes after it completes", async () => {
    const { run } = fakeRunner([
      "",
      view({ mergeStateStatus: "BLOCKED", rollup: requeuedRollup }),
      "0\t1",
      "0\t0",
      view({ rollup: rerunRollup }),
      "",
      view({ rollup: rerunRollup }),
      "0\t1",
      "0\t0",
    ]);
    const { logs } = captureConsole();

    const command = new PrVerifyCommand();
    command.runner = run;
    command.interval = "0";
    const exit = await command.execute();

    expect(exit).toBe(0);
    expect(logs).toEqual(["pass"]);
  });

  it("fails when the view is still BLOCKED after the checks pass", async () => {
    const { run } = fakeRunner([
      "",
      view({ rollup: passingRollup }),
      "0\t1",
      "0\t0",
      "",
      view({ mergeStateStatus: "BLOCKED", rollup: passingRollup }),
    ]);
    const { errors } = captureConsole();

    const command = new PrVerifyCommand();
    command.runner = run;
    command.interval = "0";
    const exit = await command.execute();

    expect(exit).toBe(1);
    expect(errors.join("\n")).toContain("mergeStateStatus: BLOCKED");
  });

  it("re-checks currency before passing", async () => {
    const { run } = fakeRunner([
      "",
      view({ rollup: passingRollup }),
      "0\t1",
      "0\t0",
      "",
      view({ rollup: passingRollup }),
      "1\t0",
    ]);
    const { errors } = captureConsole();

    const command = new PrVerifyCommand();
    command.runner = run;
    command.interval = "0";
    const exit = await command.execute();

    expect(exit).toBe(1);
    expect(errors.join("\n")).toContain("behind base by 1 commits");
  });

  it("passes a runless head when the view is CLEAN", async () => {
    const { run } = fakeRunner([
      "",
      view({ rollup: emptyRollup }),
      "0\t1",
      "0\t0",
      view({ rollup: emptyRollup }),
      view({ rollup: emptyRollup }),
      "",
      view({ rollup: emptyRollup }),
      "0\t1",
      "0\t0",
    ]);
    const { logs } = captureConsole();

    const command = new PrVerifyCommand();
    command.runner = run;
    command.interval = "0";
    const exit = await command.execute();

    expect(exit).toBe(0);
    expect(logs).toEqual(["pass"]);
  });

  it("waits out an empty rollup before passing a CLEAN head", async () => {
    // 4 consecutive CLEAN+empty view reads: initial, two grace polls, final gate
    const { run } = fakeRunner([
      "",
      view({ rollup: emptyRollup }),
      "0\t1",
      "0\t0",
      view({ rollup: emptyRollup }),
      view({ rollup: emptyRollup }),
      "",
      view({ rollup: emptyRollup }),
      "0\t1",
      "0\t0",
    ]);
    const { logs } = captureConsole();

    const command = new PrVerifyCommand();
    command.runner = run;
    command.interval = "0";
    command.timeout = "1";
    const exit = await command.execute();

    expect(exit).toBe(0);
    expect(logs).toEqual(["pass"]);
  });

  it("resets the grace when checks appear", async () => {
    const { run } = fakeRunner([
      "",
      view({ rollup: emptyRollup }),
      "0\t1",
      "0\t0",
      view({ mergeStateStatus: "BLOCKED", rollup: queuedRollup }),
      view({ rollup: passingRollup }),
      "",
      view({ rollup: passingRollup }),
      "0\t1",
      "0\t0",
    ]);
    const { logs } = captureConsole();

    const command = new PrVerifyCommand();
    command.runner = run;
    command.interval = "0";
    const exit = await command.execute();

    expect(exit).toBe(0);
    expect(logs).toEqual(["pass"]);
  });

  it("pends a runless head while the view is BLOCKED", async () => {
    const { run } = fakeRunner(["", view({ mergeStateStatus: "BLOCKED", rollup: emptyRollup }), "0\t1", "0\t0"]);
    const { errors } = captureConsole();

    const command = new PrVerifyCommand();
    command.runner = run;
    command.interval = "0";
    command.timeout = "0";
    const exit = await command.execute();

    expect(exit).toBe(2);
    expect(errors.join("\n")).toContain("pending after 0m");
  });

  it("polls a check that queues after the checks read", async () => {
    const { run } = fakeRunner([
      "",
      view({ rollup: passingRollup }),
      "0\t1",
      "0\t0",
      "",
      view({ mergeStateStatus: "BLOCKED", rollup: queuedRollup }),
      view({ rollup: passingRollup }),
      "",
      view({ rollup: passingRollup }),
      "0\t1",
      "0\t0",
    ]);
    const { logs } = captureConsole();

    const command = new PrVerifyCommand();
    command.runner = run;
    command.interval = "0";
    const exit = await command.execute();

    expect(exit).toBe(0);
    expect(logs).toEqual(["pass"]);
  });

  it("pends through UNKNOWN mergeability to pass", async () => {
    const { run } = fakeRunner([
      "",
      view({ mergeable: "UNKNOWN", mergeStateStatus: "UNKNOWN" }),
      "0\t1",
      "0\t0",
      view({ rollup: passingRollup }),
      "",
      view({ rollup: passingRollup }),
      "0\t1",
      "0\t0",
    ]);
    const { logs } = captureConsole();

    const command = new PrVerifyCommand();
    command.runner = run;
    command.interval = "0";
    const exit = await command.execute();

    expect(exit).toBe(0);
    expect(logs).toEqual(["pass"]);
  });

  it("times out on UNKNOWN mergeability", async () => {
    const { run } = fakeRunner(["", view({ mergeable: "UNKNOWN", mergeStateStatus: "UNKNOWN" }), "0\t1", "0\t0"]);
    const { errors } = captureConsole();

    const command = new PrVerifyCommand();
    command.runner = run;
    command.interval = "0";
    command.timeout = "0";
    const exit = await command.execute();

    expect(exit).toBe(2);
    expect(errors.join("\n")).toContain("pending after 0m: mergeability");
  });

  it("fails fast on a gh error that is not a runless head", async () => {
    const { run } = fakeRunner([
      "",
      view({ rollup: passingRollup }),
      "0\t1",
      "0\t0",
      "",
      new Error("gh: Not logged in"),
    ]);
    captureConsole();

    const command = new PrVerifyCommand();
    command.runner = run;
    command.interval = "0";
    command.timeout = "0";
    const exit = await command.execute();

    expect(exit).toBe(1);
  });

  it("fails fast when the runner errors on the view", async () => {
    const { run } = fakeRunner(["", new Error("gh: Not logged in")]);
    captureConsole();

    const command = new PrVerifyCommand();
    command.runner = run;
    const exit = await command.execute();

    expect(exit).toBe(1);
  });

  it("fails when the runner errors at the final gate", async () => {
    const { run } = fakeRunner(["", view({ rollup: passingRollup }), "0\t1", "0\t0", "", new Error("gh died")]);
    captureConsole();

    const command = new PrVerifyCommand();
    command.runner = run;
    command.interval = "0";
    const exit = await command.execute();

    expect(exit).toBe(1);
  });

  it("fails when local is ahead of the remote head", async () => {
    const { run } = fakeRunner(["", view({ rollup: passingRollup }), "0\t1", "1\t0"]);
    const { errors } = captureConsole();

    const command = new PrVerifyCommand();
    command.runner = run;
    const exit = await command.execute();

    expect(exit).toBe(1);
    expect(errors.join("\n")).toContain("ahead of origin/topic by 1 commits");
  });

  it("fails when local is behind the remote head", async () => {
    const { run } = fakeRunner(["", view({ rollup: passingRollup }), "0\t1", "0\t2"]);
    const { errors } = captureConsole();

    const command = new PrVerifyCommand();
    command.runner = run;
    const exit = await command.execute();

    expect(exit).toBe(1);
    expect(errors.join("\n")).toContain("behind origin/topic by 2 commits");
  });

  it("fails when local has diverged from the remote head", async () => {
    const { run } = fakeRunner(["", view({ rollup: passingRollup }), "0\t1", "1\t2"]);
    const { errors } = captureConsole();

    const command = new PrVerifyCommand();
    command.runner = run;
    const exit = await command.execute();

    expect(exit).toBe(1);
    expect(errors.join("\n")).toContain("diverged from origin/topic");
  });

  it("forwards the PR selector to both gh calls", async () => {
    const { run, calls } = fakeRunner([
      "",
      view({ rollup: passingRollup }),
      "0\t1",
      "0\t0",
      "",
      view({ rollup: passingRollup }),
      "0\t1",
      "0\t0",
    ]);
    captureConsole();

    const command = new PrVerifyCommand();
    command.runner = run;
    command.forward = ["585"];
    const exit = await command.execute();

    const forwardedCall =
      "gh pr view --json state,mergeable,mergeStateStatus,baseRefName,headRefName,statusCheckRollup 585";
    expect(exit).toBe(0);
    expect(calls.filter((call) => call === forwardedCall)).toHaveLength(2);
  });

  it("binds its own flags and forwards the rest through the parser", async () => {
    let bound: { interval: string; timeout: string; forward: unknown } | undefined;
    class ProbeVerify extends PrVerifyCommand {
      // eslint-disable-next-line @typescript-eslint/require-await -- clipanion requires a Promise even for synchronous probes.
      public async execute(): Promise<number> {
        bound = { interval: this.interval, timeout: this.timeout, forward: this.forward };
        return 0;
      }
    }
    const cli = new Cli({ binaryName: "ghb" });
    cli.register(ProbeVerify);
    const stdout: string[] = [];
    const context = {
      ...Cli.defaultContext,
      stdout: {
        write: (chunk: string | Uint8Array): boolean => {
          stdout.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
          return true;
        },
      } as NodeJS.WriteStream,
    };
    const exit = await cli.run(["pr", "verify", "--interval", "5", "--timeout", "120", "585"], context);

    expect(exit).toBe(0);
    expect(bound?.interval).toBe("5");
    expect(bound?.timeout).toBe("120");
    expect(bound?.forward).toEqual(["585"]);
  });

  it("shows help instead of forwarding --help to gh", async () => {
    class ProbeVerify extends PrVerifyCommand {
      // eslint-disable-next-line @typescript-eslint/require-await -- clipanion requires a Promise even for synchronous probes.
      public async execute(): Promise<number> {
        return 0;
      }
    }
    const cli = new Cli({ binaryName: "ghb" });
    cli.register(ProbeVerify);
    const stdout: string[] = [];
    const context = {
      ...Cli.defaultContext,
      stdout: {
        write: (chunk: string | Uint8Array): boolean => {
          stdout.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
          return true;
        },
      } as NodeJS.WriteStream,
    };
    const exit = await cli.run(["pr", "verify", "--help"], context);

    expect(exit).toBe(0);
    expect(stdout.join("")).toContain("pr verify");
  });

  it("times out with the pending check names", async () => {
    const { run } = fakeRunner(["", view({ rollup: runningRollup }), "0\t1", "0\t0", view({ rollup: runningRollup })]);
    const { errors } = captureConsole();

    const command = new PrVerifyCommand();
    command.runner = run;
    command.interval = "0";
    command.timeout = "0";
    const exit = await command.execute();

    expect(exit).toBe(2);
    expect(errors.join("\n")).toContain("pending after 0m: build");
  });

  it("times out marking never-started checks as queued", async () => {
    const { run } = fakeRunner(["", view({ rollup: queuedRollup }), "0\t1", "0\t0", view({ rollup: queuedRollup })]);
    const { errors } = captureConsole();

    const command = new PrVerifyCommand();
    command.runner = run;
    command.interval = "0";
    command.timeout = "0";
    const exit = await command.execute();

    expect(exit).toBe(2);
    expect(errors.join("\n")).toContain("pending after 0m: queued: build");
  });

  it("fails when the PR closes during the poll", async () => {
    const { run } = fakeRunner(["", view({ rollup: passingRollup }), "0\t1", "0\t0", "", view({ state: "CLOSED" })]);
    const { errors } = captureConsole();

    const command = new PrVerifyCommand();
    command.runner = run;
    command.interval = "0";
    const exit = await command.execute();

    expect(exit).toBe(1);
    expect(errors.join("\n")).toContain("state: CLOSED");
  });

  it("re-settles when the final view is UNKNOWN", async () => {
    const { run } = fakeRunner([
      "",
      view({ rollup: passingRollup }),
      "0\t1",
      "0\t0",
      "",
      view({ mergeable: "UNKNOWN", mergeStateStatus: "UNKNOWN" }),
      view({ rollup: passingRollup }),
      "",
      view({ rollup: passingRollup }),
      "0\t1",
      "0\t0",
    ]);
    const { logs } = captureConsole();

    const command = new PrVerifyCommand();
    command.runner = run;
    command.interval = "0";
    const exit = await command.execute();

    expect(exit).toBe(0);
    expect(logs).toEqual(["pass"]);
  });

  it("fails at the final gate on a conflicting PR", async () => {
    const { run } = fakeRunner([
      "",
      view({ rollup: passingRollup }),
      "0\t1",
      "0\t0",
      "",
      view({ mergeable: "CONFLICTING", rollup: passingRollup }),
    ]);
    const { errors } = captureConsole();

    const command = new PrVerifyCommand();
    command.runner = run;
    command.interval = "0";
    const exit = await command.execute();

    expect(exit).toBe(1);
    expect(errors.join("\n")).toContain("mergeable: CONFLICTING");
  });

  it("falls back to the default interval on a non-numeric value", async () => {
    const { run } = fakeRunner(["", view({ mergeStateStatus: "BLOCKED", rollup: emptyRollup }), "0\t1", "0\t0"]);
    captureConsole();

    const command = new PrVerifyCommand();
    command.runner = run;
    command.interval = "abc";
    command.timeout = "0";
    const exit = await command.execute();

    expect(exit).toBe(2);
  });

  it("falls back to the default interval on an empty value", async () => {
    const { run } = fakeRunner(["", view({ mergeStateStatus: "BLOCKED", rollup: emptyRollup }), "0\t1", "0\t0"]);
    captureConsole();

    const command = new PrVerifyCommand();
    command.runner = run;
    command.interval = "";
    command.timeout = "0";
    const exit = await command.execute();

    expect(exit).toBe(2);
  });

  it("uses the real runner when none is injected", async () => {
    vi.mocked(execRunner).mockImplementation((cmd: "git" | "gh", args: string[]) => {
      if (cmd === "gh") {
        return view({ rollup: passingRollup });
      }
      if (args[0] === "rev-list") {
        return args.includes("origin/develop...HEAD") ? "0\t1" : "0\t0";
      }
      return "";
    });
    const { logs } = captureConsole();

    const command = new PrVerifyCommand();
    const exit = await command.execute();

    expect(exit).toBe(0);
    expect(logs).toEqual(["pass"]);
  });
});
