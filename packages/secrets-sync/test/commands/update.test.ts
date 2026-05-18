// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { UpdateCommand } from "../../src/commands/update.js";

describe("UpdateCommand", () => {
  let tmpDir = "";

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "secrets-sync-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should add new key to file", async () => {
    const envPath = join(tmpDir, "secrets.env");
    writeFileSync(envPath, "EXISTING_KEY=old-value\n", "utf8");

    const cmd = new UpdateCommand();
    cmd.file = envPath;
    cmd.key = "NEW_KEY";
    cmd.value = "new-value";

    const exitCode = await cmd.execute();
    expect(exitCode).toBe(0);

    const content = readFileSync(envPath, "utf8");
    expect(content).toContain("NEW_KEY=new-value");
    expect(content).toContain("EXISTING_KEY=old-value");
  });

  it("should update existing key in file", async () => {
    const envPath = join(tmpDir, "secrets.env");
    writeFileSync(envPath, "API_KEY=old-value\nSECRET=unchanged\n", "utf8");

    const cmd = new UpdateCommand();
    cmd.file = envPath;
    cmd.key = "API_KEY";
    cmd.value = "updated-value";

    const exitCode = await cmd.execute();
    expect(exitCode).toBe(0);

    const content = readFileSync(envPath, "utf8");
    expect(content).toContain("API_KEY=updated-value");
    expect(content).toContain("SECRET=unchanged");
  });

  it("should create file if it does not exist", async () => {
    const envPath = join(tmpDir, "new-secrets.env");

    const cmd = new UpdateCommand();
    cmd.file = envPath;
    cmd.key = "API_KEY";
    cmd.value = "new-value";

    const exitCode = await cmd.execute();
    expect(exitCode).toBe(0);

    const content = readFileSync(envPath, "utf8");
    expect(content).toContain("API_KEY=new-value");
  });
});
