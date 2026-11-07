// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdtempSync, rmSync, statSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkFilePermissions, setSecurePermissions } from "../src/fs-utils.js";
import { setLogLevel } from "../src/logger.js";

describe("fs-utils", () => {
  let tmpDir = "";

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "fs-utils-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
    setLogLevel("info");
  });

  it("warns when permissions cannot be set", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    setSecurePermissions(join(tmpDir, "missing.txt"));

    expect(warn.mock.calls.map((call) => call.join(" ")).join(" ")).toContain("Could not set permissions");
  });

  it("tightens a permissive file and leaves a tight one alone", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const loose = join(tmpDir, "loose.txt");
    const tight = join(tmpDir, "tight.txt");
    writeFileSync(loose, "x", { mode: 0o644 });
    writeFileSync(tight, "x", { mode: 0o600 });

    checkFilePermissions(loose);
    checkFilePermissions(tight);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls.map((call) => call.join(" ")).join(" ")).toContain("setting to 600");
    expect(statSync(loose).mode & 0o777).toBe(0o600);
  });

  it("logs at debug level when the file cannot be stat'ed", () => {
    setLogLevel("debug");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    checkFilePermissions(join(tmpDir, "missing.txt"));

    expect(log.mock.calls.map((call) => call.join(" ")).join(" ")).toContain("Could not check file permissions");
  });
});
