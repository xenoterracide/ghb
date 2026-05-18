#!/usr/bin/env tsx

// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { Cli } from "clipanion";
import { SyncCommand } from "./commands/sync.js";
import { UpdateCommand } from "./commands/update.js";
import { GetCommand } from "./commands/get.js";
import { UserError } from "./errors.js";

const cli = new Cli({
  binaryLabel: "secrets-sync",
  binaryName: "secrets",
});

cli.register(SyncCommand);
cli.register(UpdateCommand);
cli.register(GetCommand);

void cli
  .run(process.argv.slice(2), Cli.defaultContext)
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((err: unknown) => {
    if (err instanceof UserError) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
    // Unexpected error - show full details
    console.error(err);
    process.exit(1);
  });
