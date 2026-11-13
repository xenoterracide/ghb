// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import { readAll, readPassphrase } from "../src/passphrase.js";

describe("readAll", () => {
  it("reads a stream to eof", async () => {
    expect(await readAll(Readable.from(["ab", "cd"]))).toBe("abcd");
  });
});

describe("readPassphrase", () => {
  it("skips the tty stream and lets pinentry ask", async () => {
    const ttyLike = { isTTY: true } as unknown as NodeJS.ReadableStream & { isTTY?: boolean };
    expect(await readPassphrase(ttyLike)).toBeUndefined();
  });

  it("keeps the trailing newline; gpg strips it", async () => {
    expect(await readPassphrase(Readable.from(["pass\n"]))).toBe("pass\n");
  });
});
