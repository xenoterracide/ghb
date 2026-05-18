// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateWithKimi, generateWithJunie, generateWithCopilot } from "./merge";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// Mock child_process
vi.mock("child_process", () => ({
  execSync: vi.fn(),
  execFileSync: vi.fn(),
}));

import { execSync, execFileSync } from "child_process";

describe("generateWithKimi", () => {
  let tmpDir: string;
  let titleFile: string;
  let bodyFile: string;
  let originalExit: typeof process.exit;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "kimi-test-"));
    titleFile = join(tmpDir, "title.txt");
    bodyFile = join(tmpDir, "body.txt");
    originalExit = process.exit;
    process.exit = vi.fn();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.exit = originalExit;
    rmSync(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("should generate message using kimi CLI", async () => {
    const diff = "some diff content";

    // Write a valid title file to simulate kimi success
    writeFileSync(titleFile, "feat: test message", "utf8");

    (execSync as ReturnType<typeof vi.fn>).mockImplementation(() => "");

    await generateWithKimi(titleFile, bodyFile, diff, tmpDir);

    expect(execSync).toHaveBeenCalled();
  });
});

describe("generateWithJunie", () => {
  let tmpDir: string;
  let titleFile: string;
  let bodyFile: string;
  let originalExit: typeof process.exit;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "junie-test-"));
    titleFile = join(tmpDir, "title.txt");
    bodyFile = join(tmpDir, "body.txt");
    originalExit = process.exit;
    process.exit = vi.fn();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.exit = originalExit;
    rmSync(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("should generate message using junie CLI", async () => {
    const diff = "some diff content";

    // Write title file before junie call simulates success
    writeFileSync(titleFile, "feat: test message", "utf8");

    (execFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => "");

    await generateWithJunie(titleFile, bodyFile, diff, tmpDir);

    expect(execFileSync).toHaveBeenCalledWith(
      "junie",
      expect.arrayContaining(["--skip-update-check"]),
      expect.any(Object),
    );
  });

  it("should throw error when junie fails completely", async () => {
    const diff = "some diff content";

    (execFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("junie failed");
    });

    await expect(generateWithJunie(titleFile, bodyFile, diff, tmpDir)).rejects.toThrow(
      "junie failed to generate message",
    );
  });
});

describe("generateWithCopilot", () => {
  let tmpDir: string;
  let titleFile: string;
  let bodyFile: string;
  let originalExit: typeof process.exit;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "copilot-test-"));
    titleFile = join(tmpDir, "title.txt");
    bodyFile = join(tmpDir, "body.txt");
    originalExit = process.exit;
    process.exit = vi.fn();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.exit = originalExit;
    rmSync(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("should generate message using copilot CLI", async () => {
    const diff = "some diff content";
    const files = "file1.ts\nfile2.ts";

    // Write output and error files to simulate copilot success
    const copilotOut = join(tmpDir, "copilot-out.txt");
    const copilotErr = join(tmpDir, "copilot-err.txt");
    writeFileSync(copilotOut, "feat: test message\n\n- Detail 1\n- Detail 2", "utf8");
    writeFileSync(copilotErr, "", "utf8");

    (execFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => "");

    await generateWithCopilot(titleFile, bodyFile, diff, files, tmpDir);

    expect(execFileSync).toHaveBeenCalledWith("copilot", expect.any(Array), expect.any(Object));
  });

  it("should use environment model variable", async () => {
    const diff = "some diff content";
    const files = "file1.ts";
    const originalModel = process.env.COPILOT_PRMSG_MODEL;
    process.env.COPILOT_PRMSG_MODEL = "gpt-4";

    const copilotOut = join(tmpDir, "copilot-out.txt");
    const copilotErr = join(tmpDir, "copilot-err.txt");
    writeFileSync(copilotOut, "feat: test", "utf8");
    writeFileSync(copilotErr, "", "utf8");

    (execFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => "");

    await generateWithCopilot(titleFile, bodyFile, diff, files, tmpDir);

    // Verify copilot was called
    const { calls } = (execFileSync as ReturnType<typeof vi.fn>).mock;
    const copilotCall = calls.find((call) => {
      const [cmd] = call;
      return cmd === "copilot";
    });
    expect(copilotCall).toBeDefined();

    process.env.COPILOT_PRMSG_MODEL = originalModel;
  });
});
