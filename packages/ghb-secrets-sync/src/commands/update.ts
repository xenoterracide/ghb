// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { Command, Option } from "clipanion";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { logger } from "../logger.js";
import { checkFilePermissions } from "../fs-utils.js";

function appendKey(lines: string[], key: string, value: string): void {
  // Add a blank line if file doesn't end with one
  if (lines.length > 0 && lines[lines.length - 1] !== "") {
    lines.push("");
  }
  lines.push(`${key}=${value}`);
}

export class UpdateCommand extends Command {
  public static paths = [["secrets", "update"]];

  public static usage = Command.Usage({
    description: "Update a secret in an env file",
    details: "Add or update a secret value in a local env file. Creates the file if it does not exist.",
  });

  public file = Option.String("--file,-f", "secrets.env", {
    description: "Secrets env file path",
  });

  public key = Option.String("--key,-k", {
    required: true,
    description: "Secret name to update",
  });

  public value = Option.String("--value,-v", {
    required: true,
    description: "Secret value",
  });

  // eslint-disable-next-line @typescript-eslint/require-await -- clipanion requires a Promise even for synchronous commands.
  public async execute(): Promise<number> {
    return this.update();
  }

  private update(): number {
    const resolvedPath = resolve(this.file);
    const { lines, found } = this.rewrite(this.readLines(resolvedPath));

    if (found) {
      logger.info(`Updated ${this.key} in ${this.file}`);
    } else {
      appendKey(lines, this.key, this.value);
      logger.info(`Added ${this.key} to ${this.file}`);
    }

    // Write with mode 0600 from the start (or maintain existing)
    writeFileSync(resolvedPath, lines.join("\n") + "\n", { encoding: "utf8", mode: 0o600 });
    return 0;
  }

  private readLines(resolvedPath: string): string[] {
    if (!existsSync(resolvedPath)) {
      return [""];
    }
    checkFilePermissions(resolvedPath);
    return readFileSync(resolvedPath, "utf8").split("\n");
  }

  private rewrite(lines: string[]): { lines: string[]; found: boolean } {
    const found = lines.some((line) => this.isMatch(line));
    return { lines: lines.map((line) => (this.isMatch(line) ? `${this.key}=${this.value}` : line)), found };
  }

  private isMatch(line: string): boolean {
    const eqIndex = line.indexOf("=");
    if (eqIndex <= 0 || line.startsWith("#")) {
      return false;
    }
    return line.slice(0, eqIndex).trim() === this.key;
  }
}
