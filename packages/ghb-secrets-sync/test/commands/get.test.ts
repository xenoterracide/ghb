// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GetCommand } from "../../src/commands/get.js";

function captureStreams(): { out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array): boolean => {
    out.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array): boolean => {
    err.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
    return true;
  });
  return { out, err };
}

describe("GetCommand", () => {
  let tmpDir = "";

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "get-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("resolves a value from an env file", async () => {
    const envPath = join(tmpDir, ".env");
    writeFileSync(envPath, "API_KEY=val:from-file\n", "utf8");
    const { out } = captureStreams();

    const command = new GetCommand();
    command.name = "API_KEY";
    command.envFile = envPath;
    const exit = await command.execute();

    expect(exit).toBe(0);
    expect(out.join("")).toBe("from-file");
  });

  it("falls back to the environment without an env file", async () => {
    process.env.GET_TEST_KEY = "from-env";
    const { out } = captureStreams();
    try {
      const command = new GetCommand();
      command.name = "GET_TEST_KEY";
      const exit = await command.execute();

      expect(exit).toBe(0);
      expect(out.join("")).toBe("from-env");
    } finally {
      delete process.env.GET_TEST_KEY;
    }
  });

  it("treats an empty --env-file as unset", async () => {
    process.env.GET_EMPTY_FILE_KEY = "from-env";
    const { out } = captureStreams();
    try {
      const command = new GetCommand();
      command.name = "GET_EMPTY_FILE_KEY";
      command.envFile = "";
      const exit = await command.execute();

      expect(exit).toBe(0);
      expect(out.join("")).toBe("from-env");
    } finally {
      delete process.env.GET_EMPTY_FILE_KEY;
    }
  });

  it("fails when no value can be resolved", async () => {
    const { err } = captureStreams();

    const command = new GetCommand();
    command.name = "DEFINITELY_MISSING_KEY";
    const exit = await command.execute();

    expect(exit).toBe(1);
    expect(err.join("")).toContain('Could not resolve secret "DEFINITELY_MISSING_KEY"');
  });

  it("fails when the env file has no entry for the name", async () => {
    const envPath = join(tmpDir, ".env");
    writeFileSync(envPath, "OTHER=val:x\n", "utf8");
    const { err } = captureStreams();

    const command = new GetCommand();
    command.name = "API_KEY";
    command.envFile = envPath;
    const exit = await command.execute();

    expect(exit).toBe(1);
    expect(err.join("")).toContain("Could not resolve secret");
  });
});
