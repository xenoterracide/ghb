// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { Command } from "clipanion";
import { execRunner, type Runner } from "../exec.js";

export class PrSyncCommand extends Command {
  public static paths = [["pr", "sync"]];

  public static usage = Command.Usage({
    description: "Sync the current branch with its remote and the default branch",
  });

  // Optional runner for testing - uses the real runner if not set
  public runner?: Runner;

  public async execute(): Promise<number> {
    const run = this.runner ?? execRunner;

    run("git", ["fetch", "--all", "--prune", "--quiet"]);
    // a remote branch named HEAD detaches refs/remotes/origin/HEAD at that
    // branch instead of symref to the default; resolve through the symref
    // so a detached or missing HEAD fails loud instead of silently syncing
    // against the wrong base
    let base: string;
    try {
      base = run("git", ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]).trim();
    } catch {
      console.error("origin/HEAD is detached or missing; run: git remote set-head origin -a");
      return 1;
    }
    const branch = run("git", ["branch", "--show-current"]).trim();
    const remoteAhead = Number(run("git", ["rev-list", "--count", `HEAD..origin/${branch}`]));
    const localAhead = Number(run("git", ["rev-list", "--count", `origin/${branch}..HEAD`]));

    if (remoteAhead > 0 && localAhead > 0) {
      console.error(`diverged: local ${localAhead} ahead, remote ${remoteAhead} ahead`);
      return 1;
    }

    if (remoteAhead > 0) {
      if (run("git", ["status", "--porcelain", "--untracked-files=no"]).trim() !== "") {
        console.error(`dirty worktree: refusing to reset to origin/${branch}`);
        return 1;
      }
      // reset --hard replaces tracked-in-target paths on disk, including
      // ignored ones; list every untracked path, ignored or not, and refuse
      // when the target carries the same path
      const untracked = run("git", ["ls-files", "--others"])
        .split("\n")
        .map((path) => path.trim())
        .filter((path) => path !== "");
      if (untracked.length > 0) {
        const incoming = run("git", ["diff", "--name-only", "HEAD", `origin/${branch}`])
          .split("\n")
          .map((path) => path.trim())
          .filter((path) => path !== "");
        const collisions = untracked.filter((path) => incoming.includes(path));
        if (collisions.length > 0) {
          console.error(`untracked files in the way of origin/${branch}: ${collisions.join(", ")}`);
          return 1;
        }
      }
      run("git", ["reset", "--hard", `origin/${branch}`]);
      console.log("reset to remote");
    }

    // the base merge runs after a reset too: an ahead remote does not
    // mean the base is current
    const behind = Number(run("git", ["rev-list", "--count", `HEAD..${base}`]));
    if (behind > 0) {
      try {
        run("git", ["merge", base, "--quiet"]);
        console.log(`merged ${behind} commits`);
      } catch {
        console.log(run("git", ["status", "--porcelain"]));
        return 1;
      }
    } else if (remoteAhead === 0) {
      console.log("up to date");
    }

    run("git", ["push", "--quiet"]);
    return 0;
  }
}
