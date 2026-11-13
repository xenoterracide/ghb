// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { existsSync, readFileSync, statSync } from "fs";
import { resolve, dirname } from "path";
import { exportSecretKey, isValidFingerprint } from "@xenoterracide/ghb-signing";
import type { CommandRunner, EnvEntry } from "./types.js";
import { checkFilePermissions } from "./fs-utils.js";
import { logger } from "./logger.js";
import { UserError } from "./errors.js";

export interface ResolveOpts {
  runner?: CommandRunner;
  passphrase?: string;
}

function splitProtocol(value: string): { protocol: string; rest: string } {
  const colonIndex = value.indexOf(":");
  if (colonIndex === -1) {
    throw new Error(`Value must have a protocol prefix (env:, file:, val:, gpg:). Got: "${value}"`);
  }
  return { protocol: value.slice(0, colonIndex), rest: value.slice(colonIndex + 1) };
}

function parseFileValue(rest: string, baseDir: string): EnvEntry {
  // Handle file:path, file:./path, or file:///absolute/path
  // Strip leading // if present (file://path -> path)
  const path = rest.startsWith("//") ? rest.slice(2) : rest;
  return { type: "file", value: resolve(baseDir, path) };
}

function parseValue(value: string, key: string, baseDir: string): EnvEntry {
  const { protocol, rest } = splitProtocol(value);

  switch (protocol) {
    case "env": {
      return { type: "env", value: rest };
    }
    case "file": {
      return parseFileValue(rest, baseDir);
    }
    case "val": {
      return { type: "value", value: rest };
    }
    case "gpg": {
      if (!isValidFingerprint(rest)) {
        throw new UserError(`gpg: value must be a full fingerprint; got "${rest}" for key "${key}"`);
      }
      return { type: "gpg", value: rest };
    }
    default: {
      throw new UserError(`Unknown protocol "${protocol}:". Use env:, file:, val:, or gpg: for key "${key}"`);
    }
  }
}

function parseLine(line: string, baseDir: string): [string, EnvEntry] | undefined {
  const trimmed = line.trim();
  // Skip empty lines and comments
  if (!trimmed || trimmed.startsWith("#")) return undefined;

  const eqIndex = trimmed.indexOf("=");
  if (eqIndex === -1) return undefined;

  const key = trimmed.slice(0, eqIndex).trim();
  if (!key) return undefined;

  return [key, parseValue(trimmed.slice(eqIndex + 1).trim(), key, baseDir)];
}

export function parseEnvFile(filePath: string): Record<string, EnvEntry> {
  const resolvedPath = resolve(filePath);
  if (!existsSync(resolvedPath)) {
    throw new Error(`Env file not found: ${filePath}`);
  }

  checkFilePermissions(resolvedPath);

  const baseDir = dirname(resolvedPath);
  const entries: Record<string, EnvEntry> = {};

  for (const line of readFileSync(resolvedPath, "utf8").split("\n")) {
    const parsed = parseLine(line, baseDir);
    if (parsed !== undefined) {
      const [key, entry] = parsed;
      entries[key] = entry;
    }
  }

  return entries;
}

function warnOnPermissiveMode(path: string): void {
  try {
    const mode = statSync(path).mode & 0o777;
    // Warn if any group or other permissions are set (not 0400 or 0600)
    if (mode !== 0o400 && mode !== 0o600) {
      logger.warn(`File "${path}" has overly permissive permissions (${mode.toString(8)}), expected 0400 or 0600`);
    }
  } catch (e) {
    logger.debug({ file: path, error: e instanceof Error ? e.message : String(e) }, "Could not check file permissions");
  }
}

function readSecretFile(path: string, name: string): string | undefined {
  if (!existsSync(path)) {
    logger.warn(`Warning: File "${path}" not found for secret "${name}"`);
    return undefined;
  }
  warnOnPermissiveMode(path);
  return readFileSync(path, "utf8");
}

function resolveEnvironmentValue(variable: string, name: string): string | undefined {
  const envValue = process.env[variable];
  if (envValue === undefined) {
    logger.warn(`Warning: Environment variable "${variable}" not found for secret "${name}"`);
  }
  return envValue;
}

function resolveGpgKey(fingerprint: string, name: string, opts?: ResolveOpts): string | undefined {
  try {
    return exportSecretKey(fingerprint, { runner: opts?.runner, passphrase: opts?.passphrase });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn(`Warning: Could not export GPG key for secret "${name}": ${msg}`);
    return undefined;
  }
}

function resolveEntry(entry: EnvEntry, name: string, opts?: ResolveOpts): string | undefined {
  switch (entry.type) {
    case "value": {
      return entry.value;
    }
    case "env": {
      return resolveEnvironmentValue(entry.value, name);
    }
    case "file": {
      return readSecretFile(entry.value, name);
    }
    case "gpg": {
      return resolveGpgKey(entry.value, name, opts);
    }
  }
}

// eslint-disable-next-line @typescript-eslint/max-params -- public API: name, entries, explicit override, resolution opts
export function resolveSecretValue(
  name: string,
  envFileEntries?: Record<string, EnvEntry>,
  explicitValue?: string,
  opts?: ResolveOpts,
): string | undefined {
  // Priority 1: Explicit value
  if (explicitValue !== undefined) {
    return explicitValue;
  }

  // Priority 2: From env file entry
  const entry = envFileEntries?.[name];
  if (entry !== undefined) {
    return resolveEntry(entry, name, opts);
  }

  // Priority 3: Environment variable matching secret name
  return process.env[name];
}
