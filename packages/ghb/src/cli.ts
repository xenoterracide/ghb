#!/usr/bin/env node

// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { Cli, Command } from "clipanion";

class HelpCommand extends Command {
  public static override paths = [["--help"], ["-h"]];

  public async execute(): Promise<void> {
    this.context.stdout.write(`ghb - GitHub Bridge CLI

Usage: ghb <command> [options]

Commands:
  merge    AI-assisted PR merge workflow

Run 'ghb <command> --help' for more information on a command.
`);
  }
}

class MergeCommand extends Command {
  public static override paths = [["merge"]];

  public static override usage = Command.Usage({
    description: "AI-assisted PR merge workflow",
    details: `
      Automates the busywork of keeping a branch up to date, generating
      PR descriptions with an AI engine, waiting for CI, and merging.
    `,
  });

  public async execute(): Promise<void> {
    this.context.stdout.write("ghb merge is not yet implemented. Use ghb-merge directly for now.\n");
    this.context.stdout.write("  yarn workspace @xenoterracide/ghb-merge run merge:kimi\n");
  }
}

const cli = new Cli({
  binaryLabel: "ghb",
  binaryName: "ghb",
});

cli.register(HelpCommand);
cli.register(MergeCommand);

void cli
  .run(process.argv.slice(2), Cli.defaultContext)
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
