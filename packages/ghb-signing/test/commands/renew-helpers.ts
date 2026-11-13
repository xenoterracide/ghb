// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, vi } from "vitest";

import { RenewCommand } from "../../src/commands/renew.js";
import type { CommandRunner } from "../../src/types.js";

export const PRIMARY_FPR = "E2161DBFFA7E2C4ED8A6DC8032BF5B09B5329853";
export const SUBKEY_FPR = "C17EB30E70FBD586F5794285C3C46C6F2A3408CC";
export const OTHER_PRIMARY_FPR = "ABCDEF0123456789ABCDEF0123456789ABCDEF01";
export const OTHER_SUBKEY_FPR = "0123456789ABCDEF0123456789ABCDEF01234567";
export const PASS = "correct horse battery staple";

export interface SequenceCall {
  cmd: string;
  args: string[];
  opts?: { cwd?: string; env?: Record<string, string>; input?: string };
}

export interface SequenceRunner extends CommandRunner {
  calls: SequenceCall[];
}

export function formatDate(seconds: number | null): string {
  if (seconds === null) return "never";
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

function colonLines(primaryExpiry: string, subkeyExpiry: string, capabilities: string): string {
  return `tru::1:1794537422:1826073421:3:1:5
pub:u:255:22:32BF5B09B5329853:1794537421:${primaryExpiry}::u:::cSC:::::ed25519:::0:
fpr:::::::::${PRIMARY_FPR}:
uid:u::::1794537421::13D53EB7B1B52BD56CEF553F7EED2E413F86F513::Plan Test <plan@example.invalid>::::::::::0:
sub:u:255:22:C3C46C6F2A3408CC:1794537422:${subkeyExpiry}:::::${capabilities}:::::ed25519::
fpr:::::::::${SUBKEY_FPR}:`;
}

export function colonKey(primaryExpiresAt: number | null, subkeyExpiresAt: number | null): string {
  return colonLines(
    primaryExpiresAt === null ? "" : String(primaryExpiresAt),
    subkeyExpiresAt === null ? "" : String(subkeyExpiresAt),
    "s",
  );
}

// gpg disables a key with D in the primary's capabilities while the
// subkeys keep their own validity: pub:cSCD beside sub:u...s
export function colonDisabledPrimary(primaryExpiresAt: number, subkeyExpiresAt: number): string {
  return colonLines(String(primaryExpiresAt), String(subkeyExpiresAt), "s").replace(":::cSC:::::", ":::cSCD:::::");
}

export function twoKeys(subExpiresAt: number): string {
  const expiryField = String(subExpiresAt);
  return `${colonLines("1826073421", expiryField, "s")}
pub:u:255:22:ABCDEF0123456789:1794537430:1826073430::u:::cSC:::::ed25519:::0:
fpr:::::::::${OTHER_PRIMARY_FPR}:
uid:u::::1794537430::13D53EB7B1B52BD56CEF553F7EED2E413F86F513::Plan Test Two <plan2@example.invalid>::::::::::0:
sub:u:255:22:0123456789ABCDEF:1794537431:1826073431:::::s:::::ed25519::
fpr:::::::::${OTHER_SUBKEY_FPR}:`;
}

export function createSequenceRunner(responses: string[]): SequenceRunner {
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

export function createFailingRunner(failAtIndex: number, errorMessage: string): SequenceRunner {
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

export function captureStreams(): { out: string[]; err: string[] } {
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

export async function runRenew(command: RenewCommand): Promise<{ exit: number; out: string; err: string }> {
  const { out, err } = captureStreams();
  const exit = await command.execute();
  return { exit, out: out.join(""), err: err.join("") };
}

export function makeCommand(runner: SequenceRunner): RenewCommand {
  const cmd = new RenewCommand();
  cmd.runner = runner;
  cmd.passphrase = PASS;
  return cmd;
}

export function renewalRunner(dates: {
  beforePrimary: number;
  beforeSubkey: number;
  afterPrimary: number;
  afterSubkey: number;
}): SequenceRunner {
  return createSequenceRunner([
    colonKey(dates.beforePrimary, dates.beforeSubkey),
    "",
    "",
    colonKey(dates.afterPrimary, dates.afterSubkey),
  ]);
}

function assertListKeysCall(call: SequenceCall): void {
  expect(call.cmd).toBe("gpg");
  expect(call.args).toEqual(["--list-keys", "--with-colons"]);
}

function assertSetExpiryCall(call: SequenceCall, duration: string, subkey?: string): void {
  const args = [
    "--batch",
    "--pinentry-mode",
    "loopback",
    "--passphrase-fd",
    "0",
    "--quick-set-expire",
    PRIMARY_FPR,
    duration,
  ];
  if (subkey !== undefined) {
    args.push(subkey);
  }
  expect(call.cmd).toBe("gpg");
  expect(call.args).toEqual(args);
  expect(call.opts).toEqual({ input: PASS });
}

export function assertRenewalCalls(calls: SequenceCall[], duration: string): void {
  expect(calls).toHaveLength(4);
  assertListKeysCall(calls[0]);
  assertSetExpiryCall(calls[1], duration);
  assertSetExpiryCall(calls[2], duration, SUBKEY_FPR);
  assertListKeysCall(calls[3]);
}

export function nextSteps(stdout: string): void {
  expect(stdout).toContain(
    "Next: ghb secrets sync --env-file <env-file> --repo <owner/repo>  # push the renewed key to CI",
  );
  expect(stdout).toContain("Next: back up the key to Bitwarden");
}
