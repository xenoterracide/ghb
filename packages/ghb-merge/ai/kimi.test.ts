// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { KimiEngine, loadKimiApiKeyFromConfig, resolveKimiApiKey, DEFAULT_KIMI_MODEL } from "./kimi";

vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: vi.fn(() => vi.fn((model: string) => ({ model }))),
}));

import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

describe("resolveKimiApiKey", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses explicit apiKey", () => {
    expect(resolveKimiApiKey({ apiKey: "sk-explicit" })).toBe("sk-explicit");
  });

  it("reads from a secure key file", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "kimi-key-"));
    const keyFile = join(tmpDir, "key.txt");
    writeFileSync(keyFile, "sk-from-file\n", "utf8");
    chmodSync(keyFile, 0o600);
    expect(resolveKimiApiKey({ keyFile })).toBe("sk-from-file");
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("throws when an explicit key file is insecure", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "kimi-key-"));
    const keyFile = join(tmpDir, "key.txt");
    writeFileSync(keyFile, "sk-from-file\n", "utf8");
    chmodSync(keyFile, 0o644);
    expect(() => resolveKimiApiKey({ keyFile })).toThrow(/must have permissions 0o600/);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("falls back to KIMI_API_KEY env var", () => {
    vi.stubEnv("KIMI_API_KEY", "sk-env");
    expect(resolveKimiApiKey()).toBe("sk-env");
  });

  it("throws when no source is available", () => {
    vi.stubEnv("KIMI_API_KEY", "");
    expect(() => resolveKimiApiKey()).toThrow(/Kimi API key not found/);
  });
});

describe("loadKimiApiKeyFromConfig", () => {
  it("extracts the first kimi provider api_key", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "kimi-cfg-"));
    const configFile = join(tmpDir, "config.toml");
    writeFileSync(
      configFile,
      `[providers.openai]\ntype = "openai"\napi_key = "sk-openai"\n\n[providers.kimi]\ntype = "kimi"\napi_key = "sk-kimi"\n`,
      "utf8",
    );
    expect(loadKimiApiKeyFromConfig(configFile)).toBe("sk-kimi");
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns undefined for a missing file", () => {
    expect(loadKimiApiKeyFromConfig("/nonexistent/config.toml")).toBeUndefined();
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

    expect(createOpenAI).toHaveBeenCalledWith({
      baseURL: "https://api.moonshot.cn/v1",
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
