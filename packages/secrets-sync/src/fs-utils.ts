// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { chmodSync, statSync } from "fs";
import { logger } from "./logger.js";

export function setSecurePermissions(filePath: string): void {
  try {
    chmodSync(filePath, 0o600);
  } catch (e) {
    logger.warn(`Could not set permissions on ${filePath}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export function checkFilePermissions(filePath: string): void {
  try {
    const stats = statSync(filePath);
    const mode = stats.mode & 0o777;
    if (mode !== 0o600) {
      logger.warn(`${filePath} has permissions ${mode.toString(8)}, setting to 600`);
      setSecurePermissions(filePath);
    }
  } catch (e) {
    logger.debug(
      { file: filePath, error: e instanceof Error ? e.message : String(e) },
      "Could not check file permissions",
    );
  }
}
