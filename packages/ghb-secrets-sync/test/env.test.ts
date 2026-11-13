// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { parseEnvFile, resolveSecretValue } from "../src/env.js";

let tmpDir = "";

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "secrets-sync-test-"));
  delete process.env.TEST_ENV_VAR;
  delete process.env.EXISTING_VAR;
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.TEST_ENV_VAR;
  delete process.env.EXISTING_VAR;
  vi.restoreAllMocks();
});

function writeEnvFile(content: string): string {
  const envPath = join(tmpDir, ".env");
  writeFileSync(envPath, content, "utf8");
  return envPath;
}

function writeSecretFile(name: string, content: string): string {
  const keyPath = join(tmpDir, name);
  writeFileSync(keyPath, content, "utf8");
  return keyPath;
}

describe("parseEnvFile val literals", () => {
  it("parses literal values", () => {
    const result = parseEnvFile(writeEnvFile("DEBUG_MODE=val:true\nAPI_KEY=val:test123\n"));

    expect(result).toEqual({
      DEBUG_MODE: { type: "value", value: "true" },
      API_KEY: { type: "value", value: "test123" },
    });
  });
});

describe("parseEnvFile val colons", () => {
  it("handles values with colons in them", () => {
    const result = parseEnvFile(writeEnvFile("PASSWORD=val:pass:word\nAPI_KEY=val:abc:123:xyz\n"));

    expect(result).toEqual({
      PASSWORD: { type: "value", value: "pass:word" },
      API_KEY: { type: "value", value: "abc:123:xyz" },
    });
  });
});

describe("parseEnvFile gpg:", () => {
  it("parses gpg: references with a full fingerprint", () => {
    const result = parseEnvFile(writeEnvFile("GPG_SIGNING_KEY=gpg:E2161DBFFA7E2C4ED8A6DC8032BF5B09B5329853\n"));

    expect(result.GPG_SIGNING_KEY).toEqual({
      type: "gpg",
      value: "E2161DBFFA7E2C4ED8A6DC8032BF5B09B5329853",
    });
  });

  it("throws for gpg: values that are not full fingerprints", () => {
    expect(() => parseEnvFile(writeEnvFile("GPG_SIGNING_KEY=gpg:8042ED9A\n"))).toThrow(
      "gpg: value must be a full fingerprint",
    );
  });
});

describe("parseEnvFile env:", () => {
  it("parses env: references", () => {
    const result = parseEnvFile(writeEnvFile("API_KEY=env:PROD_API_KEY\n"));

    expect(result).toEqual({ API_KEY: { type: "env", value: "PROD_API_KEY" } });
  });
});

describe("parseEnvFile file reference", () => {
  it("parses file: references", () => {
    const keyPath = writeSecretFile("key.asc", "gpg-key-content");
    const result = parseEnvFile(writeEnvFile(`GPG_KEY=file:${keyPath}\n`));

    expect(result.GPG_KEY.type).toBe("file");
    expect(result.GPG_KEY.value).toBe(keyPath);
  });
});

describe("parseEnvFile file URI style", () => {
  it("handles file: with // prefix (URI style)", () => {
    const keyPath = writeSecretFile("key-uri.asc", "gpg-key-content");
    const result = parseEnvFile(writeEnvFile(`GPG_KEY=file://${keyPath}\n`));

    expect(result.GPG_KEY.type).toBe("file");
    expect(result.GPG_KEY.value).toBe(keyPath);
  });
});

describe("parseEnvFile file relative", () => {
  it("resolves relative file: paths", () => {
    const keysDir = join(tmpDir, "keys");
    mkdirSync(keysDir);
    const keyPath = join(keysDir, "signing.asc");
    writeFileSync(keyPath, "key-content", "utf8");
    const result = parseEnvFile(writeEnvFile("GPG_KEY=file:./keys/signing.asc\n"));

    expect(result.GPG_KEY.value).toBe(keyPath);
  });
});

describe("parseEnvFile errors", () => {
  it("throws for values without protocol prefix", () => {
    expect(() => parseEnvFile(writeEnvFile("API_KEY=no-protocol-value\n"))).toThrow("must have a protocol prefix");
  });

  it("throws for unknown protocol", () => {
    expect(() => parseEnvFile(writeEnvFile("API_KEY=unknown:value\n"))).toThrow('Unknown protocol "unknown:"');
  });

  it("throws if env file not found", () => {
    expect(() => parseEnvFile(join(tmpDir, "missing.env"))).toThrow("Env file not found");
  });

  it("mentions gpg: in the unknown protocol message", () => {
    expect(() => parseEnvFile(writeEnvFile("API_KEY=unknown:value\n"))).toThrow(/Use env:, file:, val:, or gpg:/);
  });
});

describe("parseEnvFile edges", () => {
  it("skips empty lines and comments", () => {
    const envPath = writeEnvFile(
      "# This is a comment\n\nAPI_KEY=val:test123\n  \n# Another comment\nSECRET=val:value\n",
    );

    expect(parseEnvFile(envPath)).toEqual({
      API_KEY: { type: "value", value: "test123" },
      SECRET: { type: "value", value: "value" },
    });
  });

  it("skips lines with an empty key", () => {
    const entries = parseEnvFile(writeEnvFile("=value\nKEY=val:kept\n"));

    expect(Object.keys(entries)).toEqual(["KEY"]);
  });
});

describe("resolveSecretValue explicit", () => {
  it("returns explicit value if provided", () => {
    const result = resolveSecretValue("API_KEY", undefined, "explicit-value");
    expect(result).toBe("explicit-value");
  });

  it("prefers explicit value over env file entry", () => {
    const envFileEntries = { API_KEY: { type: "value" as const, value: "from-env-file" } };

    const result = resolveSecretValue("API_KEY", envFileEntries, "explicit-value");
    expect(result).toBe("explicit-value");
  });
});

describe("resolveSecretValue env file precedence", () => {
  it("prefers env file entry over environment variable", () => {
    process.env.API_KEY = "from-env-var";
    const envFileEntries = { API_KEY: { type: "value" as const, value: "from-env-file" } };

    const result = resolveSecretValue("API_KEY", envFileEntries);
    expect(result).toBe("from-env-file");

    delete process.env.API_KEY;
  });
});

describe("resolveSecretValue val:", () => {
  it("resolves from env file entry with val: value", () => {
    const envFileEntries = { API_KEY: { type: "value" as const, value: "from-env-file" } };

    const result = resolveSecretValue("API_KEY", envFileEntries);
    expect(result).toBe("from-env-file");
  });
});

describe("resolveSecretValue env present", () => {
  it("resolves from env file entry with env: reference", () => {
    process.env.EXISTING_VAR = "env-var-value";
    const envFileEntries = { API_KEY: { type: "env" as const, value: "EXISTING_VAR" } };

    const result = resolveSecretValue("API_KEY", envFileEntries);
    expect(result).toBe("env-var-value");
  });
});

describe("resolveSecretValue env missing", () => {
  it("returns undefined for missing env var in env: reference", () => {
    const envFileEntries = { API_KEY: { type: "env" as const, value: "NONEXISTENT_VAR" } };

    const result = resolveSecretValue("API_KEY", envFileEntries);
    expect(result).toBeUndefined();
  });
});

describe("resolveSecretValue file present", () => {
  it("resolves from env file entry with file: reference", () => {
    const keyPath = writeSecretFile("key.asc", "file-contents");
    const envFileEntries = { GPG_KEY: { type: "file" as const, value: keyPath } };

    const result = resolveSecretValue("GPG_KEY", envFileEntries);
    expect(result).toBe("file-contents");
  });
});

describe("resolveSecretValue file missing", () => {
  it("returns undefined for missing file in file: reference", () => {
    const envFileEntries = { GPG_KEY: { type: "file" as const, value: "/path/to/missing.asc" } };

    const result = resolveSecretValue("GPG_KEY", envFileEntries);
    expect(result).toBeUndefined();
  });
});

describe("resolveSecretValue file permissions", () => {
  it("warns on an overly permissive referenced secret file", () => {
    const secretPath = join(tmpDir, "secret.txt");
    writeFileSync(secretPath, "s3cret", { mode: 0o644 });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const value = resolveSecretValue("KEY", parseEnvFile(writeEnvFile(`KEY=file:${secretPath}\n`)));

    expect(value).toBe("s3cret");
    expect(warn.mock.calls.map((call) => call.join(" ")).join(" ")).toContain("overly permissive");
  });
});

describe("resolveSecretValue environment fallback", () => {
  it("resolves from environment variable matching secret name", () => {
    process.env.MY_SECRET = "env-value";

    const result = resolveSecretValue("MY_SECRET");
    expect(result).toBe("env-value");

    delete process.env.MY_SECRET;
  });

  it("returns undefined if no value found", () => {
    const result = resolveSecretValue("NONEXISTENT_SECRET");
    expect(result).toBeUndefined();
  });
});
