// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, describe, expect, it, vi } from "vitest";
import { PrSyncCommand } from "../../src/commands/pr-sync.js";
import { execRunner, type Runner } from "../../src/exec.js";

vi.mock("../../src/exec.js", () => ({ execRunner: vi.fn() }));

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
    const { run, calls } = fakeRunner(["", "origin/develop", "topic", "0", "0", "2", ""]);
    const { logs } = captureConsole();

    const command = new PrSyncCommand();
    command.runner = run;
    const exit = await command.execute();

    expect(exit).toBe(0);
    expect(logs).toEqual(["merged 2 commits"]);
    expect(calls).toContain("git merge origin/develop --quiet");
    expect(calls).toContain("git push --quiet");
  });

  it("prints up to date when nothing to do and still pushes", async () => {
    const { run, calls } = fakeRunner(["", "origin/develop", "topic", "0", "0", "0", ""]);
    const { logs } = captureConsole();

    const command = new PrSyncCommand();
    command.runner = run;
    const exit = await command.execute();

    expect(exit).toBe(0);
    expect(logs).toEqual(["up to date"]);
    expect(calls).toContain("git push --quiet");
  });

  it("resets to remote when the remote branch is ahead and local is clean", async () => {
    const { run, calls } = fakeRunner(["", "origin/develop", "topic", "1", "0", "", "", ""]);
    const { logs } = captureConsole();

    const command = new PrSyncCommand();
    command.runner = run;
    const exit = await command.execute();

    expect(exit).toBe(0);
    expect(logs).toEqual(["reset to remote"]);
    expect(calls).toContain("git reset --hard origin/topic");
    expect(calls).toContain("git push --quiet");
  });

  it("merges the base after resetting to an ahead remote", async () => {
    const { run, calls } = fakeRunner(["", "origin/develop", "topic", "1", "0", "", "", "", "3", ""]);
    const { logs } = captureConsole();

    const command = new PrSyncCommand();
    command.runner = run;
    const exit = await command.execute();

    expect(exit).toBe(0);
    expect(logs).toEqual(["reset to remote", "merged 3 commits"]);
    expect(calls).toContain("git reset --hard origin/topic");
    expect(calls).toContain("git merge origin/develop --quiet");
    expect(calls).toContain("git push --quiet");
  });

  it("trims the newline git branch prints", async () => {
    const { run, calls } = fakeRunner(["", "origin/develop", "topic\n", "1", "0", "", "", ""]);
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
    const { run, calls } = fakeRunner(["", "origin/develop", "topic", "1", "0", " M src/file.ts"]);
    const { errors } = captureConsole();

    const command = new PrSyncCommand();
    command.runner = run;
    const exit = await command.execute();

    expect(exit).toBe(1);
    expect(errors.join("\n")).toContain("dirty worktree");
    expect(calls.some((call) => call.startsWith("git reset"))).toBe(false);
    expect(calls).not.toContain("git push --quiet");
  });

  it("refuses to reset over an untracked file the target tracks", async () => {
    const { run, calls } = fakeRunner(["", "origin/develop", "topic", "1", "0", "", "new.txt", "new.txt"]);
    const { errors } = captureConsole();

    const command = new PrSyncCommand();
    command.runner = run;
    const exit = await command.execute();

    expect(exit).toBe(1);
    expect(errors.join("\n")).toContain("untracked");
    expect(errors.join("\n")).toContain("new.txt");
    expect(calls.some((call) => call.startsWith("git reset"))).toBe(false);
    expect(calls).not.toContain("git push --quiet");
  });

  it("includes ignored files in the collision check", async () => {
    // reset --hard replaces an ignored file the target tracks, so the
    // untracked set must not exclude them
    const { run, calls } = fakeRunner(["", "origin/develop", "topic", "1", "0", "", "ignored.txt", "ignored.txt"]);
    const { errors } = captureConsole();

    const command = new PrSyncCommand();
    command.runner = run;
    const exit = await command.execute();

    expect(exit).toBe(1);
    expect(errors.join("\n")).toContain("ignored.txt");
    expect(calls).toContain("git ls-files --others");
    expect(calls).not.toContain("git ls-files --others --exclude-standard");
  });

  it("resets when untracked files do not collide with the target", async () => {
    const { run, calls } = fakeRunner(["", "origin/develop", "topic", "1", "0", "", "scratch.txt", "src/new.txt"]);
    const { logs } = captureConsole();

    const command = new PrSyncCommand();
    command.runner = run;
    const exit = await command.execute();

    expect(exit).toBe(0);
    expect(logs).toEqual(["reset to remote"]);
    expect(calls).toContain("git reset --hard origin/topic");
    expect(calls).toContain("git push --quiet");
  });

  it("refuses to reset when local and remote diverged", async () => {
    const { run, calls } = fakeRunner(["", "origin/develop", "topic", "3", "1"]);
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

  it("fails fast when origin/HEAD is detached or missing", async () => {
    const { run, calls } = fakeRunner(["", new Error("fatal: not a symbolic ref")]);
    const { errors } = captureConsole();

    const command = new PrSyncCommand();
    command.runner = run;
    const exit = await command.execute();

    expect(exit).toBe(1);
    expect(errors.join("\n")).toContain("set-head");
    expect(calls.some((call) => call.startsWith("git reset"))).toBe(false);
    expect(calls).not.toContain("git push --quiet");
  });

  it("prints porcelain status on merge conflict", async () => {
    const { run } = fakeRunner([
      "",
      "origin/develop",
      "topic",
      "0",
      "0",
      "2",
      new Error("merge failed"),
      "UU src/file.ts",
    ]);
    const { logs } = captureConsole();

    const command = new PrSyncCommand();
    command.runner = run;
    const exit = await command.execute();

    expect(exit).toBe(1);
    expect(logs.join("\n")).toContain("UU src/file.ts");
  });

  it("uses the real runner when none is injected", async () => {
    vi.mocked(execRunner).mockImplementation((cmd: "git" | "gh", args: string[]) => {
      const [arg] = args;
      if (arg === "symbolic-ref") {
        return "origin/develop";
      }
      if (arg === "branch") {
        return "topic";
      }
      if (arg === "rev-list") {
        return "0";
      }
      return "";
    });
    const { logs } = captureConsole();

    const command = new PrSyncCommand();
    const exit = await command.execute();

    expect(exit).toBe(0);
    expect(logs).toEqual(["up to date"]);
  });
});
