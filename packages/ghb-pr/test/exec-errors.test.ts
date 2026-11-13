// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { execRunner } from "../src/exec.js";

// vitest hoists vi.mock above the imports regardless of position
vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }));

function printedError(): string {
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

  expect(() => execRunner("git", ["status"])).toThrow();
  return error.mock.calls.map((call) => call.join(" ")).join(" ");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("execRunner output fallbacks", () => {
  it("prints the child stdout when the error carries nothing else", () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- the fallback must survive a non-Error
      throw { stdout: "child stdout" };
    });

    expect(printedError()).toContain("child stdout");
  });

  it("prints the error message when it carries no output", () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error("only a message");
    });

    expect(printedError()).toContain("only a message");
  });
});

describe("execRunner output fallbacks", () => {
  it("falls back to String(e) when the error carries nothing at all", () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- the fallback must survive a non-Error
      throw {};
    });

    expect(printedError()).toContain("[object Object]");
  });
});
