// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { PrMessageCommand, MergeCommand } from "./merge";
import type { CommandRunner } from "./merge";

function createFakeRunner(): CommandRunner {
  return {
    run: (): string => "",
    runSilent: (): string => "",
    runArgv: (): string => "",
  };
}

describe("PrMessageCommand with injected runner", () => {
  it("should accept injected runner in constructor", () => {
    const runner = createFakeRunner();
    const cmd = new PrMessageCommand(runner);
    expect(cmd).toBeDefined();
  });

  it("should use default runner when none provided", () => {
    const cmd = new PrMessageCommand();
    expect(cmd).toBeDefined();
  });
});

describe("MergeCommand with injected runner", () => {
  it("should accept injected runner in constructor", () => {
    const runner = createFakeRunner();
    const cmd = new MergeCommand(runner);
    expect(cmd).toBeDefined();
  });

  it("should use default runner when none provided", () => {
    const cmd = new MergeCommand();
    expect(cmd).toBeDefined();
  });
});
