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

async function runGet(name: string, envFile?: string): Promise<{ exit: number; out: string; err: string }> {
  const { out, err } = captureStreams();
  const command = new GetCommand();
  command.name = name;
  if (envFile !== undefined) {
    command.envFile = envFile;
  }
  const exit = await command.execute();
  return { exit, out: out.join(""), err: err.join("") };
}

let tmpDir = "";

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "get-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("GetCommand", () => {
  it("resolves a value from an env file", async () => {
    const envPath = join(tmpDir, ".env");
    writeFileSync(envPath, "API_KEY=val:from-file\n", "utf8");

    const { exit, out } = await runGet("API_KEY", envPath);

    expect(exit).toBe(0);
    expect(out).toBe("from-file");
  });

  it("fails when no value can be resolved", async () => {
    const { exit, err } = await runGet("DEFINITELY_MISSING_KEY");

    expect(exit).toBe(1);
    expect(err).toContain('Could not resolve secret "DEFINITELY_MISSING_KEY"');
  });
});

describe("GetCommand", () => {
  it("falls back to the environment without an env file", async () => {
    process.env.GET_TEST_KEY = "from-env";
    try {
      const { exit, out } = await runGet("GET_TEST_KEY");

      expect(exit).toBe(0);
      expect(out).toBe("from-env");
    } finally {
      delete process.env.GET_TEST_KEY;
    }
  });

  it("fails when the env file has no entry for the name", async () => {
    const envPath = join(tmpDir, ".env");
    writeFileSync(envPath, "OTHER=val:x\n", "utf8");

    const { exit, err } = await runGet("API_KEY", envPath);

    expect(exit).toBe(1);
    expect(err).toContain("Could not resolve secret");
  });
});

describe("GetCommand", () => {
  it("treats an empty --env-file as unset", async () => {
    process.env.GET_EMPTY_FILE_KEY = "from-env";
    try {
      const { exit, out } = await runGet("GET_EMPTY_FILE_KEY", "");

      expect(exit).toBe(0);
      expect(out).toBe("from-env");
    } finally {
      delete process.env.GET_EMPTY_FILE_KEY;
    }
  });

  it("resolves a gpg: entry by exporting the secret key", async () => {
    const fpr = "E2161DBFFA7E2C4ED8A6DC8032BF5B09B5329853";
    const armor = "-----BEGIN PGP PRIVATE KEY BLOCK-----\n\nabc\n-----END PGP PRIVATE KEY BLOCK-----\n";
    const envPath = join(tmpDir, ".env");
    writeFileSync(envPath, `GPG_SIGNING_KEY=gpg:${fpr}\n`, "utf8");
    const { out } = captureStreams();

    const command = new GetCommand();
    command.name = "GPG_SIGNING_KEY";
    command.envFile = envPath;
    command.passphrase = "pass";
    command.runner = {
      runArgv: (cmd: string, args: string[]): string => {
        if (cmd === "gpg" && args.includes("--export-secret-keys")) {
          return armor;
        }
        throw new Error(`Unexpected command: ${cmd} ${args.join(" ")}`);
      },
    };
    const exit = await command.execute();

    expect(exit).toBe(0);
    expect(out.join("")).toBe(armor);
  });
});
