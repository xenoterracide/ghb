// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { SyncCommand } from "../../src/commands/sync.js";
import type { CommandRunner } from "../../src/types.js";

interface SyncOptions {
  runner?: CommandRunner;
  secrets?: string;
  envFile?: string;
  repo?: string;
  label?: string;
  dryRun?: boolean;
}

function createFakeRunner(responses: Map<string, string>): CommandRunner {
  return {
    runArgv: (cmd: string, args: string[]): string => {
      const key = `${cmd} ${args.join(" ")}`;
      const response = responses.get(key);
      if (response === undefined) {
        throw new Error(`Unexpected command: ${key}`);
      }
      return response;
    },
  };
}

function writeEnvFile(dir: string, content: string): string {
  const envPath = join(dir, "secrets.env");
  writeFileSync(envPath, content, "utf8");
  return envPath;
}

async function runSync(options: SyncOptions): Promise<number> {
  const cmd = new SyncCommand();
  Object.assign(cmd, options);
  return cmd.execute();
}

let tmpDir = "";
const originalEnv = process.env;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "sync-test-"));
  process.env = { ...originalEnv };
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  process.env = originalEnv;
});

describe("SyncCommand", () => {
  it("should return error when neither --secrets nor --env-file provided", async () => {
    const result = await runSync({ repo: "owner/target", dryRun: true });

    expect(result).toBe(1);
  });

  it("should return error when both --to and --label provided", async () => {
    const result = await runSync({ secrets: "API_KEY", repo: "owner/target", label: "production", dryRun: true });

    expect(result).toBe(1);
  });
});

describe("SyncCommand", () => {
  it("should sync secrets from environment variables to specific repo", async () => {
    process.env.API_KEY = "test-api-key";
    process.env.SECRET = "test-secret";
    const runner = createFakeRunner(
      new Map([
        ["gh secret set API_KEY --repo owner/target", ""],
        ["gh secret set SECRET --repo owner/target", ""],
      ]),
    );
    const result = await runSync({ runner, secrets: "API_KEY,SECRET", repo: "owner/target", dryRun: false });

    expect(result).toBe(0);
  });
});

describe("SyncCommand", () => {
  it("should sync all secrets from env file to specific repo", async () => {
    const envFile = writeEnvFile(tmpDir, "API_KEY=val:from-env\nSECRET=val:also-from-env\n");
    const runner = createFakeRunner(
      new Map([
        ["gh secret set API_KEY --repo owner/target", ""],
        ["gh secret set SECRET --repo owner/target", ""],
      ]),
    );
    const result = await runSync({ runner, envFile, repo: "owner/target", dryRun: false });

    expect(result).toBe(0);
  });
});

describe("SyncCommand", () => {
  it("should auto-detect current repo when --to not specified", async () => {
    process.env.MY_SECRET = "secret-value";
    const runner = createFakeRunner(
      new Map([
        ["gh repo view --json nameWithOwner", '{"nameWithOwner":"current/repo"}'],
        ["gh secret set MY_SECRET --repo current/repo", ""],
      ]),
    );
    const result = await runSync({ runner, secrets: "MY_SECRET", dryRun: false });

    expect(result).toBe(0);
  });
});

describe("SyncCommand", () => {
  it("should sync to repos with label", async () => {
    const envFile = writeEnvFile(tmpDir, "TOKEN=val:abc123\n");
    const runner = createFakeRunner(
      new Map([
        ["gh api user --jq .login", "myuser"],
        [
          "gh repo list myuser --topic auto-updated --no-archived --limit 1000 --json nameWithOwner",
          '[{"nameWithOwner":"myuser/repo1"},{"nameWithOwner":"myuser/repo2"}]',
        ],
        ["gh secret set TOKEN --repo myuser/repo1", ""],
        ["gh secret set TOKEN --repo myuser/repo2", ""],
      ]),
    );
    const result = await runSync({ runner, envFile, label: "auto-updated", dryRun: false });

    expect(result).toBe(0);
  });
});

describe("SyncCommand", () => {
  it("should return 0 for dry-run without making changes", async () => {
    process.env.API_KEY = "test-key";
    const result = await runSync({ secrets: "API_KEY", repo: "owner/target", dryRun: true });

    expect(result).toBe(0);
  });

  it("should skip secrets that cannot be resolved", async () => {
    // API_KEY is not set in the environment; only SECRET is
    process.env.SECRET = "secret-value";
    const runner = createFakeRunner(new Map([["gh secret set SECRET --repo owner/target", ""]]));
    const result = await runSync({ runner, secrets: "API_KEY,SECRET", repo: "owner/target", dryRun: false });

    expect(result).toBe(0);
  });
});

describe("SyncCommand", () => {
  it("should return error when no secrets can be resolved", async () => {
    const result = await runSync({ secrets: "MISSING_KEY,ANOTHER_MISSING", repo: "owner/target", dryRun: false });

    expect(result).toBe(1);
  });
});

describe("SyncCommand", () => {
  it("should return error when no target repos found", async () => {
    process.env.API_KEY = "test-key";
    const runner = createFakeRunner(
      new Map([
        ["gh api user --jq .login", "myuser"],
        ["gh repo list myuser --topic empty-label --no-archived --limit 1000 --json nameWithOwner", "[]"],
      ]),
    );
    const result = await runSync({ runner, secrets: "API_KEY", label: "empty-label", dryRun: false });

    expect(result).toBe(1);
  });
});

describe("SyncCommand", () => {
  it("should handle setSecret errors gracefully", async () => {
    process.env.API_KEY = "test-key";
    // setSecret throws because "gh secret set" is not in the map
    const runner = createFakeRunner(
      new Map([["gh repo view --json nameWithOwner", '{"nameWithOwner":"current/repo"}']]),
    );
    const result = await runSync({ runner, secrets: "API_KEY", dryRun: false });

    expect(result).toBe(0);
  });

  it("should return error when current repo cannot be detected", async () => {
    process.env.API_KEY = "test-key";
    // "gh repo view" throws because it is absent from the map
    const result = await runSync({ runner: createFakeRunner(new Map()), secrets: "API_KEY", dryRun: false });

    expect(result).toBe(1);
  });
});

describe("SyncCommand", () => {
  it("should return error when secrets list is empty after filtering", async () => {
    const result = await runSync({ secrets: "", repo: "owner/target", dryRun: false });

    expect(result).toBe(1);
  });
});
