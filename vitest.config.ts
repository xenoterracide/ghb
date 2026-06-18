// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/.share/**", "**/.agents/**", "**/.pnp.*"],
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
          name: "ghb-merge",
          root: "./packages/ghb-merge",
          include: ["**/*.test.ts"],
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
      exclude: ["**/.share/**", "**/.pnp.*", "**/node_modules/**", "**/*.test.ts", "**/coverage/**"],
      thresholds: {
        statements: 70,
        branches: 58,
        functions: 72,
        lines: 70,
      },
    },
  },
});
