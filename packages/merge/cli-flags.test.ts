// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";

function getHelpOutput(cmd: string): string {
  try {
    return execFileSync(cmd, ["--help"], { encoding: "utf8" });
  } catch {
    return "";
  }
}

describe("CLI flag compatibility", () => {
  describe("kimi", () => {
    it("should support -p / --prompt flag", () => {
      const help = getHelpOutput("kimi");
      expect(help).toMatch(/-p, --prompt/);
    });

    it("should support --skills-dir flag", () => {
      const help = getHelpOutput("kimi");
      expect(help).toMatch(/--skills-dir/);
    });
  });

  describe("copilot", () => {
    it("should support --model flag", () => {
      const help = getHelpOutput("copilot");
      expect(help).toMatch(/--model/);
    });

    it("should support -p / --prompt flag", () => {
      const help = getHelpOutput("copilot");
      expect(help).toMatch(/-p, --prompt/);
    });

    it("should support --silent flag", () => {
      const help = getHelpOutput("copilot");
      expect(help).toMatch(/--silent/);
    });
  });

  describe("junie", () => {
    it.todo(
      "should support required flags — skipped because @jetbrains/junie npm package delegates to a shim installed by their bash script, not the npm binary itself",
    );
  });
});
