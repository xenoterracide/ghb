// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, describe, expect, it, vi } from "vitest";
import { PrSyncCommand } from "../../src/commands/pr-sync.js";
import { execRunner, type Runner } from "../../src/exec.js";

vi.mock("../../src/exec.js", () => ({ execRunner: vi.fn() }));

interface SyncResult {
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

async function runSync(script: (string | Error)[]): Promise<SyncResult> {
  const { run, calls } = fakeRunner(script);
  const { logs, errors } = captureConsole();
  const command = new PrSyncCommand();
  command.runner = run;
  const exit = await command.execute();
  return { exit, logs, errors, calls };
}

const untrackedNoCollision = ["", "origin/develop", "topic", "1", "0", "", "scratch.txt", "src/new.txt"];

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PrSyncCommand", () => {
  it("merges when behind the base branch and pushes", async () => {
    const { exit, logs, calls } = await runSync(["", "origin/develop", "topic", "0", "0", "2", ""]);

    expect(exit).toBe(0);
    expect(logs).toEqual(["merged 2 commits"]);
    expect(calls).toContain("git merge origin/develop --quiet");
    expect(calls).toContain("git push --quiet");
  });

  it("prints up to date when nothing to do and still pushes", async () => {
    const { exit, logs, calls } = await runSync(["", "origin/develop", "topic", "0", "0", "0", ""]);

    expect(exit).toBe(0);
    expect(logs).toEqual(["up to date"]);
    expect(calls).toContain("git push --quiet");
  });
});

describe("PrSyncCommand", () => {
  it("resets to remote when the remote branch is ahead and local is clean", async () => {
    const { exit, logs, calls } = await runSync(["", "origin/develop", "topic", "1", "0", "", "", ""]);

    expect(exit).toBe(0);
    expect(logs).toEqual(["reset to remote"]);
    expect(calls).toContain("git reset --hard origin/topic");
    expect(calls).toContain("git push --quiet");
  });

  it("merges the base after resetting to an ahead remote", async () => {
    const { exit, logs, calls } = await runSync(["", "origin/develop", "topic", "1", "0", "", "", "", "3", ""]);

    expect(exit).toBe(0);
    expect(logs).toEqual(["reset to remote", "merged 3 commits"]);
    expect(calls).toContain("git reset --hard origin/topic");
    expect(calls).toContain("git merge origin/develop --quiet");
    expect(calls).toContain("git push --quiet");
  });
});

describe("PrSyncCommand", () => {
  it("trims the newline git branch prints", async () => {
    const { exit, logs, calls } = await runSync(["", "origin/develop", "topic\n", "1", "0", "", "", ""]);

    expect(exit).toBe(0);
    expect(logs).toEqual(["reset to remote"]);
    expect(calls).toContain("git reset --hard origin/topic");
    expect(calls.some((call) => call.includes("\n"))).toBe(false);
  });

  it("resets when untracked files do not collide with the target", async () => {
    const { exit, logs, calls } = await runSync(untrackedNoCollision);

    expect(exit).toBe(0);
    expect(logs).toEqual(["reset to remote"]);
    expect(calls).toContain("git reset --hard origin/topic");
    expect(calls).toContain("git push --quiet");
  });
});

describe("PrSyncCommand", () => {
  it("refuses to reset over a dirty worktree", async () => {
    const { exit, errors, calls } = await runSync(["", "origin/develop", "topic", "1", "0", " M src/file.ts"]);

    expect(exit).toBe(1);
    expect(errors.join("\n")).toContain("dirty worktree");
    expect(calls.some((call) => call.startsWith("git reset"))).toBe(false);
    expect(calls).not.toContain("git push --quiet");
  });

  it("refuses to reset over an untracked file the target tracks", async () => {
    const { exit, errors, calls } = await runSync(["", "origin/develop", "topic", "1", "0", "", "new.txt", "new.txt"]);

    expect(exit).toBe(1);
    expect(errors.join("\n")).toContain("untracked");
    expect(errors.join("\n")).toContain("new.txt");
    expect(calls.some((call) => call.startsWith("git reset"))).toBe(false);
    expect(calls).not.toContain("git push --quiet");
  });
});

describe("PrSyncCommand", () => {
  it("includes ignored files in the collision check", async () => {
    // reset --hard replaces an ignored file the target tracks, so the
    // untracked set must not exclude them
    const script = ["", "origin/develop", "topic", "1", "0", "", "ignored.txt", "ignored.txt"];
    const { exit, errors, calls } = await runSync(script);

    expect(exit).toBe(1);
    expect(errors.join("\n")).toContain("ignored.txt");
    expect(calls).toContain("git ls-files --others");
    expect(calls).not.toContain("git ls-files --others --exclude-standard");
  });

  it("refuses to reset when local and remote diverged", async () => {
    const { exit, errors, calls } = await runSync(["", "origin/develop", "topic", "3", "1"]);

    expect(exit).toBe(1);
    const printed = errors.join("\n");
    expect(printed).toContain("local 1 ahead");
    expect(printed).toContain("remote 3 ahead");
    expect(calls.some((call) => call.startsWith("git reset"))).toBe(false);
    expect(calls).not.toContain("git push --quiet");
  });
});

describe("PrSyncCommand", () => {
  it("fails fast when origin/HEAD is detached or missing", async () => {
    const { exit, errors, calls } = await runSync(["", new Error("fatal: not a symbolic ref")]);

    expect(exit).toBe(1);
    expect(errors.join("\n")).toContain("set-head");
    expect(calls.some((call) => call.startsWith("git reset"))).toBe(false);
    expect(calls).not.toContain("git push --quiet");
  });

  it("prints porcelain status on merge conflict", async () => {
    const script = ["", "origin/develop", "topic", "0", "0", "2", new Error("merge failed"), "UU src/file.ts"];
    const { exit, logs } = await runSync(script);

    expect(exit).toBe(1);
    expect(logs.join("\n")).toContain("UU src/file.ts");
  });
});

describe("PrSyncCommand", () => {
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

    const exit = await new PrSyncCommand().execute();

    expect(exit).toBe(0);
    expect(logs).toEqual(["up to date"]);
  });
});
