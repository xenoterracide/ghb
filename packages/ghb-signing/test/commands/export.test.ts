// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { execFileSync } from "child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ExportCommand } from "../../src/commands/export.js";
import { listKeys } from "../../src/index.js";
import type { CommandRunner } from "../../src/types.js";
import { createGnupgHome, generateSigningKey } from "../gnupg.js";

const PRIMARY_FPR = "E2161DBFFA7E2C4ED8A6DC8032BF5B09B5329853";
const SUBKEY_FPR = "C17EB30E70FBD586F5794285C3C46C6F2A3408CC";
const OTHER_PRIMARY_FPR = "ABCDEF0123456789ABCDEF0123456789ABCDEF01";
const OTHER_SUBKEY_FPR = "0123456789ABCDEF0123456789ABCDEF01234567";
const PASS = "correct horse battery staple";
const ARMOR = `-----BEGIN PGP PRIVATE KEY BLOCK-----
abc
-----END PGP PRIVATE KEY BLOCK-----`;

interface SequenceCall {
  cmd: string;
  args: string[];
  opts?: { cwd?: string; env?: Record<string, string>; input?: string };
}

interface SequenceRunner extends CommandRunner {
  calls: SequenceCall[];
}

function colonKey(): string {
  return `tru::1:1794537422:1826073421:3:1:5
pub:u:255:22:32BF5B09B5329853:1794537421:1826073421::u:::cSC:::::ed25519:::0:
fpr:::::::::${PRIMARY_FPR}:
uid:u::::1794537421::13D53EB7B1B52BD56CEF553F7EED2E413F86F513::Plan Test <plan@example.invalid>::::::::::0:
sub:u:255:22:C3C46C6F2A3408CC:1794537422:1826073422:::::s:::::ed25519::
fpr:::::::::${SUBKEY_FPR}:`;
}

function twoKeys(): string {
  return `tru::1:1794537422:1826073421:3:1:5
pub:u:255:22:32BF5B09B5329853:1794537421:1826073421::u:::cSC:::::ed25519:::0:
fpr:::::::::${PRIMARY_FPR}:
uid:u::::1794537421::13D53EB7B1B52BD56CEF553F7EED2E413F86F513::Plan Test <plan@example.invalid>::::::::::0:
sub:u:255:22:C3C46C6F2A3408CC:1794537422:1826073422:::::s:::::ed25519::
fpr:::::::::${SUBKEY_FPR}:
pub:u:255:22:ABCDEF0123456789:1794537430:1826073430::u:::cSC:::::ed25519:::0:
fpr:::::::::${OTHER_PRIMARY_FPR}:
uid:u::::1794537430::13D53EB7B1B52BD56CEF553F7EED2E413F86F513::Plan Test Two <plan2@example.invalid>::::::::::0:
sub:u:255:22:0123456789ABCDEF:1794537431:1826073431:::::s:::::ed25519::
fpr:::::::::${OTHER_SUBKEY_FPR}:`;
}

function createSequenceRunner(responses: string[]): SequenceRunner {
  let index = 0;
  const calls: SequenceCall[] = [];
  return {
    calls,
    runArgv(
      cmd: string,
      args: string[],
      opts?: { cwd?: string; env?: Record<string, string>; input?: string },
    ): string {
      calls.push({ cmd, args, opts });
      if (index >= responses.length) {
        throw new Error(`Unexpected call #${index}: ${cmd} ${args.join(" ")}`);
      }
      return responses[index++];
    },
  };
}

function createFailingRunner(errorMessage: string): SequenceRunner {
  const calls: SequenceCall[] = [];
  return {
    calls,
    runArgv(
      cmd: string,
      args: string[],
      opts?: { cwd?: string; env?: Record<string, string>; input?: string },
    ): string {
      calls.push({ cmd, args, opts });
      if (calls.length === 1) {
        return colonKey();
      }
      throw new Error(errorMessage);
    },
  };
}

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

async function runExport(command: ExportCommand): Promise<{ exit: number; out: string; err: string }> {
  const { out, err } = captureStreams();
  const exit = await command.execute();
  return { exit, out: out.join(""), err: err.join("") };
}

function makeCommand(runner: SequenceRunner): ExportCommand {
  const cmd = new ExportCommand();
  cmd.runner = runner;
  cmd.passphrase = PASS;
  return cmd;
}

function importArmor(armor: string): void {
  execFileSync("gpg", ["--batch", "--pinentry-mode", "loopback", "--import"], {
    encoding: "utf8",
    env: process.env,
    input: armor,
  });
}

function assertListKeysCall(call: SequenceCall): void {
  expect(call.cmd).toBe("gpg");
  expect(call.args).toEqual(["--list-keys", "--with-colons"]);
}

function assertExportCall(call: SequenceCall): void {
  expect(call.cmd).toBe("gpg");
  expect(call.args).toEqual([
    "--batch",
    "--pinentry-mode",
    "loopback",
    "--passphrase-fd",
    "0",
    "--armor",
    "--export-secret-keys",
    PRIMARY_FPR,
  ]);
  expect(call.opts).toEqual({ input: PASS });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ExportCommand exports armored secret", () => {
  it("exports the armored secret key to stdout with a loopback passphrase", async () => {
    const runner = createSequenceRunner([colonKey(), ARMOR]);

    const { exit, out, err } = await runExport(makeCommand(runner));

    expect(exit).toBe(0);
    expect(runner.calls).toHaveLength(2);
    assertListKeysCall(runner.calls[0]);
    assertExportCall(runner.calls[1]);
    expect(out).toBe(ARMOR + "\n");
    expect(err).toBe("");
  });
});

describe("ExportCommand non-signing key", () => {
  it("exports a key without a signing subkey", async () => {
    const noSigning = colonKey().replace(/:::::s:::::ed25519::/, ":::::e:::::ed25519::");
    const runner = createSequenceRunner([noSigning, ARMOR]);

    const { exit, out, err } = await runExport(makeCommand(runner));

    expect(exit).toBe(0);
    expect(runner.calls).toHaveLength(2);
    expect(out).toBe(ARMOR + "\n");
    expect(err).toBe("");
  });
});

describe("ExportCommand key validation", () => {
  it("errors when --key is not a full fingerprint", async () => {
    const runner = createSequenceRunner([]);
    const cmd = makeCommand(runner);
    cmd.key = "8042ED9A";

    const { exit, err } = await runExport(cmd);

    expect(exit).toBe(1);
    expect(runner.calls).toHaveLength(0);
    expect(err).toContain('Error: --key must be a full fingerprint; got "8042ED9A"');
  });

  it("errors on an explicitly empty --key instead of exporting the sole key", async () => {
    const runner = createSequenceRunner([]);
    const cmd = makeCommand(runner);
    cmd.key = "";

    const { exit, err } = await runExport(cmd);

    expect(exit).toBe(1);
    expect(runner.calls).toHaveLength(0);
    expect(err).toContain('Error: --key must be a full fingerprint; got ""');
  });
});

describe("ExportCommand empty keyring", () => {
  it("errors when the keyring is empty", async () => {
    const runner = createSequenceRunner([""]);

    const { exit, err } = await runExport(makeCommand(runner));

    expect(exit).toBe(2);
    expect(err).toContain("Error: no keys in the keyring");
  });
});

describe("ExportCommand ambiguous keys", () => {
  it("errors with both fingerprints when no --key and several keys", async () => {
    const runner = createSequenceRunner([twoKeys()]);

    const { exit, err } = await runExport(makeCommand(runner));

    expect(exit).toBe(2);
    expect(err).toContain("Error: multiple keys in the keyring; pass --key with one of:");
    expect(err).toContain(PRIMARY_FPR);
    expect(err).toContain(OTHER_PRIMARY_FPR);
    expect(runner.calls).toHaveLength(1);
  });
});

describe("ExportCommand key not found", () => {
  it("errors when --key matches nothing", async () => {
    const runner = createSequenceRunner([colonKey()]);
    const cmd = makeCommand(runner);
    cmd.key = OTHER_PRIMARY_FPR;

    const { exit, err } = await runExport(cmd);

    expect(exit).toBe(2);
    expect(err).toContain(`Error: key ${OTHER_PRIMARY_FPR} not found`);
  });
});

describe("ExportCommand export failure", () => {
  it("errors when the export fails", async () => {
    const runner = createFailingRunner("gpg exited with code 2");

    const { exit, err } = await runExport(makeCommand(runner));

    expect(exit).toBe(1);
    expect(runner.calls).toHaveLength(2);
    expect(err).toContain(`Error: Failed to export secret key ${PRIMARY_FPR}: gpg exited with code 2`);
  });
});

const originalEnv = process.env;
let exportHome: string;

function setupExportHome(): void {
  exportHome = createGnupgHome();
  process.env = { ...originalEnv, GNUPGHOME: exportHome };
}

function teardownExportHome(): void {
  process.env = originalEnv;
}

function assertArmoredFormat(out: string): void {
  expect(out).toContain("-----BEGIN PGP PRIVATE KEY BLOCK-----");
  expect(out.endsWith("\n")).toBe(true);
  expect(out.endsWith("\n\n")).toBe(false);
}

describe("ExportCommand integration", () => {
  beforeEach(setupExportHome);
  afterEach(teardownExportHome);

  it("exports a generated key and reimports it into a fresh home", async () => {
    const generated = generateSigningKey(exportHome, PASS);
    const command = new ExportCommand();
    command.passphrase = PASS;

    const { exit, out } = await runExport(command);

    expect(exit).toBe(0);
    assertArmoredFormat(out);

    const freshHome = createGnupgHome();
    process.env = { ...originalEnv, GNUPGHOME: freshHome };
    importArmor(out);

    const keys = listKeys();
    const primary = keys.find((key) => key.fingerprint === generated.primaryFpr);
    expect(primary).toBeDefined();
  });
});
