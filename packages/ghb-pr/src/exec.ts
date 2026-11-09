// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { execFileSync } from "node:child_process";

export type Runner = (cmd: "git" | "gh", args: string[]) => string;

export const execRunner: Runner = (cmd, args) => {
  try {
    return execFileSync(cmd, args, {
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1" },
      // stderr piped, not inherited: the child's error prints once, below,
      // instead of twice (inherited plus this console.error)
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    const err = e as { stderr?: string; stdout?: string; message?: string };
    const output =
      [err.stderr, err.stdout, err.message].find((s): s is string => typeof s === "string" && s.length > 0) ??
      String(e);
    console.error(output);
    throw e;
  }
};
