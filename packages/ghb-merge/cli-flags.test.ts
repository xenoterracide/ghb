// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";

function getHelp(cmd: string): string | undefined {
  try {
    return execFileSync(cmd, ["--help"], { encoding: "utf8", timeout: 10000 });
  } catch {
    return undefined;
  }
}

const describeIf = (condition: boolean): typeof describe => (condition ? describe : describe.skip);

const kimiHelp = getHelp("kimi");
describeIf(kimiHelp !== undefined)("kimi", () => {
  it("should support -p / --prompt flag", () => {
    expect(kimiHelp).toMatch(/-p, --prompt/);
  });

  it("should support --skills-dir flag", () => {
    expect(kimiHelp).toMatch(/--skills-dir/);
  });
});

const copilotHelp = getHelp("copilot");
describeIf(copilotHelp !== undefined)("copilot", () => {
  it("should support --model flag", () => {
    expect(copilotHelp).toMatch(/--model/);
  });

  it("should support -p / --prompt flag", () => {
    expect(copilotHelp).toMatch(/-p, --prompt/);
  });

  it("should support --silent flag", () => {
    expect(copilotHelp).toMatch(/--silent/);
  });
});

const junieHelp = getHelp("junie");
describeIf(junieHelp !== undefined)("junie", () => {
  it.todo(
    "should support required flags — skipped because @jetbrains/junie npm package delegates to a shim installed by their bash script, not the npm binary itself",
  );
});
