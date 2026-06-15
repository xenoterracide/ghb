// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

export type EngineName = "kimi" | "junie" | "copilot";

export interface AiEngineOptions {
  readonly model?: string;
  readonly apiKey?: string;
  readonly keyFile?: string;
  readonly configFile?: string;
  readonly baseUrl?: string;
}

export interface AiEngine {
  readonly name: EngineName;
  generate(prompt: string): Promise<string>;
}
