// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { parseEnvFile, resolveSecretValue } from "../src/env.js";

describe("parseEnvFile", () => {
  let tmpDir = "";

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "secrets-sync-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should parse val: literal values", () => {
    const envPath = join(tmpDir, ".env");
    writeFileSync(envPath, "DEBUG_MODE=val:true\nAPI_KEY=val:test123\n", "utf8");

    const result = parseEnvFile(envPath);

    expect(result).toEqual({
      DEBUG_MODE: { type: "value", value: "true" },
      API_KEY: { type: "value", value: "test123" },
    });
  });

  it("should throw for values without protocol prefix", () => {
    const envPath = join(tmpDir, ".env");
    writeFileSync(envPath, "API_KEY=no-protocol-value\n", "utf8");

    expect(() => parseEnvFile(envPath)).toThrow("must have a protocol prefix");
  });

  it("should parse env: references", () => {
    const envPath = join(tmpDir, ".env");
    writeFileSync(envPath, "API_KEY=env:PROD_API_KEY\n", "utf8");

    const result = parseEnvFile(envPath);

    expect(result).toEqual({
      API_KEY: { type: "env", value: "PROD_API_KEY" },
    });
  });

  it("should parse file: references", () => {
    const envPath = join(tmpDir, ".env");
    const keyPath = join(tmpDir, "key.asc");
    writeFileSync(keyPath, "gpg-key-content", "utf8");
    writeFileSync(envPath, `GPG_KEY=file:${keyPath}\n`, "utf8");

    const result = parseEnvFile(envPath);

    expect(result.GPG_KEY.type).toBe("file");
    expect(result.GPG_KEY.value).toBe(keyPath);
  });

  it("should handle file: with // prefix (URI style)", () => {
    const envPath = join(tmpDir, ".env");
    const keyPath = join(tmpDir, "key.asc");
    writeFileSync(keyPath, "gpg-key-content", "utf8");
    writeFileSync(envPath, `GPG_KEY=file://${keyPath}\n`, "utf8");

    const result = parseEnvFile(envPath);

    expect(result.GPG_KEY.type).toBe("file");
    expect(result.GPG_KEY.value).toBe(keyPath);
  });

  it("should resolve relative file: paths", () => {
    const envPath = join(tmpDir, ".env");
    const keysDir = join(tmpDir, "keys");
    mkdirSync(keysDir);
    const keyPath = join(keysDir, "signing.asc");
    writeFileSync(keyPath, "key-content", "utf8");
    writeFileSync(envPath, "GPG_KEY=file:./keys/signing.asc\n", "utf8");

    const result = parseEnvFile(envPath);

    expect(result.GPG_KEY.value).toBe(keyPath);
  });

  it("should skip empty lines and comments", () => {
    const envPath = join(tmpDir, ".env");
    writeFileSync(
      envPath,
      "# This is a comment\n\nAPI_KEY=val:test123\n  \n# Another comment\nSECRET=val:value\n",
      "utf8",
    );

    const result = parseEnvFile(envPath);

    expect(result).toEqual({
      API_KEY: { type: "value", value: "test123" },
      SECRET: { type: "value", value: "value" },
    });
  });

  it("should throw if file not found", () => {
    const missingPath = join(tmpDir, "missing.env");

    expect(() => parseEnvFile(missingPath)).toThrow("Env file not found");
  });

  it("should throw for unknown protocol", () => {
    const envPath = join(tmpDir, ".env");
    writeFileSync(envPath, "API_KEY=unknown:value\n", "utf8");

    expect(() => parseEnvFile(envPath)).toThrow('Unknown protocol "unknown:"');
  });

  it("should handle values with colons in them", () => {
    const envPath = join(tmpDir, ".env");
    writeFileSync(envPath, "PASSWORD=val:pass:word\nAPI_KEY=val:abc:123:xyz\n", "utf8");

    const result = parseEnvFile(envPath);

    expect(result).toEqual({
      PASSWORD: { type: "value", value: "pass:word" },
      API_KEY: { type: "value", value: "abc:123:xyz" },
    });
  });
});

describe("resolveSecretValue", () => {
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
  });

  it("should return explicit value if provided", () => {
    const result = resolveSecretValue("API_KEY", undefined, "explicit-value");
    expect(result).toBe("explicit-value");
  });

  it("should resolve from env file entry with val: value", () => {
    const envFileEntries = {
      API_KEY: { type: "value" as const, value: "from-env-file" },
    };

    const result = resolveSecretValue("API_KEY", envFileEntries);
    expect(result).toBe("from-env-file");
  });

  it("should resolve from env file entry with env: reference", () => {
    process.env.EXISTING_VAR = "env-var-value";
    const envFileEntries = {
      API_KEY: { type: "env" as const, value: "EXISTING_VAR" },
    };

    const result = resolveSecretValue("API_KEY", envFileEntries);
    expect(result).toBe("env-var-value");
  });

  it("should return undefined for missing env var in env: reference", () => {
    const envFileEntries = {
      API_KEY: { type: "env" as const, value: "NONEXISTENT_VAR" },
    };

    const result = resolveSecretValue("API_KEY", envFileEntries);
    expect(result).toBeUndefined();
  });

  it("should resolve from env file entry with file: reference", () => {
    const keyPath = join(tmpDir, "key.asc");
    writeFileSync(keyPath, "file-contents", "utf8");
    const envFileEntries = {
      GPG_KEY: { type: "file" as const, value: keyPath },
    };

    const result = resolveSecretValue("GPG_KEY", envFileEntries);
    expect(result).toBe("file-contents");
  });

  it("should return undefined for missing file in file: reference", () => {
    const envFileEntries = {
      GPG_KEY: { type: "file" as const, value: "/path/to/missing.asc" },
    };

    const result = resolveSecretValue("GPG_KEY", envFileEntries);
    expect(result).toBeUndefined();
  });

  it("should resolve from environment variable matching secret name", () => {
    process.env.MY_SECRET = "env-value";

    const result = resolveSecretValue("MY_SECRET");
    expect(result).toBe("env-value");

    delete process.env.MY_SECRET;
  });

  it("should return undefined if no value found", () => {
    const result = resolveSecretValue("NONEXISTENT_SECRET");
    expect(result).toBeUndefined();
  });

  it("should prefer explicit value over env file entry", () => {
    const envFileEntries = {
      API_KEY: { type: "value" as const, value: "from-env-file" },
    };

    const result = resolveSecretValue("API_KEY", envFileEntries, "explicit-value");
    expect(result).toBe("explicit-value");
  });

  it("should prefer env file entry over environment variable", () => {
    process.env.API_KEY = "from-env-var";
    const envFileEntries = {
      API_KEY: { type: "value" as const, value: "from-env-file" },
    };

    const result = resolveSecretValue("API_KEY", envFileEntries);
    expect(result).toBe("from-env-file");

    delete process.env.API_KEY;
  });
});
