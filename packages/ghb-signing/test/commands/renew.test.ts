// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RenewCommand } from "../../src/commands/renew.js";
import { findSigningSubkey, listKeys } from "../../src/index.js";
import type { CommandRunner } from "../../src/types.js";
import { createGnupgHome, generateSigningKey } from "../gnupg.js";

const PRIMARY_FPR = "E2161DBFFA7E2C4ED8A6DC8032BF5B09B5329853";
const SUBKEY_FPR = "C17EB30E70FBD586F5794285C3C46C6F2A3408CC";
const OTHER_PRIMARY_FPR = "ABCDEF0123456789ABCDEF0123456789ABCDEF01";
const OTHER_SUBKEY_FPR = "0123456789ABCDEF0123456789ABCDEF01234567";
const PASS = "correct horse battery staple";

interface SequenceCall {
  cmd: string;
  args: string[];
  opts?: { cwd?: string; env?: Record<string, string>; input?: string };
}

interface SequenceRunner extends CommandRunner {
  calls: SequenceCall[];
}

function formatDate(seconds: number | null): string {
  if (seconds === null) return "never";
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

function colonKey(primaryExpiresAt: number | null, subkeyExpiresAt: number | null): string {
  const primaryExpiry = primaryExpiresAt === null ? "" : String(primaryExpiresAt);
  const subkeyExpiry = subkeyExpiresAt === null ? "" : String(subkeyExpiresAt);
  return `tru::1:1794537422:1826073421:3:1:5
pub:u:255:22:32BF5B09B5329853:1794537421:${primaryExpiry}::u:::cSC:::::ed25519:::0:
fpr:::::::::${PRIMARY_FPR}:
uid:u::::1794537421::13D53EB7B1B52BD56CEF553F7EED2E413F86F513::Plan Test <plan@example.invalid>::::::::::0:
sub:u:255:22:C3C46C6F2A3408CC:1794537422:${subkeyExpiry}:::::s:::::ed25519::
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

function createFailingRunner(failAtIndex: number, errorMessage: string): SequenceRunner {
  const responses: string[] = [colonKey(1826073421, 1826073422), "", "", colonKey(1857609421, 1857609422)];
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
      if (index === failAtIndex) {
        throw new Error(errorMessage);
      }
      if (index >= responses.length) {
        throw new Error(`Unexpected call #${index}: ${cmd} ${args.join(" ")}`);
      }
      return responses[index++];
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

function makeCommand(runner: SequenceRunner): RenewCommand {
  const cmd = new RenewCommand();
  cmd.runner = runner;
  cmd.passphrase = PASS;
  return cmd;
}

describe("RenewCommand unit", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renews the primary and signing subkey with the default duration", async () => {
    const beforePrimary = 1826073421;
    const beforeSubkey = 1826073422;
    const afterPrimary = 1857609421;
    const afterSubkey = 1857609422;
    const runner = createSequenceRunner([
      colonKey(beforePrimary, beforeSubkey),
      "",
      "",
      colonKey(afterPrimary, afterSubkey),
    ]);
    const { out } = captureStreams();

    const result = await makeCommand(runner).execute();

    expect(result).toBe(0);
    expect(runner.calls).toHaveLength(4);

    expect(runner.calls[0].cmd).toBe("gpg");
    expect(runner.calls[0].args).toEqual(["--list-keys", "--with-colons"]);

    expect(runner.calls[1].cmd).toBe("gpg");
    expect(runner.calls[1].args).toEqual([
      "--batch",
      "--pinentry-mode",
      "loopback",
      "--passphrase-fd",
      "0",
      "--quick-set-expire",
      PRIMARY_FPR,
      "1y",
    ]);
    expect(runner.calls[1].opts).toEqual({ input: PASS });

    expect(runner.calls[2].cmd).toBe("gpg");
    expect(runner.calls[2].args).toEqual([
      "--batch",
      "--pinentry-mode",
      "loopback",
      "--passphrase-fd",
      "0",
      "--quick-set-expire",
      PRIMARY_FPR,
      "1y",
      SUBKEY_FPR,
    ]);
    expect(runner.calls[2].opts).toEqual({ input: PASS });

    expect(runner.calls[3].cmd).toBe("gpg");
    expect(runner.calls[3].args).toEqual(["--list-keys", "--with-colons"]);

    const stdout = out.join("");
    expect(stdout).toContain(
      `primary ${PRIMARY_FPR} expires ${formatDate(afterPrimary)} (was ${formatDate(beforePrimary)})`,
    );
    expect(stdout).toContain(
      `signing subkey ${SUBKEY_FPR} expires ${formatDate(afterSubkey)} (was ${formatDate(beforeSubkey)})`,
    );
    expect(stdout).toContain(
      "Next: ghb secrets sync --env-file <env-file> --repo <owner/repo>  # push the renewed key to CI",
    );
    expect(stdout).toContain("Next: back up the key to Bitwarden");
  });

  it("renews with an explicit duration", async () => {
    const beforePrimary = 1826073421;
    const beforeSubkey = 1826073422;
    const afterPrimary = 1889145421;
    const afterSubkey = 1889145422;
    const runner = createSequenceRunner([
      colonKey(beforePrimary, beforeSubkey),
      "",
      "",
      colonKey(afterPrimary, afterSubkey),
    ]);
    const { out } = captureStreams();

    const cmd = makeCommand(runner);
    cmd.duration = "2y";
    const result = await cmd.execute();

    expect(result).toBe(0);
    expect(runner.calls[1].args).toContain("2y");
    expect(runner.calls[2].args).toContain("2y");
    const stdout = out.join("");
    expect(stdout).toContain(
      `primary ${PRIMARY_FPR} expires ${formatDate(afterPrimary)} (was ${formatDate(beforePrimary)})`,
    );
    expect(stdout).toContain(
      `signing subkey ${SUBKEY_FPR} expires ${formatDate(afterSubkey)} (was ${formatDate(beforeSubkey)})`,
    );
  });

  it("errors when --key is not a full fingerprint", async () => {
    const runner = createSequenceRunner([]);
    const { err } = captureStreams();

    const cmd = makeCommand(runner);
    cmd.key = "8042ED9A";
    const result = await cmd.execute();

    expect(result).toBe(1);
    expect(runner.calls).toHaveLength(0);
    expect(err.join("")).toContain('Error: --key must be a full fingerprint; got "8042ED9A"');
  });

  it("errors when --duration is not in the allowed format", async () => {
    const runner = createSequenceRunner([]);
    const { err } = captureStreams();

    const cmd = makeCommand(runner);
    cmd.duration = "forever";
    const result = await cmd.execute();

    expect(result).toBe(1);
    expect(runner.calls).toHaveLength(0);
    expect(err.join("")).toContain('Error: --duration must be <n>d, <n>w, <n>m, or <n>y; got "forever"');
  });

  it.each(["0d", "0w", "0m", "0y"])("errors when --duration is zero (%s)", async (duration) => {
    const runner = createSequenceRunner([]);
    const { err } = captureStreams();

    const cmd = makeCommand(runner);
    cmd.duration = duration;
    const result = await cmd.execute();

    expect(result).toBe(1);
    expect(runner.calls).toHaveLength(0);
    expect(err.join("")).toContain(`Error: --duration must be <n>d, <n>w, <n>m, or <n>y; got "${duration}"`);
  });

  it("errors when the keyring is empty", async () => {
    const runner = createSequenceRunner([""]);
    const { err } = captureStreams();

    const result = await makeCommand(runner).execute();

    expect(result).toBe(2);
    expect(err.join("")).toContain("Error: no keys in the keyring");
  });

  it("errors with both fingerprints when no --key and several keys", async () => {
    const runner = createSequenceRunner([twoKeys(1826073422)]);
    const { err } = captureStreams();

    const result = await makeCommand(runner).execute();

    expect(result).toBe(2);
    const stderr = err.join("");
    expect(stderr).toContain("Error: multiple keys in the keyring; pass --key with one of:");
    expect(stderr).toContain(PRIMARY_FPR);
    expect(stderr).toContain(OTHER_PRIMARY_FPR);
  });

  it("errors when --key matches nothing", async () => {
    const runner = createSequenceRunner([colonKey(1826073421, 1826073422)]);
    const { err } = captureStreams();

    const cmd = makeCommand(runner);
    cmd.key = OTHER_PRIMARY_FPR;
    const result = await cmd.execute();

    expect(result).toBe(2);
    expect(err.join("")).toContain(`Error: key ${OTHER_PRIMARY_FPR} not found`);
  });

  it("errors when the key has no signing subkey", async () => {
    const noSigning = colonKey(1826073421, 1826073422).replace(/:::::s:::::ed25519::/, ":::::e:::::ed25519::");
    const runner = createSequenceRunner([noSigning]);
    const { err } = captureStreams();

    const result = await makeCommand(runner).execute();

    expect(result).toBe(2);
    expect(err.join("")).toContain(`Error: key ${PRIMARY_FPR} has no signing subkey`);
  });

  it("errors when the first setExpiry fails", async () => {
    const runner = createFailingRunner(1, "gpg exited with code 2");
    const { err } = captureStreams();

    const result = await makeCommand(runner).execute();

    expect(result).toBe(1);
    expect(runner.calls).toHaveLength(2);
    expect(err.join("")).toContain(`Error: Failed to set expiry for ${PRIMARY_FPR}: gpg exited with code 2`);
  });

  it("errors when the second setExpiry fails", async () => {
    const runner = createFailingRunner(2, "gpg exited with code 2");
    const { err } = captureStreams();

    const result = await makeCommand(runner).execute();

    expect(result).toBe(1);
    expect(runner.calls).toHaveLength(3);
    expect(err.join("")).toContain(`Error: Failed to set expiry for ${PRIMARY_FPR}: gpg exited with code 2`);
  });

  it("prints never when the before expiry is null", async () => {
    const runner = createSequenceRunner([colonKey(null, null), "", "", colonKey(1857609421, 1857609422)]);
    const { out } = captureStreams();

    const result = await makeCommand(runner).execute();

    expect(result).toBe(0);
    const stdout = out.join("");
    expect(stdout).toContain(`primary ${PRIMARY_FPR} expires ${formatDate(1857609421)} (was never)`);
    expect(stdout).toContain(`signing subkey ${SUBKEY_FPR} expires ${formatDate(1857609422)} (was never)`);
  });
});

describe("RenewCommand integration", () => {
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

  it("renews a 1y key to 2y", async () => {
    const before = generateSigningKey(home, PASS, "1y");
    const command = new RenewCommand();
    command.passphrase = PASS;
    command.duration = "2y";
    const { out } = captureStreams();

    const result = await command.execute();

    expect(result).toBe(0);
    const stdout = out.join("");
    expect(stdout).toContain(`primary ${before.primaryFpr} expires`);
    expect(stdout).toContain(`signing subkey ${before.subkeyFpr} expires`);
    expect(stdout).toContain(
      "Next: ghb secrets sync --env-file <env-file> --repo <owner/repo>  # push the renewed key to CI",
    );
    expect(stdout).toContain("Next: back up the key to Bitwarden");

    const keys = listKeys();
    const primary = keys.find((key) => key.fingerprint === before.primaryFpr);
    expect(primary).toBeDefined();
    if (primary === undefined) {
      throw new Error("primary key missing after renew");
    }

    const subkey = findSigningSubkey(primary);
    expect(subkey).toBeDefined();
    if (subkey === undefined) {
      throw new Error("signing subkey missing after renew");
    }

    const now = Math.floor(Date.now() / 1000);
    const roughlyTwoYears = 2 * 365 * 86400;
    expect(primary.expiresAt).toBeGreaterThanOrEqual(now + roughlyTwoYears - 7 * 86400);
    expect(primary.expiresAt).toBeLessThan(now + roughlyTwoYears + 30 * 86400);
    expect(subkey.expiresAt).toBeGreaterThanOrEqual(now + roughlyTwoYears - 7 * 86400);
    expect(subkey.expiresAt).toBeLessThan(now + roughlyTwoYears + 30 * 86400);
  });
});
