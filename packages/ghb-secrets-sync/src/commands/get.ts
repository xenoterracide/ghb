// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { Command, Option } from "clipanion";
import { readPassphrase } from "@xenoterracide/ghb-signing";
import { parseEnvFile, resolveSecretValue } from "../env.js";
import type { CommandRunner, EnvEntry } from "../types.js";

export class GetCommand extends Command {
  public static paths = [["secrets", "get"]];

  public static usage = Command.Usage({
    description: "Get a secret value",
    details: "Resolve and print the value of a named secret from environment variables or an env file.",
  });

  public name = Option.String({ required: true });

  public envFile = Option.String("--env-file,-e", {
    description: "Env file with secret names and values",
  });

  // Optional runner for testing - uses default gpg/gh runner if not set
  public runner?: CommandRunner;

  // Optional passphrase for gpg: entries - read from stdin if not set
  public passphrase?: string;

  public async execute(): Promise<number> {
    return await this.get();
  }

  private async resolveFromEnvFile(envFilePath: string): Promise<string | undefined> {
    const entries = parseEnvFile(envFilePath);
    const entry = entries[this.name] as EnvEntry | undefined;
    const needsPassphrase = entry?.type === "gpg";
    const passphrase = this.passphrase ?? (needsPassphrase ? await readPassphrase(process.stdin) : undefined);
    return resolveSecretValue(this.name, entries, undefined, { runner: this.runner, passphrase });
  }

  private async resolveValue(): Promise<string | undefined> {
    const envFilePath = this.envFile;
    if (typeof envFilePath !== "string" || envFilePath === "") {
      // Fall back to environment variable
      return process.env[this.name];
    }
    return this.resolveFromEnvFile(envFilePath);
  }

  private async get(): Promise<number> {
    const value = await this.resolveValue();

    if (value === undefined) {
      process.stderr.write(`Error: Could not resolve secret "${this.name}"\n`);
      return 1;
    }

    // Output value to stdout (for shell capture)
    process.stdout.write(value);
    return 0;
  }
}
