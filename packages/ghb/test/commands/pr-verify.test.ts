// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, describe, expect, it, vi } from "vitest";
import { PrVerifyCommand } from "../../src/commands/pr-verify.js";
import type { Runner } from "../../src/exec.js";

const greenView = JSON.stringify({
  state: "OPEN",
  mergeable: "MERGEABLE",
  mergeStateStatus: "CLEAN",
  baseRefName: "develop",
  headRefName: "topic",
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

describe("PrVerifyCommand", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints pass when open, current, mergeable, and every check passes", async () => {
    const { run, calls } = fakeRunner([
      "",
      greenView,
      "0\t1",
      "0\t0",
      JSON.stringify([
        { name: "build", bucket: "pass" },
        { name: "lint", bucket: "pass" },
      ]),
    ]);
    const { logs, errors } = captureConsole();

    const command = new PrVerifyCommand();
    command.runner = run;
    const exit = await command.execute();

    expect(exit).toBe(0);
    expect(logs).toEqual(["pass"]);
    expect(errors).toEqual([]);
    expect(calls).toContain("gh pr checks --json name,bucket");
  });

  it("fails behind base without polling checks", async () => {
    const { run, calls } = fakeRunner(["", greenView, "3\t0", "0\t0"]);
    const { errors } = captureConsole();

    const command = new PrVerifyCommand();
    command.runner = run;
    const exit = await command.execute();

    expect(exit).toBe(1);
    expect(errors.join("\n")).toContain("behind base by 3 commits");
    expect(calls.some((call) => call.startsWith("gh pr checks"))).toBe(false);
  });

  it("fails on mergeStateStatus without polling", async () => {
    const view = JSON.stringify({
      state: "OPEN",
      mergeable: "MERGEABLE",
      mergeStateStatus: "DIRTY",
      baseRefName: "develop",
      headRefName: "topic",
    });
    const { run, calls } = fakeRunner(["", view, "0\t1", "0\t0"]);
    const { errors } = captureConsole();

    const command = new PrVerifyCommand();
    command.runner = run;
    const exit = await command.execute();

    expect(exit).toBe(1);
    expect(errors.join("\n")).toContain("mergeStateStatus: DIRTY");
    expect(calls.some((call) => call.startsWith("gh pr checks"))).toBe(false);
  });

  it("fails on a fail bucket despite gh exiting 0", async () => {
    const { run } = fakeRunner(["", greenView, "0\t1", "0\t0", JSON.stringify([{ name: "build", bucket: "fail" }])]);
    const { errors } = captureConsole();

    const command = new PrVerifyCommand();
    command.runner = run;
    const exit = await command.execute();

    expect(exit).toBe(1);
    expect(errors.join("\n")).toContain("fail: build");
  });

  it("treats a runless head as pending until timeout", async () => {
    const { run } = fakeRunner(["", greenView, "0\t1", "0\t0", new Error("no checks"), new Error("no checks")]);
    const { errors } = captureConsole();

    const command = new PrVerifyCommand();
    command.runner = run;
    command.interval = "0";
    command.timeout = "0";
    const exit = await command.execute();

    expect(exit).toBe(2);
    expect(errors.join("\n")).toContain("pending after 0m");
  });

  it("pends through a pending bucket to pass", async () => {
    const { run } = fakeRunner([
      "",
      greenView,
      "0\t1",
      "0\t0",
      JSON.stringify([{ name: "build", bucket: "pending" }]),
      JSON.stringify([{ name: "build", bucket: "pass" }]),
    ]);
    const { logs } = captureConsole();

    const command = new PrVerifyCommand();
    command.runner = run;
    command.interval = "0";
    const exit = await command.execute();

    expect(exit).toBe(0);
    expect(logs).toEqual(["pass"]);
  });

  it("fails when local has diverged from the remote head", async () => {
    const { run } = fakeRunner(["", greenView, "0\t1", "1\t0"]);
    const { errors } = captureConsole();

    const command = new PrVerifyCommand();
    command.runner = run;
    const exit = await command.execute();

    expect(exit).toBe(1);
    expect(errors.join("\n")).toContain("diverged from origin/topic");
  });
});
