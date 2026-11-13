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

interface FakeRunner extends CommandRunner {
  called: boolean;
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

function makeCommand(runner: FakeRunner): CheckCommand {
  const cmd = new CheckCommand();
  cmd.runner = runner;
  return cmd;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

describe("CheckCommand unit", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports healthy when expiry is beyond the window", async () => {
    const now = nowSeconds();
    const runner = createFakeRunner(colon(now + 365 * 86400));
    const { out } = captureStreams();

    const result = await makeCommand(runner).execute();

    expect(result).toBe(0);
    expect(out.join("")).toMatch(/signing subkey \w{40} expires \d{4}-\d{2}-\d{2} \(\d+ days\)/);
  });

  it("reports within window at the inclusive boundary", async () => {
    const now = nowSeconds();
    const runner = createFakeRunner(colon(now + 30 * 86400 + 3600));
    const { err } = captureStreams();

    const result = await makeCommand(runner).execute();

    expect(result).toBe(1);
    const stderr = err.join("");
    expect(stderr).toContain("within 30 days");
    expect(stderr).toContain(`Run: ghb signing renew --key ${PRIMARY_FPR}`);
  });

  it("reports healthy just above the window", async () => {
    const now = nowSeconds();
    const runner = createFakeRunner(colon(now + 31 * 86400 + 3600));
    const { out } = captureStreams();

    const result = await makeCommand(runner).execute();

    expect(result).toBe(0);
    expect(out.join("")).toMatch(/signing subkey \w{40} expires \d{4}-\d{2}-\d{2} \(\d+ days\)/);
  });

  it("reports expired when expiry is in the past", async () => {
    const now = nowSeconds();
    const runner = createFakeRunner(colon(now - 5 * 86400 + 3600));
    const { err } = captureStreams();

    const result = await makeCommand(runner).execute();

    expect(result).toBe(1);
    const stderr = err.join("");
    expect(stderr).toContain("expired");
    expect(stderr).toMatch(/\d+ days ago/);
    expect(stderr).toContain(`Run: ghb signing renew --key ${PRIMARY_FPR}`);
  });

  it("reports never expires when the subkey has no expiry", async () => {
    const runner = createFakeRunner(colon(null));
    const { out } = captureStreams();

    const result = await makeCommand(runner).execute();

    expect(result).toBe(0);
    expect(out.join("")).toContain("never expires");
  });

  it("errors when the key has no signing subkey", async () => {
    const runner = createFakeRunner(colon(nowSeconds() + 365 * 86400, "e"));
    const { err } = captureStreams();

    const result = await makeCommand(runner).execute();

    expect(result).toBe(2);
    expect(err.join("")).toContain(`Error: key ${PRIMARY_FPR} has no signing subkey`);
  });

  it("errors when --key is not a full fingerprint", async () => {
    const runner = createFakeRunner(colon(nowSeconds() + 365 * 86400));
    const { err } = captureStreams();

    const cmd = makeCommand(runner);
    cmd.key = "8042ED9A";
    const result = await cmd.execute();

    expect(result).toBe(1);
    expect(runner.called).toBe(false);
    expect(err.join("")).toContain('Error: --key must be a full fingerprint; got "8042ED9A"');
  });

  it("errors when --key matches nothing", async () => {
    const runner = createFakeRunner(colon(nowSeconds() + 365 * 86400));
    const { err } = captureStreams();

    const cmd = makeCommand(runner);
    cmd.key = OTHER_PRIMARY_FPR;
    const result = await cmd.execute();

    expect(result).toBe(2);
    expect(err.join("")).toContain(`Error: key ${OTHER_PRIMARY_FPR} not found`);
  });

  it("errors with both fingerprints when no --key and several keys", async () => {
    const now = nowSeconds();
    const runner = createFakeRunner(twoKeys(now + 365 * 86400));
    const { err } = captureStreams();

    const result = await makeCommand(runner).execute();

    expect(result).toBe(2);
    const stderr = err.join("");
    expect(stderr).toContain("Error: multiple keys in the keyring; pass --key with one of:");
    expect(stderr).toContain(PRIMARY_FPR);
    expect(stderr).toContain(OTHER_PRIMARY_FPR);
  });

  it("errors when --days is not a number", async () => {
    const runner = createFakeRunner(colon(nowSeconds() + 365 * 86400));
    const { err } = captureStreams();

    const cmd = makeCommand(runner);
    cmd.days = "abc";
    const result = await cmd.execute();

    expect(result).toBe(1);
    expect(runner.called).toBe(false);
    expect(err.join("")).toContain('Error: --days must be a number; got "abc"');
  });

  it("errors when the keyring is empty", async () => {
    const runner = createFakeRunner("");
    const { err } = captureStreams();

    const result = await makeCommand(runner).execute();

    expect(result).toBe(2);
    expect(err.join("")).toContain("Error: no keys in the keyring");
  });
});

describe("CheckCommand integration", () => {
  const PASS = "correct horse battery staple";
  const originalEnv = process.env;
  let home: string;

  beforeEach(() => {
    home = createGnupgHome();
    process.env = { ...originalEnv, GNUPGHOME: home };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("reports a freshly generated 1y key as healthy", async () => {
    generateSigningKey(home, PASS, "1y");
    const { out } = captureStreams();

    const result = await new CheckCommand().execute();

    expect(result).toBe(0);
    expect(out.join("")).toMatch(/signing subkey \w{40} expires \d{4}-\d{2}-\d{2} \(\d+ days\)/);
  });

  it("reports a 1d key as inside the window", async () => {
    const { primaryFpr } = generateSigningKey(home, PASS, "1d");
    const { err } = captureStreams();

    const result = await new CheckCommand().execute();

    expect(result).toBe(1);
    const stderr = err.join("");
    expect(stderr).toContain("within 30 days");
    expect(stderr).toContain(`Run: ghb signing renew --key ${primaryFpr}`);
  });
});
