<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# pr verify remote-only Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `ghb pr verify` checks the PR on GitHub without depending on the checked-out branch, so a selector works from any worktree.

**Architecture:** Add the PR head SHA to the existing `gh pr view` read. Use that SHA as the subject of the base-freshness gate. Delete the local head-currency gate and its messages. Keep the poll, mergeability, and check-state logic unchanged.

**Tech Stack:** TypeScript, clipanion, vitest, `gh` CLI through the existing `execRunner`.

**Spec:** `docs/superpowers/specs/2026-11-19-pr-verify-remote-only-design.md`

## Global Constraints

- Conventional commits per `git-conventional-commits.yaml`; allowed types include `feat`, `fix`, `test`, `docs`, `refactor`.
- SPDX headers on every file; `lint-staged` adds them on commit — do not remove the ones present.
- Shell safety: only `execRunner` spawns subprocesses, with argv arrays; no new spawn paths.
- Structured reads only: `--json`; never parse a human table.
- Exit codes stay 0, 1, 2 with the current meanings; no new flags.
- Commands run from the repo root: targeted tests `pnpm vitest run packages/ghb-pr`, package typecheck `pnpm --filter @xenoterracide/ghb-pr typecheck`, full gate `pnpm check`.
- Tick each checkbox when its step completes; the committed plan is the completion record.

## Review Focus

Input classes the spec implies but no current test exercises; each is pinned to its owning task.

1. A selector used from a branch unrelated to the PR — no `HEAD` comparison may run, and the base gate must use the PR head SHA. Test: Task 2.
2. A local branch ahead of, behind, or diverged from its remote — none of those may fail verify. Test: Task 2.
3. `headRefOid` missing from the view — the field must be requested and carried in test fixtures so a missing value cannot silently become a git ref named `undefined`. Test: Task 1.
4. Currency re-check after a long poll must use the fresh view's head SHA. Test: Task 3.
5. User-facing copy must stop promising to verify "the current PR" as a checkout-local operation. Test: Task 4.

---

### Task 1: Carry the PR head SHA through the view

**Files:**

- Modify: `packages/ghb-pr/src/pr-gates.ts` (`PrView`, `readView`)
- Modify: `packages/ghb-pr/test/commands/pr-verify-support.ts` (`ViewSpec`, `view`)
- Test: `packages/ghb-pr/test/commands/pr-verify.test.ts`

**Interfaces:**

- Consumes: nothing new.
- Produces (later tasks rely on these exact names):
  - `PrView.headRefOid: string`
  - `view({ headRefOid?: string })` in the test helper, defaulting to `"abc123"`

- [ ] **Step 1: Write the failing test**

Add to `packages/ghb-pr/test/commands/pr-verify.test.ts`:

```ts
it("requests the PR head SHA from gh", async () => {
  const { exit, calls } = await runVerify(passingCycle);

  expect(exit).toBe(0);
  expect(calls).toContain(
    "gh pr view --json state,mergeable,mergeStateStatus,baseRefName,headRefName,headRefOid,statusCheckRollup",
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/ghb-pr/test/commands/pr-verify.test.ts`
Expected: FAIL on the `toContain` assertion; the call lacks `headRefOid`.

- [ ] **Step 3: Implement the view field**

In `packages/ghb-pr/src/pr-gates.ts`:

- Add `headRefOid: string` to `PrView`.
- Add `headRefOid` to the `gh pr view --json` field list in `readView`, between `headRefName` and `statusCheckRollup`.

In `packages/ghb-pr/test/commands/pr-verify-support.ts`:

- Add `headRefOid?: string` to `ViewSpec`.
- Emit `headRefOid: spec.headRefOid ?? "abc123"` from `view()`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run packages/ghb-pr/test/commands/pr-verify.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ghb-pr/src/pr-gates.ts packages/ghb-pr/test/commands/pr-verify-support.ts packages/ghb-pr/test/commands/pr-verify.test.ts
git commit -m "feat(pr): read the PR head SHA during verify"
```

### Task 2: Make the currency gate remote-only

**Files:**

- Modify: `packages/ghb-pr/src/pr-gates.ts` (`baseCurrency`, `headCurrency`, `currencyFailures`)
- Test: `packages/ghb-pr/test/commands/pr-verify.test.ts`

**Interfaces:**

- Consumes: `PrView.headRefOid: string` from Task 1.
- Produces: `currencyFailures(run: Runner, view: PrView): string[]`, returning only base failures.

- [ ] **Step 1: Write the failing tests**

Replace the three local-head tests in `packages/ghb-pr/test/commands/pr-verify.test.ts` (currently "fails when local is ahead of the remote head", "fails when local is behind the remote head", "fails when local has diverged from the remote head") with:

```ts
it("compares the base with the PR head SHA, not HEAD", async () => {
  const { exit, errors, calls } = await runVerify(["", view({ rollup: passingRollup, headRefOid: "abc123" }), "0\t1"]);

  expect(exit).toBe(0);
  expect(errors).toEqual([]);
  expect(calls).toContain("git rev-list --left-right --count origin/develop...abc123");
  expect(calls.some((call) => call.includes("HEAD"))).toBe(false);
});

it("fails behind base using the PR head SHA", async () => {
  const { exit, errors, calls } = await runVerify(["", view({ rollup: passingRollup, headRefOid: "abc123" }), "3\t0"]);

  expect(exit).toBe(1);
  expect(errors.join("\n")).toContain("behind base by 3 commits");
  expect(calls).toContain("git rev-list --left-right --count origin/develop...abc123");
});
```

Update the existing "fails behind base without polling checks" script to `["", view({ rollup: passingRollup }), "3\t0"]`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/ghb-pr/test/commands/pr-verify.test.ts`
Expected: FAIL. The command still makes a second `rev-list` call against `HEAD`.

- [ ] **Step 3: Implement the remote-only gate**

In `packages/ghb-pr/src/pr-gates.ts`:

- Change `baseCurrency` to compare `origin/${view.baseRefName}...${view.headRefOid}`.
- Delete `headCurrency`.
- Make `currencyFailures` return `baseCurrency(run, view)` only.

Do not change the failure message `behind base by N commits`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/ghb-pr/test/commands/pr-verify.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ghb-pr/src/pr-gates.ts packages/ghb-pr/test/commands/pr-verify.test.ts
git commit -m "fix(pr): verify currency against the PR head"
```

### Task 3: Update the fake runner scripts

**Files:**

- Modify: `packages/ghb-pr/test/commands/pr-verify.test.ts`
- Modify: `packages/ghb-pr/test/commands/pr-verify-poll.test.ts`
- Modify: `packages/ghb-pr/test/commands/pr-verify-poll-grace.test.ts`
- Modify: `packages/ghb-pr/test/commands/pr-verify-support.ts` (`realGreenRunner`)

**Interfaces:**

- Consumes: `currencyFailures` from Task 2, which now performs one `rev-list` read per currency check.
- Produces: no new interface.

- [ ] **Step 1: Remove the stale head-currency script values**

In the three test files, delete the second `rev-list` result from each currency pair. Every pair has the form `"0\t1", "0\t0",`; keep `"0\t1",`. In `currencyRecheck`, delete the `"0\t0"` immediately after its first `"0\t1"`, and keep `"1\t0"` as the fresh base result.

In `packages/ghb-pr/test/commands/pr-verify-poll.test.ts`, change the second `view(...)` in `currencyRecheck` to `view({ rollup: passingRollup, headRefOid: "def456" })`. In its test "re-checks currency before passing", capture `calls` from `runVerify` and assert it contains `git rev-list --left-right --count origin/develop...def456`.

In `packages/ghb-pr/test/commands/pr-verify-support.ts`, change `realGreenRunner` so its `rev-list` branch returns `"0\t1"` when any argument starts with `origin/develop...`, and `"0\t0"` otherwise. The old check for `origin/develop...HEAD` no longer matches.

- [ ] **Step 2: Run the package tests and typecheck**

Run: `pnpm --filter @xenoterracide/ghb-pr test`
Expected: PASS. Any script drift shows as a wrong return value from `fakeRunner`.

- [ ] **Step 3: Commit**

```bash
git add packages/ghb-pr/test/commands/pr-verify.test.ts packages/ghb-pr/test/commands/pr-verify-poll.test.ts packages/ghb-pr/test/commands/pr-verify-poll-grace.test.ts packages/ghb-pr/test/commands/pr-verify-support.ts
git commit -m "test(pr): drop local head currency from verify scripts"
```

### Task 4: Update the user-facing description

**Files:**

- Modify: `packages/ghb-pr/src/commands/pr-verify.ts` (command `description`)
- Modify: `packages/ghb-pr/README.md` (verify usage comment)
- Test: `packages/ghb-pr/test/commands/pr-verify-flags.test.ts`

**Interfaces:**

- Consumes: nothing new.
- Produces: no new interface.

- [ ] **Step 1: Write the failing test**

Add to `packages/ghb-pr/test/commands/pr-verify-flags.test.ts`:

```ts
it("describes verify as checking a PR, not the current checkout", async () => {
  const { exit, stdout } = await runCli(["pr", "verify", "--help"]);

  expect(exit).toBe(0);
  expect(stdout).toContain("Verify a PR is current, mergeable, and green");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/ghb-pr/test/commands/pr-verify-flags.test.ts`
Expected: FAIL; help still says "Verify the current PR is current, mergeable, and green".

- [ ] **Step 3: Update the copy**

In `packages/ghb-pr/src/commands/pr-verify.ts`, set the command description to `Verify a PR is current, mergeable, and green`.

In `packages/ghb-pr/README.md`, change the verify usage comment to say it verifies the PR on GitHub and does not depend on the checked-out branch.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run packages/ghb-pr/test/commands/pr-verify-flags.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ghb-pr/src/commands/pr-verify.ts packages/ghb-pr/README.md packages/ghb-pr/test/commands/pr-verify-flags.test.ts
git commit -m "docs(pr): describe verify as a remote PR check"
```

### Task 5: Full gate

**Files:** none

**Interfaces:**

- Consumes: all prior tasks.
- Produces: no new interface.

- [ ] **Step 1: Run the full check**

Run: `pnpm check`
Expected: PASS. CI owns full-repo lint and tests; this is the one command a failure names for a targeted fix.

- [ ] **Step 2: Review the branch diff**

Run: `git diff develop...HEAD`
Expected: only the files named in Tasks 1-4 plus the two committed planning documents.

- [ ] **Step 3: Open the PR**

Create a draft PR with the commit bodies as its title and description, then run `ghb pr verify` from this branch.
