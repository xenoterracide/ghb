// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

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
  afterAll(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it("answers help when installed from tarballs and invoked through its bin link", () => {
    // pack applies publishConfig (main -> dist) and rewrites workspace:^,
    // so only the packed form can run under plain node; prepack builds
    for (const pkg of ["ghb", "ghb-pr", "ghb-secrets-sync"]) {
      run("pnpm", ["pack", "--pack-destination", packsDir], join(repoRoot, "packages", pkg));
    }

    const tarballs = run("ls", [packsDir], workDir)
      .split("\n")
      .filter((line) => line.endsWith(".tgz"))
      .map((name) => join(packsDir, name));
    run("npm", ["install", "--global", "--prefix", installDir, ...tarballs], workDir);

    // npm links the bin as install/bin/ghb -> .../dist/cli.js; argv[1]
    // carries the link's name, never the module's
    const bin = join(installDir, "bin", "ghb");
    const stdout = run("node", [bin, "--help"], workDir);

    expect(stdout).toContain("ghb <command>");
  }, 60000);
});
