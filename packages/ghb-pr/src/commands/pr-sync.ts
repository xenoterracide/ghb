// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { Command } from "clipanion";
import { execRunner, type Runner } from "../exec.js";

function countRange(run: Runner, range: string): number {
  return Number(run("git", ["rev-list", "--count", range]));
}

function lines(output: string): string[] {
  return output
    .split("\n")
    .map((path) => path.trim())
    .filter((path) => path !== "");
}

// a remote branch named HEAD detaches refs/remotes/origin/HEAD at that
// branch instead of symref to the default; resolve through the symref
// so a detached or missing HEAD fails loud instead of silently syncing
// against the wrong base
function resolveBase(run: Runner): string | undefined {
  try {
    return run("git", ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]).trim();
  } catch {
    console.error("origin/HEAD is detached or missing; run: git remote set-head origin -a");
    return undefined;
  }
}

// reset --hard replaces tracked-in-target paths on disk, including
// ignored ones; list every untracked path, ignored or not, and refuse
// when the target carries the same path
function collisions(run: Runner, branch: string): string[] {
  const untracked = lines(run("git", ["ls-files", "--others"]));
  if (untracked.length === 0) return [];
  const incoming = lines(run("git", ["diff", "--name-only", "HEAD", `origin/${branch}`]));
  return untracked.filter((path) => incoming.includes(path));
}

function resetToRemote(run: Runner, branch: string): boolean {
  if (run("git", ["status", "--porcelain", "--untracked-files=no"]).trim() !== "") {
    console.error(`dirty worktree: refusing to reset to origin/${branch}`);
    return false;
  }
  const blocked = collisions(run, branch);
  if (blocked.length > 0) {
    console.error(`untracked files in the way of origin/${branch}: ${blocked.join(", ")}`);
    return false;
  }
  run("git", ["reset", "--hard", `origin/${branch}`]);
  console.log("reset to remote");
  return true;
}

function mergeBehind(run: Runner, base: string, behind: number): boolean {
  try {
    run("git", ["merge", base, "--quiet"]);
    console.log(`merged ${behind} commits`);
    return true;
  } catch {
    console.log(run("git", ["status", "--porcelain"]));
    return false;
  }
}

// the base merge runs after a reset too: an ahead remote does not
// mean the base is current
function mergeBase(run: Runner, base: string, remoteAhead: number): boolean {
  const behind = countRange(run, `HEAD..${base}`);
  if (behind > 0) {
    return mergeBehind(run, base, behind);
  }
  if (remoteAhead === 0) {
    console.log("up to date");
  }
  return true;
}

export class PrSyncCommand extends Command {
  public static paths = [["pr", "sync"]];

  public static usage = Command.Usage({
    description: "Sync the current branch with its remote and the default branch",
  });

  // Optional runner for testing - uses the real runner if not set
  public runner?: Runner;

  // eslint-disable-next-line @typescript-eslint/require-await -- clipanion requires a Promise even for synchronous commands.
  public async execute(): Promise<number> {
    return this.sync();
  }

  private sync(): number {
    const run = this.runner ?? execRunner;

    run("git", ["fetch", "--all", "--prune", "--quiet"]);
    const base = resolveBase(run);
    if (base === undefined) return 1;

    const branch = run("git", ["branch", "--show-current"]).trim();
    const remoteAhead = countRange(run, `HEAD..origin/${branch}`);
    const localAhead = countRange(run, `origin/${branch}..HEAD`);
    if (remoteAhead > 0 && localAhead > 0) {
      console.error(`diverged: local ${localAhead} ahead, remote ${remoteAhead} ahead`);
      return 1;
    }

    if (remoteAhead > 0 && !resetToRemote(run, branch)) return 1;
    if (!mergeBase(run, base, remoteAhead)) return 1;

    run("git", ["push", "--quiet"]);
    return 0;
  }
}
