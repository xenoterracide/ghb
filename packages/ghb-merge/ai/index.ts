// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import type { AiEngine, AiEngineOptions, EngineName } from "./engine.js";
import { KimiEngine } from "./kimi.js";

export type { AiEngine, AiEngineOptions, EngineName };
export { KimiEngine, DEFAULT_KIMI_MODEL } from "./kimi.js";

export function createAiEngine(name: EngineName, opts: AiEngineOptions = {}): AiEngine {
  switch (name) {
    case "kimi":
      return new KimiEngine(opts);
    case "junie":
    case "copilot":
      throw new Error(`Engine "${name}" is not yet migrated to the Vercel AI SDK.`);
    default:
      throw new Error(`Unknown engine "${name}".`);
  }
}
