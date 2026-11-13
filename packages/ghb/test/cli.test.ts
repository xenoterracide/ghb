// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { Cli } from "clipanion";
import { createCli } from "../src/cli.js";

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
    expect(paths).toContain("ghb signing check");
    expect(paths).toContain("ghb signing renew");
    expect(paths).toContain("ghb signing export");
  });

  it("should register 8 commands", () => {
    const cli = createCli();
    const definitions = Array.from(cli.definitions());
    expect(definitions.length).toBe(8);
  });

  it("should print help when run with no args", async () => {
    const cli = createCli();
    const stdoutChunks: string[] = [];
    const mockContext = {
      ...Cli.defaultContext,
      stdout: {
        write: (chunk: string | Uint8Array): boolean => {
          stdoutChunks.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
          return true;
        },
      } as NodeJS.WriteStream,
      stderr: process.stderr,
      stdin: process.stdin,
    };

    const exitCode = await cli.run([], mockContext);
    const output = stdoutChunks.join("");

    expect(exitCode).toBe(0);
    expect(output).toContain("ghb pr sync");
    expect(output).toContain("ghb pr verify");
    expect(output).toContain("ghb secrets sync");
    expect(output).toContain("ghb secrets update");
    expect(output).toContain("ghb secrets get");
    expect(output).toContain("ghb signing check");
    expect(output).toContain("ghb signing renew");
    expect(output).toContain("ghb signing export");
  });

  it("should print help for secrets sync subcommand", async () => {
    const cli = createCli();
    const stdoutChunks: string[] = [];
    const mockContext = {
      ...Cli.defaultContext,
      stdout: {
        write: (chunk: string | Uint8Array): boolean => {
          stdoutChunks.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
          return true;
        },
      } as NodeJS.WriteStream,
      stderr: process.stderr,
      stdin: process.stdin,
    };

    const exitCode = await cli.run(["secrets", "sync", "--help"], mockContext);
    const output = stdoutChunks.join("");

    expect(exitCode).toBe(0);
    expect(output).toContain("Sync secrets to GitHub repositories");
    expect(output).toContain("--secrets");
    expect(output).toContain("--env-file");
  });
});
