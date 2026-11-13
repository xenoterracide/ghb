// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { resolveSecretValue } from "../src/env.js";

const FPR = "E2161DBFFA7E2C4ED8A6DC8032BF5B09B5329853";
const ARMOR = "-----BEGIN PGP PRIVATE KEY BLOCK-----\n\nabc\n-----END PGP PRIVATE KEY BLOCK-----\n";

let tmpDir = "";

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "secrets-sync-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

interface RunnerResult {
  calls: { cmd: string; args: string[]; input?: string }[];
  runner: { runArgv: (cmd: string, args: string[], opts?: { input?: string }) => string };
}

function createSuccessfulRunner(): RunnerResult {
  const calls: { cmd: string; args: string[]; input?: string }[] = [];
  return {
    calls,
    runner: {
      runArgv: (cmd: string, args: string[], opts?: { input?: string }): string => {
        calls.push({ cmd, args, input: opts?.input });
        return ARMOR;
      },
    },
  };
}

function gpgExportArgs(fpr: string): string[] {
  return ["--batch", "--pinentry-mode", "loopback", "--passphrase-fd", "0", "--armor", "--export-secret-keys", fpr];
}

describe("resolveSecretValue gpg export", () => {
  it("resolves a gpg: entry by exporting the secret key", () => {
    const { calls, runner } = createSuccessfulRunner();
    const envFileEntries = {
      GPG_SIGNING_KEY: { type: "gpg" as const, value: FPR },
    };

    const result = resolveSecretValue("GPG_SIGNING_KEY", envFileEntries, undefined, {
      runner,
      passphrase: "pass",
    });

    expect(result).toBe(ARMOR);
    expect(calls).toHaveLength(1);
    expect(calls[0].cmd).toBe("gpg");
    expect(calls[0].args).toEqual(gpgExportArgs(FPR));
    expect(calls[0].input).toBe("pass");
  });
});

describe("resolveSecretValue gpg export failure", () => {
  it("warns and returns undefined when gpg export fails", () => {
    const runner = {
      runArgv: (): string => {
        throw new Error("no secret key");
      },
    };
    const envFileEntries = {
      GPG_SIGNING_KEY: { type: "gpg" as const, value: FPR },
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const result = resolveSecretValue("GPG_SIGNING_KEY", envFileEntries, undefined, { runner });

    expect(result).toBeUndefined();
    expect(warn.mock.calls.map((call) => call.join(" ")).join(" ")).toContain(
      'Warning: Could not export GPG key for secret "GPG_SIGNING_KEY"',
    );
  });
});

describe("resolveSecretValue gpg empty armor", () => {
  it("warns and returns undefined when gpg exports empty armor", () => {
    const runner = {
      runArgv: (): string => {
        return "";
      },
    };
    const envFileEntries = {
      GPG_SIGNING_KEY: { type: "gpg" as const, value: FPR },
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const result = resolveSecretValue("GPG_SIGNING_KEY", envFileEntries, undefined, { runner });

    expect(result).toBeUndefined();
    const warning = warn.mock.calls.map((call) => call.join(" ")).join(" ");
    expect(warning).toContain('Warning: Could not export GPG key for secret "GPG_SIGNING_KEY"');
    expect(warning).toContain(`Failed to export secret key ${FPR}: gpg exported no key`);
    expect(warning).not.toContain(`Failed to export secret key ${FPR}: Failed to export`);
  });
});
