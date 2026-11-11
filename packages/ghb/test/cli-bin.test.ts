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

// clipanion writes usage errors to stdout; runtime errors to stderr. The
// bin is executed directly, never through an explicit `node <script>`:
// production always goes through the kernel and the script's shebang
const runExpectingFailure = (bin: string, args: string[]): string => {
  try {
    run(bin, args, workDir);
  } catch (e) {
    return `${(e as { stdout?: string }).stdout ?? ""}${(e as { stderr?: string }).stderr ?? ""}`;
  }
  throw new Error(`expected a nonzero exit: ghb ${args.join(" ")}`);
};

let bin = "";

describe("the installed bin", () => {
  beforeAll(() => {
    // pack applies publishConfig (main -> dist) and rewrites workspace:^,
    // so only the packed form can run under plain node; prepack builds
    for (const pkg of ["ghb", "ghb-pr", "ghb-secrets-sync"]) {
      run("pnpm", ["pack", "--pack-destination", packsDir], join(repoRoot, "packages", pkg));
    }

    const tarballs = run("ls", [packsDir], workDir)
      .split("\n")
      .filter((line) => line.endsWith(".tgz"))
      .map((name) => join(packsDir, name));

    // one prefix, never three globals: npm -g installs each tarball as
    // its own root and nests a clipanion copy per package; option specs
    // carry a module-scoped symbol, so the parser only saw specs from
    // its own copy and every flag and positional of a subpackage's
    // commands died as a syntax error. One root hoists one clipanion
    // every package shares
    run("npm", ["install", "--prefix", installDir, ...tarballs], workDir);
    bin = join(installDir, "node_modules", ".bin", "ghb");
  }, 60000);

  afterAll(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it("answers help when installed from tarballs and invoked through its bin link", () => {
    const stdout = run(bin, ["--help"], workDir);

    expect(stdout).toContain("ghb <command>");
  });

  it("binds pr verify's flags and PR selector instead of rejecting them", () => {
    // outside a git repository the command must fail at its first git
    // call, never at the parser
    const output = runExpectingFailure(bin, ["pr", "verify", "--interval", "5", "--timeout", "10", "585"]);

    expect(output).toContain("not a git repository");
    expect(output).not.toContain("Unknown Syntax Error");
  });

  it("binds the secrets commands' positionals instead of rejecting them", () => {
    // an unbound positional dies as a syntax error; a bound one reaches
    // the resolver, which fails on an unknown name without touching gh
    const output = runExpectingFailure(bin, ["secrets", "get", "NO_SUCH_SECRET"]);

    expect(output).toContain('Could not resolve secret "NO_SUCH_SECRET"');
    expect(output).not.toContain("Unknown Syntax Error");
  });

  it("delivers --env-file to the command instead of node", () => {
    // node recognizes --env-file after the entry script, eats it, and
    // dies on the missing file with its own error before the command
    // runs; the command's own error must reach the user instead
    const output = runExpectingFailure(bin, ["secrets", "sync", "--env-file", join(workDir, "no-such.env")]);

    expect(output).toContain("Env file not found");
    // node's eaten-flag error shape: "<path>: not found"
    expect(output).not.toContain(".env: not found");
  });
});
