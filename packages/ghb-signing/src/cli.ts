#!/usr/bin/env node

// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { Cli } from "clipanion";

import { CheckCommand } from "./commands/check.js";

const cli = new Cli({
  binaryLabel: "signing",
  binaryName: "signing",
});

cli.register(CheckCommand);

void cli
  .run(process.argv.slice(2), Cli.defaultContext)
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
