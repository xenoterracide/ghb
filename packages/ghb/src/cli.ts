#!/usr/bin/env node

// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { Cli, Command } from "clipanion";
import { MergeCommand, PrMessageCommand } from "@xenoterracide/ghb-merge";
import { GetCommand, SyncCommand, UpdateCommand } from "@xenoterracide/ghb-secrets-sync";

class HelpCommand extends Command {
  public static override paths = [["--help"], ["-h"]];

  public async execute(): Promise<void> {
    this.context.stdout.write(`ghb - GitHub Bridge CLI

Usage: ghb <command> [options]

Commands:
  merge       AI-assisted PR merge workflow
  pr-message  Generate PR title/body files
  sync        Sync GitHub secrets to repositories
  update      Update secrets in an env file
  get         Get a secret value

Run 'ghb <command> --help' for more information on a command.
`);
  }
}

const cli = new Cli({
  binaryLabel: "ghb",
  binaryName: "ghb",
});

cli.register(HelpCommand);
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
