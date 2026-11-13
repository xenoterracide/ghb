// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

// Types
export type { CommandRunner, KeySelection, PublicKey, SubKey } from "./types.js";

// Gpg colon format parsing
export { findSigningSubkey, isValidFingerprint, parseColonKeys, selectKey } from "./colon.js";

// Gpg operations
export type { GpgOpts } from "./gpg.js";
export { exportSecretKey, listKeys, setExpiry } from "./gpg.js";

// Stdin passphrase reading
export { readAll, readPassphrase } from "./passphrase.js";

// Commands
export { CheckCommand } from "./commands/check.js";
export { RenewCommand } from "./commands/renew.js";
