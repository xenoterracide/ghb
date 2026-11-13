// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { findSigningSubkey, parseColonKeys } from "@xenoterracide/ghb-signing";
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

const runWithInput = (
  bin: string,
  args: string[],
  opts: { input: string; env: Record<string, string | undefined> },
): string =>
  execFileSync(bin, args, {
    cwd: workDir,
    encoding: "utf8",
    env: opts.env,
    input: opts.input,
    stdio: ["pipe", "pipe", "pipe"],
  });

const createGnupgHome = (): string => mkdtempSync(join(tmpdir(), "ghb-signing-"));

function generateUid(): string {
  return `Ghb Signing Test <test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid>`;
}

function loopbackArgs(): string[] {
  return ["--batch", "--pinentry-mode", "loopback", "--passphrase-fd", "0"];
}

interface KeyPair {
  primaryFpr: string;
  subkeyFpr: string;
}

function primaryFingerprint(env: Record<string, string>): string {
  const keys = parseColonKeys(execFileSync("gpg", ["--list-keys", "--with-colons"], { encoding: "utf8", env }));
  return keys[0].fingerprint;
}

function subkeyFingerprint(env: Record<string, string>): string {
  const keys = parseColonKeys(execFileSync("gpg", ["--list-keys", "--with-colons"], { encoding: "utf8", env }));
  const subkey = findSigningSubkey(keys[0]);
  if (subkey === undefined) {
    throw new Error("signing subkey missing after key generation");
  }
  return subkey.fingerprint;
}

function generateSigningKey(home: string, passphrase: string, expiry = "1y"): KeyPair {
  const env = { ...process.env, GNUPGHOME: home };
  const uid = generateUid();
  const args = loopbackArgs();

  execFileSync("gpg", [...args, "--quick-generate-key", uid, "ed25519", "cert", expiry], {
    encoding: "utf8",
    env,
    input: passphrase,
  });

  const primaryFpr = primaryFingerprint(env);

  execFileSync("gpg", [...args, "--quick-add-key", primaryFpr, "ed25519", "sign", expiry], {
    encoding: "utf8",
    env,
    input: passphrase,
  });

  const subkeyFpr = subkeyFingerprint(env);

  return { primaryFpr, subkeyFpr };
}

let bin = "";

// pack applies publishConfig (main -> dist) and rewrites workspace:^,
// so only the packed form can run under plain node; prepack builds
function packPackages(): void {
  for (const pkg of ["ghb", "ghb-pr", "ghb-secrets-sync", "ghb-signing"]) {
    run("pnpm", ["pack", "--pack-destination", packsDir], join(repoRoot, "packages", pkg));
  }
}

function packedTarballs(): string[] {
  return run("ls", [packsDir], workDir)
    .split("\n")
    .filter((line) => line.endsWith(".tgz"))
    .map((name) => join(packsDir, name));
}

function installTarballs(tarballs: string[]): void {
  // one prefix, never three globals: npm -g installs each tarball as
  // its own root and nests a clipanion copy per package; option specs
  // carry a module-scoped symbol, so the parser only saw specs from
  // its own copy and every flag and positional of a subpackage's
  // commands died as a syntax error. One root hoists one clipanion
  // every package shares
  run("npm", ["install", "--prefix", installDir, ...tarballs], workDir);
}

beforeAll(() => {
  packPackages();
  installTarballs(packedTarballs());
  bin = join(installDir, "node_modules", ".bin", "ghb");
}, 60000);

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe("the installed bin help", () => {
  it("answers help when installed from tarballs and invoked through its bin link", () => {
    const stdout = run(bin, ["--help"], workDir);

    expect(stdout).toContain("ghb <command>");
  });
});

describe("the installed bin pr verify", () => {
  it("binds pr verify's flags and PR selector instead of rejecting them", () => {
    const output = runExpectingFailure(bin, ["pr", "verify", "--interval", "5", "--timeout", "10", "585"]);

    expect(output).toContain("not a git repository");
    expect(output).not.toContain("Unknown Syntax Error");
  });
});

describe("the installed bin secrets get", () => {
  it("binds the secrets commands' positionals instead of rejecting them", () => {
    const output = runExpectingFailure(bin, ["secrets", "get", "NO_SUCH_SECRET"]);

    expect(output).toContain('Could not resolve secret "NO_SUCH_SECRET"');
    expect(output).not.toContain("Unknown Syntax Error");
  });
});

describe("the installed bin secrets sync env-file", () => {
  it("delivers --env-file to the command instead of node", () => {
    const output = runExpectingFailure(bin, ["secrets", "sync", "--env-file", join(workDir, "no-such.env")]);

    expect(output).toContain("Env file not found");
    expect(output).not.toContain(".env: not found");
  });
});

describe("the installed bin signing check", () => {
  it("binds signing check's --key instead of rejecting it", () => {
    const output = runExpectingFailure(bin, ["signing", "check", "--key", "8042ED9A"]);

    expect(output).toContain("must be a full fingerprint");
    expect(output).not.toContain("Unknown Syntax Error");
  });
});

describe("the installed bin signing export", () => {
  it("exports the armored key from a piped passphrase", () => {
    const home = createGnupgHome();
    const PASS = "correct horse battery staple";
    generateSigningKey(home, PASS);

    try {
      const output = runWithInput(bin, ["signing", "export"], {
        input: PASS,
        env: { ...process.env, GNUPGHOME: home },
      });

      expect(output).toContain("BEGIN PGP PRIVATE KEY BLOCK");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
