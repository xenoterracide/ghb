// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, describe, expect, it, vi } from "vitest";
import { PrVerifyCommand } from "../../src/commands/pr-verify.js";
import { execRunner } from "../../src/exec.js";
import {
  captureConsole,
  failingRollup,
  passingRollup,
  realGreenRunner,
  runVerify,
  twoChecksRollup,
  view,
} from "./pr-verify-support.js";

vi.mock("../../src/exec.js", () => ({ execRunner: vi.fn() }));

afterEach(() => {
  vi.restoreAllMocks();
});

const passingCycle = [
  "",
  view({ rollup: twoChecksRollup }),
  "0\t1",
  "0\t0",
  "",
  view({ rollup: twoChecksRollup }),
  "0\t1",
  "0\t0",
];

const forwardedCycle = [
  "",
  view({ rollup: passingRollup }),
  "0\t1",
  "0\t0",
  "",
  view({ rollup: passingRollup }),
  "0\t1",
  "0\t0",
];

describe("PrVerifyCommand", () => {
  it("prints pass when open, current, mergeable, and every check passes", async () => {
    const { exit, logs, errors, calls } = await runVerify(passingCycle);

    expect(exit).toBe(0);
    expect(logs).toEqual(["pass"]);
    expect(errors).toEqual([]);
    expect(calls).toContain(
      "gh pr view --json state,mergeable,mergeStateStatus,baseRefName,headRefName,statusCheckRollup",
    );
    expect(calls.some((call) => call.startsWith("gh pr checks"))).toBe(false);
  });

  it("fails behind base without polling checks", async () => {
    const { exit, errors, calls } = await runVerify(["", view({ rollup: passingRollup }), "3\t0", "0\t0"]);

    expect(exit).toBe(1);
    expect(errors.join("\n")).toContain("behind base by 3 commits");
    expect(calls.some((call) => call.startsWith("gh pr checks"))).toBe(false);
  });
});

describe("PrVerifyCommand", () => {
  it("fails on mergeStateStatus without polling", async () => {
    const { exit, errors, calls } = await runVerify(["", view({ mergeStateStatus: "DIRTY" }), "0\t1", "0\t0"]);

    expect(exit).toBe(1);
    expect(errors.join("\n")).toContain("mergeStateStatus: DIRTY");
    expect(calls.some((call) => call.startsWith("gh pr checks"))).toBe(false);
  });

  it("fails on a fail bucket despite gh exiting 0", async () => {
    const { exit, errors } = await runVerify(["", view({ rollup: failingRollup }), "0\t1", "0\t0"]);

    expect(exit).toBe(1);
    expect(errors.join("\n")).toContain("fail: build");
  });
});

describe("PrVerifyCommand", () => {
  it("fails fast on a gh error that is not a runless head", async () => {
    const { exit } = await runVerify(
      ["", view({ rollup: passingRollup }), "0\t1", "0\t0", "", new Error("gh: Not logged in")],
      { interval: "0", timeout: "0" },
    );

    expect(exit).toBe(1);
  });

  it("fails when local is ahead of the remote head", async () => {
    const { exit, errors } = await runVerify(["", view({ rollup: passingRollup }), "0\t1", "1\t0"]);

    expect(exit).toBe(1);
    expect(errors.join("\n")).toContain("ahead of origin/topic by 1 commits");
  });
});

describe("PrVerifyCommand", () => {
  it("fails when local is behind the remote head", async () => {
    const { exit, errors } = await runVerify(["", view({ rollup: passingRollup }), "0\t1", "0\t2"]);

    expect(exit).toBe(1);
    expect(errors.join("\n")).toContain("behind origin/topic by 2 commits");
  });

  it("fails when local has diverged from the remote head", async () => {
    const { exit, errors } = await runVerify(["", view({ rollup: passingRollup }), "0\t1", "1\t2"]);

    expect(exit).toBe(1);
    expect(errors.join("\n")).toContain("diverged from origin/topic");
  });
});

describe("PrVerifyCommand", () => {
  it("forwards the PR selector to gh pr view", async () => {
    const { exit, calls } = await runVerify(forwardedCycle, { forward: ["585"] });

    const forwardedCall =
      "gh pr view --json state,mergeable,mergeStateStatus,baseRefName,headRefName,statusCheckRollup 585";
    expect(exit).toBe(0);
    expect(calls.filter((call) => call === forwardedCall)).toHaveLength(2);
  });

  it("uses the real runner when none is injected", async () => {
    vi.mocked(execRunner).mockImplementation(realGreenRunner);
    const { logs } = captureConsole();

    const exit = await new PrVerifyCommand().execute();

    expect(exit).toBe(0);
    expect(logs).toEqual(["pass"]);
  });
});
