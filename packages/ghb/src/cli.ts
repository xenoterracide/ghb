#!/usr/bin/env node

// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { Cli, Builtins } from "clipanion";
import { MergeCommand, PrMessageCommand } from "@xenoterracide/ghb-merge";
import { GetCommand, SyncCommand, UpdateCommand } from "@xenoterracide/ghb-secrets-sync";

export function createCli(): Cli {
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

  return cli;
}

const cliPath = process.argv[1] ?? "";
// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
const isMainModule = cliPath.endsWith("cli.ts") || cliPath.endsWith("cli.js");

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
