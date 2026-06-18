// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { createOpenAI, type OpenAIProvider } from "@ai-sdk/openai";
import { generateText } from "ai";
import { existsSync, readFileSync, statSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { parse as parseToml } from "smol-toml";
import { logger } from "../logger.js";
import type { AiEngine, AiEngineOptions } from "./engine.js";

export const DEFAULT_KIMI_MODEL = "kimi-k2-0712-preview";
const DEFAULT_KIMI_BASE_URL = "https://api.moonshot.cn/v1";

interface KimiProviderConfig {
  readonly type?: string;
  readonly api_key?: string;
}

export interface CredentialResolver {
  resolve: () => string;
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

export class KimiConfigCredentialResolver implements CredentialResolver {
  public constructor(private readonly configFile?: string) {}

  public resolve(): string {
    const path = this.configFile ?? join(kimiConfigHome(), "config.toml");
    if (!existsSync(path)) {
      throw new Error(`Kimi config file not found at ${path}`);
    }
    assertSecureKeyFile(path);
    let raw: string;
    try {
      raw = readFileSync(path, "utf8");
    } catch {
      throw new Error(`Kimi config file not found at ${path}`);
    }

    const parsed = parseToml(raw) as {
      providers?: Record<string, KimiProviderConfig>;
    };
    for (const provider of Object.values(parsed.providers ?? {})) {
      if (provider.type === "kimi" && provider.api_key) {
        return provider.api_key;
      }
    }
    throw new Error(`No kimi provider found in ${path}`);
  }
}

export class KeyFileCredentialResolver implements CredentialResolver {
  public constructor(private readonly keyFile: string) {}

  public resolve(): string {
    assertSecureKeyFile(this.keyFile);
    return readFileSync(this.keyFile, "utf8").trim();
  }
}

export class EnvCredentialResolver implements CredentialResolver {
  public constructor(private readonly envVar: string) {}

  public resolve(): string {
    const value = process.env[this.envVar];
    if (!value) {
      throw new Error(`Environment variable ${this.envVar} is not set`);
    }
    return value;
  }
}

export class ChainCredentialResolver implements CredentialResolver {
  public constructor(private readonly resolvers: CredentialResolver[]) {}

  public resolve(): string {
    const errors: string[] = [];
    for (const resolver of this.resolvers) {
      try {
        return resolver.resolve();
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        logger.debug("Credential resolver failed:", message);
        errors.push(message);
      }
    }
    throw new Error(
      "Kimi API key not found. Configure a kimi provider in ~/.kimi-code/config.toml, pass --key-file, or set KIMI_API_KEY. " +
        `Details: ${errors.join("; ")}`,
    );
  }
}

function createKimiCredentialResolver(opts: AiEngineOptions): CredentialResolver {
  const { apiKey } = opts;
  if (apiKey) {
    return { resolve: () => apiKey };
  }
  if (opts.keyFile) {
    return new KeyFileCredentialResolver(opts.keyFile);
  }
  return new ChainCredentialResolver([
    new KimiConfigCredentialResolver(opts.configFile),
    new EnvCredentialResolver("KIMI_API_KEY"),
  ]);
}

export function createKimiProvider(opts: AiEngineOptions = {}): OpenAIProvider {
  const credentials = createKimiCredentialResolver(opts);
  return createOpenAI({
    baseURL: opts.baseUrl ?? DEFAULT_KIMI_BASE_URL,
    apiKey: credentials.resolve(),
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
