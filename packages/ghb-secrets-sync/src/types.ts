// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Interface for executing external commands.
 * Allows for dependency injection in tests.
 */
export interface CommandRunner {
  runArgv: (
    cmd: string,
    args: string[],
    opts?: { cwd?: string; env?: Record<string, string>; input?: string },
  ) => string;
}

/**
 * Represents a secret value entry parsed from an env file.
 */
export interface EnvEntry {
  type: "value" | "env" | "file";
  value: string;
}

/**
 * Options for setting a secret on a repository.
 */
export interface SetSecretOptions {
  repo: string;
  name: string;
  value: string;
  runner?: CommandRunner;
}
