// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { execFileSync } from "child_process";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { findSigningSubkey, parseColonKeys } from "../src/colon.js";

const LOOPBACK_ARGS = ["--batch", "--pinentry-mode", "loopback", "--passphrase-fd", "0"];

interface KeyGenContext {
  home: string;
  passphrase: string;
  expiry: string;
}

export function createGnupgHome(): string {
  return mkdtempSync(join(tmpdir(), "ghb-signing-"));
}

function runGpg(ctx: KeyGenContext, args: string[], input = ""): string {
  return execFileSync("gpg", args, {
    encoding: "utf8",
    env: { ...process.env, GNUPGHOME: ctx.home },
    input,
  });
}

function parseKeys(ctx: KeyGenContext): ReturnType<typeof parseColonKeys> {
  return parseColonKeys(runGpg(ctx, ["--list-keys", "--with-colons"]));
}

function primaryFingerprint(ctx: KeyGenContext): string {
  const keys = parseKeys(ctx);
  if (keys.length === 0) {
    throw new Error("primary key missing after generation");
  }
  return keys[0].fingerprint;
}

function generatePrimary(ctx: KeyGenContext): string {
  const uid = `Ghb Signing Test <test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid>`;
  runGpg(ctx, [...LOOPBACK_ARGS, "--quick-generate-key", uid, "ed25519", "cert", ctx.expiry], ctx.passphrase);
  return primaryFingerprint(ctx);
}

function subkeyFingerprint(ctx: KeyGenContext): string {
  const keys = parseKeys(ctx);
  if (keys.length === 0) {
    throw new Error("primary key missing after key generation");
  }
  const subkey = findSigningSubkey(keys[0]);
  if (subkey === undefined) {
    throw new Error("signing subkey missing after key generation");
  }
  return subkey.fingerprint;
}

function addSigningSubkey(ctx: KeyGenContext, primaryFpr: string): string {
  runGpg(ctx, [...LOOPBACK_ARGS, "--quick-add-key", primaryFpr, "ed25519", "sign", ctx.expiry], ctx.passphrase);
  return subkeyFingerprint(ctx);
}

export function generateSigningKey(
  home: string,
  passphrase: string,
  expiry = "1y",
): { primaryFpr: string; subkeyFpr: string } {
  const ctx = { home, passphrase, expiry };
  const primaryFpr = generatePrimary(ctx);
  const subkeyFpr = addSigningSubkey(ctx, primaryFpr);
  return { primaryFpr, subkeyFpr };
}
