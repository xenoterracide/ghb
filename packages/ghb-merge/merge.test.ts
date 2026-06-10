// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect, vi } from "vitest";
import {
  findMainRepoRoot,
  parseAndWriteMessage,
  getBranch,
  hasPR,
  getHead,
  isPRMerged,
  createOrUpdatePR,
  type CommandRunner,
  type FileSystem,
} from "./merge";

describe("findMainRepoRoot", () => {
  it("should return the directory when .git exists and no parent .gitmodules", () => {
    const fs = {
      existsSync: vi.fn((path: string) => {
        if (path === "/project/.git") return true;
        if (path === "/project/../.gitmodules") return false;
        return false;
      }),
    };

    const result = findMainRepoRoot("/project", fs);
    expect(result).toBe("/project");
  });

  it("should walk up when parent has .gitmodules (submodule)", () => {
    const fs = {
      existsSync: vi.fn((path: string) => {
        // First iteration: /project/sub
        if (path === "/project/sub/.git") return true;
        if (path === "/project/.gitmodules") return true; // parent has .gitmodules
        // After moving up to /project:
        if (path === "/project/.git") return true;
        if (path === "/.gitmodules") return false; // root has no .gitmodules
        return false;
      }),
    };

    const result = findMainRepoRoot("/project/sub", fs);
    expect(result).toBe("/project");
  });

  it("should walk up multiple levels to find main repo", () => {
    const fs = {
      existsSync: vi.fn((path: string) => {
        if (path === "/a/b/c/d/.git") return false;
        if (path === "/a/b/c/.git") return false;
        if (path === "/a/b/.git") return true;
        if (path === "/a/b/../.gitmodules") return false;
        return false;
      }),
    };

    const result = findMainRepoRoot("/a/b/c/d", fs);
    expect(result).toBe("/a/b");
  });
});

describe("parseAndWriteMessage", () => {
  const createMockFs = (): FileSystem => ({
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => ""),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    mkdtempSync: vi.fn(() => "/tmp/test-123"),
    rmSync: vi.fn(),
  });

  it("should extract conventional commit subject and body", async () => {
    const fs = createMockFs();
    const aiOutput = `feat(auth): add OAuth2 login support

- Implement Google OAuth2 provider
- Add token refresh mechanism
- Update login UI with OAuth button`;

    await parseAndWriteMessage(aiOutput, "/tmp/title.txt", "/tmp/body.txt", fs);

    expect(fs.writeFileSync).toHaveBeenCalledWith("/tmp/title.txt", "feat(auth): add OAuth2 login support\n", {
      encoding: "utf8",
    });
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      "/tmp/body.txt",
      "- Implement Google OAuth2 provider\n- Add token refresh mechanism\n- Update login UI with OAuth button",
      { encoding: "utf8" },
    );
  });

  it("should handle commit with breaking change marker", async () => {
    const fs = createMockFs();
    const aiOutput = `feat(api)!: remove deprecated endpoints

BREAKING CHANGE: /v1/users endpoint removed
- Migrate to /v2/users
- Update client libraries`;

    await parseAndWriteMessage(aiOutput, "/tmp/title.txt", "/tmp/body.txt", fs);

    expect(fs.writeFileSync).toHaveBeenCalledWith("/tmp/title.txt", "feat(api)!: remove deprecated endpoints\n", {
      encoding: "utf8",
    });
  });

  it("should handle commit without scope", async () => {
    const fs = createMockFs();
    const aiOutput = `fix: resolve memory leak in worker thread

- Clean up event listeners on exit
- Add proper resource disposal`;

    await parseAndWriteMessage(aiOutput, "/tmp/title.txt", "/tmp/body.txt", fs);

    expect(fs.writeFileSync).toHaveBeenCalledWith("/tmp/title.txt", "fix: resolve memory leak in worker thread\n", {
      encoding: "utf8",
    });
  });

  it("should clean up common AI prefixes from subject", async () => {
    const fs = createMockFs();
    const aiOutput = `Here's a suggested commit message:

feat: add new feature

- Implementation details`;

    await parseAndWriteMessage(aiOutput, "/tmp/title.txt", "/tmp/body.txt", fs);

    expect(fs.writeFileSync).toHaveBeenCalledWith("/tmp/title.txt", "feat: add new feature\n", { encoding: "utf8" });
  });

  it("should truncate subject to 72 characters", async () => {
    const fs = createMockFs();
    // "feat: " is 6 characters, so we need 66 more to reach 72
    const longSubject = "a".repeat(100);
    const aiOutput = `feat: ${longSubject}

Body text`;

    await parseAndWriteMessage(aiOutput, "/tmp/title.txt", "/tmp/body.txt", fs);

    // "feat: " (6) + 66 chars = 72 total
    const expectedSubject = `feat: ${"a".repeat(66)}\n`;
    expect(fs.writeFileSync).toHaveBeenCalledWith("/tmp/title.txt", expectedSubject, { encoding: "utf8" });
  });

  it("should filter out AI fluff from body", async () => {
    const fs = createMockFs();
    const aiOutput = `feat: implement search

I'll implement the search feature.
- Add search index
Sure, here's the implementation:
- Update UI
Let's also add filters.
- Add filters`;

    await parseAndWriteMessage(aiOutput, "/tmp/title.txt", "/tmp/body.txt", fs);

    const bodyCall = (fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: [string, string, string]) => call[0] === "/tmp/body.txt",
    );
    expect(bodyCall?.[1]).not.toContain("I'll implement");
    expect(bodyCall?.[1]).not.toContain("Sure, here's");
    expect(bodyCall?.[1]).not.toContain("Let's also add");
    expect(bodyCall?.[1]).toContain("- Add search index");
    expect(bodyCall?.[1]).toContain("- Update UI");
    expect(bodyCall?.[1]).toContain("- Add filters");
  });

  it("should exit if no valid subject found and no existing message", async () => {
    const fs = createMockFs();
    (fs.readFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("File not found");
    });

    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });
    const mockConsoleError = vi.spyOn(console, "error").mockImplementation(vi.fn());

    await expect(parseAndWriteMessage("invalid output", "/tmp/title.txt", "/tmp/body.txt", fs)).rejects.toThrow(
      "process.exit",
    );

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockConsoleError).toHaveBeenCalledWith("ERROR: Failed to generate valid conventional commit subject");

    mockExit.mockRestore();
    mockConsoleError.mockRestore();
  });

  it("should preserve existing valid PR message if AI output is invalid", async () => {
    const fs = createMockFs();
    (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue("feat(valid): existing message");

    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });
    const mockConsoleLog = vi.spyOn(console, "log").mockImplementation(vi.fn());

    await expect(parseAndWriteMessage("invalid output", "/tmp/title.txt", "/tmp/body.txt", fs)).rejects.toThrow(
      "process.exit",
    );

    expect(mockConsoleLog).toHaveBeenCalledWith("Preserving existing PR message");
    expect(mockExit).toHaveBeenCalledWith(0);

    mockExit.mockRestore();
    mockConsoleLog.mockRestore();
  });

  it("should handle AI output with prefixes", async () => {
    const fs = createMockFs();
    const aiOutput = `Here's a suggested commit:

feat: add new feature

- Implementation detail 1
- Implementation detail 2`;

    await parseAndWriteMessage(aiOutput, "/tmp/title.txt", "/tmp/body.txt", fs);

    expect(fs.writeFileSync).toHaveBeenCalledWith("/tmp/title.txt", "feat: add new feature\n", { encoding: "utf8" });
  });

  it("should filter AI fluff from body", async () => {
    const fs = createMockFs();
    const aiOutput = `feat: implement search

I'll implement the search feature.
- Add search index
Sure, here's the implementation:
- Update UI
Let's also add filters.
- Add filters`;

    await parseAndWriteMessage(aiOutput, "/tmp/title.txt", "/tmp/body.txt", fs);

    const bodyCall = (fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: [string, string, object]) => call[0] === "/tmp/body.txt",
    );
    expect(bodyCall?.[1]).not.toContain("I'll implement");
    expect(bodyCall?.[1]).not.toContain("Sure, here's");
    expect(bodyCall?.[1]).not.toContain("Let's also add");
    expect(bodyCall?.[1]).toContain("- Add search index");
    expect(bodyCall?.[1]).toContain("- Update UI");
    expect(bodyCall?.[1]).toContain("- Add filters");
  });
});

describe("getBranch", () => {
  it("should return current branch from git", () => {
    const runner: CommandRunner = {
      run: vi.fn(() => "feature/test-branch"),
      runSilent: vi.fn(),
      runArgv: vi.fn(),
    };

    const result = getBranch(runner);
    expect(result).toBe("feature/test-branch");
    expect(runner.run).toHaveBeenCalledWith("git branch --show-current");
  });
});

describe("hasPR", () => {
  it("should return true when PR exists for branch", () => {
    const runner: CommandRunner = {
      run: vi.fn(),
      runSilent: vi.fn(),
      runArgv: vi.fn(() => '{"number": 42}'),
    };

    const result = hasPR("feature/test", runner);
    expect(result).toBe(true);
    expect(runner.runArgv).toHaveBeenCalledWith("gh", ["pr", "view", "--json", "number", "feature/test"]);
  });

  it("should return false when no PR exists for branch", () => {
    const runner: CommandRunner = {
      run: vi.fn(),
      runSilent: vi.fn(),
      runArgv: vi.fn(() => {
        throw new Error("no pull requests found");
      }),
    };

    const result = hasPR("feature/test", runner);
    expect(result).toBe(false);
  });

  it("should work without branch argument (uses current branch)", () => {
    const runner: CommandRunner = {
      run: vi.fn(),
      runSilent: vi.fn(),
      runArgv: vi.fn(() => '{"number": 42}'),
    };

    const result = hasPR(undefined, runner);
    expect(result).toBe(true);
    expect(runner.runArgv).toHaveBeenCalledWith("gh", ["pr", "view", "--json", "number"]);
  });
});

describe("getHead", () => {
  it("should return current HEAD commit hash", () => {
    const runner: CommandRunner = {
      run: vi.fn(() => "abc123def456"),
      runSilent: vi.fn(),
      runArgv: vi.fn(),
    };

    const result = getHead(runner);
    expect(result).toBe("abc123def456");
    expect(runner.run).toHaveBeenCalledWith("git rev-parse --verify HEAD");
  });
});

describe("isPRMerged", () => {
  it("should return true when PR state is MERGED", () => {
    const runner: CommandRunner = {
      run: vi.fn(),
      runSilent: vi.fn(),
      runArgv: vi.fn(() => '{"state": "MERGED"}'),
    };

    const result = isPRMerged("feature/test", runner);
    expect(result).toBe(true);
    expect(runner.runArgv).toHaveBeenCalledWith("gh", ["pr", "view", "feature/test", "--json", "state"]);
  });

  it("should return false when PR state is OPEN", () => {
    const runner: CommandRunner = {
      run: vi.fn(),
      runSilent: vi.fn(),
      runArgv: vi.fn(() => '{"state": "OPEN"}'),
    };

    const result = isPRMerged("feature/test", runner);
    expect(result).toBe(false);
  });

  it("should return false when command fails", () => {
    const runner: CommandRunner = {
      run: vi.fn(),
      runSilent: vi.fn(),
      runArgv: vi.fn(() => {
        throw new Error("not found");
      }),
    };

    const result = isPRMerged("feature/test", runner);
    expect(result).toBe(false);
  });
});

describe("createOrUpdatePR", () => {
  it("should skip update when PR is already merged", async () => {
    const runner: CommandRunner = {
      run: vi.fn(),
      runSilent: vi.fn(),
      runArgv: vi.fn((cmd: string, args: string[]) => {
        if (args.includes("--json") && args.includes("number")) {
          return '{"number": 42}';
        }
        if (args.includes("--json") && args.includes("state")) {
          return '{"state": "MERGED"}';
        }
        return "";
      }),
    };

    const fs: FileSystem = {
      existsSync: vi.fn(() => true),
      readFileSync: vi.fn(() => "feat: test message"),
      writeFileSync: vi.fn(),
      unlinkSync: vi.fn(),
      mkdtempSync: vi.fn(() => "/tmp/test-123"),
      rmSync: vi.fn(),
    };

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(vi.fn());

    await createOrUpdatePR("feature/test", runner, fs, "kimi");

    expect(consoleSpy).toHaveBeenCalledWith("PR already merged, skipping title/description update.");
    // Should not call pr edit
    const editCall = (runner.runArgv as ReturnType<typeof vi.fn>).mock.calls.find((call: [string, string[]]) =>
      call[1].includes("edit"),
    );
    expect(editCall).toBeUndefined();

    consoleSpy.mockRestore();
  });
});

describe("Integration: PR workflow state machine", () => {
  it("should detect PR existence correctly across state transitions", () => {
    // Simulate: no PR -> PR created -> PR exists
    const runner: CommandRunner = {
      run: vi.fn(),
      runSilent: vi.fn(),
      runArgv: vi.fn(),
    };

    // First call: no PR
    (runner.runArgv as ReturnType<typeof vi.fn>)
      .mockImplementationOnce(() => {
        throw new Error("no pull requests found");
      })
      // Second call: PR exists after creation
      .mockImplementationOnce(() => '{"number": 42}');

    expect(hasPR("feature/new", runner)).toBe(false);
    expect(hasPR("feature/new", runner)).toBe(true);
  });
});
