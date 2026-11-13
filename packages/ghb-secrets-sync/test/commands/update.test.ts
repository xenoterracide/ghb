// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { UpdateCommand } from "../../src/commands/update.js";

async function updateFile(file: string, key: string, value: string): Promise<number> {
  const cmd = new UpdateCommand();
  cmd.file = file;
  cmd.key = key;
  cmd.value = value;
  return cmd.execute();
}

let tmpDir = "";

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "secrets-sync-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("UpdateCommand", () => {
  it("should add new key to file", async () => {
    const envPath = join(tmpDir, "secrets.env");
    writeFileSync(envPath, "EXISTING_KEY=old-value\n", "utf8");
    const exitCode = await updateFile(envPath, "NEW_KEY", "new-value");
    const content = readFileSync(envPath, "utf8");

    expect(exitCode).toBe(0);
    expect(content).toContain("NEW_KEY=new-value");
    expect(content).toContain("EXISTING_KEY=old-value");
  });

  it("should update existing key in file", async () => {
    const envPath = join(tmpDir, "secrets.env");
    writeFileSync(envPath, "API_KEY=old-value\nSECRET=unchanged\n", "utf8");
    const exitCode = await updateFile(envPath, "API_KEY", "updated-value");
    const content = readFileSync(envPath, "utf8");

    expect(exitCode).toBe(0);
    expect(content).toContain("API_KEY=updated-value");
    expect(content).toContain("SECRET=unchanged");
  });
});

describe("UpdateCommand", () => {
  it("should create file if it does not exist", async () => {
    const envPath = join(tmpDir, "new-secrets.env");
    const exitCode = await updateFile(envPath, "API_KEY", "new-value");
    const content = readFileSync(envPath, "utf8");

    expect(exitCode).toBe(0);
    expect(content).toContain("API_KEY=new-value");
  });

  it("should add a blank line before an appended key when the file has no trailing newline", async () => {
    const envPath = join(tmpDir, "secrets.env");
    writeFileSync(envPath, "EXISTING=val:1", "utf8");
    const exitCode = await updateFile(envPath, "NEW_KEY", "new-value");
    const content = readFileSync(envPath, "utf8");

    expect(exitCode).toBe(0);
    expect(content).toContain("EXISTING=val:1\n\nNEW_KEY=new-value\n");
  });
});
