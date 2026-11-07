// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, describe, expect, it, vi } from "vitest";
import { execRunner } from "../src/exec.js";

describe("execRunner", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws and prints the child's real stderr on failure", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(() => execRunner("git", ["--invalid-flag"])).toThrow();

    const printed = error.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(printed).toContain("unknown option: --invalid-flag");
  });
});
