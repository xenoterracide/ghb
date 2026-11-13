// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { execFileSync } from "child_process";

import { parseColonKeys } from "./colon.js";
import type { CommandRunner, PublicKey } from "./types.js";

export interface GpgOpts {
  runner?: CommandRunner;
  env?: Record<string, string>;
  passphrase?: string;
}

function createDefaultCommandRunner(): CommandRunner {
  return {
    runArgv(
      cmd: string,
      args: string[],
      opts?: { cwd?: string; env?: Record<string, string>; input?: string },
    ): string {
      return execFileSync(cmd, args, {
        encoding: "utf8",
        cwd: opts?.cwd,
        env: { ...process.env, ...opts?.env },
        input: opts?.input,
      }).trim();
    },
  };
}

const defaultRunner = createDefaultCommandRunner();

function loopbackArgs(passphrase: string | undefined): { args: string[]; input: string | undefined } {
  if (passphrase !== undefined) {
    return {
      args: ["--batch", "--pinentry-mode", "loopback", "--passphrase-fd", "0"],
      input: passphrase,
    };
  }
  return { args: [], input: undefined };
}

function runOpts(
  env: Record<string, string> | undefined,
  input: string | undefined,
): { env?: Record<string, string>; input?: string } | undefined {
  if (env === undefined && input === undefined) return undefined;
  const opts: { env?: Record<string, string>; input?: string } = {};
  if (env !== undefined) opts.env = env;
  if (input !== undefined) opts.input = input;
  return opts;
}

export function listKeys(opts?: GpgOpts): PublicKey[] {
  const runner = opts?.runner ?? defaultRunner;
  try {
    const output = runner.runArgv("gpg", ["--list-keys", "--with-colons"], runOpts(opts?.env, undefined));
    return parseColonKeys(output);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to list keys: ${msg}`, { cause: e });
  }
}

export function exportSecretKey(fingerprint: string, opts?: GpgOpts): string {
  const runner = opts?.runner ?? defaultRunner;
  const { args, input } = loopbackArgs(opts?.passphrase);
  let output: string;
  try {
    output = runner.runArgv(
      "gpg",
      [...args, "--armor", "--export-secret-keys", fingerprint],
      runOpts(opts?.env, input),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to export secret key ${fingerprint}: ${msg}`, { cause: e });
  }
  if (output === "") {
    throw new Error(`Failed to export secret key ${fingerprint}: gpg exported no key`);
  }
  return output;
}

// eslint-disable-next-line @typescript-eslint/max-params
export function setExpiry(fingerprint: string, duration: string, subkeyFingerprint?: string, opts?: GpgOpts): void {
  const runner = opts?.runner ?? defaultRunner;
  const { args, input } = loopbackArgs(opts?.passphrase);
  const argv = [...args, "--quick-set-expire", fingerprint, duration];
  if (subkeyFingerprint !== undefined) {
    argv.push(subkeyFingerprint);
  }
  try {
    runner.runArgv("gpg", argv, runOpts(opts?.env, input));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to set expiry for ${fingerprint}: ${msg}`, { cause: e });
  }
}
