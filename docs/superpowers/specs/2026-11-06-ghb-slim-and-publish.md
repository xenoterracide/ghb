<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# ghb Slim and Publish

- Date: 2026-11-06
- Status: proposed, awaiting approval

## Problem

`ghb merge` automates PR merging by shelling out to AI engines to write
messages. Agents now write the messages. The engine layer is dead weight:
four runtime deps, a credential chain, an output sanitizer, and a CI
workflow that installs two global CLIs to test it.

Meanwhile agents re-type the mechanical steps at every merge: sync the
branch, verify currency, state, and checks. Those steps belong in the
tool. The tool belongs on npm, so any agent on any machine can run it.

## Decision

Slim ghb, adopt base-template, install the CLI locally, beta test it on
real merges, then publish to npm and point agent-skills at the commands.
Chosen over bridge scripts in agent-skills (throwaway code) and over
publishing before a beta — the commands are unproven until real merges
run them. Publishing stays what makes the skill reference portable:
`npm i -g @xenoterracide/ghb` puts the commands on every machine.

## What dies

- `packages/ghb-merge/ai/` — engine layer, credential resolvers, Kimi call
- `ghb pr message` — agents write messages; `commit-creator.md` is the
  sanitizer now
- Junie and Copilot paths — half-dead already, never migrated to the SDK
- Output sanitizer, diff caps, `--dry-run`, `cleanNodeOptions`
- `findMainRepoRoot` — submodule support, dropped
- `.github/workflows/ai-engines.yml`
- Root `merge:*` scripts
- Deps: `ai`, `@ai-sdk/anthropic`, `smol-toml`, `zod`
- Engine references everywhere: root README, packages/ghb README, AGENTS.md,
  the `--kimi` help assertion in cli.test.ts
- Renovate #578 closes with the engine layer

## What stays

- `ghb-secrets-sync`, untouched
- The human merge gate — moved to skill prose, which is stronger than the
  old Y/n prompt: it spans every merge route and requires an explicit yes
  after the human read the PR

## New commands

`packages/ghb-merge` is deleted. Its useful flow is rewritten as two
commands in `packages/ghb/src/commands/`, following the secrets-sync
structure. Each is one mechanical step the agent no longer thinks about.

### Output contract

The commands encode the discipline the skills teach: output-hygiene for
the patterns, the bootstrap skill's quiet-flag table for the flags. The
tool embodies them so agents inherit them for free.

- Quiet on success, loud on failure. `--quiet` on `git fetch`, `merge`,
  `push`, `checkout`, `pull`. On failure the real output prints; no flag
  may hide a warning or an error.
- One line per verdict, gh-pr-wait style. Exit codes carry the meaning.
- Structured reads only: `--json` with `--jq`, `git rev-list --count`,
  `git status --porcelain`. Never parse a human table.
- `NO_COLOR=1` in the environment of every captured command.
- Polling is bounded: `--interval` and `--timeout` flags, a 10-minute
  default.

### `ghb pr sync`

1. `git fetch --all --prune --quiet`
2. If `origin/<branch>` has commits local lacks — the human clicked Update
   Branch — `git reset --hard origin/<branch>`
3. Else `git merge origin/HEAD --quiet`; on conflict, print
   `git status --porcelain` and exit non-zero — agent judgment resolves
4. `git push --quiet`

Prints one line: `merged N commits`, `reset to remote`, or `up to date`.

### `ghb pr verify`

1. `git fetch --all --prune --quiet`
2. Currency: `git rev-list --left-right --count` against the base and the
   remote branch
3. PR state: `state`, `mergeable`, `mergeStateStatus` via
   `gh pr view --json`
4. Checks: poll `gh pr checks --json name,bucket` until every check is
   terminal — a TypeScript port of `gh-pr-wait.sh`, watching ALL checks,
   not just required ones. A check that has not queued yet is invisible
   to the list, so the state in step 3 gates too: mergeStateStatus turns
   CLEAN only when every rule is satisfied.

Prints one line per failed dimension. Exits 0 only when the PR is open,
current, mergeable, and every check passes.

## Package structure

Two workspaces: `ghb` (aggregator plus the pr commands) and
`ghb-secrets-sync`. Both publish. `ghb-merge` folds into `ghb`; it existed
to carry the AI deps, and those are gone.

## Migration, in order

The work runs in this order; each code step is its own PR. ghb was born
from an older template generation and is the family's last yarn holdout;
this is the re-adoption github and java-commons completed, plus a
workspace.

1. **Slim.** Delete ghb-merge, its deps, ai-engines.yml, the root
   `merge:*` scripts. Fold the two pr commands into packages/ghb.
   Tests stay green under yarn.
2. **Adopt.** Render the typescript variant from the template URL, per
   the update-contract design: `copier copy --trust
https://github.com/xenoterracide/base-template`. Managed files adopt;
   product files stay; seeded versions skip; `.rej` resolved by hand;
   lockfiles regenerate, never merge. Slim first — the render carries
   less surface after the deletions. Prerequisite: base-template's staged
   workflows gain `timeout-minutes: 5` first, so the render inherits the
   default.
3. **Adapt the workspace.** The template renders a single-package
   project; ghb is packages/*. After the render:
   - add `pnpm-workspace.yaml` listing `packages/*`
   - root scripts drive workspaces — lint, test, typecheck fan out
   - per-package scripts and deps stay package-owned
   - staged workflows need workspace-aware run commands when copied
   - a monorepo-aware template is a future base-template concern; ghb
     reconciles locally
4. **Cut over.** Delete `yarn.lock`, `.yarnrc.yml`, the PnP files.
   `contribute` re-points core.hooksPath from `.share/git/hooks` to
   `.config/git/hooks`; delete the old hooks dir. Update README.md,
   AGENTS.md, CONTRIBUTING.md for pnpm.
5. **Triage Renovate.** The render replaces the config. #578 died in the
   slim. #342, #515, #514, #550, #579 are superseded or rebased. #360 is
   unrelated feature work on its own track.
6. **Go green.** Every workflow runs pnpm and defaults to
   `timeout-minutes: 5` — more only where shown necessary; hooks no-op
   in CI; the full suite passes on the adopted tree.
7. **Install locally and beta test.** Build the CLI and link it into
   PATH — a bin symlink or a `pnpm deploy` plus `npm i -g`; the exact
   mechanism is proven during the step. Real merges on the family's
   repos run through the commands until they stop surprising. Fixes
   land as ordinary PRs.
8. **Publish.** Semver replaces the placeholder versions — manifests
   carry bare `1.0.0`, tag `v1.0.0`; the release workflow publishes
   with NPM_TOKEN. pnpm replaces `workspace:^` with real versions at
   publish.
9. **agent-skills.** After publish — the plugin is public, so the
   reference ships only once `npm i -g` works for everyone. The beta
   rides direct invocation.

## Publishing

The beta precedes all of this; nothing below runs until the local
install has carried real merges.

- Semver, not calver — calver fits what has no concept of a breaking
  change, where things just march on: templates, skills, internal
  tooling. ghb has a user API, so a break must signal. The tag carries
  the `v`; manifests carry the bare version.
- The user API is the commands: names, flags, output lines, exit codes.
  Breaking any of them is a major. The beta stabilizes it; the first
  npm release is `1.0.0`.
- Release workflow on tag push runs `pnpm publish`; `NPM_TOKEN` is a
  human-required secret.
- The scoped names are free on npm. The bare `ghb` is not — an
  unrelated GitHub CLI holds it, dormant since 2018 — so no squat stub
  publishes and the scoped name carries alone.

## agent-skills

One edit to `git-workflow/references/pull-request.md`:

- Routine sync is `ghb pr sync`
- PRs are born current: fetch and check develop immediately before
  `gh pr create`, and sync then
- Before the human's yes: `ghb pr verify`
- After it: the agent runs the squash merge itself, passing the PR's own
  title and body so the squash commit keeps the reviewed message
- Message writing and the human gate stay prose, unchanged

`gh-pr-wait.sh` stays in output-hygiene for non-merge watching. The poll
logic exists twice by design: shell for plugin portability, TypeScript
inside ghb. Its default timeout drops from 30 minutes to 10 and its skill
wording follows; no test pins the default. Both implementations treat a
head with no check runs yet as pending, not error — the window after a
push.

Version bump to `26.11.4` at PR time, per the repo's maintenance rule.

## Human-required

- `NPM_TOKEN` secret in ghb
- npm access to the `@xenoterracide` scope
- Approval of this design
- The usual per-PR merge approvals

## Decisions already made

- No SDK, no engine flags: the agent calls ghb; ghb calls no AI
- No submodule handling
- No `pr message`, no `--dry-run`, no `pr merge` — the agent runs the
  squash merge after the human's yes
- Checks watched are all checks, always
- `pr sync` always pushes; a current branch is a no-op
- Quiet by default; failures print their real output
- Local install and a beta precede the npm release
- Semver, not calver: the commands are a user API, and breaking one is
  a major
- New workflows default to a five-minute timeout; the check watch
  defaults to ten; more is allowed only where shown necessary, and the
  showing is project-specific
