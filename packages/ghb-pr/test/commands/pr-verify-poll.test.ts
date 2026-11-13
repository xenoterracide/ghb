// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  emptyRollup,
  mixedRollup,
  passingRollup,
  queuedRollup,
  runningRollup,
  runVerify,
  view,
} from "./pr-verify-support.js";

vi.mock("../../src/exec.js", () => ({ execRunner: vi.fn() }));

afterEach(() => {
  vi.restoreAllMocks();
});

const polling = { interval: "0" };

const blockedThenGreen = [
  "",
  view({ mergeStateStatus: "BLOCKED", rollup: runningRollup }),
  "0\t1",
  "0\t0",
  view({ rollup: passingRollup }),
  "",
  view({ rollup: passingRollup }),
  "0\t1",
  "0\t0",
];

const blockedAfterChecks = [
  "",
  view({ rollup: passingRollup }),
  "0\t1",
  "0\t0",
  "",
  view({ mergeStateStatus: "BLOCKED", rollup: passingRollup }),
];

const currencyRecheck = [
  "",
  view({ rollup: passingRollup }),
  "0\t1",
  "0\t0",
  "",
  view({ rollup: passingRollup }),
  "1\t0",
];

const runlessCycle = [
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
];

const queuedCheck = [
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
];

const unknownSettles = [
  "",
  view({ mergeable: "UNKNOWN", mergeStateStatus: "UNKNOWN" }),
  "0\t1",
  "0\t0",
  view({ rollup: passingRollup }),
  "",
  view({ rollup: passingRollup }),
  "0\t1",
  "0\t0",
];

const timeoutRunning = ["", view({ rollup: runningRollup }), "0\t1", "0\t0", view({ rollup: runningRollup })];
const timeoutQueued = ["", view({ rollup: queuedRollup }), "0\t1", "0\t0", view({ rollup: queuedRollup })];
const timeoutMixed = ["", view({ rollup: mixedRollup }), "0\t1", "0\t0", view({ rollup: mixedRollup })];
const closedDuring = ["", view({ rollup: passingRollup }), "0\t1", "0\t0", "", view({ state: "CLOSED" })];

const finalUnknown = [
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
];

const finalGateError = ["", view({ rollup: passingRollup }), "0\t1", "0\t0", "", new Error("gh died")];

const conflicting = [
  "",
  view({ rollup: passingRollup }),
  "0\t1",
  "0\t0",
  "",
  view({ mergeable: "CONFLICTING", rollup: passingRollup }),
];

const blockedRunless = ["", view({ mergeStateStatus: "BLOCKED", rollup: emptyRollup }), "0\t1", "0\t0"];

const unknownBlocked = ["", view({ mergeable: "UNKNOWN", mergeStateStatus: "UNKNOWN" }), "0\t1", "0\t0"];

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
    const { exit, errors } = await runVerify(currencyRecheck, polling);

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
    const { exit, errors } = await runVerify(blockedRunless, { interval: "0", timeout: "0" });

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
    const { exit, errors } = await runVerify(unknownBlocked, { interval: "0", timeout: "0" });

    expect(exit).toBe(2);
    expect(errors.join("\n")).toContain("pending after 0m: mergeability");
  });
});

describe("PrVerifyCommand", () => {
  it("times out with the pending check names", async () => {
    const { exit, errors } = await runVerify(timeoutRunning, { interval: "0", timeout: "0" });

    expect(exit).toBe(2);
    expect(errors.join("\n")).toContain("pending after 0m: build");
  });

  it("times out marking never-started checks as queued", async () => {
    const { exit, errors } = await runVerify(timeoutQueued, { interval: "0", timeout: "0" });

    expect(exit).toBe(2);
    expect(errors.join("\n")).toContain("pending after 0m: queued: build");
  });
});

describe("PrVerifyCommand", () => {
  it("times out naming started checks before queued ones", async () => {
    const { exit, errors } = await runVerify(timeoutMixed, { interval: "0", timeout: "0" });

    expect(exit).toBe(2);
    expect(errors.join("\n")).toContain("pending after 0m: build; queued: lint");
  });

  it("fails when the PR closes during the poll", async () => {
    const { exit, errors } = await runVerify(closedDuring, polling);

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
    const { exit } = await runVerify(finalGateError, polling);

    expect(exit).toBe(1);
  });
});

describe("PrVerifyCommand", () => {
  it("fails at the final gate on a conflicting PR", async () => {
    const { exit, errors } = await runVerify(conflicting, polling);

    expect(exit).toBe(1);
    expect(errors.join("\n")).toContain("mergeable: CONFLICTING");
  });

  it("falls back to the default interval on a non-numeric value", async () => {
    const { exit } = await runVerify(blockedRunless, { interval: "abc", timeout: "0" });

    expect(exit).toBe(2);
  });
});

describe("PrVerifyCommand", () => {
  it("falls back to the default interval on an empty value", async () => {
    const { exit } = await runVerify(blockedRunless, { interval: "", timeout: "0" });

    expect(exit).toBe(2);
  });
});
