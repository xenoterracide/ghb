<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# pr verify queued checks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `ghb pr verify` reads the raw `statusCheckRollup` in its single `gh pr view` call, maps check states itself, and waits out every pre-terminal phase — queued, running, and the window after a push before check runs exist — with no false pass or fast fail in any of them.

**Architecture:** Two additions to `packages/ghb-pr`. First, a pure state mapping — `bucketOf` and `summarize`, a TypeScript port of gh's `aggregateChecks`/`eliminateDuplicates` with the precedence gh's bug (cli/cli#14371) inverts. Second, the poll loop rewires from two subprocess reads (`gh pr view` + `gh pr checks`) to one (`gh pr view --json ...,statusCheckRollup`), with the empty rollup as data and a three-consecutive-poll grace before a runless CLEAN pass.

**Tech Stack:** TypeScript, clipanion, vitest, `gh` CLI via the existing `execRunner`.

**Spec:** `docs/superpowers/specs/2026-11-11-pr-verify-queued-checks.md`

## Global Constraints

- Conventional commits per `git-conventional-commits.yaml`; allowed types include `feat`, `fix`, `test`, `docs`, `refactor`.
- SPDX headers on every file; `lint-staged` adds them on commit — do not remove the ones present.
- Shell safety: only `execRunner` spawns subprocesses, with argv arrays; no new spawn paths.
- Structured reads only: `--json`; never parse a human table.
- Exit codes stay 0, 1, 2 with the current meanings; no new flags.
- Always run `gh` output through the existing runner (`NO_COLOR=1` is already set there).
- Commands run from the repo root: targeted tests `pnpm vitest run packages/ghb-pr`, package typecheck `pnpm --filter @xenoterracide/ghb-pr typecheck`, full gate `pnpm check`.

## Review Focus

Input classes the spec implies but the current tests do not exercise; each is pinned to its owning task below.

1. `statusCheckRollup` returns `null` or `[]` on a runless head — both must summarize to zero checks, never a crash or fast fail. Test: Task 1.
2. Commit statuses (`StatusContext`) still in the rollup — mapped via `state` (`EXPECTED`, `PENDING` → pending; `SUCCESS` → pass; `ERROR`, `FAILURE` → fail), named by `context`. Test: Task 1.
3. A re-queued run next to its completed predecessor (cli/cli#14371): completed `FAILURE` + `QUEUED` under one name → pending, never fail-fast. Test: Task 1.
4. A real `gh pr view` failure mid-poll (auth, network) exits 1 through the existing runner-error path, never a silent spin. Test: Task 2.
5. The post-push no-checks window: `BLOCKED` + empty rollup polls; `CLEAN` + empty rollup passes only after three consecutive stable polls. Tests: Task 2.
6. Timeout on never-started checks reads `queued: <name>` so a stuck queue is tellable from a slow run. Test: Task 2.

---

### Task 1: Port the check-state mapping

**Files:**

- Modify: `packages/ghb-pr/src/commands/pr-verify.ts` (module scope, above the `Command` class)
- Test: `packages/ghb-pr/test/commands/pr-verify.test.ts` (new `describe("summarize")`)

**Interfaces:**

- Consumes: nothing new — pure functions, no runner.
- Produces (Task 2 imports/uses these exact names):

```ts
export type Bucket = "pass" | "skipping" | "fail" | "cancel" | "pending";

export interface RollupContext {
  name?: string; // CheckRun
  context?: string; // StatusContext name
  state?: string; // StatusContext: EXPECTED ERROR FAILURE PENDING SUCCESS
  status?: string; // CheckRun: QUEUED IN_PROGRESS COMPLETED
  conclusion?: string; // CheckRun: SUCCESS FAILURE ERROR TIMED_OUT ACTION_REQUIRED CANCELLED SKIPPED NEUTRAL
  startedAt?: string | null;
  workflowName?: string;
}

export interface Check {
  name: string; // CheckRun name, StatusContext context
  bucket: Bucket;
  started: boolean; // every in-flight run of this name started on a runner
}

export function bucketOf(context: RollupContext): Bucket;
export function summarize(rollup: RollupContext[] | null | undefined): Check[];
```

- [ ] **Step 1: Write the failing tests**

`bucketOf`, exact cases from gh's table (spec §Design):

```ts
it("maps CheckRun states", () => {
  expect(bucketOf({ status: "COMPLETED", conclusion: "SUCCESS" })).toBe("pass");
  expect(bucketOf({ status: "COMPLETED", conclusion: "SKIPPED" })).toBe("skipping");
  expect(bucketOf({ status: "COMPLETED", conclusion: "NEUTRAL" })).toBe("skipping");
  expect(bucketOf({ status: "COMPLETED", conclusion: "FAILURE" })).toBe("fail");
  expect(bucketOf({ status: "COMPLETED", conclusion: "ERROR" })).toBe("fail");
  expect(bucketOf({ status: "COMPLETED", conclusion: "TIMED_OUT" })).toBe("fail");
  expect(bucketOf({ status: "COMPLETED", conclusion: "ACTION_REQUIRED" })).toBe("fail");
  expect(bucketOf({ status: "COMPLETED", conclusion: "CANCELLED" })).toBe("cancel");
  expect(bucketOf({ status: "QUEUED" })).toBe("pending");
  expect(bucketOf({ status: "IN_PROGRESS" })).toBe("pending");
});

it("maps StatusContext states", () => {
  expect(bucketOf({ state: "SUCCESS" })).toBe("pass");
  expect(bucketOf({ state: "PENDING" })).toBe("pending");
  expect(bucketOf({ state: "EXPECTED" })).toBe("pending");
  expect(bucketOf({ state: "FAILURE" })).toBe("fail");
  expect(bucketOf({ state: "ERROR" })).toBe("fail");
});
```

`summarize`, exact behavior:

```ts
it("returns no checks for an empty or null rollup", () => {
  expect(summarize([])).toEqual([]);
  expect(summarize(null)).toEqual([]);
  expect(summarize(undefined)).toEqual([]);
});

it("names a status by its context and marks started runs", () => {
  expect(summarize([{ statusContext("codespell", "PENDING") }])) // helper: { context: "codespell", state: "PENDING" }
    .toEqual([{ name: "codespell", bucket: "pending", started: false }]);
});

it("prefers a pending run over the completed run it re-queues", () => {
  const rollup = [
    { name: "build", status: "COMPLETED", conclusion: "FAILURE", startedAt: "2026-11-11T19:00:00Z", workflowName: "test" },
    { name: "build", status: "QUEUED", startedAt: null, workflowName: "test" },
  ];
  expect(summarize(rollup)).toEqual([{ name: "build", bucket: "pending", started: false }]);
});

it("keeps one entry per name and reports a lone completed failure", () => {
  const rollup = [
    { name: "pnpm / check", status: "COMPLETED", conclusion: "SUCCESS", startedAt: "2026-11-11T19:00:00Z", workflowName: "test" },
  ];
  expect(summarize(rollup)).toEqual([{ name: "pnpm / check", bucket: "pass", started: true }]);
});

it("fails a group whose newest verdict is failure with no run in flight", () => {
  const rollup = [
    { name: "build", status: "COMPLETED", conclusion: "SUCCESS", startedAt: "2026-11-11T18:00:00Z", workflowName: "test" },
    { name: "build", status: "COMPLETED", conclusion: "FAILURE", startedAt: "2026-11-11T19:00:00Z", workflowName: "test" },
  ];
  expect(summarize(rollup)).toEqual([{ name: "build", bucket: "fail", started: true }]);
});
```

Grouping key: `context` when present, else `name` + `workflowName` (two workflows naming a check the same stay distinct). Precedence within a group: any run pending → pending; otherwise the completed run with the latest `startedAt` decides its verdict — fail, cancel, or pass. `started` follows the deciding run(s): a pending group reads `started` true only when every in-flight member has started; a terminal group follows its deciding (latest-started) run.

A mirrored pair pins the re-run lifecycle both ways:

```ts
it("clears a failed group whose re-run passed", () => {
  const rollup = [
    {
      name: "build",
      status: "COMPLETED",
      conclusion: "FAILURE",
      startedAt: "2026-11-11T18:00:00Z",
      workflowName: "test",
    },
    {
      name: "build",
      status: "COMPLETED",
      conclusion: "SUCCESS",
      startedAt: "2026-11-11T19:00:00Z",
      workflowName: "test",
    },
  ];
  expect(summarize(rollup)).toEqual([{ name: "build", bucket: "pass", started: true }]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/ghb-pr`
Expected: the new cases fail — `bucketOf`/`summarize` are not exported.

- [ ] **Step 3: Implement the mapping in `pr-verify.ts`**

Port gh's logic verbatim: `state = context.state || (context.status === "COMPLETED" ? context.conclusion : context.status)`, then the switch table from the spec. Delete nothing else in this task; the existing `Check` interface (`name`, `bucket: string`) is replaced by the exported one above.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/ghb-pr`
Expected: all pass, including the untouched `PrVerifyCommand` suite.

- [ ] **Step 5: Commit**

```bash
git add packages/ghb-pr/src/commands/pr-verify.ts packages/ghb-pr/test/commands/pr-verify.test.ts
git commit -m "feat: port gh check-state mapping into pr verify" \
  -m "- add bucketOf mapping gh check runs and commit statuses to buckets
- summarize the rollup per check name; an in-flight run overrides a
completed verdict, otherwise the latest startedAt decides" \
  -m "Assisted-by: GLM:glm-5.3"
```

### Task 2: Poll the rollup, wait out every pre-terminal phase

**Files:**

- Modify: `packages/ghb-pr/src/commands/pr-verify.ts` (`execute`, `readView`, delete `readChecks`)
- Modify: `packages/ghb-pr/test/commands/pr-verify.test.ts` (fixture rewrite + new scenarios)
- Modify: `README.md` (pr verify block), `packages/ghb-pr/README.md` (usage block)

**Interfaces:**

- Consumes: Task 1's `summarize`, `Check`; the existing `Runner`, `PrView` (gains `statusCheckRollup?: RollupContext[] | null | undefined`).
- Produces: the shipped command behavior; no new exports.

- [ ] **Step 1: Rewrite the fixtures and the failing tests**

Fixture shapes — a view is now built with a rollup, favoring a small builder in the test file:

```ts
const passingRollup = [
  {
    name: "build",
    status: "COMPLETED",
    conclusion: "SUCCESS",
    startedAt: "2026-11-11T19:00:00Z",
    workflowName: "test",
  },
];
const queuedRollup = [{ name: "build", status: "QUEUED", startedAt: null, workflowName: "test" }];
const emptyRollup = [];
```

Every existing scenario keeps its name and assertions; the `fakeRunner` scripts change shape — each `gh pr view` call (poll reads and the final-gate read) returns the view JSON including `statusCheckRollup`, and every `gh pr checks` step is deleted. The `noChecks` error fixture disappears; "runless head" scenarios feed `statusCheckRollup: []`.

New tests, exact scenarios:

```ts
it("waits out an empty rollup before passing a CLEAN head", async () => {
  // 4 consecutive CLEAN+empty view reads: initial, two grace polls, final gate.
  // interval 0; timeout "1" so the grace polls never trip the deadline.
  // expect exit 0, "pass"
});

it("resets the grace when checks appear", async () => {
  // CLEAN+empty, then BLOCKED+queued, then green+passing; expect exit 0, "pass"
});

it("times out marking never-started checks as queued", async () => {
  // two pending reads of queuedRollup with timeout 0
  // expect exit 2, errors contain "pending after 0m" and "queued: build"
});

it("sees a re-queued run as pending and passes after it completes", async () => {
  // first rollup: FAILURE completed + QUEUED same name (must NOT fail-fast);
  // later rollup: both, the QUEUED now COMPLETED SUCCESS with the later
  // startedAt (real data keeps both runs); expect exit 0, "pass"
});

it("pends a runless head while the view is BLOCKED", async () => {
  // empty rollup, BLOCKED view, timeout 0 → exit 2, "pending after 0m"
});

it("fails fast when the runner errors on the view", async () => {
  // readView throws a non-"not found" gh error; expect exit 1
});
```

Timeout-line format, pinned: started names first, then `; queued: <names>` when any pending check never started; when none started, omit the empty first segment — `pending after 0m: queued: build`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/ghb-pr`
Expected: the new scenarios fail — `execute` still calls `gh pr checks`, the grace and queued marking do not exist.

- [ ] **Step 3: Rewire `execute` to the single-read loop**

`readView` gains `statusCheckRollup` in the `--json` field list and the `PrView` field. Delete `readChecks` and the `Check` import of its JSON shape. The loop becomes:

- One read per poll; the rollup is part of the view.
- UNKNOWN settle, permanent verdicts (`mergeable !== "MERGEABLE"`, `DIRTY`, `DRAFT`), `fail`/`cancel` fail-fast, the final re-read gate — all keep their current semantics, now fed by `summarize(view.statusCheckRollup)`.
- Rainless head: `BLOCKED`/`UNSTABLE` + empty polls to the deadline; `CLEAN` + empty passes only after it has been observed in three consecutive reads (grace; polls that see anything else reset the count). The final gate's fresh read observes the same rule.
- Final gate: fresh view non-CLEAN with pending or empty rollup polls; fresh non-CLEAN with terminal checks fails; fresh CLEAN passes through the currency re-check.
- Deadline check before every sleep, as now; `pending after Xm` prints started names, then `; queued: <names>` per the pinned format.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/ghb-pr`
Expected: all pass.

- [ ] **Step 5: Typecheck, READMEs, and the full gate**

Typecheck: `pnpm --filter @xenoterracide/ghb-pr typecheck`.

`packages/ghb-pr/README.md`, after the usage block:

```markdown
Verify waits out every pre-terminal check phase: queued, running, and
the seconds after a push before check runs exist.
```

`README.md`, the `pr verify` block gains after its exit-codes comment line:

```markdown
# Waits out queued and not-yet-created checks before passing
```

Then: `pnpm check` — prettier, eslint, typecheck, tests all green.

- [ ] **Step 6: Commit**

```bash
git add packages/ghb-pr/src/commands/pr-verify.ts packages/ghb-pr/test/commands/pr-verify.test.ts README.md packages/ghb-pr/README.md
git commit -m "fix: wait out every pre-terminal check phase in pr verify" \
  -m "gh pr checks errors while check runs do not exist yet and reports
a re-queued run under the run it replaces (cli/cli#14371), so verify
failed fast right after a push and could pass while a re-run sat queued.

- read the raw statusCheckRollup in the single gh pr view poll
- poll an empty rollup while the view is not CLEAN and require three
stable polls before a runless CLEAN pass
- mark never-started checks as queued in the timeout line" \
  -m "Assisted-by: GLM:glm-5.3"
```
