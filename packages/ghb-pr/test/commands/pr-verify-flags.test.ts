// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, describe, expect, it, vi } from "vitest";
import { Cli } from "clipanion";
import { PrVerifyCommand } from "../../src/commands/pr-verify.js";

vi.mock("../../src/exec.js", () => ({ execRunner: vi.fn() }));

interface Bound {
  interval: string;
  timeout: string;
  forward: string[];
}

interface CliResult {
  exit: number;
  stdout: string;
}

// a probe that records what clipanion bound instead of running the real gate
class ProbeVerify extends PrVerifyCommand {
  public static bound: Bound | undefined;

  public async execute(): Promise<number> {
    ProbeVerify.bound = { interval: this.interval, timeout: this.timeout, forward: this.forward };
    // clipanion requires a Promise even from a synchronous probe
    await Promise.resolve();
    return 0;
  }
}

async function runCli(args: string[]): Promise<CliResult> {
  const chunks: string[] = [];
  const cli = new Cli({ binaryName: "ghb" });
  cli.register(ProbeVerify);
  const stdout = {
    write: (chunk: string | Uint8Array): boolean => {
      chunks.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
      return true;
    },
  } as NodeJS.WriteStream;
  const exit = await cli.run(args, { ...Cli.defaultContext, stdout });
  return { exit, stdout: chunks.join("") };
}

afterEach(() => {
  ProbeVerify.bound = undefined;
});

describe("PrVerifyCommand", () => {
  it("binds its own flags and forwards the rest through the parser", async () => {
    const { exit } = await runCli(["pr", "verify", "--interval", "5", "--timeout", "120", "585"]);

    expect(exit).toBe(0);
    expect(ProbeVerify.bound?.interval).toBe("5");
    expect(ProbeVerify.bound?.timeout).toBe("120");
    expect(ProbeVerify.bound?.forward).toEqual(["585"]);
  });

  it("shows help instead of forwarding --help to gh", async () => {
    const { exit, stdout } = await runCli(["pr", "verify", "--help"]);

    expect(exit).toBe(0);
    expect(stdout).toContain("pr verify");
  });
});
