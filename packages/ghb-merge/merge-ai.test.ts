// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateWithKimi, generateWithJunie, generateWithCopilot } from "./merge";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// Mock child_process
vi.mock("child_process", () => ({
  execSync: vi.fn(),
  execFileSync: vi.fn(),
}));

vi.mock("./ai/index.js", () => ({
  createAiEngine: vi.fn(),
  DEFAULT_KIMI_MODEL: "kimi-k2-0712-preview",
}));

import { execFileSync } from "child_process";
import { createAiEngine } from "./ai/index.js";

describe("generateWithKimi", () => {
  let tmpDir: string;
  let titleFile: string;
  let bodyFile: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "kimi-test-"));
    titleFile = join(tmpDir, "title.txt");
    bodyFile = join(tmpDir, "body.txt");
    vi.clearAllMocks();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("writes a generated conventional commit message to the title and body files", async () => {
    const diff = "some diff content";
    const generate = vi.fn().mockResolvedValue("feat: test message\n\n- Detail 1\n- Detail 2");
    (createAiEngine as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({ generate }));

    await generateWithKimi(titleFile, bodyFile, diff, { apiKey: "sk-test" });

    expect(createAiEngine).toHaveBeenCalledWith("kimi", { apiKey: "sk-test" });
    expect(generate).toHaveBeenCalledWith(expect.stringContaining(diff));
    expect(readFileSync(titleFile, "utf8").trim()).toBe("feat: test message");
    expect(readFileSync(bodyFile, "utf8").trim()).toBe("- Detail 1\n- Detail 2");
  });

  it("throws when the engine fails", async () => {
    const diff = "some diff content";
    const generate = vi.fn().mockRejectedValue(new Error("network error"));
    (createAiEngine as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({ generate }));

    await expect(generateWithKimi(titleFile, bodyFile, diff)).rejects.toThrow("network error");
  });
});

describe("generateWithJunie", () => {
  const nodeOptions =
    "--require /project/.pnp.cjs --experimental-loader file:///project/.pnp.loader.mjs --max-old-space-size=4096";
  let tmpDir: string;
  let titleFile: string;
  let bodyFile: string;
  let originalExit: typeof process.exit;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "junie-test-"));
    titleFile = join(tmpDir, "title.txt");
    bodyFile = join(tmpDir, "body.txt");
    originalExit = process.exit;
    vi.stubEnv("NODE_OPTIONS", nodeOptions);
    process.exit = vi.fn();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.exit = originalExit;
    vi.unstubAllEnvs();
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

    const junieCall = (execFileSync as ReturnType<typeof vi.fn>).mock.calls.find(([cmd]) => cmd === "junie");
    expect(junieCall?.[2]?.env?.NODE_OPTIONS).toBe("--max-old-space-size=4096");
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
  const nodeOptions =
    "--require /project/.pnp.cjs --experimental-loader file:///project/.pnp.loader.mjs --max-old-space-size=4096";
  let tmpDir: string;
  let titleFile: string;
  let bodyFile: string;
  let originalExit: typeof process.exit;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "copilot-test-"));
    titleFile = join(tmpDir, "title.txt");
    bodyFile = join(tmpDir, "body.txt");
    originalExit = process.exit;
    vi.stubEnv("NODE_OPTIONS", nodeOptions);
    process.exit = vi.fn();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.exit = originalExit;
    vi.unstubAllEnvs();
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

    expect(execFileSync).toHaveBeenCalledWith(
      "copilot",
      expect.arrayContaining(["--model", "--silent", "--prompt"]),
      expect.any(Object),
    );

    const copilotCall = (execFileSync as ReturnType<typeof vi.fn>).mock.calls.find(([cmd]) => cmd === "copilot");
    expect(copilotCall?.[2]?.env?.NODE_OPTIONS).toBe("--max-old-space-size=4096");
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
