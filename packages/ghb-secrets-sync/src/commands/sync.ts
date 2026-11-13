// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { Command, Option } from "clipanion";
import { logger, setLogLevel } from "../logger.js";
import { parseEnvFile, resolveSecretValue } from "../env.js";
import { setSecret, getCurrentRepo, findReposByLabel } from "../github.js";
import { UserError } from "../errors.js";
import type { CommandRunner, EnvEntry } from "../types.js";

function hasValue(value: string | undefined): value is string {
  return typeof value === "string" && value !== "";
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function nonEmptyNames(names: string[]): string[] | undefined {
  if (names.length > 0) {
    return names;
  }
  logger.error("Error: No secrets specified");
  return undefined;
}

async function readReply(): Promise<string> {
  const reply = await new Promise<string>((resolve) => {
    process.stdin.once("data", (data): void => {
      resolve(data.toString().trim().toLowerCase());
    });
  });
  process.stdin.pause();
  return reply;
}

export class SyncCommand extends Command {
  public static paths = [["secrets", "sync"]];

  public static usage = Command.Usage({
    description: "Sync secrets to GitHub repositories",
    details: "Sync secrets from environment variables or an env file to one or more GitHub repositories.",
  });

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
    const hasEnvFile = hasValue(this.envFile);
    const hasSecrets = hasValue(this.secrets);
    this.configureLogging(hasSecrets, hasEnvFile, this.envFile);
    if (!this.optionsValid(hasSecrets, hasEnvFile)) return 1;

    const entries = this.parseEntries();
    const names = this.resolveSecretNames(hasSecrets, entries);
    const targets = names === undefined ? undefined : this.resolveTargetRepos();
    if (names === undefined || targets === undefined) return 1;

    return this.syncAll(targets, names, entries);
  }

  private parseEntries(): Record<string, EnvEntry> | undefined {
    if (!hasValue(this.envFile)) return undefined;
    const entries = parseEnvFile(this.envFile);
    if (this.verbose) {
      logger.debug({ keys: Object.keys(entries) }, "Parsed env file");
    }
    return entries;
  }

  private async syncAll(
    targetRepos: string[],
    names: string[],
    entries: Record<string, EnvEntry> | undefined,
  ): Promise<number> {
    const secretsToSync = this.collectSecretValues(names, entries);
    if (secretsToSync.length === 0) return this.reportUnresolvedSecrets();

    this.printPlan(targetRepos, secretsToSync);
    if (this.dryRun) return this.dryRunResult();
    if (process.stdin.isTTY && !(await this.confirm())) return 0;

    this.syncSecrets(targetRepos, secretsToSync);
    return 0;
  }

  private configureLogging(hasSecrets: boolean, hasEnvFile: boolean, envFilePath: string | undefined): void {
    if (!this.verbose) return;
    setLogLevel("debug");
    logger.debug({ hasSecrets, hasEnvFile, envFilePath }, "Parsing options");
  }

  private optionsValid(hasSecrets: boolean, hasEnvFile: boolean): boolean {
    // Must provide either --secrets or --env-file
    if (!hasSecrets && !hasEnvFile) {
      logger.error("Error: Must provide either --secrets or --env-file");
      return false;
    }
    // Cannot use both --repo and --label
    if (hasValue(this.repo) && hasValue(this.label)) {
      logger.error("Error: Cannot use both --repo and --label");
      return false;
    }
    return true;
  }

  private resolveSecretNames(hasSecrets: boolean, entries: Record<string, EnvEntry> | undefined): string[] | undefined {
    if (hasSecrets) {
      return nonEmptyNames(splitList(this.secrets ?? ""));
    }
    if (entries !== undefined) {
      // Sync all secrets from env file
      return nonEmptyNames(Object.keys(entries));
    }
    logger.error("Error: No secrets to sync");
    return undefined;
  }

  private resolveTargetRepos(): string[] | undefined {
    const targetRepos = hasValue(this.repo) ? splitList(this.repo) : this.reposByLabel();
    if (targetRepos === undefined) return undefined;
    if (targetRepos.length > 0) return targetRepos;
    logger.error("Error: No target repos found");
    return undefined;
  }

  private reposByLabel(): string[] | undefined {
    if (hasValue(this.label)) {
      // Find repos by label
      return findReposByLabel(this.label, hasValue(this.owner) ? this.owner : undefined, this.runner);
    }
    // Default to current repo
    try {
      return [getCurrentRepo(this.runner)];
    } catch (e) {
      logger.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
      return undefined;
    }
  }

  private collectSecretValues(
    secretNames: string[],
    entries: Record<string, EnvEntry> | undefined,
  ): { name: string; value: string }[] {
    const secretsToSync: { name: string; value: string }[] = [];

    for (const name of secretNames) {
      logger.debug({ name }, "Resolving secret");
      const value = resolveSecretValue(name, entries);
      if (value === undefined) {
        logger.warn(`Warning: Could not resolve value for secret "${name}", skipping`);
        continue;
      }
      logger.debug({ name, length: value.length }, "Resolved secret");
      secretsToSync.push({ name, value });
    }

    return secretsToSync;
  }

  private reportUnresolvedSecrets(): number {
    logger.error("Error: Could not resolve values for any secrets.");
    logger.error("Secrets must be provided via environment variables or --env-file.");
    return 1;
  }

  // Use console for interactive output to avoid async log ordering issues
  private printPlan(targetRepos: string[], secretsToSync: { name: string }[]): void {
    console.log(`Will sync ${secretsToSync.length} secret(s) to ${targetRepos.length} repo(s):`);
    console.log(`  Repos: ${targetRepos.join(", ")}`);
    console.log(`  Secrets: ${secretsToSync.map((s) => s.name).join(", ")}`);
  }

  private dryRunResult(): number {
    console.log("[Dry Run] No changes made");
    return 0;
  }

  private async confirm(): Promise<boolean> {
    process.stdout.write("\nProceed? [Y/n] ");
    const reply = await readReply();
    if (reply === "n" || reply === "no") {
      console.log("Cancelled");
      return false;
    }
    return true;
  }

  private syncSecrets(targetRepos: string[], secretsToSync: { name: string; value: string }[]): void {
    for (const repo of targetRepos) {
      console.log(`\nSyncing to ${repo}...`);
      for (const { name, value } of secretsToSync) {
        this.syncSecret(repo, name, value);
      }
    }
    console.log("\nSync complete!");
  }

  private syncSecret(repo: string, name: string, value: string): void {
    try {
      setSecret({ repo, name, value, runner: this.runner });
      console.log(`  ✓ ${name}`);
    } catch (e) {
      console.error(`  ✗ ${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
