// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { existsSync, readFileSync, statSync } from "fs";
import { resolve, dirname } from "path";
import type { EnvEntry } from "./types.js";
import { checkFilePermissions } from "./fs-utils.js";
import { logger } from "./logger.js";
import { UserError } from "./errors.js";

function parseValue(value: string, key: string, baseDir: string): EnvEntry {
  const colonIndex = value.indexOf(":");
  if (colonIndex === -1) {
    throw new Error(`Value must have a protocol prefix (env:, file:, val:). Got: "${value}"`);
  }

  const protocol = value.slice(0, colonIndex);
  const rest = value.slice(colonIndex + 1);

  switch (protocol) {
    case "env": {
      return { type: "env", value: rest };
    }
    case "file": {
      // Handle file:path, file:./path, or file:///absolute/path
      // Strip leading // if present (file://path -> path)
      const path = rest.startsWith("//") ? rest.slice(2) : rest;
      const resolvedPath = resolve(baseDir, path);
      return { type: "file", value: resolvedPath };
    }
    case "val": {
      return { type: "value", value: rest };
    }
    default: {
      throw new UserError(`Unknown protocol "${protocol}:". Use env:, file:, or val: for key "${key}"`);
    }
  }
}

export function parseEnvFile(filePath: string): Record<string, EnvEntry> {
  const resolvedPath = resolve(filePath);
  if (!existsSync(resolvedPath)) {
    throw new Error(`Env file not found: ${filePath}`);
  }

  checkFilePermissions(resolvedPath);

  const content = readFileSync(resolvedPath, "utf8");
  const entries: Record<string, EnvEntry> = {};
  const baseDir = dirname(resolvedPath);

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();

    if (!key) continue;

    entries[key] = parseValue(value, key, baseDir);
  }

  return entries;
}

export function resolveSecretValue(
  name: string,
  envFileEntries?: Record<string, EnvEntry>,
  explicitValue?: string,
): string | undefined {
  // Priority 1: Explicit value
  if (explicitValue !== undefined) {
    return explicitValue;
  }

  // Priority 2: From env file entry
  if (envFileEntries && name in envFileEntries) {
    const entry = envFileEntries[name];

    switch (entry.type) {
      case "value": {
        return entry.value;
      }
      case "env": {
        const envValue = process.env[entry.value];
        if (envValue !== undefined) {
          return envValue;
        }
        logger.warn(`Warning: Environment variable "${entry.value}" not found for secret "${name}"`);
        return undefined;
      }
      case "file": {
        if (!existsSync(entry.value)) {
          logger.warn(`Warning: File "${entry.value}" not found for secret "${name}"`);
          return undefined;
        }
        // Check file permissions - warn on any group/other permissions
        try {
          const stats = statSync(entry.value);
          const mode = stats.mode & 0o777;
          // Warn if any group or other permissions are set (not 0400 or 0600)
          if (mode !== 0o400 && mode !== 0o600) {
            logger.warn(
              `File "${entry.value}" has overly permissive permissions (${mode.toString(8)}), expected 0400 or 0600`,
            );
          }
        } catch (e) {
          logger.debug(
            { file: entry.value, error: e instanceof Error ? e.message : String(e) },
            "Could not check file permissions",
          );
        }
        const content = readFileSync(entry.value, "utf8");
        return content;
      }
    }
  }

  // Priority 3: Environment variable matching secret name
  const envValue = process.env[name];
  if (envValue !== undefined) {
    return envValue;
  }

  return undefined;
}
