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

### `ghb pr sync`

1. `git fetch --all --prune`
2. If `origin/<branch>` has commits local lacks — the human clicked Update
   Branch — `git reset --hard origin/<branch>`
3. Else `git merge origin/HEAD`; conflicts fail loudly and stop for agent
   judgment
4. `git push`

Prints one line: `merged N commits`, `reset to remote`, or `up to date`.

### `ghb pr verify`

1. `git fetch --all --prune`
2. Currency: ahead/behind counts against the base and the remote branch
3. PR state: `state`, `mergeable`, `mergeStateStatus` via `gh pr view`
4. Checks: poll `gh pr checks --json name,bucket` until every check is
   terminal — a TypeScript port of `gh-pr-wait.sh`, watching ALL checks,
   not just required ones

Prints one line per failed dimension. Exits 0 only when the PR is open,
current, mergeable, and every check passes.

### `ghb pr merge`

1. Runs verify; any failure stops here
2. Pulls subject and body from the PR so the squash commit keeps the
   reviewed message
3. `gh pr merge --squash --delete-branch`
4. Checks out the default branch and pulls

A TTY prompts Y/n — humans merging by hand keep a gate. `--yes` skips it
for agents acting on the human's explicit yes. No TTY and no `--yes`
aborts, as before.

## Package structure

Two workspaces: `ghb` (aggregator plus the pr commands) and
`ghb-secrets-sync`. Both publish. `ghb-merge` folds into `ghb`; it existed
to carry the AI deps, and those are gone.

## Template adoption

Render the typescript variant from the template URL, per the update-contract
design in base-template:

- `copier copy --trust https://github.com/xenoterracide/base-template`
- Managed files adopt; product files stay; seeded versions skip
- `.rej` files resolved by hand
- Lockfiles regenerate; they are never merged
- `yarn.lock`, `.yarnrc.yml`, and PnP files delete; pnpm renders fresh
- The staged workflow copy into `.github/workflows/` the agent can run

Order matters: slim first, adopt second. Adoption carries less surface
after the deletions, and `cleanNodeOptions` dies with the PnP runtime it
worked around.

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
inside ghb.

Version bump to `26.11.4` at PR time, per the repo's maintenance rule.

## Order of work

1. Slim ghb — deletions, fold, three commands, tests green under yarn
2. Adopt base-template — pnpm, toolchain, staged workflows
3. Publish — token, release workflow, tag
4. agent-skills — reference edit, version bump

Each step is its own PR. Renovate #342, #515, #514, #550, and #579 are
superseded or rebased by adoption. #360 is unrelated feature work and
stays on its own track.

## Human-required

- `NPM_TOKEN` secret in ghb
- npm access to the `@xenoterracide` scope
- Approval of this design
- The usual per-PR merge approvals

## Decisions already made

- No AI anything in ghb: the agent is the model
- No submodule handling
- No `pr message`, no `--dry-run`
- Checks watched are all checks, always
- `pr sync` always pushes; a current branch is a no-op
