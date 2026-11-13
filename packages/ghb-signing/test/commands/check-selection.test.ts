// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, describe, expect, it, vi } from "vitest";

import { CheckCommand } from "../../src/commands/check.js";
import type { CommandRunner } from "../../src/types.js";

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

// gpg disables a key with D in the primary's capabilities while the
// subkeys keep their own validity: pub:cSCD beside sub:u...s
function colonDisabledPrimary(subExpiresAt: number): string {
  return colon(subExpiresAt).replace(":::cSC:::::", ":::cSCD:::::");
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

async function runCheck(cmd: CheckCommand): Promise<{ exit: number; out: string; err: string }> {
  const { out, err } = captureStreams();
  const exit = await cmd.execute();
  return { exit, out: out.join(""), err: err.join("") };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CheckCommand missing signing subkey", () => {
  it("errors when the key has no signing subkey", async () => {
    const { exit, err } = await runCheck(makeCommand(createFakeRunner(colon(nowSeconds() + 365 * 86400, "e"))));

    expect(exit).toBe(2);
    expect(err).toContain(`Error: key ${PRIMARY_FPR} has no signing subkey`);
  });
});

describe("CheckCommand disabled primary", () => {
  it("errors when the primary is disabled, even with a usable signing subkey", async () => {
    // the subkey's own validity stays u; only the primary carries D
    const runner = createFakeRunner(colonDisabledPrimary(nowSeconds() + 365 * 86400));

    const { exit, err } = await runCheck(makeCommand(runner));

    expect(exit).toBe(2);
    expect(err).toContain(`Error: key ${PRIMARY_FPR} is disabled`);
  });
});

describe("CheckCommand empty key validation", () => {
  it("errors on an explicitly empty --key instead of selecting the sole key", async () => {
    const runner = createFakeRunner(colon(nowSeconds() + 365 * 86400));
    const cmd = makeCommand(runner);
    cmd.key = "";

    const { exit, err } = await runCheck(cmd);

    expect(exit).toBe(1);
    expect(runner.called).toBe(false);
    expect(err).toContain('Error: --key must be a full fingerprint; got ""');
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
