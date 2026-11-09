#!/usr/bin/env node

// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { Cli, Builtins } from "clipanion";
import { PrSyncCommand } from "./commands/pr-sync.js";
import { PrVerifyCommand } from "./commands/pr-verify.js";
import { GetCommand, SyncCommand, UpdateCommand } from "@xenoterracide/ghb-secrets-sync";

export function createCli(): Cli {
  const cli = new Cli({
    binaryLabel: "ghb",
    binaryName: "ghb",
  });

  cli.register(Builtins.HelpCommand);
  cli.register(PrSyncCommand);
  cli.register(PrVerifyCommand);
  cli.register(SyncCommand);
  cli.register(UpdateCommand);
  cli.register(GetCommand);

  return cli;
}

// The tsx dev entry (`pnpm ghb`) runs the source as argv[1]; every built
// invocation — direct node or a bin symlink whose name is not cli.js — is
// covered by the CommonJS entry identity, which node resolves through
// symlinks. The typeof guards keep vitest's ESM import of this module inert.
const cliPath = process.argv[1] ?? "";
const isMainModule =
  cliPath.endsWith("cli.ts") ||
  (typeof require === "function" && typeof module === "object" && module !== null && require.main === module);

if (isMainModule) {
  const cli = createCli();
  void cli
    .run(process.argv.slice(2), Cli.defaultContext)
    .then((exitCode) => {
      process.exit(exitCode);
    })
    .catch((err: unknown) => {
      console.error(err);
      process.exit(1);
    });
}
