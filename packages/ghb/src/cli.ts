#!/usr/bin/env node

// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { Cli, Builtins } from "clipanion";
import { MergeCommand, PrMessageCommand } from "@xenoterracide/ghb-merge";
import { GetCommand, SyncCommand, UpdateCommand } from "@xenoterracide/ghb-secrets-sync";

const cli = new Cli({
  binaryLabel: "ghb",
  binaryName: "ghb",
});

cli.register(Builtins.HelpCommand);
cli.register(MergeCommand);
cli.register(PrMessageCommand);
cli.register(SyncCommand);
cli.register(UpdateCommand);
cli.register(GetCommand);

void cli
  .run(process.argv.slice(2), Cli.defaultContext)
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
