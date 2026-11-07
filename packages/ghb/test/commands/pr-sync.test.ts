// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, describe, expect, it, vi } from "vitest";
import { PrSyncCommand } from "../../src/commands/pr-sync.js";
import type { Runner } from "../../src/exec.js";

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

describe("PrSyncCommand", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("merges when behind the base branch and pushes", async () => {
    const { run, calls } = fakeRunner(["", "topic", "0", "0", "2", "", ""]);
    const { logs } = captureConsole();

    const command = new PrSyncCommand();
    command.runner = run;
    const exit = await command.execute();

    expect(exit).toBe(0);
    expect(logs).toEqual(["merged 2 commits"]);
    expect(calls).toContain("git merge origin/HEAD --quiet");
    expect(calls).toContain("git push --quiet");
  });

  it("prints up to date when nothing to do and still pushes", async () => {
    const { run, calls } = fakeRunner(["", "topic", "0", "0", "0", ""]);
    const { logs } = captureConsole();

    const command = new PrSyncCommand();
    command.runner = run;
    const exit = await command.execute();

    expect(exit).toBe(0);
    expect(logs).toEqual(["up to date"]);
    expect(calls).toContain("git push --quiet");
  });

  it("resets to remote when the remote branch is ahead and local is clean", async () => {
    const { run, calls } = fakeRunner(["", "topic", "1", "0", "", "", ""]);
    const { logs } = captureConsole();

    const command = new PrSyncCommand();
    command.runner = run;
    const exit = await command.execute();

    expect(exit).toBe(0);
    expect(logs).toEqual(["reset to remote"]);
    expect(calls).toContain("git reset --hard origin/topic");
    expect(calls).toContain("git push --quiet");
  });

  it("trims the newline git branch prints", async () => {
    const { run, calls } = fakeRunner(["", "topic\n", "1", "0", "", "", ""]);
    const { logs } = captureConsole();

    const command = new PrSyncCommand();
    command.runner = run;
    const exit = await command.execute();

    expect(exit).toBe(0);
    expect(logs).toEqual(["reset to remote"]);
    expect(calls).toContain("git reset --hard origin/topic");
    expect(calls.some((call) => call.includes("\n"))).toBe(false);
  });

  it("refuses to reset over a dirty worktree", async () => {
    const { run, calls } = fakeRunner(["", "topic", "1", "0", " M src/file.ts"]);
    const { errors } = captureConsole();

    const command = new PrSyncCommand();
    command.runner = run;
    const exit = await command.execute();

    expect(exit).toBe(1);
    expect(errors.join("\n")).toContain("dirty worktree");
    expect(calls.some((call) => call.startsWith("git reset"))).toBe(false);
    expect(calls).not.toContain("git push --quiet");
  });

  it("refuses to reset when local and remote diverged", async () => {
    const { run, calls } = fakeRunner(["", "topic", "3", "1"]);
    const { errors } = captureConsole();

    const command = new PrSyncCommand();
    command.runner = run;
    const exit = await command.execute();

    expect(exit).toBe(1);
    const printed = errors.join("\n");
    expect(printed).toContain("local 1 ahead");
    expect(printed).toContain("remote 3 ahead");
    expect(calls.some((call) => call.startsWith("git reset"))).toBe(false);
    expect(calls).not.toContain("git push --quiet");
  });

  it("prints porcelain status on merge conflict", async () => {
    const { run } = fakeRunner(["", "topic", "0", "0", "2", new Error("merge failed"), "UU src/file.ts"]);
    const { logs } = captureConsole();

    const command = new PrSyncCommand();
    command.runner = run;
    const exit = await command.execute();

    expect(exit).toBe(1);
    expect(logs.join("\n")).toContain("UU src/file.ts");
  });
});
