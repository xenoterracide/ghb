<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# Contributing to ghb

Thank you for your interest in improving `ghb`. This repository is a TypeScript
monorepo managed with pnpm workspaces.

## Repository Overview

- **`packages/ghb/`** — the `ghb` CLI aggregator.
- **`packages/ghb-pr/`** — `pr sync` and `pr verify`.
- **`packages/ghb-secrets-sync/`** — GitHub secrets sync utilities.
- **`.config/git/hooks/`** — git hooks; they heal the toolchain and gate
  commits.
- **`.github/workflows/`** — CI workflows.

## Setup

1. Ensure `asdf` and `direnv` are installed and allowed.
2. Run `pnpm contribute` — it installs tools, syncs Node and Python
   dependencies, and points `core.hooksPath` at `.config/git/hooks`.

`contribute` and the post-checkout/post-merge hooks all call
`.config/git/hooks/heal.sh`; a failed heal never breaks a checkout.

## Local Build

The registry install (`npm install -g @xenoterracide/ghb`) works only
after the first publish. Until then — and whenever you want to run your
own changes — install the packed tarballs into one prefix. The unpacked
workspace cannot run under plain node: workspace dependencies resolve
`main` to TypeScript source, the tsx dev contract. Packing swaps `main`
to `dist` and rewrites `workspace:^` to real versions:

```bash
pnpm -r pack --pack-destination /tmp/packs
npm install --prefix ~/.local/lib/ghb /tmp/packs/*.tgz
ln -sf ~/.local/lib/ghb/node_modules/.bin/ghb ~/.local/bin/ghb
```

Never `npm install -g` the separate tarballs: `-g` installs each tarball
as its own root, nesting one clipanion copy per package, and clipanion's
option specs carry a module-scoped symbol — the parser only sees specs
from its own copy, so every flag and positional of a subpackage's
commands dies as a syntax error. One prefix is one root: npm hoists a
single clipanion every package shares, and every command parses.

The bin's shebang resolves `node` from `PATH`, so one install serves
every asdf-managed Node version — no per-version `npm i -g`, no reshim.
The registry install replaces this flow after the first publish.

## Build, Test, and Lint

```bash
# Run all checks
pnpm check

# Individual commands
pnpm test              # tests with coverage across the workspace
pnpm build             # build every package topologically
pnpm typecheck         # root project, then every package
pnpm lint              # eslint + prettier + reuse
pnpm lint:eslint
pnpm lint:prettier
pnpm lint:reuse
```

## Updating from the Template

This repository is managed with
[copier](https://copier.readthedocs.io); [`.copier-answers.yml`](./.copier-answers.yml)
holds the answers. Refresh from
[xenoterracide/base-template](https://github.com/xenoterracide/base-template):

    copier update --trust

Conflicts appear as `.rej` files or inline markers; resolve and commit.
Renovate opens an update PR on each template release and automerges clean
updates.

## Pull Requests

- Follow the project's [conventional commit
  conventions](git-conventional-commits.yaml).
- Use squash merge. Do not force push.
- Update `README.md` for user-facing behavior changes.
- Update `AGENTS.md` for build processes, tools, or agent workflows.
- Update `CONTRIBUTING.md` for contributor-facing commands or workflows.
- Ensure every file has an SPDX license header.
- Ensure all GitHub checks pass before requesting review.

## License

By contributing, you agree to license your work under the project's
[CC-BY-NC-SA-4.0](LICENSES/CC-BY-NC-SA-4.0.txt) license.
