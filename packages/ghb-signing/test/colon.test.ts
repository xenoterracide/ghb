// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { findSigningSubkey, isValidFingerprint, parseColonKeys, selectKey } from "../src/colon.js";
import type { PublicKey, SubKey } from "../src/types.js";

// Real `gpg --list-keys --with-colons` output, captured from gpg 2.4.9
// (an ed25519 `cert` primary plus an ed25519 `sign` subkey).
const FIXTURE = `tru::1:1794537422:1826073421:3:1:5
pub:u:255:22:32BF5B09B5329853:1794537421:1826073421::u:::cSC:::::ed25519:::0:
fpr:::::::::E2161DBFFA7E2C4ED8A6DC8032BF5B09B5329853:
uid:u::::1794537421::13D53EB7B1B52BD56CEF553F7EED2E413F86F513::Plan Test <plan@example.invalid>::::::::::0:
sub:u:255:22:C3C46C6F2A3408CC:1794537422:1826073422:::::s:::::ed25519::
fpr:::::::::C17EB30E70FBD586F5794285C3C46C6F2A3408CC:`;

const NO_EXPIRY = `tru::1:1794537422:1826073421:3:1:5
pub:u:255:22:32BF5B09B5329853:1794537421:::u:::cSC:::::ed25519:::0:
fpr:::::::::E2161DBFFA7E2C4ED8A6DC8032BF5B09B5329853:
uid:u::::1794537421::13D53EB7B1B52BD56CEF553F7EED2E413F86F513::Plan Test <plan@example.invalid>::::::::::0:
sub:u:255:22:C3C46C6F2A3408CC:1794537422::::::s:::::ed25519::
fpr:::::::::C17EB30E70FBD586F5794285C3C46C6F2A3408CC:`;

const TWO_KEYS = `${FIXTURE}
pub:u:255:22:ABCDEF0123456789:1794537430:1826073430::u:::cSC:::::ed25519:::0:
fpr:::::::::ABCDEF0123456789ABCDEF0123456789ABCDEF01:
sub:u:255:22:0123456789ABCDEF:1794537431:1826073431:::::s:::::ed25519::
fpr:::::::::0123456789ABCDEF0123456789ABCDEF01234567:`;

interface SubkeySpec {
  keyId: string;
  fingerprint: string;
  capabilities: string;
  validity?: string;
}

function makeSubkey(spec: SubkeySpec): SubKey {
  return {
    validity: spec.validity ?? "u",
    keyId: spec.keyId,
    fingerprint: spec.fingerprint,
    capabilities: spec.capabilities,
    createdAt: 1794537422,
    expiresAt: 1826073422,
  };
}

function makePublicKey(subkey: SubKey): PublicKey {
  return {
    validity: "u",
    keyId: "32BF5B09B5329853",
    fingerprint: "E2161DBFFA7E2C4ED8A6DC8032BF5B09B5329853",
    capabilities: "cSC",
    createdAt: 1794537421,
    expiresAt: 1826073421,
    subkeys: [subkey],
  };
}

describe("parseColonKeys one key", () => {
  it("parses one key with its signing subkey", () => {
    expect(parseColonKeys(FIXTURE)).toEqual([
      {
        validity: "u",
        keyId: "32BF5B09B5329853",
        fingerprint: "E2161DBFFA7E2C4ED8A6DC8032BF5B09B5329853",
        capabilities: "cSC",
        createdAt: 1794537421,
        expiresAt: 1826073421,
        subkeys: [
          {
            validity: "u",
            keyId: "C3C46C6F2A3408CC",
            fingerprint: "C17EB30E70FBD586F5794285C3C46C6F2A3408CC",
            capabilities: "s",
            createdAt: 1794537422,
            expiresAt: 1826073422,
          },
        ],
      },
    ]);
  });
});

describe("parseColonKeys empty expiry", () => {
  it("reads an empty expiry as never", () => {
    const keys = parseColonKeys(NO_EXPIRY);

    expect(keys).toHaveLength(1);
    expect(keys[0]?.expiresAt).toBeNull();
    expect(keys[0]?.subkeys[0]?.expiresAt).toBeNull();
  });
});

describe("parseColonKeys multiple keys", () => {
  it("keeps each key's subkeys with it", () => {
    const keys = parseColonKeys(TWO_KEYS);

    expect(keys).toHaveLength(2);
    expect(keys.map((k) => k.keyId)).toEqual(["32BF5B09B5329853", "ABCDEF0123456789"]);
    expect(keys[0]?.subkeys.map((s) => s.keyId)).toEqual(["C3C46C6F2A3408CC"]);
    expect(keys[1]?.subkeys.map((s) => s.keyId)).toEqual(["0123456789ABCDEF"]);
  });
});

describe("findSigningSubkey fixture", () => {
  it("returns the signing-capable subkey of the fixture key", () => {
    const [key] = parseColonKeys(FIXTURE);

    expect(findSigningSubkey(key)).toEqual({
      validity: "u",
      keyId: "C3C46C6F2A3408CC",
      fingerprint: "C17EB30E70FBD586F5794285C3C46C6F2A3408CC",
      capabilities: "s",
      createdAt: 1794537422,
      expiresAt: 1826073422,
    });
  });
});

describe("findSigningSubkey missing sign", () => {
  it("returns undefined when no subkey can sign", () => {
    const key = makePublicKey(
      makeSubkey({
        keyId: "C3C46C6F2A3408CC",
        fingerprint: "C17EB30E70FBD586F5794285C3C46C6F2A3408CC",
        capabilities: "e",
      }),
    );

    expect(findSigningSubkey(key)).toBeUndefined();
  });
});

describe("findSigningSubkey newest", () => {
  it("picks the newest signing subkey", () => {
    const older = makeSubkey({
      keyId: "C3C46C6F2A3408CC",
      fingerprint: "C17EB30E70FBD586F5794285C3C46C6F2A3408CC",
      capabilities: "s",
    });
    const newer: SubKey = {
      validity: "u",
      keyId: "0123456789ABCDEF",
      fingerprint: "0123456789ABCDEF0123456789ABCDEF01234567",
      capabilities: "s",
      createdAt: 1794537431,
      expiresAt: 1826073431,
    };
    const key = makePublicKey(older);
    key.subkeys.push(newer);

    expect(findSigningSubkey(key)).toBe(newer);
  });
});

describe("findSigningSubkey uppercase S", () => {
  it("matches uppercase S as sign", () => {
    const subkey = makeSubkey({
      keyId: "C3C46C6F2A3408CC",
      fingerprint: "C17EB30E70FBD586F5794285C3C46C6F2A3408CC",
      capabilities: "S",
    });
    const key = makePublicKey(subkey);

    expect(findSigningSubkey(key)).toBe(subkey);
  });
});

describe("findSigningSubkey revoked", () => {
  it("skips a newer revoked signing subkey for the older usable one", () => {
    const usable = makeSubkey({
      keyId: "C3C46C6F2A3408CC",
      fingerprint: "C17EB30E70FBD586F5794285C3C46C6F2A3408CC",
      capabilities: "s",
    });
    const revoked: SubKey = {
      validity: "r",
      keyId: "0123456789ABCDEF",
      fingerprint: "0123456789ABCDEF0123456789ABCDEF01234567",
      capabilities: "s",
      createdAt: 1794537431,
      expiresAt: 1826073431,
    };
    const key = makePublicKey(usable);
    key.subkeys.push(revoked);

    expect(findSigningSubkey(key)).toBe(usable);
  });
});

describe("findSigningSubkey disabled", () => {
  it("skips a disabled signing subkey", () => {
    const subkey = makeSubkey({
      keyId: "C3C46C6F2A3408CC",
      fingerprint: "C17EB30E70FBD586F5794285C3C46C6F2A3408CC",
      capabilities: "s",
      validity: "d",
    });
    const key = makePublicKey(subkey);

    expect(findSigningSubkey(key)).toBeUndefined();
  });
});

describe("findSigningSubkey expired", () => {
  it("keeps an expired signing subkey selectable; expiry is what check reports and renew extends", () => {
    const expired = makeSubkey({
      keyId: "C3C46C6F2A3408CC",
      fingerprint: "C17EB30E70FBD586F5794285C3C46C6F2A3408CC",
      capabilities: "s",
      validity: "e",
    });
    const key = makePublicKey(expired);

    expect(findSigningSubkey(key)).toBe(expired);
  });
});

describe("isValidFingerprint 40-hex", () => {
  it("accepts a 40-hex fingerprint", () => {
    expect(isValidFingerprint("E2161DBFFA7E2C4ED8A6DC8032BF5B09B5329853")).toBe(true);
  });
});

describe("isValidFingerprint 64-hex", () => {
  it("accepts a 64-hex fingerprint", () => {
    expect(isValidFingerprint("e2161dbffa7e2c4ed8a6dc8032bf5b09b5329853e2161dbffa7e2c4ed8a6dc80")).toBe(true);
  });
});

describe("isValidFingerprint lowercase", () => {
  it("accepts a lowercase 40-hex fingerprint", () => {
    expect(isValidFingerprint("e2161dbffa7e2c4ed8a6dc8032bf5b09b5329853")).toBe(true);
  });
});

describe("isValidFingerprint key id", () => {
  it("rejects a key id", () => {
    expect(isValidFingerprint("32BF5B09B5329853")).toBe(false);
  });
});

describe("isValidFingerprint non-hex", () => {
  it("rejects non-hex characters", () => {
    expect(isValidFingerprint("G2161DBFFA7E2C4ED8A6DC8032BF5B09B5329853")).toBe(false);
  });
});

const [fixtureKey, secondKey] = parseColonKeys(TWO_KEYS);

describe("selectKey single", () => {
  it("returns ok for a single key", () => {
    expect(selectKey([fixtureKey])).toEqual({
      status: "ok",
      key: fixtureKey,
    });
  });
});

describe("selectKey missing", () => {
  it("returns missing when there are no keys", () => {
    expect(selectKey([])).toEqual({ status: "missing" });
  });
});

describe("selectKey ambiguous", () => {
  it("returns ambiguous with both keys", () => {
    expect(selectKey([fixtureKey, secondKey])).toEqual({
      status: "ambiguous",
      keys: [fixtureKey, secondKey],
    });
  });
});

describe("selectKey case insensitive", () => {
  it("matches a fingerprint case-insensitively", () => {
    expect(selectKey([fixtureKey], "e2161dbffa7e2c4ed8a6dc8032bf5b09b5329853")).toEqual({
      status: "ok",
      key: fixtureKey,
    });
  });
});

describe("selectKey not found", () => {
  it("returns not-found when the fingerprint matches nothing", () => {
    expect(selectKey([fixtureKey], "0123456789ABCDEF0123456789ABCDEF01234567")).toEqual({ status: "not-found" });
  });
});
