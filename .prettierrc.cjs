// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: MIT

/** @type {import('prettier').Options} */
module.exports = {
  printWidth: 120,
  xmlWhitespaceSensitivity: "ignore",
  keySeparator: "=",
  plugins: ["@prettier/plugin-xml", "prettier-plugin-properties", "prettier-plugin-java", "prettier-plugin-toml"]
    .map((p) => {
      try {
        return require.resolve(p);
      } catch {
        return null;
      }
    })
    .filter(Boolean),
};
