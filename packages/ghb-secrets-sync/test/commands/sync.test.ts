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
  passphrase?: string;
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

function gpgExportCommand(fpr: string): string {
  return `gpg --batch --pinentry-mode loopback --passphrase-fd 0 --armor --export-secret-keys ${fpr}`;
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

describe("SyncCommand missing input", () => {
  it("returns error when neither --secrets nor --env-file provided", async () => {
    const result = await runSync({ repo: "owner/target", dryRun: true });

    expect(result).toBe(1);
  });
});

describe("SyncCommand conflicting target", () => {
  it("returns error when both --to and --label provided", async () => {
    const result = await runSync({ secrets: "API_KEY", repo: "owner/target", label: "production", dryRun: true });

    expect(result).toBe(1);
  });
});

describe("SyncCommand secrets", () => {
  it("syncs secrets from environment variables to specific repo", async () => {
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

describe("SyncCommand env file", () => {
  it("syncs all secrets from env file to specific repo", async () => {
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

describe("SyncCommand repo detection", () => {
  it("auto-detects current repo when --to not specified", async () => {
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

describe("SyncCommand label sync", () => {
  it("syncs to repos with label", async () => {
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

describe("SyncCommand empty label", () => {
  it("returns error when no target repos found", async () => {
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

describe("SyncCommand dry run", () => {
  it("returns 0 for dry-run without making changes", async () => {
    process.env.API_KEY = "test-key";
    const result = await runSync({ secrets: "API_KEY", repo: "owner/target", dryRun: true });

    expect(result).toBe(0);
  });
});

describe("SyncCommand skip missing", () => {
  it("skips secrets that cannot be resolved", async () => {
    process.env.SECRET = "secret-value";
    const runner = createFakeRunner(new Map([["gh secret set SECRET --repo owner/target", ""]]));
    const result = await runSync({ runner, secrets: "API_KEY,SECRET", repo: "owner/target", dryRun: false });

    expect(result).toBe(0);
  });
});

describe("SyncCommand no secrets resolved", () => {
  it("returns error when no secrets can be resolved", async () => {
    const result = await runSync({ secrets: "MISSING_KEY,ANOTHER_MISSING", repo: "owner/target", dryRun: false });

    expect(result).toBe(1);
  });
});

describe("SyncCommand empty secrets list", () => {
  it("returns error when secrets list is empty after filtering", async () => {
    const result = await runSync({ secrets: "", repo: "owner/target", dryRun: false });

    expect(result).toBe(1);
  });
});

describe("SyncCommand setSecret error", () => {
  it("handles setSecret errors gracefully", async () => {
    process.env.API_KEY = "test-key";
    const runner = createFakeRunner(
      new Map([["gh repo view --json nameWithOwner", '{"nameWithOwner":"current/repo"}']]),
    );
    const result = await runSync({ runner, secrets: "API_KEY", dryRun: false });

    expect(result).toBe(0);
  });
});

describe("SyncCommand repo detection failure", () => {
  it("returns error when current repo cannot be detected", async () => {
    process.env.API_KEY = "test-key";
    const result = await runSync({ runner: createFakeRunner(new Map()), secrets: "API_KEY", dryRun: false });

    expect(result).toBe(1);
  });
});

interface RecordedCall {
  cmd: string;
  args: string[];
  input?: string;
}

function createGpgRunner(responses: Map<string, string>, calls: RecordedCall[]): CommandRunner {
  return {
    runArgv: (cmd: string, args: string[], opts?: { input?: string }): string => {
      calls.push({ cmd, args, input: opts?.input });
      const key = `${cmd} ${args.join(" ")}`;
      const response = responses.get(key);
      if (response === undefined) {
        throw new Error(`Unexpected command: ${key}`);
      }
      return response;
    },
  };
}

function createFailingGpgRunner(responses: Map<string, string>, calls: RecordedCall[]): CommandRunner {
  return {
    runArgv: (cmd: string, args: string[], opts?: { input?: string }): string => {
      calls.push({ cmd, args, input: opts?.input });
      const key = `${cmd} ${args.join(" ")}`;
      if (cmd === "gpg" && args.includes("--export-secret-keys")) {
        throw new Error("no secret key");
      }
      const response = responses.get(key);
      if (response === undefined) {
        throw new Error(`Unexpected command: ${key}`);
      }
      return response;
    },
  };
}

describe("SyncCommand gpg export", () => {
  it("syncs gpg: entries by exporting the secret key", async () => {
    const fpr = "E2161DBFFA7E2C4ED8A6DC8032BF5B09B5329853";
    const armor = "-----BEGIN PGP PRIVATE KEY BLOCK-----\n\nabc\n-----END PGP PRIVATE KEY BLOCK-----\n";
    const envPath = join(tmpDir, "secrets.env");
    writeFileSync(envPath, `GPG_SIGNING_KEY=gpg:${fpr}\nPLAIN_SECRET=val:plain\n`, "utf8");

    const responses = new Map([
      [gpgExportCommand(fpr), armor],
      ["gh secret set GPG_SIGNING_KEY --repo owner/target", ""],
      ["gh secret set PLAIN_SECRET --repo owner/target", ""],
    ]);
    const calls: RecordedCall[] = [];
    const runner = createGpgRunner(responses, calls);

    const result = await runSync({ runner, envFile: envPath, repo: "owner/target", passphrase: "pass", dryRun: false });

    expect(result).toBe(0);
    expect(calls.some((c) => c.cmd === "gpg" && c.input === "pass")).toBe(true);
    expect(calls.some((c) => c.cmd === "gh" && c.args.includes("GPG_SIGNING_KEY") && c.input === armor)).toBe(true);
  });
});

describe("SyncCommand gpg export failure", () => {
  it("skips a gpg: entry when export fails and still sync other secrets", async () => {
    const fpr = "E2161DBFFA7E2C4ED8A6DC8032BF5B09B5329853";
    const envPath = join(tmpDir, "secrets.env");
    writeFileSync(envPath, `GPG_SIGNING_KEY=gpg:${fpr}\nPLAIN_SECRET=val:plain\n`, "utf8");

    const responses = new Map([["gh secret set PLAIN_SECRET --repo owner/target", ""]]);
    const calls: RecordedCall[] = [];
    const runner = createFailingGpgRunner(responses, calls);

    const result = await runSync({ runner, envFile: envPath, repo: "owner/target", passphrase: "pass", dryRun: false });

    expect(result).toBe(0);
    expect(calls.some((c) => c.cmd === "gpg")).toBe(true);
    expect(calls.some((c) => c.cmd === "gh" && c.args.includes("GPG_SIGNING_KEY"))).toBe(false);
    expect(calls.some((c) => c.cmd === "gh" && c.args.includes("PLAIN_SECRET"))).toBe(true);
  });
});
