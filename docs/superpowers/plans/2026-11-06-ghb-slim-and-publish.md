<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# ghb Slim and Publish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Slim ghb to two agent commands (`pr sync`, `pr verify`), adopt base-template, beta the CLI locally on real merges, publish `1.0.0` on semver, and leave ghb born inside the automatic template-update loop.

**Architecture:** The engine layer dies; the useful flow is rewritten as two clipanion commands in `packages/ghb`, following the secrets-sync structure: an injectable runner, tests over scripted argv. The ladder runs slim under yarn, template prerequisites first, then one migration PR that adopts, adapts, and cuts over to pnpm — one PR because the render drops yarn's `workspaces` field and CI must flip to pnpm at the same boundary. The update loop (Renovate's copier manager on template tags) is wired into base-template before ghb adopts, so ghb's updates arrive as automatic PRs from day one.

**Tech Stack:** TypeScript 6, clipanion 4, vitest 4; yarn 4 until the cutover, pnpm 12 / node 26 after; copier 9; `gh` and `git` as subprocesses via `execFileSync`.

**Spec:** `docs/superpowers/specs/2026-11-06-ghb-slim-and-publish.md`. Adoption rules: `/home/ai/base-template/docs/superpowers/specs/2026-11-05-update-contract-design.md` and `/home/ai/base-template/docs/superpowers/specs/2026-11-04-revive-source-of-truth-design.md`.

## Global Constraints

- ghb calls no AI: no SDK, no engines, no engine docs
- No `pr message`, no `--dry-run`, no `pr merge`, no submodule handling
- All checks are watched, always; a head with no check runs is pending, not error
- `pr sync` always pushes; a current branch is a no-op
- Quiet on success, loud on failure; no flag may hide a warning or an error
- `NO_COLOR=1` in the environment of every captured command
- Structured reads only: `--json` + `--jq`, `rev-list --count`, `status --porcelain`
- Polling is bounded: `--interval` and `--timeout` flags, 10-minute default
- Exit 0 only when the PR is open, current, mergeable, and every check passes
- New workflows default `timeout-minutes: 5`; more only where shown necessary
- Semver, not calver; first npm release `1.0.0`; bare `ghb` is taken, scoped names only
- Conventional commits; squash merge; never force push
- SPDX header on every file; JSON is licensed by REUSE.toml annotation, never a `.license` companion
- `execFileSync` with argv arrays, never shell strings; secret values via stdin, never argv
- Versions are seeds: `.tool-versions` and the Maven wrapper skip on update; lockfiles regenerate, never merge
- Managed files adopt, product files stay, `.rej` resolves by hand
- PRs are born current: fetch and check develop immediately before `gh pr create`
- Local install and a beta precede npm; agent-skills edits follow publish

## Review Focus

1. A required check that has not queued yet is invisible to `gh pr checks` — verify gates on `mergeStateStatus` too, and fails without polling. Test: Task 3, "state gates before checks".
2. A runless head right after a push makes `gh pr checks` error — pending until timeout, never an immediate fail. Test: Task 3, "runless head is pending".
3. `gh pr checks --json` exits 0 even when checks fail — the bucket field carries the verdict, not the exit code. Test: Task 3, "checks fail despite exit 0".
4. Remote branch moved while local holds unpushed commits — sync refuses loudly; `reset --hard` only ever discards a strictly-behind local. Test: Task 2, "diverged refuses reset".
5. A merge conflict mid-sync — print `git status --porcelain`, exit non-zero, leave nothing silent. Test: Task 2, "conflict prints porcelain".

## File Map

- Create: `packages/ghb/src/exec.ts`, `packages/ghb/src/commands/pr-sync.ts`, `packages/ghb/src/commands/pr-verify.ts`, `packages/ghb/test/exec.test.ts`, `packages/ghb/test/commands/pr-sync.test.ts`, `packages/ghb/test/commands/pr-verify.test.ts`
- Modify: `packages/ghb/src/cli.ts`, `packages/ghb/test/cli.test.ts`, `packages/ghb/package.json`, root `package.json`, `README.md`, `packages/ghb/README.md`, `AGENTS.md`, `CONTRIBUTING.md`
- Delete: `packages/ghb-merge/` (17 files), `.github/workflows/ai-engines.yml`, seven `*.license` companions in ghb
- base-template (Tasks 5–7): `copier.yml`, `.lintstagedrc.cjs`, `REUSE.toml(.jinja)`, `package.json.jinja`, `.github/renovate.json5.jinja`, `staged/.github/workflows/*.jinja`, three active workflows, `package.json.license`

Every task below names its repo. Each PR is born current and merges only on the human's explicit yes.

---

### Task 1: Delete the engine layer

**Repo:** ghb. Lands in the slim PR.

**Files:**

- Delete: `packages/ghb-merge/` (whole tree, 17 files)
- Delete: `.github/workflows/ai-engines.yml`
- Modify: root `package.json` (drop `merge:copilot`, `merge:junie`, `merge:kimi`)
- Modify: `packages/ghb/package.json` (drop `@xenoterracide/ghb-merge` dependency)
- Modify: `packages/ghb/src/cli.ts`, `packages/ghb/test/cli.test.ts`

**Interfaces:**

- Produces: `createCli()` registering exactly three commands — `secrets sync`, `secrets update`, `secrets get` — until Tasks 2–3 add the pr commands

- [ ] **Step 1: Update `packages/ghb/test/cli.test.ts` to the post-deletion truth**

Registration assertions become the three secrets commands; count `3`. Delete the `pr merge --help` test (the `--kimi` assertion dies with it).

- [ ] **Step 2: Run the suite to verify it fails**

Run: `yarn workspace @xenoterracide/ghb test`
Expected: FAIL — `cli.ts` still imports `@xenoterracide/ghb-merge`.

- [ ] **Step 3: Delete the layer**

`git rm -r packages/ghb-merge .github/workflows/ai-engines.yml`. In `cli.ts`, drop the `MergeCommand`/`PrMessageCommand` import and registrations. Drop the three `merge:*` scripts and the `ghb-merge` dependency.

- [ ] **Step 4: Run the full check**

Run: `yarn check`
Expected: PASS — eslint, typecheck, tests, reuse all green under yarn.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat!: delete the engine layer"
```

### Task 2: `ghb pr sync` and the shared exec runner

**Repo:** ghb. Lands in the slim PR.

**Files:**

- Create: `packages/ghb/src/exec.ts`, `packages/ghb/src/commands/pr-sync.ts`
- Test: `packages/ghb/test/exec.test.ts`, `packages/ghb/test/commands/pr-sync.test.ts`
- Modify: `packages/ghb/src/cli.ts` (register), `packages/ghb/test/cli.test.ts` (expect `ghb pr sync`)

**Interfaces:**

- Produces: `export type Runner = (cmd: "git" | "gh", args: string[]) => string;` and `export const execRunner: Runner` — `execFileSync` with argv arrays, `NO_COLOR: "1"` merged into `env`, `encoding: "utf8"`; on a thrown child error it prints the child's real `stderr` (fallback `stdout`, fallback `message`) to stderr, then rethrows — loud on failure, silent on success
- Produces: `export class PrSyncCommand extends Command` with `static paths = [["pr", "sync"]]`, optional `public runner?: Runner` for tests, `execute(): Promise<number>`

`PrSyncCommand` behavior, in order: `git fetch --all --prune --quiet`; `git branch --show-current`; `git rev-list --count HEAD..origin/<branch>` and `...origin/<branch>..HEAD`. Remote ahead and local ahead → print `diverged: local N ahead, remote M ahead` to stderr, exit 1 — never `reset --hard` away unpushed work. Remote ahead only → `git reset --hard origin/<branch>`, print `reset to remote`. Else `git rev-list --count HEAD..origin/HEAD`: `N > 0` → `git merge origin/HEAD --quiet`, print `merged N commits`; on conflict print the output of `git status --porcelain` and exit 1; `N = 0` → print `up to date`. Always `git push --quiet` last. Exactly one line on success; exit 0.

- [ ] **Step 1: Write the failing exec test**

`execRunner("git", ["--invalid-flag"])` throws, and the printed stderr contains git's real error output (Review Focus 5's contract, at the runner level). One real child process; no mocking.

- [ ] **Step 2: Write the failing sync tests**

Fake runner: records `${cmd} ${args.join(" ")}` per call, returns queued responses, supports a `throw` sentinel. Cases:

1. behind develop by 2 → exit 0, stdout exactly `merged 2 commits`, calls include `git merge origin/HEAD --quiet` and `git push --quiet`
2. nothing to do → exit 0, stdout `up to date`, `git push --quiet` still called
3. remote branch ahead, local clean → `git reset --hard origin/topic` called, stdout `reset to remote`, exit 0
4. remote ahead 3 and local ahead 1 → exit 1, stderr names both counts, no reset call (Review Focus 4)
5. merge throws → status stub returns `UU src/file.ts` → exit 1, stdout contains `UU src/file.ts` (Review Focus 5)

- [ ] **Step 3: Run to verify fail**

Run: `yarn workspace @xenoterracide/ghb test`
Expected: FAIL — `exec.js` and `pr-sync.js` not found.

- [ ] **Step 4: Implement `exec.ts` and `PrSyncCommand`**

Clipanion shape mirrors `SyncCommand` in `packages/ghb-secrets-sync/src/commands/sync.ts`. One line per verdict, through `console.log`/`console.error`.

- [ ] **Step 5: Run to verify pass**

Run: `yarn check`
Expected: PASS, including the new `ghb pr sync` registration assertions.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat: add ghb pr sync"
```

### Task 3: `ghb pr verify`

**Repo:** ghb. Lands in the slim PR.

**Files:**

- Create: `packages/ghb/src/commands/pr-verify.ts`
- Test: `packages/ghb/test/commands/pr-verify.test.ts`
- Modify: `packages/ghb/src/cli.ts`, `packages/ghb/test/cli.test.ts`

**Interfaces:**

- Consumes: `Runner`, `execRunner` from Task 2
- Produces: `export class PrVerifyCommand extends Command`, `static paths = [["pr", "verify"]]`, flags `--interval SECONDS` (default 10) and `--timeout SECONDS` (default 600), remaining args forwarded to `gh pr checks`, optional `runner`, `execute(): Promise<number>`

Behavior, in order: `git fetch --all --prune --quiet`; `gh pr view --json state,mergeable,mergeStateStatus,baseRefName,headRefName` — a failing view is a hard fail: print gh's stderr, exit 1. Currency: `git rev-list --left-right --count origin/<base>...HEAD` → left > 0 prints `behind base by N commits`; `HEAD...origin/<head>` nonzero either side prints `diverged from origin/<head>`. State: not `OPEN` → `state: X`; not `MERGEABLE` → `mergeable: X`; not `CLEAN` → `mergeStateStatus: X`. Any currency or state failure prints its lines and exits 1 **without polling** — state gates first because an unqueued required check is invisible to `gh pr checks`, and `CLEAN` is what proves the rules satisfied. Only then poll `gh pr checks --json name,bucket`: a gh error or empty render means runless head → pending; any `fail`/`cancel` bucket → print `fail: <names>`, exit 1; any `pending` bucket → sleep `--interval` seconds, re-poll; past `--timeout` → print `pending after Xm: <names>`, exit 2. All pass → print `pass`, exit 0. The rendered buckets carry the verdict — `gh pr checks` exits 0 in JSON mode even when checks fail.

- [ ] **Step 1: Write the failing tests**

Same fake-runner pattern plus a queue that varies per poll. Cases:

1. all green — view JSON `OPEN/MERGEABLE/CLEAN`, counts `0\t1` and `0\t0`, checks all `pass` buckets → exit 0, stdout exactly `pass`
2. behind base 3 → exit 1, line `behind base by 3 commits`, no `gh pr checks` call recorded
3. `mergeStateStatus: DIRTY` → exit 1, that line, no polling (Review Focus 1)
4. checks JSON contains a `fail` bucket → exit 1, `fail: <name>`, despite gh exiting 0 (Review Focus 3)
5. first two polls throw (runless head), `--interval 0 --timeout 0` → exit 2, `pending after 0m` (Review Focus 2)
6. first poll `pending`, second all `pass`, `--interval 0` → exit 0, `pass`
7. `HEAD...origin/<head>` returns `1\t0` → exit 1, `diverged from origin/topic`

- [ ] **Step 2: Run to verify fail → implement → verify pass**

Run: `yarn check`
Expected: FAIL first, PASS after.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: add ghb pr verify"
```

### Task 4: Docs, then the slim PR

**Repo:** ghb. Completes the slim PR.

**Files:**

- Modify: `README.md`, `packages/ghb/README.md`, `AGENTS.md`, `CONTRIBUTING.md`

- [ ] **Step 1: Scrub and document**

Run: `grep -rniE 'kimi|junie|copilot|ai-engines|ghb-merge|pr merge|pr message' README.md packages/ghb/README.md AGENTS.md CONTRIBUTING.md`

Remove every hit. Document `pr sync` and `pr verify`: one line each on what they do, their one-line outputs, and the exit codes. `ghb-secrets-sync` docs untouched. The full pnpm rewrite is Task 10's; only dead references die here.

- [ ] **Step 2: Verify, commit, open the PR**

Run: `yarn check` — PASS. Commit: `docs: scrub the engine references`. Then fetch, confirm `git rev-list --count HEAD..origin/develop` is 0, and `gh pr create` — born current. Title: `feat!: slim ghb to pr sync and pr verify`. Settle runs by the pushed head SHA (`gh api repos/xenoterracide/ghb/commits/<sha>/check-runs --jq .total_count`), then `gh-pr-wait.sh`. Merge on the human's yes.

### Task 5: Staged and active workflow timeouts

**Repo:** base-template. Its own PR; prerequisite for ghb's render.

**Files:**

- Modify: `staged/.github/workflows/devtools-regression.yml.jinja`, `staged/.github/workflows/{% if template_type != 'config' %}test.yml{% endif %}.jinja`, `staged/.github/workflows/{% if use_opencode %}opencode.yml{% endif %}.jinja`, `staged/.github/workflows/pre-commit.yml.jinja`
- Modify: `.github/workflows/devtools-regression.yml`, `.github/workflows/pre-commit.yml`, `.github/workflows/opencode.yml`

- [ ] **Step 1: Add `timeout-minutes: 5` to every job in all seven files**

`test-template.yml` already carries 5 (#286). For the three active workflows, gather the showing first: `gh run list` durations; the PR body records the worst observed job.

- [ ] **Step 2: Verify and PR**

Template CI (`test-template` renders all variants) green. Commit: `ci: default every workflow to a five-minute timeout`. Standard watch and merge flow.

### Task 6: License companions die, REUSE.toml carries JSON

**Repo:** base-template. Its own PR.

**Files:**

- Modify: `.lintstagedrc.cjs`, `REUSE.toml`, `REUSE.toml.jinja`, `copier.yml`
- Delete: `package.json.license`

- [ ] **Step 1: lint-staged stops annotating JSON**

The `"!(package).json"` and `"package.json"` rules keep prettier, drop the `reuse annotate` command. Comment: JSON cannot carry headers; its licensing lives in REUSE.toml; companions confused agents and regenerate even when REUSE.toml covers the file.

- [ ] **Step 2: REUSE.toml(.jinja) gains the JSON annotations**

`**/package.json` → `SPDX-License-Identifier = "MIT"`, copyright `Copyright © 2026 Caleb Cushing`; `**/tsconfig*.json` → `CC0-1.0`, `SPDX-FileCopyrightText = "NONE"`. Same blocks in the `.jinja` so consumers inherit. Delete the authoring `package.json.license` and the `package.json.license` entry in `_exclude`.

- [ ] **Step 3: Verify and PR**

Run: `uv run --group dev reuse lint` — PASS. `pnpm lint:prettier` — PASS. Commit: `build: license JSON via REUSE.toml, not companion files`

### Task 7: Wire the update loop — Option A

**Repo:** base-template. Its own PR.

**Files:**

- Modify: `copier.yml` (delete `_tasks`), `package.json.jinja` (contribute), `.github/renovate.json5.jinja`

- [ ] **Step 1: Delete `_tasks` from `copier.yml`**

The hosted Renovate app never runs trusted tasks, so `_tasks` blocks its copier manager entirely. Comment that reason at the deletion site.

- [ ] **Step 2: Give `reuse download --all` a home**

The dropped task populated `LICENSES/` on fresh copies. `contribute` in `package.json.jinja` gains it (idempotent), so a fresh render passes `reuse lint` after setup.

- [ ] **Step 3: Enable the copier manager for consumers in `renovate.json5.jinja`**

`copier` manager enabled; a package rule pins `matchManagers: ["copier"]` with `automerge: false` — update PRs can carry `.rej`, so they merge by hand until clean updates are the norm. The copier manager tracks tags; answers files already point at `v26.11.0`.

- [ ] **Step 4: Verify and PR**

Template CI green (a fresh render still passes `verify.sh`: the prettier task is gone, so confirm the render is formatted and `reuse lint` passes after contribute). Commit: `feat: wire updates through Renovate's copier manager`

### Task 8: Tag v26.11.1

**Repo:** base-template. Human gates the tag push; also re-enable tag-deletion protection (turned off for the orphan cleanup).

- [ ] **Step 1: Tag and push on the human's yes**

Tasks 5–7 merged. `git tag v26.11.1 && git push origin v26.11.1`. Pep440-shaped calver keeps Renovate's default versioning working.

### Task 9: Bootstrap github, then java-commons

**Repo:** github first, then java-commons. One PR each; the last manual updates these repos ever take.

- [ ] **Step 1: github — `copier update` to v26.11.1**

`uv run --project /home/ai/base-template --group dev copier update` in the consumer. Resolve `.rej` by hand; managed files adopt, versions skip, the lockfile regenerates. Delete `package.json.license` (now annotation-covered). Copy any staged workflow changes active. PR, watch, merge on the human's yes.

- [ ] **Step 2: java-commons — same flow, its own pace**

Its update drags the prettier v4 reformat, so expect a larger diff. Same rules.

### Task 10: Adopt, adapt, cut over — one migration PR

**Repo:** ghb. Steps 2–4 of the design's ladder land as one PR: the render drops the `workspaces` field for `pnpm-workspace.yaml`, so yarn dies at the render's edge and CI must flip in the same boundary.

**Files:** the whole render plus the deletions below.

- [ ] **Step 1: Seed answers and render**

Seed `.copier-answers.yml`: `_commit: v26.11.1`, `_src_path: https://github.com/xenoterracide/base-template`, `template_type: typescript`, `project_name: ghb`, `project_title: ghb`, `license: GPL-3.0-or-later`, `include_skeleton: false`, `use_opencode: true`, `ts_scope: "@xenoterracide"`. Run `copier update` from the authoring env.

- [ ] **Step 2: Resolve the render**

`.rej` by hand; managed files adopt; product files stay; `.tool-versions` and lockfiles skip — set `.tool-versions` to the family toolchain (nodejs 26.13.0, pnpm 12.16.1, python 3.15.2; drop the yarn line). Delete ghb's seven `*.license` companions. Copy staged workflows to `.github/workflows/` (the PAT carries workflow scope).

- [ ] **Step 3: Adapt the workspace**

`pnpm-workspace.yaml` lists `packages/*`. Root scripts fan out (`pnpm -r run`), per-package scripts and deps stay package-owned, root `package.json` stays private and unscoped. Reconcile the root `vitest.config.ts` with the per-package configs.

- [ ] **Step 4: Cut over**

Delete `yarn.lock`, `.yarnrc.yml`, `.pnp.cjs`, `.pnp.loader.mjs`, `.yarn/`, `.share/`. `contribute` (from the render) points `core.hooksPath` at `.config/git/hooks`. Rewrite `README.md`, `AGENTS.md`, `CONTRIBUTING.md` for pnpm, sources-of-truth table style.

- [ ] **Step 5: Go green**

`pnpm install` regenerates the lockfile; `pnpm check`-equivalent green; `reuse lint` green — a surviving unannotated file gets reconciled then. CI green with the 5-minute defaults; hooks no-op in CI. Triage Renovate live: close #578 (dead in the slim), rebase or supersede #342/#515/#514/#550/#579, leave #360 alone. Commit: `feat!: adopt base-template and cut over to pnpm`. Standard watch and merge flow.

### Task 11: Install locally and beta

**Repo:** ghb. No PR of its own; fixes land as ordinary PRs.

- [ ] **Step 1: Put the CLI on PATH**

`pnpm build`, then a bin symlink or `pnpm deploy` + `npm i -g` — prove the mechanism in this step; `ghb pr sync --help` answers from any directory.

- [ ] **Step 2: Beta on real merges**

Family repos' merges run through `ghb pr sync` and `ghb pr verify` until they stop surprising. Both race lessons get exercised for real: born-current before `gh pr create`, runless-head-as-pending after a push.

### Task 12: Prove the loop on ghb

**Repo:** base-template + ghb. The automation proof.

- [ ] **Step 1: Cut a trivial template change, tag `v26.11.2`**

A docs tweak suffices; the tag is the event. Human gates the tag push.

- [ ] **Step 2: Watch Renovate open the update PRs with no intervention**

Expect automatic PRs in github and ghb (java-commons once bootstrapped). Resolve `.rej` if any appear, standard watch and merge flow. If no PR arrives within a day, diagnose before touching anything by hand — the loop is the deliverable.

### Task 13: Decide the name and the license

**Human decisions.** Both windows close at first publish.

- Name: before it, a rename is nearly free; after it, the name is API and only deprecate-and-redirect remains. Beta runs under any name.
- License: the project is GPL-3.0-or-later today; the file scheme (MIT for `package.json` and scripts, CC0-1.0 configuration, CC-BY-NC-SA-4.0 docs) is independent of it. A change is the sole holder's to make and awaits investigation. Published versions keep the license they shipped under, so the clean moment is before `v1.0.0`. The adoption (Task 10) renders today's GPL answer; a decision to change updates it before publish, not after.

### Task 14: Publish

**Repo:** ghb. Human-required first: `NPM_TOKEN` secret, npm access to `@xenoterracide`.

- [ ] **Step 1: Set bare `1.0.0` in both package manifests; tag `v1.0.0`; release workflow publishes**

The release workflow is ghb-local product (the template ships no npm-publish workflow): on `v*` tag push, build and `pnpm publish -r` with `NPM_TOKEN`. pnpm replaces `workspace:^` with real versions at publish. The tag push waits for the human's yes.

### Task 15: agent-skills

**Repo:** agent-skills. After publish only — the plugin is public, so the reference ships only once `npm i -g` works for everyone.

- [ ] **Step 1: Edit `skills/git-workflow/references/pull-request.md`**

Routine sync is `ghb pr sync`; PRs are born current (fetch and check develop immediately before `gh pr create`, sync then); before the human's yes, `ghb pr verify`; after it, the agent runs the squash merge itself, passing the PR's own title and body. Message writing and the human gate stay prose.

- [ ] **Step 2: `gh-pr-wait.sh` default timeout 1800 → 600, runless head treated as pending**

The poll logic exists twice by design: shell for plugin portability, TypeScript inside ghb. No test pins the default. Version bump to `26.11.4` at PR time.

### Task 16: Delete this plan

Family convention: completed plans die before the final PR.

- [ ] **Step 1:** `git rm docs/superpowers/plans/2026-11-06-ghb-slim-and-publish.md` in the last ghb PR.

---

## Parallel chores, any time after Task 6

- agent-skills: `timeout-minutes: 5` on its three workflows, evidence in each PR body
- java-commons: same for its workflow set
- agent-skills: replace its own JSON companions (`mcp.json.license`, `opencode.json.license`, `tsconfig*.json.license`, others) with REUSE.toml annotations — same pattern as Task 6

## Human-required

- `NPM_TOKEN` secret in ghb; npm access to the `@xenoterracide` scope
- Tag pushes: `v26.11.1`, `v26.11.2`, `v1.0.0`
- Re-enable tag-deletion protection on base-template
- The name and license decisions (Task 13)
- The usual per-PR merge approvals
