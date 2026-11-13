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

  private async get(): Promise<number> {
    const envFilePath = this.envFile;
    const hasEnvFile = typeof envFilePath === "string" && envFilePath !== "";

    let value: string | undefined;

    if (hasEnvFile) {
      const envFileEntries = parseEnvFile(envFilePath);
      const entry = envFileEntries[this.name] as EnvEntry | undefined;
      const needsPassphrase = entry?.type === "gpg";
      const passphrase = this.passphrase ?? (needsPassphrase ? await readPassphrase(process.stdin) : undefined);
      value = resolveSecretValue(this.name, envFileEntries, undefined, { runner: this.runner, passphrase });
    } else {
      // Fall back to environment variable
      value = process.env[this.name];
    }

    if (value === undefined) {
      process.stderr.write(`Error: Could not resolve secret "${this.name}"\n`);
      return 1;
    }

    // Output value to stdout (for shell capture)
    process.stdout.write(value);
    return 0;
  }
}
