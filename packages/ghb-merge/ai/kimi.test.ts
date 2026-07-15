// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  KimiEngine,
  DEFAULT_KIMI_MODEL,
  KimiConfigCredentialResolver,
  KeyFileCredentialResolver,
  EnvCredentialResolver,
  ChainCredentialResolver,
} from "./kimi";

vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: vi.fn(() => vi.fn((model: string) => ({ model }))),
}));

import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

describe("KimiConfigCredentialResolver", () => {
  it("extracts the first kimi provider api_key", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "kimi-cfg-"));
    const configFile = join(tmpDir, "config.toml");
    writeFileSync(
      configFile,
      `[providers.openai]\ntype = "openai"\napi_key = "sk-openai"\n\n[providers.kimi]\ntype = "kimi"\napi_key = "sk-kimi"\n`,
      "utf8",
    );
    const resolver = new KimiConfigCredentialResolver(configFile);
    expect(resolver.resolve()).toEqual({ apiKey: "sk-kimi" });
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("extracts the provider base_url", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "kimi-cfg-"));
    const configFile = join(tmpDir, "config.toml");
    writeFileSync(
      configFile,
      `[providers.kimi]\ntype = "kimi"\napi_key = "sk-kimi"\nbase_url = "https://api.kimi.com/coding/v1"\n`,
      "utf8",
    );
    const resolver = new KimiConfigCredentialResolver(configFile);
    expect(resolver.resolve()).toEqual({ apiKey: "sk-kimi", baseUrl: "https://api.kimi.com/coding/v1" });
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("reads OAuth access_token from a credentials file", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "kimi-cfg-"));
    const configFile = join(tmpDir, "config.toml");
    const credentialsDir = join(tmpDir, "credentials");
    const credentialsFile = join(credentialsDir, "kimi-code.json");
    writeFileSync(
      configFile,
      `[providers.kimi]\ntype = "kimi"\nbase_url = "https://api.kimi.com/coding/v1"\n\n[providers.kimi.oauth]\nstorage = "file"\nkey = "credentials/kimi-code.json"\n`,
      "utf8",
    );
    mkdirSync(credentialsDir, { recursive: true });
    writeFileSync(credentialsFile, JSON.stringify({ access_token: "oauth-token" }), "utf8");
    const resolver = new KimiConfigCredentialResolver(configFile, tmpDir);
    expect(resolver.resolve()).toEqual({ apiKey: "oauth-token", baseUrl: "https://api.kimi.com/coding/v1" });
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("falls back to credentials directory when the OAuth file is empty or missing", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "kimi-cfg-"));
    const configFile = join(tmpDir, "config.toml");
    const oauthDir = join(tmpDir, "oauth");
    const oauthFile = join(oauthDir, "kimi-code");
    const credentialsDir = join(tmpDir, "credentials");
    const credentialsFile = join(credentialsDir, "kimi-code.json");
    writeFileSync(
      configFile,
      `[providers.kimi]\ntype = "kimi"\nbase_url = "https://api.kimi.com/coding/v1"\n\n[providers.kimi.oauth]\nstorage = "file"\nkey = "oauth/kimi-code"\n`,
      "utf8",
    );
    mkdirSync(oauthDir, { recursive: true });
    writeFileSync(oauthFile, "", "utf8");
    mkdirSync(credentialsDir, { recursive: true });
    writeFileSync(credentialsFile, JSON.stringify({ access_token: "fallback-token" }), "utf8");
    const resolver = new KimiConfigCredentialResolver(configFile, tmpDir);
    expect(resolver.resolve()).toEqual({ apiKey: "fallback-token", baseUrl: "https://api.kimi.com/coding/v1" });
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("throws when the OAuth credentials file is missing", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "kimi-cfg-"));
    const configFile = join(tmpDir, "config.toml");
    writeFileSync(
      configFile,
      `[providers.kimi]\ntype = "kimi"\n\n[providers.kimi.oauth]\nstorage = "file"\nkey = "credentials/missing.json"\n`,
      "utf8",
    );
    const resolver = new KimiConfigCredentialResolver(configFile);
    expect(() => resolver.resolve()).toThrow(/OAuth credentials file not found or contained no access_token/);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("throws when the file is missing", () => {
    const resolver = new KimiConfigCredentialResolver("/nonexistent/config.toml");
    expect(() => resolver.resolve()).toThrow(/config file not found/);
  });

  it("throws when no kimi provider exists", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "kimi-cfg-"));
    const configFile = join(tmpDir, "config.toml");
    writeFileSync(configFile, `[providers.openai]\ntype = "openai"\napi_key = "sk-openai"\n`, "utf8");
    const resolver = new KimiConfigCredentialResolver(configFile);
    expect(() => resolver.resolve()).toThrow(/No kimi provider found/);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("does not require a secure config file", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "kimi-cfg-"));
    const configFile = join(tmpDir, "config.toml");
    writeFileSync(configFile, `[providers.kimi]\ntype = "kimi"\napi_key = "sk-kimi"\n`, "utf8");
    chmodSync(configFile, 0o644);
    const resolver = new KimiConfigCredentialResolver(configFile);
    expect(resolver.resolve()).toEqual({ apiKey: "sk-kimi" });
    rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe("KeyFileCredentialResolver", () => {
  it("reads from a secure key file", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "kimi-key-"));
    const keyFile = join(tmpDir, "key.txt");
    writeFileSync(keyFile, "sk-from-file\n", "utf8");
    chmodSync(keyFile, 0o600);
    const resolver = new KeyFileCredentialResolver(keyFile);
    expect(resolver.resolve()).toEqual({ apiKey: "sk-from-file" });
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("throws when the key file is insecure", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "kimi-key-"));
    const keyFile = join(tmpDir, "key.txt");
    writeFileSync(keyFile, "sk-from-file\n", "utf8");
    chmodSync(keyFile, 0o644);
    const resolver = new KeyFileCredentialResolver(keyFile);
    expect(() => resolver.resolve()).toThrow(/must have permissions 0o600/);
    rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe("EnvCredentialResolver", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads the configured environment variable", () => {
    vi.stubEnv("KIMI_API_KEY", "sk-env");
    const resolver = new EnvCredentialResolver("KIMI_API_KEY");
    expect(resolver.resolve()).toEqual({ apiKey: "sk-env" });
  });

  it("throws when the environment variable is not set", () => {
    vi.stubEnv("KIMI_API_KEY", "");
    const resolver = new EnvCredentialResolver("KIMI_API_KEY");
    expect(() => resolver.resolve()).toThrow(/is not set/);
  });
});

describe("ChainCredentialResolver", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the first successful resolver", () => {
    const resolver = new ChainCredentialResolver([
      {
        resolve: (): { apiKey: string } => {
          throw new Error("first");
        },
      },
      { resolve: (): { apiKey: string } => ({ apiKey: "second" }) },
      { resolve: (): { apiKey: string } => ({ apiKey: "third" }) },
    ]);
    expect(resolver.resolve()).toEqual({ apiKey: "second" });
  });

  it("throws a friendly message when all resolvers fail", () => {
    vi.stubEnv("KIMI_API_KEY", "");
    const resolver = new ChainCredentialResolver([
      {
        resolve: (): { apiKey: string } => {
          throw new Error("fail");
        },
      },
    ]);
    expect(() => resolver.resolve()).toThrow(/Kimi API key not found/);
  });
});

describe("KimiEngine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("generates text using the default model", async () => {
    (generateText as ReturnType<typeof vi.fn>).mockResolvedValue({ text: "feat: hello\n\n- detail" });

    const engine = new KimiEngine({ apiKey: "sk-test" });
    const result = await engine.generate("my prompt");

    expect(createAnthropic).toHaveBeenCalledWith({
      baseURL: "https://api.kimi.com/coding/v1",
      apiKey: "sk-test",
    });
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.objectContaining({ model: DEFAULT_KIMI_MODEL }),
        prompt: "my prompt",
      }),
    );
    expect(result).toBe("feat: hello\n\n- detail");
  });

  it("honors a custom model", async () => {
    (generateText as ReturnType<typeof vi.fn>).mockResolvedValue({ text: "" });

    const engine = new KimiEngine({ apiKey: "sk-test", model: "kimi-latest" });
    await engine.generate("prompt");

    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({ model: expect.objectContaining({ model: "kimi-latest" }) }),
    );
  });
});
