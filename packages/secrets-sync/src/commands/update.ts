// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { Command, Option } from "clipanion";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { logger } from "../logger.js";
import { checkFilePermissions } from "../fs-utils.js";

export class UpdateCommand extends Command {
  public static paths = [["update"]];

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

  public async execute(): Promise<number> {
    const resolvedPath = resolve(this.file);

    // Check/fix existing file permissions
    if (existsSync(resolvedPath)) {
      checkFilePermissions(resolvedPath);
    }

    // Read existing content or start fresh
    let content = "";
    if (existsSync(resolvedPath)) {
      content = readFileSync(resolvedPath, "utf8");
    }

    const lines = content.split("\n");
    let found = false;
    const newLines: string[] = [];

    for (const line of lines) {
      // Check if this is a key=value line
      const eqIndex = line.indexOf("=");
      if (eqIndex > 0 && !line.startsWith("#")) {
        const lineKey = line.slice(0, eqIndex).trim();
        if (lineKey === this.key) {
          newLines.push(`${this.key}=${this.value}`);
          found = true;
          continue;
        }
      }
      newLines.push(line);
    }

    // If key not found, append it
    if (!found) {
      // Add a blank line if file doesn't end with one
      if (newLines.length > 0 && newLines[newLines.length - 1] !== "") {
        newLines.push("");
      }
      newLines.push(`${this.key}=${this.value}`);
      logger.info(`Added ${this.key} to ${this.file}`);
    } else {
      logger.info(`Updated ${this.key} in ${this.file}`);
    }

    // Write with mode 0600 from the start (or maintain existing)
    writeFileSync(resolvedPath, newLines.join("\n") + "\n", { encoding: "utf8", mode: 0o600 });
    return 0;
  }
}
