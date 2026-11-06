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
branch, verify currency and state, watch checks, execute the squash. Those
steps belong in the tool. The tool belongs on npm, so any agent on any
machine can run it.

## Decision

Slim ghb, adopt base-template, publish to npm, then point agent-skills at
the commands. Chosen over bridge scripts in agent-skills (throwaway code)
and deferred publish (the skill reference stays machine-specific until the
package exists). Publishing is what makes the skill reference portable:
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

`packages/ghb-merge` is deleted. Its useful flow is rewritten as three
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
   not just required ones

Prints one line per failed dimension. Exits 0 only when the PR is open,
current, mergeable, and every check passes.

### `ghb pr merge`

1. Runs verify; any failure stops here
2. Pulls subject and body via `gh pr view --json` so the squash commit
   keeps the reviewed message
3. `gh pr merge --squash --delete-branch`
4. `git checkout <default> --quiet` and `git pull --quiet`

A TTY prompts Y/n — humans merging by hand keep a gate. `--yes` skips it
for agents acting on the human's explicit yes. No TTY and no `--yes`
aborts, as before.

## Package structure

Two workspaces: `ghb` (aggregator plus the pr commands) and
`ghb-secrets-sync`. Both publish. `ghb-merge` folds into `ghb`; it existed
to carry the AI deps, and those are gone.

## Migration, in order

Every step lands before publish. Each is its own PR. ghb was born from an
older template generation and is the family's last yarn holdout; this is
the re-adoption github and java-commons completed, plus a workspace.

1. **Slim.** Delete ghb-merge, its deps, ai-engines.yml, the root
   `merge:*` scripts. Fold the three pr commands into packages/ghb.
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
7. **Publish.** Manifests carry bare `26.11.0`; tag `v26.11.0`; the
   release workflow publishes with NPM_TOKEN. pnpm replaces `workspace:^`
   with real versions at publish.
8. **agent-skills.** After publish — the reference is only truthful once
   the package installs.

## Publishing

- Calver, matching the family: tag `vYY.MM.micro`, bare in manifests. First
  release `26.11.0`.
- Release workflow on tag push runs `pnpm publish`; `NPM_TOKEN` is a
  human-required secret.
- Both names are free on npm today (`@xenoterracide/ghb` returns 404).

## agent-skills

One edit to `git-workflow/references/pull-request.md`:

- Routine sync is `ghb pr sync`
- After the human's yes: `ghb pr verify`, then `ghb pr merge`
- Message writing and the human gate stay prose, unchanged

`gh-pr-wait.sh` stays in output-hygiene for non-merge watching. The poll
logic exists twice by design: shell for plugin portability, TypeScript
inside ghb. Its default timeout drops from 30 minutes to 10 and its skill
wording follows; no test pins the default.

Version bump to `26.11.4` at PR time, per the repo's maintenance rule.

## Human-required

- `NPM_TOKEN` secret in ghb
- npm access to the `@xenoterracide` scope
- Approval of this design
- The usual per-PR merge approvals

## Decisions already made

- No SDK, no engine flags: the agent calls ghb; ghb calls no AI
- No submodule handling
- No `pr message`, no `--dry-run`
- Checks watched are all checks, always
- `pr sync` always pushes; a current branch is a no-op
- Quiet by default; failures print their real output
- New workflows default to a five-minute timeout; the check watch
  defaults to ten; more is allowed only where shown necessary, and the
  showing is project-specific
