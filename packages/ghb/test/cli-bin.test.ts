// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The root tsc project compiles test files as CommonJS, so import.meta is
// unavailable here; walk up from the cwd to the workspace root instead.
const findRepoRoot = (start: string): string => {
  let dir = start;
  while (dirname(dir) !== dir) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    dir = dirname(dir);
  }
  throw new Error("could not find the workspace root");
};

const repoRoot = findRepoRoot(process.cwd());
const workDir = mkdtempSync(join(tmpdir(), "ghb-bin-"));
const packsDir = join(workDir, "packs");
const installDir = join(workDir, "install");

const run = (command: string, args: string[], cwd: string): string =>
  execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

describe("the published bin", () => {
  beforeAll(() => {
    // pack applies publishConfig (main -> dist) and rewrites workspace:^,
    // so only the packed form can run under plain node; prepack builds
    for (const pkg of ["ghb", "ghb-secrets-sync"]) {
      run("pnpm", ["pack", "--pack-destination", packsDir], join(repoRoot, "packages", pkg));
    }

    const tarballs = run("ls", [packsDir], workDir)
      .split("\n")
      .filter((line) => line.endsWith(".tgz"))
      .map((name) => join(packsDir, name));
    run("npm", ["install", "--global", "--prefix", installDir, ...tarballs], workDir);
  }, 60000);

  afterAll(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it("answers help when installed from tarballs and invoked through its bin link", () => {
    // npm links the bin as install/bin/ghb -> .../dist/cli.js; argv[1]
    // carries the link's name, never the module's
    const bin = join(installDir, "bin", "ghb");
    const stdout = run("node", [bin, "--help"], workDir);

    expect(stdout).toContain("ghb <command>");
  });

  it("binds pr verify's flags and PR selector instead of rejecting them", () => {
    // a separate pr-commands package put its option specs on a second
    // clipanion copy; specs carry a module-scoped symbol, so the parser
    // never saw them and rejected every flag and positional as a syntax
    // error before the command could run
    const bin = join(installDir, "bin", "ghb");
    try {
      run("node", [bin, "pr", "verify", "--interval", "5", "--timeout", "10", "585"], workDir);
      expect.unreachable("pr verify cannot pass outside a git repository");
    } catch (e) {
      // clipanion writes usage errors to stdout; runtime errors to stderr
      const output = `${(e as { stdout?: string }).stdout ?? ""}${(e as { stderr?: string }).stderr ?? ""}`;
      expect(output).not.toContain("Unknown Syntax Error");
    }
  });
});
