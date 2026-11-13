// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  emptyRollup,
  queuedRollup,
  requeuedRollup,
  rerunRollup,
  runningRollup,
  runVerify,
  view,
} from "./pr-verify-support.js";

vi.mock("../../src/exec.js", () => ({ execRunner: vi.fn() }));

afterEach(() => {
  vi.restoreAllMocks();
});

const polling = { interval: "0" };

const graceCycle = [
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

const resetGrace = [
  "",
  view({ rollup: emptyRollup }),
  "0\t1",
  "0\t0",
  view({ rollup: emptyRollup }),
  view({ mergeStateStatus: "BLOCKED", rollup: queuedRollup }),
  view({ rollup: emptyRollup }),
  view({ rollup: emptyRollup }),
  view({ rollup: emptyRollup }),
  "",
  view({ rollup: emptyRollup }),
  "0\t1",
  "0\t0",
];

const requeuedThenPass = [
  "",
  view({ mergeStateStatus: "BLOCKED", rollup: requeuedRollup }),
  "0\t1",
  "0\t0",
  view({ rollup: rerunRollup }),
  "",
  view({ rollup: rerunRollup }),
  "0\t1",
  "0\t0",
];

const closedOnPoll = [
  "",
  view({ mergeStateStatus: "BLOCKED", rollup: runningRollup }),
  "0\t1",
  "0\t0",
  view({ state: "CLOSED" }),
];

describe("PrVerifyCommand", () => {
  it("waits out an empty rollup before passing a CLEAN head", async () => {
    const { exit, logs } = await runVerify(graceCycle, { interval: "0", timeout: "1" });

    expect(exit).toBe(0);
    expect(logs).toEqual(["pass"]);
  });

  it("resets the grace when checks appear", async () => {
    const { exit, logs, calls } = await runVerify(resetGrace, polling);

    expect(exit).toBe(0);
    expect(logs).toEqual(["pass"]);
    expect(calls.filter((call) => call.startsWith("gh pr view"))).toHaveLength(7);
  });
});

describe("PrVerifyCommand", () => {
  it("sees a re-queued run as pending and passes after it completes", async () => {
    const { exit, logs } = await runVerify(requeuedThenPass, polling);

    expect(exit).toBe(0);
    expect(logs).toEqual(["pass"]);
  });
});

describe("PrVerifyCommand", () => {
  it("fails when the PR closes on a poll read", async () => {
    const { exit, errors } = await runVerify(closedOnPoll, polling);

    expect(exit).toBe(1);
    expect(errors.join("\n")).toContain("state: CLOSED");
  });

  it("fails fast when the runner errors on the view", async () => {
    const { exit } = await runVerify(["", new Error("gh: Not logged in")]);

    expect(exit).toBe(1);
  });
});
