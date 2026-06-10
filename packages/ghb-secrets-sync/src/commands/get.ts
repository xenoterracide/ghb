// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { Command, Option } from "clipanion";
import { parseEnvFile, resolveSecretValue } from "../env.js";

export class GetCommand extends Command {
  public static paths = [["get"]];

  public name = Option.String({ required: true });

  public envFile = Option.String("--env-file,-e", {
    description: "Env file with secret names and values",
  });

  public async execute(): Promise<number> {
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
