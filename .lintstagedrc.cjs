// SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
//
// SPDX-License-Identifier: MIT

const shfmt = "shfmt --write";
const prettier = "prettier --cache --ignore-unknown --write";
const reuse = "uv run --frozen --group dev reuse annotate";
const copyright = "--copyright 'Caleb Cushing' --merge-copyrights";
const symbol = "--copyright-prefix spdx-string-symbol";

const licenseConfiguration = "--license 'CC0-1.0' --fallback-dot-license";
const licenseDocumentation = "--license 'CC-BY-NC-SA-4.0";
const licenseScripts = "--license 'MIT' --fallback-dot-license";

const withoutYarn = (files) => files.filter((file) => !file.includes("/.yarn/") && !file.startsWith(".yarn/"));

const withFiles = (command, files) => `${command} ${files.map((file) => `"${file.replace(/"/g, '\\"')}"`).join(" ")}`;

const run = (commands) => (files) => {
  const filtered = withoutYarn(files);

  if (!filtered.length) {
    return [];
  }

  const cmds = Array.isArray(commands) ? commands : [commands];
  return cmds.map((command) => withFiles(command, filtered));
};

module.exports = {
  "!(package).json": run([`${reuse} ${copyright} ${symbol} ${licenseConfiguration}`, prettier]),
  // package.json can contain logic via the scripts segment
  "package.json": run([`${reuse} ${copyright} ${symbol} ${licenseScripts}`, prettier]),
  "{.config/git/hooks/**,**/*.*sh}": run([`${reuse} ${copyright} ${symbol} ${licenseScripts} --style python`, shfmt]),
  "*.{md,adoc}": run([`${reuse} ${copyright} ${symbol} ${licenseDocumentation}`, prettier]),
  "*.{xml,yaml,properties,toml,json5}": run([`${reuse} ${copyright} ${licenseConfiguration} ${symbol}`, prettier]),
  // yml is different from yaml extension as the only known yaml required file is for git-conventional-commits, but yml
  // contains files like GitHub workflows which can have significant logic
  "*.{js,cjs,yml}": run([`${reuse} ${copyright} ${symbol} ${licenseScripts}`, prettier]),
  ".{*ignore,editorconfig,gitattributes,mailmap}": run([
    `${reuse} ${copyright} ${symbol} ${licenseConfiguration}`,
    prettier,
  ]),
  // JetBrains obnoxiously assume that properties files aren't utf8 by default, and so to avoid rendering issues we
  // avoid adding the Unicode copyright symbol
  "*.properties": run([`${reuse} ${copyright} ${licenseConfiguration}`, prettier]),
};
