// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  OTHER_PRIMARY_FPR,
  PRIMARY_FPR,
  SUBKEY_FPR,
  assertRenewalCalls,
  colonKey,
  createFailingRunner,
  createSequenceRunner,
  formatDate,
  makeCommand,
  nextSteps,
  renewalRunner,
  runRenew,
  twoKeys,
} from "./renew-helpers.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RenewCommand default duration", () => {
  it("renews the primary and signing subkey with the default duration", async () => {
    const runner = renewalRunner({
      beforePrimary: 1826073421,
      beforeSubkey: 1826073422,
      afterPrimary: 1857609421,
      afterSubkey: 1857609422,
    });

    const { exit, out } = await runRenew(makeCommand(runner));

    expect(exit).toBe(0);
    assertRenewalCalls(runner.calls, "1y");
    expect(out).toContain(`primary ${PRIMARY_FPR} expires ${formatDate(1857609421)} (was ${formatDate(1826073421)})`);
    expect(out).toContain(
      `signing subkey ${SUBKEY_FPR} expires ${formatDate(1857609422)} (was ${formatDate(1826073422)})`,
    );
    nextSteps(out);
  });
});

describe("RenewCommand explicit duration", () => {
  it("renews with an explicit duration", async () => {
    const runner = renewalRunner({
      beforePrimary: 1826073421,
      beforeSubkey: 1826073422,
      afterPrimary: 1889145421,
      afterSubkey: 1889145422,
    });
    const cmd = makeCommand(runner);
    cmd.duration = "2y";

    const { exit, out } = await runRenew(cmd);

    expect(exit).toBe(0);
    expect(runner.calls[1].args).toContain("2y");
    expect(runner.calls[2].args).toContain("2y");
    expect(out).toContain(`primary ${PRIMARY_FPR} expires ${formatDate(1889145421)} (was ${formatDate(1826073421)})`);
    expect(out).toContain(
      `signing subkey ${SUBKEY_FPR} expires ${formatDate(1889145422)} (was ${formatDate(1826073422)})`,
    );
  });
});

describe("RenewCommand null expiry", () => {
  it("prints never when the before expiry is null", async () => {
    const runner = createSequenceRunner([colonKey(null, null), "", "", colonKey(1857609421, 1857609422)]);

    const { exit, out } = await runRenew(makeCommand(runner));

    expect(exit).toBe(0);
    expect(out).toContain(`primary ${PRIMARY_FPR} expires ${formatDate(1857609421)} (was never)`);
    expect(out).toContain(`signing subkey ${SUBKEY_FPR} expires ${formatDate(1857609422)} (was never)`);
  });
});

describe("RenewCommand zero duration", () => {
  it.each(["0d", "0w", "0m", "0y"])("errors when --duration is zero (%s)", async (duration) => {
    const runner = createSequenceRunner([]);
    const cmd = makeCommand(runner);
    cmd.duration = duration;

    const { exit, err } = await runRenew(cmd);

    expect(exit).toBe(1);
    expect(runner.calls).toHaveLength(0);
    expect(err).toContain(`Error: --duration must be <n>d, <n>w, <n>m, or <n>y; got "${duration}"`);
  });
});

describe("RenewCommand duration format", () => {
  it("errors when --duration is not in the allowed format", async () => {
    const runner = createSequenceRunner([]);
    const cmd = makeCommand(runner);
    cmd.duration = "forever";

    const { exit, err } = await runRenew(cmd);

    expect(exit).toBe(1);
    expect(runner.calls).toHaveLength(0);
    expect(err).toContain('Error: --duration must be <n>d, <n>w, <n>m, or <n>y; got "forever"');
  });
});

describe("RenewCommand key validation", () => {
  it("errors when --key is not a full fingerprint", async () => {
    const runner = createSequenceRunner([]);
    const cmd = makeCommand(runner);
    cmd.key = "8042ED9A";

    const { exit, err } = await runRenew(cmd);

    expect(exit).toBe(1);
    expect(runner.calls).toHaveLength(0);
    expect(err).toContain('Error: --key must be a full fingerprint; got "8042ED9A"');
  });
});

describe("RenewCommand key not found", () => {
  it("errors when --key matches nothing", async () => {
    const runner = createSequenceRunner([colonKey(1826073421, 1826073422)]);
    const cmd = makeCommand(runner);
    cmd.key = OTHER_PRIMARY_FPR;

    const { exit, err } = await runRenew(cmd);

    expect(exit).toBe(2);
    expect(err).toContain(`Error: key ${OTHER_PRIMARY_FPR} not found`);
  });
});

describe("RenewCommand ambiguous keys", () => {
  it("errors with both fingerprints when no --key and several keys", async () => {
    const runner = createSequenceRunner([twoKeys(1826073422)]);

    const { exit, err } = await runRenew(makeCommand(runner));

    expect(exit).toBe(2);
    expect(err).toContain("Error: multiple keys in the keyring; pass --key with one of:");
    expect(err).toContain(PRIMARY_FPR);
    expect(err).toContain(OTHER_PRIMARY_FPR);
  });
});

describe("RenewCommand empty keyring", () => {
  it("errors when the keyring is empty", async () => {
    const runner = createSequenceRunner([""]);

    const { exit, err } = await runRenew(makeCommand(runner));

    expect(exit).toBe(2);
    expect(err).toContain("Error: no keys in the keyring");
  });
});

describe("RenewCommand missing signing subkey", () => {
  it("errors when the key has no signing subkey", async () => {
    const noSigning = colonKey(1826073421, 1826073422).replace(/:::::s:::::ed25519::/, ":::::e:::::ed25519::");
    const runner = createSequenceRunner([noSigning]);

    const { exit, err } = await runRenew(makeCommand(runner));

    expect(exit).toBe(2);
    expect(err).toContain(`Error: key ${PRIMARY_FPR} has no signing subkey`);
  });
});

describe("RenewCommand first setExpiry failure", () => {
  it("errors when the first setExpiry fails", async () => {
    const runner = createFailingRunner(1, "gpg exited with code 2");

    const { exit, err } = await runRenew(makeCommand(runner));

    expect(exit).toBe(1);
    expect(runner.calls).toHaveLength(2);
    expect(err).toContain(`Error: Failed to set expiry for ${PRIMARY_FPR}: gpg exited with code 2`);
  });
});

describe("RenewCommand second setExpiry failure", () => {
  it("errors when the second setExpiry fails", async () => {
    const runner = createFailingRunner(2, "gpg exited with code 2");

    const { exit, err } = await runRenew(makeCommand(runner));

    expect(exit).toBe(1);
    expect(runner.calls).toHaveLength(3);
    expect(err).toContain(`Error: Failed to set expiry for ${PRIMARY_FPR}: gpg exited with code 2`);
  });
});
