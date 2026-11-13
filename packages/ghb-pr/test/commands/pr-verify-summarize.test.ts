// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { bucketOf, summarize } from "../../src/pr-gates.js";
import {
  requeuedRollup,
  rerunRollup,
  staleAloneRollup,
  staleBesideSuccessRollup,
  startupFailureRollup,
  statusContext,
} from "./pr-verify-support.js";

const loneSuccessRollup = [
  {
    name: "pnpm / check",
    status: "COMPLETED",
    conclusion: "SUCCESS",
    startedAt: "2026-11-11T19:00:00Z",
    workflowName: "test",
  },
];

const newestFailureRollup = [
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

const differentWorkflowsRollup = [
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

const inFlightRollup = [
  {
    name: "build",
    status: "COMPLETED",
    conclusion: "SUCCESS",
    startedAt: "2026-11-11T18:00:00Z",
    workflowName: "test",
  },
  { name: "build", status: "IN_PROGRESS", startedAt: "2026-11-11T19:00:00Z", workflowName: "test" },
];

const running = {
  name: "build",
  status: "IN_PROGRESS",
  startedAt: "2026-11-11T19:00:00Z",
  workflowName: "test",
};
const queued = { name: "build", status: "QUEUED", startedAt: null, workflowName: "test" };
const unparseable = {
  name: "build",
  status: "IN_PROGRESS",
  startedAt: "not a timestamp",
  workflowName: "test",
};

describe("bucketOf", () => {
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
});

describe("summarize", () => {
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
});

describe("summarize", () => {
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
    expect(summarize(loneSuccessRollup)).toEqual([{ name: "pnpm / check", bucket: "pass", started: true }]);
  });
});

describe("summarize", () => {
  it("fails a group whose newest verdict is failure with no run in flight", () => {
    expect(summarize(newestFailureRollup)).toEqual([{ name: "build", bucket: "fail", started: true }]);
  });

  it("clears a failed group whose re-run passed", () => {
    expect(summarize(requeuedRollup)).toEqual([{ name: "build", bucket: "pending", started: false }]);
    expect(summarize(rerunRollup)).toEqual([{ name: "build", bucket: "pass", started: true }]);
  });
});

describe("summarize", () => {
  it("keeps runs of different workflows apart when they share a name", () => {
    expect(summarize(differentWorkflowsRollup)).toEqual([
      { name: "build", bucket: "pass", started: true },
      { name: "build", bucket: "fail", started: true },
    ]);
  });

  it("marks a group in flight on a runner as started", () => {
    expect(summarize(inFlightRollup)).toEqual([{ name: "build", bucket: "pending", started: true }]);
  });
});

describe("summarize", () => {
  it("marks a pending group started only when every in-flight run started", () => {
    expect(summarize([running, queued])).toEqual([{ name: "build", bucket: "pending", started: false }]);
    expect(summarize([queued, running])).toEqual([{ name: "build", bucket: "pending", started: false }]);
    expect(summarize([running, unparseable])).toEqual([{ name: "build", bucket: "pending", started: false }]);
  });
});

describe("summarize stale runs", () => {
  it("ignores a stale run superseded by a newer success", () => {
    // gh pr view returns every run; gh pr checks dedupes them. a stale run
    // folded as pending would poll a green PR to its timeout
    expect(summarize(staleBesideSuccessRollup)).toEqual([{ name: "build", bucket: "pass", started: true }]);
  });

  it("ignores a lone stale run rather than reporting it pending", () => {
    expect(summarize(staleAloneRollup)).toEqual([]);
  });
});

describe("summarize startup failures", () => {
  it("fails a completed STARTUP_FAILURE run", () => {
    expect(summarize(startupFailureRollup)).toEqual([{ name: "build", bucket: "fail", started: true }]);
  });
});
