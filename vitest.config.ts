// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/.agents/**"],
    projects: [
      {
        test: {
          name: "ghb",
          root: "./packages/ghb",
          include: ["**/*.test.ts"],
        },
      },
      {
        test: {
          name: "ghb-pr",
          root: "./packages/ghb-pr",
          include: ["test/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "ghb-secrets-sync",
          root: "./packages/ghb-secrets-sync",
          include: ["test/**/*.test.ts"],
        },
      },
    ],
    coverage: {
      exclude: ["**/node_modules/**", "**/*.test.ts", "**/coverage/**"],
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90,
      },
    },
  },
});
