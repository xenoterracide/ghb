// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { Cli } from "clipanion";
import { createCli } from "../src/cli.js";

async function runCapturing(cli: Cli, args: string[]): Promise<{ exit: number; output: string }> {
  const chunks: string[] = [];
  const context = {
    ...Cli.defaultContext,
    stdout: {
      write: (chunk: string | Uint8Array): boolean => {
        chunks.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
        return true;
      },
    } as NodeJS.WriteStream,
    stderr: process.stderr,
    stdin: process.stdin,
  };

  const exit = await cli.run(args, context);
  return { exit, output: chunks.join("") };
}

describe("ghb CLI", () => {
  it("should register all expected commands", () => {
    const cli = createCli();
    const definitions = Array.from(cli.definitions());

    const paths = definitions.map((def: { path: string }) => def.path);

    expect(paths).toContain("ghb pr sync");
    expect(paths).toContain("ghb pr verify");
    expect(paths).toContain("ghb secrets sync");
    expect(paths).toContain("ghb secrets update");
    expect(paths).toContain("ghb secrets get");
  });

  it("should register 5 commands", () => {
    const cli = createCli();
    const definitions = Array.from(cli.definitions());
    expect(definitions.length).toBe(5);
  });
});

describe("ghb CLI", () => {
  it("should print help when run with no args", async () => {
    const cli = createCli();

    const { exit, output } = await runCapturing(cli, []);

    expect(exit).toBe(0);
    expect(output).toContain("ghb pr sync");
    expect(output).toContain("ghb pr verify");
    expect(output).toContain("ghb secrets sync");
    expect(output).toContain("ghb secrets update");
    expect(output).toContain("ghb secrets get");
  });
});

describe("ghb CLI", () => {
  it("should print help for secrets sync subcommand", async () => {
    const cli = createCli();

    const { exit, output } = await runCapturing(cli, ["secrets", "sync", "--help"]);

    expect(exit).toBe(0);
    expect(output).toContain("Sync secrets to GitHub repositories");
    expect(output).toContain("--secrets");
    expect(output).toContain("--env-file");
  });
});
