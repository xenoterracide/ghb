// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { Command, Option } from "clipanion";
import { parseEnvFile, resolveSecretValue } from "../env.js";

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

  // eslint-disable-next-line @typescript-eslint/require-await -- clipanion requires a Promise even for synchronous commands.
  public async execute(): Promise<number> {
    return this.get();
  }

  private get(): number {
    const envFilePath = this.envFile;
    const hasEnvFile = typeof envFilePath === "string" && envFilePath !== "";

    let value: string | undefined;

    if (hasEnvFile) {
      const envFileEntries = parseEnvFile(envFilePath);
      value = resolveSecretValue(this.name, envFileEntries);
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
