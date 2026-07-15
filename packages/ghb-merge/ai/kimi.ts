// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { createAnthropic, type AnthropicProvider } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { readFileSync, statSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { parse as parseToml } from "smol-toml";
import { logger } from "../logger.js";
import type { AiEngine, AiEngineOptions } from "./engine.js";

export const DEFAULT_KIMI_MODEL = "kimi-for-coding";
const DEFAULT_KIMI_BASE_URL = "https://api.kimi.com/coding/v1";

interface KimiOAuthConfig {
  readonly storage?: string;
  readonly key?: string;
}

interface KimiProviderConfig {
  readonly type?: string;
  readonly api_key?: string;
  readonly base_url?: string;
  readonly oauth?: KimiOAuthConfig;
}

interface KimiResolvedConfig {
  readonly apiKey: string;
  readonly baseUrl?: string;
}

interface KimiCredentialsFile {
  readonly access_token?: string;
}

export interface CredentialResolver {
  resolve: () => KimiResolvedConfig;
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

function readSecureKeyFile(keyFile: string): string {
  assertSecureKeyFile(keyFile);
  return readFileSync(keyFile, "utf8").trim();
}

function readOAuthCredentials(configHome: string, oauth: KimiOAuthConfig): string {
  if (oauth.storage !== "file" || !oauth.key) {
    throw new Error(`Unsupported OAuth storage: ${oauth.storage ?? "missing"}`);
  }

  const credentialsPath = join(configHome, oauth.key);
  const fallbackPath = join(configHome, "credentials", `${oauth.key.split("/").pop() ?? ""}.json`);
  const paths = [credentialsPath, fallbackPath];

  for (const path of paths) {
    let raw: string;
    try {
      raw = readFileSync(path, "utf8").trim();
    } catch {
      continue;
    }
    if (!raw) {
      continue;
    }
    const parsed = JSON.parse(raw) as KimiCredentialsFile;
    if (parsed.access_token) {
      return parsed.access_token;
    }
  }

  const checked = paths.join(", ");
  throw new Error(`OAuth credentials file not found or contained no access_token (checked: ${checked})`);
}

export class KimiConfigCredentialResolver implements CredentialResolver {
  public constructor(
    private readonly configFile?: string,
    private readonly configHome?: string,
  ) {}

  public resolve(): KimiResolvedConfig {
    const configHome = this.configHome ?? kimiConfigHome();
    const path = this.configFile ?? join(configHome, "config.toml");
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
      if (provider.type === "kimi") {
        if (provider.oauth) {
          return {
            apiKey: readOAuthCredentials(configHome, provider.oauth),
            baseUrl: provider.base_url,
          };
        }
        if (provider.api_key) {
          return { apiKey: provider.api_key, baseUrl: provider.base_url };
        }
      }
    }
    throw new Error(`No kimi provider found in ${path}`);
  }
}

export class KeyFileCredentialResolver implements CredentialResolver {
  public constructor(private readonly keyFile: string) {}

  public resolve(): KimiResolvedConfig {
    return { apiKey: readSecureKeyFile(this.keyFile) };
  }
}

export class EnvCredentialResolver implements CredentialResolver {
  public constructor(private readonly envVar: string) {}

  public resolve(): KimiResolvedConfig {
    const value = process.env[this.envVar];
    if (!value) {
      throw new Error(`Environment variable ${this.envVar} is not set`);
    }
    return { apiKey: value };
  }
}

export class ChainCredentialResolver implements CredentialResolver {
  public constructor(private readonly resolvers: CredentialResolver[]) {}

  public resolve(): KimiResolvedConfig {
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
    return { resolve: () => ({ apiKey }) };
  }
  if (opts.keyFile) {
    return new KeyFileCredentialResolver(opts.keyFile);
  }
  return new ChainCredentialResolver([
    new KimiConfigCredentialResolver(opts.configFile),
    new EnvCredentialResolver("KIMI_API_KEY"),
  ]);
}

export function createKimiProvider(opts: AiEngineOptions = {}): AnthropicProvider {
  const credentials = createKimiCredentialResolver(opts).resolve();
  return createAnthropic({
    baseURL: opts.baseUrl ?? credentials.baseUrl ?? DEFAULT_KIMI_BASE_URL,
    apiKey: credentials.apiKey,
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
