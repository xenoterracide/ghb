<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# pr verify waits out every pre-terminal check phase

- Date: 2026-11-11
- Status: proposed, awaiting approval

## Problem

The beta found the window after a push that the ghb-slim design feared. A
watcher session ran `ghb pr verify` right after a push; it exited 1 fast
because gh errored on the not-yet-created checks phase and verify's regex
did not recognize that flavor. gh prints more than one no-data message
("no checks reported on the 'x' branch", also "no commit found on the
pull request", checks.go:287) and the recognition is a regex over thrown
error text. Any wording drift is a fail-fast.

Same source, worse symptom: `gh pr checks` dedups check runs by
`startedAt` (cli/cli#14371). A re-queued run has none, sorts oldest, and
loses to the run it replaces. Verify sees `pass` while the new run sits
queued — a false pass — or a false `BLOCKED` fail at the final gate.

## Decision

Stop reading `gh pr checks`. Extend the existing `gh pr view --json` call
with `statusCheckRollup` and map states in verify — a TypeScript port of
gh's own `aggregateChecks`. One subprocess per poll, no error strings to
recognize, every run of every check visible, including re-queued ones.

Chosen over patching the regex (stays fragile, keeps the gh bug) and over
adding `gh run list --commit` evidence checks (two more calls, false
waits on path-filtered repos; the grace period below covers the residual
lag).

## Design

One poll is one read: `gh pr view --json
state,mergeable,mergeStateStatus,baseRefName,headRefName,statusCheckRollup`.

State mapping, gh's table verbatim:

- CheckRun: `COMPLETED` → conclusion; otherwise status (`QUEUED`,
  `IN_PROGRESS`)
- StatusContext: `state`
- `SUCCESS` → pass; `SKIPPED`, `NEUTRAL` → skipping; `ERROR`, `FAILURE`,
  `TIMED_OUT`, `ACTION_REQUIRED` → fail; `CANCELLED` → cancel; everything
  else (`EXPECTED`, `REQUESTED`, `WAITING`, `QUEUED`, `PENDING`,
  `IN_PROGRESS`, `STALE`) → pending

Checks group by name (`CheckRun.name`, `StatusContext.context`). Precedence
within a group: any run pending → the name is pending — the re-run is in
flight and may pass. Otherwise the completed run with the latest
`startedAt` decides the verdict; a finished re-run replaces the one it
supersedes. This is the behavior cli/cli#14371 expects of gh itself.

An empty rollup — the no-checks phase — is data, not an error. It polls
like any pending phase while the view is non-CLEAN. A CLEAN view with an
empty rollup passes only after three consecutive stable polls — grace for
the post-push lag, about 30s at the default interval — which closes the
stale-CLEAN false pass on repos without required checks.

The exit-2 timeout line marks checks that never started (`startedAt`
null), so a stuck queue reads differently from a slow run. Exact wording
is the builder's.

## What stays

- `--interval`, `--timeout`, forwarded PR selectors — now to `gh pr view`
  only
- Currency checks, the UNKNOWN mergeability settle, the final re-read gate
- All checks, always; quiet on success
- Exit codes 0, 1, 2

`gh-pr-wait.sh` is gone from agent-skills; verify is the single
implementation of the poll.

## Constraints

- The rollup caps at roughly 100 contexts per SHA; family repos run ~10
- A runless head may return `[]` or `null` — accept both
- READMEs (root and package) gain the queued and no-checks behavior
  lines; no new flags

## Human-required

- Approval of this design
