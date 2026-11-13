// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RenewCommand } from "../../src/commands/renew.js";
import { findSigningSubkey, listKeys } from "../../src/index.js";
import { createGnupgHome, generateSigningKey } from "../gnupg.js";

const PASS = "correct horse battery staple";
const ROUGHLY_TWO_YEARS = 2 * 365 * 86400;

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

function assertKeyRenewed(before: { primaryFpr: string; subkeyFpr: string }): void {
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
  expect(primary.expiresAt).toBeGreaterThanOrEqual(now + ROUGHLY_TWO_YEARS - 7 * 86400);
  expect(primary.expiresAt).toBeLessThan(now + ROUGHLY_TWO_YEARS + 30 * 86400);
  expect(subkey.expiresAt).toBeGreaterThanOrEqual(now + ROUGHLY_TWO_YEARS - 7 * 86400);
  expect(subkey.expiresAt).toBeLessThan(now + ROUGHLY_TWO_YEARS + 30 * 86400);
}

function assertNextSteps(stdout: string): void {
  expect(stdout).toContain(
    "Next: ghb secrets sync --env-file <env-file> --repo <owner/repo>  # push the renewed key to CI",
  );
  expect(stdout).toContain("Next: back up the key to Bitwarden");
}

const originalEnv = process.env;
let renewHome: string;

function setupRenewHome(): void {
  renewHome = createGnupgHome();
  process.env = { ...originalEnv, GNUPGHOME: renewHome };
}

function teardownRenewHome(): void {
  process.env = originalEnv;
  vi.restoreAllMocks();
}

describe("RenewCommand integration", () => {
  beforeEach(setupRenewHome);
  afterEach(teardownRenewHome);

  it("renews a 1y key to 2y", async () => {
    const before = generateSigningKey(renewHome, PASS, "1y");
    const command = new RenewCommand();
    command.passphrase = PASS;
    command.duration = "2y";
    const { out } = captureStreams();

    const result = await command.execute();

    expect(result).toBe(0);
    assertKeyRenewed(before);
    assertNextSteps(out.join(""));
  });
});
