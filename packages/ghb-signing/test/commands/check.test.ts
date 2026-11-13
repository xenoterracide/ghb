// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CheckCommand } from "../../src/commands/check.js";
import type { CommandRunner } from "../../src/types.js";
import { createGnupgHome, generateSigningKey } from "../gnupg.js";

const PRIMARY_FPR = "E2161DBFFA7E2C4ED8A6DC8032BF5B09B5329853";
const SUBKEY_FPR = "C17EB30E70FBD586F5794285C3C46C6F2A3408CC";
const OTHER_PRIMARY_FPR = "ABCDEF0123456789ABCDEF0123456789ABCDEF01";
const OTHER_SUBKEY_FPR = "0123456789ABCDEF0123456789ABCDEF01234567";

interface FakeRunner extends CommandRunner {
  called: boolean;
}

function colon(subExpiresAt: number | null, subCapabilities = "s"): string {
  const expiryField = subExpiresAt === null ? "" : String(subExpiresAt);
  return `tru::1:1794537422:1826073421:3:1:5
pub:u:255:22:32BF5B09B5329853:1794537421:1826073421::u:::cSC:::::ed25519:::0:
fpr:::::::::${PRIMARY_FPR}:
uid:u::::1794537421::13D53EB7B1B52BD56CEF553F7EED2E413F86F513::Plan Test <plan@example.invalid>::::::::::0:
sub:u:255:22:C3C46C6F2A3408CC:1794537422:${expiryField}:::::${subCapabilities}:::::ed25519::
fpr:::::::::${SUBKEY_FPR}:`;
}

function twoKeys(subExpiresAt: number): string {
  const expiryField = String(subExpiresAt);
  return `tru::1:1794537422:1826073421:3:1:5
pub:u:255:22:32BF5B09B5329853:1794537421:1826073421::u:::cSC:::::ed25519:::0:
fpr:::::::::${PRIMARY_FPR}:
uid:u::::1794537421::13D53EB7B1B52BD56CEF553F7EED2E413F86F513::Plan Test <plan@example.invalid>::::::::::0:
sub:u:255:22:C3C46C6F2A3408CC:1794537422:${expiryField}:::::s:::::ed25519::
fpr:::::::::${SUBKEY_FPR}:
pub:u:255:22:ABCDEF0123456789:1794537430:1826073430::u:::cSC:::::ed25519:::0:
fpr:::::::::${OTHER_PRIMARY_FPR}:
uid:u::::1794537430::13D53EB7B1B52BD56CEF553F7EED2E413F86F513::Plan Test Two <plan2@example.invalid>::::::::::0:
sub:u:255:22:0123456789ABCDEF:1794537431:1826073431:::::s:::::ed25519::
fpr:::::::::${OTHER_SUBKEY_FPR}:`;
}

function createFakeRunner(output: string): FakeRunner {
  let called = false;
  return {
    get called(): boolean {
      return called;
    },
    runArgv(cmd: string, args: string[]): string {
      called = true;
      if (cmd === "gpg" && args.join(" ") === "--list-keys --with-colons") {
        return output;
      }
      throw new Error(`Unexpected command: ${cmd} ${args.join(" ")}`);
    },
  };
}

function createThrowingRunner(errorMessage: string): FakeRunner {
  let called = false;
  return {
    get called(): boolean {
      return called;
    },
    runArgv(cmd: string, args: string[]): string {
      called = true;
      if (cmd === "gpg" && args.join(" ") === "--list-keys --with-colons") {
        throw new Error(errorMessage);
      }
      throw new Error(`Unexpected command: ${cmd} ${args.join(" ")}`);
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

async function runCheck(command: CheckCommand): Promise<{ exit: number; out: string; err: string }> {
  const { out, err } = captureStreams();
  const exit = await command.execute();
  return { exit, out: out.join(""), err: err.join("") };
}

function makeCommand(runner: FakeRunner): CheckCommand {
  const cmd = new CheckCommand();
  cmd.runner = runner;
  return cmd;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CheckCommand healthy key", () => {
  it("reports healthy when expiry is beyond the window", async () => {
    const { exit, out } = await runCheck(makeCommand(createFakeRunner(colon(nowSeconds() + 365 * 86400))));

    expect(exit).toBe(0);
    expect(out).toMatch(/signing subkey \w{40} expires \d{4}-\d{2}-\d{2} \(\d+ days\)/);
  });
});

describe("CheckCommand window boundary", () => {
  it("reports within window at the inclusive boundary", async () => {
    const { exit, err } = await runCheck(makeCommand(createFakeRunner(colon(nowSeconds() + 30 * 86400 + 3600))));

    expect(exit).toBe(1);
    expect(err).toContain("within 30 days");
    expect(err).toContain(`Run: ghb signing renew --key ${PRIMARY_FPR}`);
  });
});

describe("CheckCommand just above window", () => {
  it("reports healthy just above the window", async () => {
    const { exit, out } = await runCheck(makeCommand(createFakeRunner(colon(nowSeconds() + 31 * 86400 + 3600))));

    expect(exit).toBe(0);
    expect(out).toMatch(/signing subkey \w{40} expires \d{4}-\d{2}-\d{2} \(\d+ days\)/);
  });
});

describe("CheckCommand expired", () => {
  it("reports expired when expiry is in the past", async () => {
    const { exit, err } = await runCheck(makeCommand(createFakeRunner(colon(nowSeconds() - 5 * 86400 + 3600))));

    expect(exit).toBe(1);
    expect(err).toContain("expired");
    expect(err).toMatch(/\d+ days ago/);
    expect(err).toContain(`Run: ghb signing renew --key ${PRIMARY_FPR}`);
  });
});

describe("CheckCommand never expires", () => {
  it("reports never expires when the subkey has no expiry", async () => {
    const { exit, out } = await runCheck(makeCommand(createFakeRunner(colon(null))));

    expect(exit).toBe(0);
    expect(out).toContain("never expires");
  });
});

describe("CheckCommand missing signing subkey", () => {
  it("errors when the key has no signing subkey", async () => {
    const { exit, err } = await runCheck(makeCommand(createFakeRunner(colon(nowSeconds() + 365 * 86400, "e"))));

    expect(exit).toBe(2);
    expect(err).toContain(`Error: key ${PRIMARY_FPR} has no signing subkey`);
  });
});

describe("CheckCommand key validation", () => {
  it("errors when --key is not a full fingerprint", async () => {
    const runner = createFakeRunner(colon(nowSeconds() + 365 * 86400));
    const cmd = makeCommand(runner);
    cmd.key = "8042ED9A";

    const { exit, err } = await runCheck(cmd);

    expect(exit).toBe(1);
    expect(runner.called).toBe(false);
    expect(err).toContain('Error: --key must be a full fingerprint; got "8042ED9A"');
  });
});

describe("CheckCommand ambiguous keys", () => {
  it("errors with both fingerprints when no --key and several keys", async () => {
    const { exit, err } = await runCheck(makeCommand(createFakeRunner(twoKeys(nowSeconds() + 365 * 86400))));

    expect(exit).toBe(2);
    expect(err).toContain("Error: multiple keys in the keyring; pass --key with one of:");
    expect(err).toContain(PRIMARY_FPR);
    expect(err).toContain(OTHER_PRIMARY_FPR);
  });
});

describe("CheckCommand days validation", () => {
  it("errors when --days is not a number", async () => {
    const runner = createFakeRunner(colon(nowSeconds() + 365 * 86400));
    const cmd = makeCommand(runner);
    cmd.days = "abc";

    const { exit, err } = await runCheck(cmd);

    expect(exit).toBe(1);
    expect(runner.called).toBe(false);
    expect(err).toContain('Error: --days must be a number; got "abc"');
  });
});

describe("CheckCommand empty keyring", () => {
  it("errors when the keyring is empty", async () => {
    const { exit, err } = await runCheck(makeCommand(createFakeRunner("")));

    expect(exit).toBe(2);
    expect(err).toContain("Error: no keys in the keyring");
  });
});

describe("CheckCommand key not found", () => {
  it("errors when --key matches nothing", async () => {
    const runner = createFakeRunner(colon(nowSeconds() + 365 * 86400));
    const cmd = makeCommand(runner);
    cmd.key = OTHER_PRIMARY_FPR;

    const { exit, err } = await runCheck(cmd);

    expect(exit).toBe(2);
    expect(err).toContain(`Error: key ${OTHER_PRIMARY_FPR} not found`);
  });
});

describe("CheckCommand listKeys failure", () => {
  it("errors when listKeys fails", async () => {
    const { exit, err } = await runCheck(makeCommand(createThrowingRunner("gpg is not installed")));

    expect(exit).toBe(1);
    expect(err).toContain("Error: Failed to list keys: gpg is not installed");
    expect(err).not.toContain("Internal Error");
  });
});

const PASS = "correct horse battery staple";
const originalEnv = process.env;
let integrationHome: string;

function setupIntegrationHome(): void {
  integrationHome = createGnupgHome();
  process.env = { ...originalEnv, GNUPGHOME: integrationHome };
}

function teardownIntegrationHome(): void {
  process.env = originalEnv;
}

describe("CheckCommand integration healthy", () => {
  beforeEach(setupIntegrationHome);
  afterEach(teardownIntegrationHome);

  it("reports a freshly generated 1y key as healthy", async () => {
    generateSigningKey(integrationHome, PASS, "1y");
    const { exit, out } = await runCheck(new CheckCommand());

    expect(exit).toBe(0);
    expect(out).toMatch(/signing subkey \w{40} expires \d{4}-\d{2}-\d{2} \(\d+ days\)/);
  });
});

describe("CheckCommand integration window", () => {
  beforeEach(setupIntegrationHome);
  afterEach(teardownIntegrationHome);

  it("reports a 1d key as inside the window", async () => {
    const { primaryFpr } = generateSigningKey(integrationHome, PASS, "1d");
    const { exit, err } = await runCheck(new CheckCommand());

    expect(exit).toBe(1);
    expect(err).toContain("within 30 days");
    expect(err).toContain(`Run: ghb signing renew --key ${primaryFpr}`);
  });
});
