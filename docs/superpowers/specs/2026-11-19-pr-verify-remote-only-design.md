<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# pr verify checks the PR, not the checkout

- Date: 2026-11-19
- Status: approved

## Problem

`ghb pr verify` forwards a PR selector to `gh pr view`, then compares the
checked-out `HEAD` with `origin/<head branch>` and `origin/<base branch>`.
`gh pr checks` does neither. Running `ghb pr verify 305` from the main
worktree fails with `behind origin/docs/pr-merge-session-move by 3 commits`
while the PR itself is current and green.

The local comparison exists to catch unpushed work. That is `ghb pr sync`'s
job. Duplicating it in verify makes the command unusable from any checkout
except the PR worktree, which costs tool calls and output tokens.

## Decision

Make verify always remote-only. Read `headRefOid` from `gh pr view` and use
it as the subject of the base-freshness gate. Remove the local ahead, behind,
and diverged gates. Verify then means: the PR is open, current with its base,
mergeable, and every check passes.

Chosen over a selector-only remote mode, which would give the same command
two meanings, and over keeping local checks when the branch matches, which
retains a checkout dependency.

## Design

- Add `headRefOid` to `PrView` and to the `gh pr view --json` field list.
- `baseCurrency` compares `origin/<baseRefName>...<headRefOid>`.
- Delete `headCurrency`; `currencyFailures` returns only `baseCurrency`.
- Update the command description and the package README to say verification
  reads the selected PR from GitHub and does not use local `HEAD`.
- Keep gh's normal PR selection. No selector resolves the current branch's PR.
- Keep exit codes 0, 1, 2, quiet success, loud failure, structured reads,
  and the existing poll and grace behavior.

## Non-goals

- No branch checkout or worktree change.
- No new flag or mode.
- No change to `ghb pr sync`.

## Accepted tradeoff

An agent with unpushed local commits gets `pass`. That matches
`gh pr checks`. Local freshness remains the user's responsibility through
`ghb pr sync`.
