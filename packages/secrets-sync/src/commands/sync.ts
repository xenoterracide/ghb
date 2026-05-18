// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { Command, Option } from "clipanion";
import { logger, setLogLevel } from "../logger.js";
import { parseEnvFile, resolveSecretValue } from "../env.js";
import { setSecret, getCurrentRepo, findReposByLabel } from "../github.js";
import { UserError } from "../errors.js";
import type { CommandRunner } from "../types.js";

export class SyncCommand extends Command {
  public static paths = [["sync"]];

  public secrets = Option.String("--secrets,-s", {
    description: "Secret names to sync (comma-separated). If omitted with --env-file, all secrets from file are synced",
  });

  public envFile = Option.String("--env-file,-e", {
    description: "Env file with secret names and values",
  });

  public repo = Option.String("--repo,-r", {
    description: "Target repo(s), comma-separated (OWNER/REPO format). Defaults to current repo",
  });

  public label = Option.String("--label,-l", {
    description: "Sync to all non-archived repos with this topic/label",
  });

  public owner = Option.String("--owner,-o", {
    description: "Owner/organization for --label (defaults to current user)",
  });

  public dryRun = Option.Boolean("--dry-run", false, {
    description: "Show what would be done",
  });

  public verbose = Option.Boolean("--verbose,-v", false, {
    description: "Enable verbose logging",
  });

  // Optional runner for testing - uses default gh runner if not set
  public runner?: CommandRunner;

  public async execute(): Promise<number> {
    try {
      return await this.doExecute();
    } catch (e) {
      if (e instanceof UserError) {
        logger.error(e.message);
        return 1;
      }
      throw e;
    }
  }

  private async doExecute(): Promise<number> {
    // Must provide either --secrets or --env-file
    const hasSecrets = typeof this.secrets === "string" && this.secrets !== "";
    const envFilePath = this.envFile;
    const hasEnvFile = typeof envFilePath === "string" && envFilePath !== "";

    if (this.verbose) {
      setLogLevel("debug");
      logger.debug({ hasSecrets, hasEnvFile, envFilePath }, "Parsing options");
    }

    if (!hasSecrets && !hasEnvFile) {
      logger.error("Error: Must provide either --secrets or --env-file");
      return 1;
    }

    // Cannot use both --repo and --label
    if (typeof this.repo === "string" && this.repo !== "" && typeof this.label === "string" && this.label !== "") {
      logger.error("Error: Cannot use both --repo and --label");
      return 1;
    }

    // Parse env file if provided
    const envFileEntries = hasEnvFile ? parseEnvFile(envFilePath) : undefined;

    if (this.verbose && envFileEntries) {
      logger.debug({ keys: Object.keys(envFileEntries) }, "Parsed env file");
    }

    // Determine secret names to sync
    let secretNames: string[] = [];
    if (hasSecrets) {
      secretNames = (this.secrets ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    } else if (envFileEntries !== undefined) {
      // Sync all secrets from env file
      secretNames = Object.keys(envFileEntries);
    } else {
      logger.error("Error: No secrets to sync");
      return 1;
    }

    if (secretNames.length === 0) {
      logger.error("Error: No secrets specified");
      return 1;
    }

    // Determine target repos
    let targetRepos: string[] = [];
    if (typeof this.repo === "string" && this.repo !== "") {
      targetRepos = this.repo
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    } else if (typeof this.label === "string" && this.label !== "") {
      // Find repos by label
      const owner = typeof this.owner === "string" && this.owner !== "" ? this.owner : undefined;
      targetRepos = findReposByLabel(this.label, owner, this.runner);
    } else {
      // Default to current repo
      try {
        targetRepos = [getCurrentRepo(this.runner)];
      } catch (e) {
        logger.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
        return 1;
      }
    }

    if (targetRepos.length === 0) {
      logger.error("Error: No target repos found");
      return 1;
    }

    // Resolve all secret values
    const secretsToSync: { name: string; value: string }[] = [];

    for (const name of secretNames) {
      logger.debug({ name }, "Resolving secret");
      const value = resolveSecretValue(name, envFileEntries);
      if (value === undefined) {
        logger.warn(`Warning: Could not resolve value for secret "${name}", skipping`);
        continue;
      }
      logger.debug({ name, length: value.length }, "Resolved secret");
      secretsToSync.push({ name, value });
    }

    if (secretsToSync.length === 0) {
      logger.error("Error: Could not resolve values for any secrets.");
      logger.error("Secrets must be provided via environment variables or --env-file.");
      return 1;
    }

    // Use console for interactive output to avoid async log ordering issues
    console.log(`Will sync ${String(secretsToSync.length)} secret(s) to ${String(targetRepos.length)} repo(s):`);
    console.log(`  Repos: ${targetRepos.join(", ")}`);
    console.log(`  Secrets: ${secretsToSync.map((s) => s.name).join(", ")}`);

    if (this.dryRun) {
      console.log("[Dry Run] No changes made");
      return 0;
    }

    // Confirm if interactive
    if (process.stdin.isTTY) {
      process.stdout.write("\nProceed? [Y/n] ");
      const reply = await new Promise<string>((res) => {
        process.stdin.once("data", (data): void => {
          res(data.toString().trim().toLowerCase());
        });
      });
      process.stdin.pause();
      if (reply === "n" || reply === "no") {
        console.log("Cancelled");
        return 0;
      }
    }

    // Sync to each target repo
    for (const repo of targetRepos) {
      console.log(`\nSyncing to ${repo}...`);
      for (const { name, value } of secretsToSync) {
        try {
          setSecret({ repo, name, value, runner: this.runner });
          console.log(`  ✓ ${name}`);
        } catch (e) {
          console.error(`  ✗ ${name}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    console.log("\nSync complete!");
    return 0;
  }
}
