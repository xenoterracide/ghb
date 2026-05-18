// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { waitForChecks } from "./merge";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// Mock child_process
vi.mock("child_process", () => ({
  execSync: vi.fn(),
  execFileSync: vi.fn(),
}));

import { execFileSync } from "child_process";

describe("generateMessage", () => {
  let tmpDir: string;
  let originalExit: typeof process.exit;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "msg-test-"));
    originalExit = process.exit;
    process.exit = vi.fn();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.exit = originalExit;
    rmSync(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it.todo(
    "should exit when no changes detected - enable once generateMessage command flow is mocked deterministically",
  );

  it.todo(
    "should generate message with changed files and diff - enable once ENGINE/execSync and runner mocks are made deterministic",
  );
});

describe("waitForChecks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should call gh pr checks with watch flag", async () => {
    (execFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => "");

    await waitForChecks("/repo/root");

    expect(execFileSync).toHaveBeenCalledWith(
      "gh",
      ["pr", "checks", "--fail-fast", "--watch"],
      expect.objectContaining({ stdio: "inherit", cwd: "/repo/root" }),
    );
  });

  it("should exit when checks fail", async () => {
    const originalExit = process.exit;
    process.exit = vi.fn();

    (execFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("checks failed");
    });

    await waitForChecks("/repo/root");

    expect(process.exit).toHaveBeenCalledWith(1);

    process.exit = originalExit;
  });
});
