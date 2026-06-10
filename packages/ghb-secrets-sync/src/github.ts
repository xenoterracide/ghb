// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { execFileSync } from "child_process";

import type { CommandRunner, SetSecretOptions } from "./types.js";

function createDefaultCommandRunner(): CommandRunner {
  return {
    runArgv(
      cmd: string,
      args: string[],
      opts?: { cwd?: string; env?: Record<string, string>; input?: string },
    ): string {
      return execFileSync(cmd, args, {
        encoding: "utf8",
        cwd: opts?.cwd,
        env: { ...process.env, ...opts?.env },
        input: opts?.input,
      }).trim();
    },
  };
}

const defaultRunner = createDefaultCommandRunner();

export function listSecretNames(repo: string, runner: CommandRunner = defaultRunner): string[] {
  try {
    const output = runner.runArgv("gh", ["secret", "list", "--repo", repo, "--json", "name"]);
    const parsed = JSON.parse(output) as { name: string }[];
    return parsed.map((s) => s.name);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to list secrets for ${repo}: ${msg}`);
  }
}

export function setSecret(opts: SetSecretOptions): void {
  const { repo, name, value, runner = defaultRunner } = opts;

  try {
    // Pass value via stdin to avoid exposing it in process argv
    runner.runArgv("gh", ["secret", "set", name, "--repo", repo], { input: value });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to set secret "${name}" on ${repo}: ${msg}`);
  }
}

export function getCurrentUser(runner: CommandRunner = defaultRunner): string {
  try {
    const output = runner.runArgv("gh", ["api", "user", "--jq", ".login"]);
    return output.trim();
  } catch {
    throw new Error("Failed to get current user. Make sure you're authenticated with 'gh auth login'");
  }
}

export function findReposByLabel(label: string, owner?: string, runner: CommandRunner = defaultRunner): string[] {
  const ownerToUse = owner ?? getCurrentUser(runner);
  try {
    const output = runner.runArgv("gh", [
      "repo",
      "list",
      ownerToUse,
      "--topic",
      label,
      "--no-archived",
      "--limit",
      "1000",
      "--json",
      "nameWithOwner",
    ]);
    const parsed = JSON.parse(output) as { nameWithOwner: string }[];
    return parsed.map((r) => r.nameWithOwner);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to list repos for owner "${ownerToUse}" with label "${label}": ${msg}`);
  }
}

export function getCurrentRepo(runner: CommandRunner = defaultRunner): string {
  try {
    const output = runner.runArgv("gh", ["repo", "view", "--json", "nameWithOwner"]);
    const parsed = JSON.parse(output) as { nameWithOwner: string };
    return parsed.nameWithOwner;
  } catch {
    throw new Error("Failed to detect current repo. Run from within a git repo or specify --to");
  }
}
