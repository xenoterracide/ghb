// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { resolveEngine, EngineResolutionError } from "./merge";
import type { EngineName } from "./ai/index.js";

function flags(overrides: Partial<Record<EngineName, boolean>> = {}): Record<EngineName, boolean> {
  return {
    kimi: false,
    junie: false,
    copilot: false,
    ...overrides,
  };
}

describe("resolveEngine", () => {
  it("defaults to kimi when no engine flag is specified", () => {
    expect(resolveEngine(flags())).toBe("kimi");
  });

  it("returns the engine from a shorthand flag", () => {
    expect(resolveEngine(flags({ kimi: true }))).toBe("kimi");
    expect(resolveEngine(flags({ junie: true }))).toBe("junie");
    expect(resolveEngine(flags({ copilot: true }))).toBe("copilot");
  });

  it("throws when multiple shorthand flags are set", () => {
    expect(() => resolveEngine(flags({ kimi: true, junie: true }))).toThrow(EngineResolutionError);
    expect(() => resolveEngine(flags({ kimi: true, junie: true }))).toThrow(/Multiple engines specified/);
  });
});
