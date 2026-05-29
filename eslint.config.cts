// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: MIT

import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import jsonPluginImport from "@eslint/json";
import markdown from "@eslint/markdown";
import { defineConfig, globalIgnores } from "eslint/config";

const jsonPlugin = (jsonPluginImport as { default?: typeof jsonPluginImport }).default ?? jsonPluginImport;

export default defineConfig([
  globalIgnores([".yarn/", ".pnp.*", "**/dist/", "**/build/", "node_modules/", ".agents/"]),
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    languageOptions: { globals: globals.node },
    ...eslint.configs.recommended,
  },
  {
    files: ["**/*.{ts,mts,cts}"],
    extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        project: "./tsconfig.eslint.json",
      },
    },
    rules: {
      // Strict rules from mira

      // Disable base ESLint rules in favor of TypeScript-aware equivalents
      // TypeScript versions understand TS syntax (generics, type annotations, etc.)
      "max-params": "off",
      "@typescript-eslint/max-params": "error",
      "default-param-last": "off",
      "@typescript-eslint/default-param-last": "error",
      "no-use-before-define": "off",
      "@typescript-eslint/no-use-before-define": "error",
      "init-declarations": "off",
      "@typescript-eslint/init-declarations": "error",
      "prefer-destructuring": "off",
      "@typescript-eslint/prefer-destructuring": "error",

      "@typescript-eslint/consistent-type-exports": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/explicit-member-accessibility": "error",
      "@typescript-eslint/explicit-function-return-type": "error",
      "@typescript-eslint/explicit-module-boundary-types": "error",
      "@typescript-eslint/member-ordering": "error",
      "@typescript-eslint/method-signature-style": "error",
      "@typescript-eslint/no-dupe-class-members": "error",
      "@typescript-eslint/no-import-type-side-effects": "error",
      "@typescript-eslint/no-invalid-this": "error",
      "@typescript-eslint/no-loop-func": "error",
      "@typescript-eslint/no-redeclare": "error",
      "@typescript-eslint/no-shadow": "error",
      "@typescript-eslint/no-unnecessary-parameter-property-assignment": "error",
      "@typescript-eslint/no-unnecessary-qualifier": "error",
      "@typescript-eslint/no-unnecessary-type-arguments": "error",
      "@typescript-eslint/no-useless-empty-export": "error",
      "@typescript-eslint/prefer-readonly": "error",
      "@typescript-eslint/promise-function-async": "error",
      "@typescript-eslint/strict-boolean-expressions": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
    },
  },
  {
    // CLI entrypoints legitimately use console for user interaction
    files: ["**/cli.ts", "**/commands/*.ts", "**/merge.ts"],
    rules: {
      "no-console": "off",
    },
  },

  {
    // Node packages: relax strict type checking due to PnP resolution issues
    files: ["packages/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/strict-boolean-expressions": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/restrict-plus-operands": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/init-declarations": "off",
      "no-useless-assignment": "off",
      "preserve-caught-error": "off",
      "no-empty": ["error", { allowEmptyCatch: false }],
      "@typescript-eslint/no-empty-function": "error",
      // Complex refactor needed
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/max-params": "off",
      "@typescript-eslint/no-use-before-define": "off",
    },
  },
  {
    files: ["**/*.json"],
    ignores: ["**/tsconfig.json", "**/tsconfig.*.json"],
    plugins: { json: jsonPlugin },
    language: "json/json",
    ...jsonPlugin.configs.recommended,
  },
  {
    files: ["**/*.json5"],
    plugins: { json: jsonPlugin },
    language: "json/json5",
    ...jsonPlugin.configs.recommended,
  },
  {
    files: ["**/*.jsonc", "**/tsconfig.json", "**/tsconfig.*.json"],
    plugins: { json: jsonPlugin },
    language: "json/jsonc",
    ...jsonPlugin.configs.recommended,
  },
  {
    files: ["**/*.md"],
    plugins: { markdown },
    language: "markdown/gfm",
    extends: [markdown.configs.recommended],
  },
]);
