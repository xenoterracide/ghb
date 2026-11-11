// SPDX-FileCopyrightText: Copyright © 2023-2026 Caleb Cushing
//
// SPDX-License-Identifier: MIT

const shfmt = "shfmt --write";
const prettier = "prettier --cache --ignore-unknown --write";
const reuse = "uv run --frozen --group dev reuse annotate";
const copyright = "--copyright 'Caleb Cushing' --merge-copyrights";
const symbol = "--copyright-prefix spdx-string-symbol";

const licenseCode = "--license 'GPL-3.0-or-later'";
const licenseConfiguration = "--license 'CC0-1.0' --fallback-dot-license";
const licenseDocumentation = "--license 'CC-BY-NC-SA-4.0'";
const licenseScripts = "--license 'MIT' --fallback-dot-license";

// pnpm-lock.yaml and the maven wrapper properties are generated; header
// comments and formatting break them. `.jinja` sources carry their baked
// lineage headers (REUSE.toml's **/*.jinja annotation backstops the
// headerless JSON-jinja), so annotate must not stamp them.
// Hooks run while lint-staged does, and annotating one rewrites the script
// under its own executing shell; they carry their headers from the template.
const withoutManaged = (files) =>
  files.filter(
    (file) =>
      !/(^|\/)(pnpm-lock\.yaml|maven-wrapper\.properties)$/.test(file) &&
      !/(^|\/)\.config\/git\/hooks\//.test(file) &&
      !/\.jinja$/.test(file),
  );

const withFiles = (command, files) => `${command} ${files.map((file) => `"${file.replace(/"/g, '\\"')}"`).join(" ")}`;

const run = (commands) => (files) => {
  const filtered = withoutManaged(files);

  if (!filtered.length) {
    return [];
  }

  const cmds = Array.isArray(commands) ? commands : [commands];
  return cmds.map((command) => withFiles(command, filtered));
};

module.exports = {
  // JSON cannot carry headers; its licensing lives in REUSE.toml. Companion
  // files confused agents and regenerate even when REUSE.toml covers the file.
  "!(package).json": run(prettier),
  // package.json can contain logic via the scripts segment
  "package.json": run(prettier),
  "{.config/git/hooks/**,**/*.*sh,.envrc}": run([
    `${reuse} ${copyright} ${symbol} ${licenseScripts} --style python`,
    shfmt,
  ]),
  "*.adoc": run([`${reuse} ${copyright} ${symbol} ${licenseDocumentation}`, prettier]),
  // don't run reuse for markdown in this repo because it doesn't deal with frontmatter properly
  "*.md": run([prettier]),
  "*.{xml,yaml,properties,toml,json5,jsonc}": run([
    `${reuse} ${copyright} ${licenseConfiguration} ${symbol}`,
    prettier,
  ]),
  // yml is different from yaml extension as the only known yaml required file is for git-conventional-commits, but yml
  // contains files like GitHub workflows which can have significant logic
  "*.{js,cjs,yml}": run([`${reuse} ${copyright} ${symbol} ${licenseScripts}`, prettier]),
  // reuse 6.3.0 does not recognise .cts, so annotate --fallback-dot-license
  // would write a sidecar the inline header already covers; prettier only
  "*.cts": run(prettier),
  ".{*ignore,editorconfig,gitattributes,mailmap}": run([
    `${reuse} ${copyright} ${symbol} ${licenseConfiguration}`,
    prettier,
  ]),
  // JetBrains obnoxiously assume that properties files aren't utf8 by default, and so to avoid rendering issues we
  // avoid adding the Unicode copyright symbol
  "*.properties": run([`${reuse} ${copyright} ${licenseConfiguration}`, prettier]),
  // TypeScript code
  "*.ts": run([`${reuse} ${copyright} ${symbol} ${licenseCode}`, prettier]),
  // Java code
  "*.java": run([`${reuse} ${copyright} ${symbol} ${licenseCode}`, prettier]),
};
