// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

// ANSI color codes
const colors = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  green: "\x1b[32m",
};

let currentLevel: "info" | "debug" = "info";

function format(msg: string, obj?: Record<string, unknown>): string {
  if (!obj || Object.keys(obj).length === 0) return msg;
  const objStr = Object.entries(obj)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(" ");
  return `${msg} ${colors.dim}(${objStr})${colors.reset}`;
}

export const logger = {
  info: (msg: string, obj?: Record<string, unknown>): void => {
    console.log(`${colors.blue}INFO${colors.reset}: ${format(msg, obj)}`);
  },
  debug: (obj: Record<string, unknown>, msg: string): void => {
    if (currentLevel === "debug") {
      console.log(`${colors.cyan}DEBUG${colors.reset}: ${format(msg, obj)}`);
    }
  },
  warn: (msg: string, obj?: Record<string, unknown>): void => {
    console.warn(`${colors.yellow}WARN${colors.reset}: ${format(msg, obj)}`);
  },
  error: (msg: string, obj?: Record<string, unknown>): void => {
    console.error(`${colors.red}ERROR${colors.reset}: ${format(msg, obj)}`);
  },
};

export function setLogLevel(level: "info" | "debug"): void {
  currentLevel = level;
}
