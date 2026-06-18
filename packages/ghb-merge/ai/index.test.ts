// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { createAiEngine, KimiEngine } from "./index.js";

describe("createAiEngine", () => {
  it("returns a KimiEngine for the kimi engine name", () => {
    const engine = createAiEngine("kimi");
    expect(engine).toBeInstanceOf(KimiEngine);
    expect(engine.name).toBe("kimi");
  });

  it("throws for the junie engine name because it is not yet migrated", () => {
    expect(() => createAiEngine("junie")).toThrow(/not yet migrated/);
  });

  it("throws for the copilot engine name because it is not yet migrated", () => {
    expect(() => createAiEngine("copilot")).toThrow(/not yet migrated/);
  });

  it("throws for an unknown engine name", () => {
    expect(() => createAiEngine("unknown" as "kimi")).toThrow(/Unknown engine/);
  });
});
