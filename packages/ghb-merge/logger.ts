// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

let debugEnabled = process.env.DEBUG === "1" || process.env.DEBUG === "true";

export const logger = {
  debug: (message: string, ...args: unknown[]): void => {
    if (debugEnabled) {
      console.debug(`[debug] ${message}`, ...args);
    }
  },
  info: (message: string, ...args: unknown[]): void => {
    console.log(message, ...args);
  },
  warn: (message: string, ...args: unknown[]): void => {
    console.warn(message, ...args);
  },
  error: (message: string, ...args: unknown[]): void => {
    console.error(message, ...args);
  },
};

export function setDebug(enabled: boolean): void {
  debugEnabled = enabled;
}
