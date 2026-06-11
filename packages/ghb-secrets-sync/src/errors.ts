// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Error class for user-facing errors (invalid input, bad config, etc.)
 * These errors show clean messages without stack traces.
 */
export class UserError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}
