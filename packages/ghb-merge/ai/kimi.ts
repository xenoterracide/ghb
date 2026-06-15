// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { createOpenAI, type OpenAIProvider } from "@ai-sdk/openai";
import { generateText } from "ai";
import { readFileSync, statSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { parse as parseToml } from "smol-toml";
import type { AiEngine, AiEngineOptions } from "./engine.js";

export const DEFAULT_KIMI_MODEL = "kimi-k2-0712-preview";
const DEFAULT_KIMI_BASE_URL = "https://api.moonshot.cn/v1";

interface KimiProviderConfig {
  readonly type?: string;
  readonly api_key?: string;
}

function kimiConfigHome(): string {
  return process.env.KIMI_CODE_HOME ?? join(homedir(), ".kimi-code");
}

function assertSecureKeyFile(path: string): void {
  const mode = statSync(path).mode & 0o777;
  if (mode !== 0o600) {
    throw new Error(`Key file ${path} must have permissions 0o600 (found 0o${mode.toString(8)}).`);
  }
}

function readKeyFile(keyFile: string): string {
  assertSecureKeyFile(keyFile);
  return readFileSync(keyFile, "utf8").trim();
}

export function loadKimiApiKeyFromConfig(configFile?: string): string | undefined {
  const path = configFile ?? join(kimiConfigHome(), "config.toml");
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = parseToml(raw) as {
      providers?: Record<string, KimiProviderConfig>;
    };
    for (const provider of Object.values(parsed.providers ?? {})) {
      if (provider.type === "kimi" && provider.api_key) {
        return provider.api_key;
      }
    }
  } catch {
    // Config missing or malformed; fall through.
  }
  return undefined;
}

export function resolveKimiApiKey(opts: AiEngineOptions): string {
  if (opts.apiKey) {
    return opts.apiKey;
  }
  const configKey = loadKimiApiKeyFromConfig(opts.configFile);
  if (configKey) {
    return configKey;
  }
  if (opts.keyFile) {
    return readKeyFile(opts.keyFile);
  }
  const envKey = process.env.KIMI_API_KEY;
  if (envKey) {
    return envKey;
  }
  throw new Error(
    "Kimi API key not found. Configure a kimi provider in ~/.kimi-code/config.toml, pass --key-file, or set KIMI_API_KEY.",
  );
}

export function createKimiProvider(opts: AiEngineOptions = {}): OpenAIProvider {
  return createOpenAI({
    baseURL: opts.baseUrl ?? DEFAULT_KIMI_BASE_URL,
    apiKey: resolveKimiApiKey(opts),
  });
}

export class KimiEngine implements AiEngine {
  public readonly name = "kimi" as const;

  public constructor(private readonly opts: AiEngineOptions = {}) {}

  public async generate(prompt: string): Promise<string> {
    const provider = createKimiProvider(this.opts);
    const { text } = await generateText({
      model: provider(this.opts.model ?? DEFAULT_KIMI_MODEL),
      system: "You are an expert at writing concise, accurate conventional commit messages for code changes.",
      prompt,
    });
    return text;
  }
}
