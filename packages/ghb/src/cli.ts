#!/usr/bin/env -S node --

// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

// The -- in the shebang ends node's own option parsing. node recognizes
// flags after the entry script — --env-file among them — and swallows
// them before the CLI ever sees them.

import { Cli, Builtins } from "clipanion";
import { PrSyncCommand, PrVerifyCommand } from "@xenoterracide/ghb-pr";
import { GetCommand, SyncCommand, UpdateCommand } from "@xenoterracide/ghb-secrets-sync";
import { CheckCommand, ExportCommand, RenewCommand } from "@xenoterracide/ghb-signing";

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
  cli.register(CheckCommand);
  cli.register(RenewCommand);
  cli.register(ExportCommand);

  return cli;
}

// The tsx dev entry (`pnpm ghb`) runs the source as argv[1]; every built
// invocation — direct node or a bin symlink whose name is not cli.js — is
// covered by the CommonJS entry identity, which node resolves through
// symlinks. The typeof guards keep vitest's ESM import of this module inert.
const cliPath = process.argv[1] ?? "";
const isMainModule =
  cliPath.endsWith("cli.ts") ||
  (typeof require === "function" && typeof module === "object" && require.main === module);

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
