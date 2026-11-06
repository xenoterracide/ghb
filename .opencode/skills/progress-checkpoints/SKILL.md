---
name: progress-checkpoints
description: |
  Use when working on a task that could run long or lose work — a delegated
  `/opencode` or `/oc` job in a GitHub Actions runner, any ephemeral CI
  environment with a job timeout, or a multi-hour session that a kill or
  crash would revert. Commit and push progress after each logical milestone so
  partial work survives a job termination.
license: CC-BY-NC-SA-4.0
metadata:
  copyright: Caleb Cushing
---

<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# Progress Checkpoints

Long-running agent work is lost when the environment dies without a push. In
ephemeral runners the working tree vanishes; only work that reached the remote
survives. Checkpoint after each logical milestone so a job kill or timeout
loses at most one milestone, not the whole task.

## When to Use

- You are a delegated task in a GitHub Actions runner (`/oc`, `/opencode`) with
  a job timeout.
- You are working in any ephemeral CI environment or disposable checkout.
- The task is long or open-ended and the session may be interrupted.

Do not use for quick, single-step edits that finish in one commit.

## Core Pattern

1. After each logical milestone that leaves a working state — lockfile updated,
   config migrated, feature green — commit and push to the current branch.
2. Keep checkpoints frequent enough that a kill loses at most one milestone.
3. When resuming after an interruption, fetch the branch and continue from the
   latest pushed state. Treat the remote branch, not the local checkout, as
   authoritative.
4. Stage only the milestone's changes in the checkpoint commit; leave the tree
   otherwise clean.

## Committing Rules

- Reuse the existing git author identity; do not invent or change it.
- Use conventional commit messages.
- Never rewrite or force-push history that may already be on the remote.
- Push after each commit, not just at the end — the branch is the recovery
  source of truth.

## Common Mistakes

- Batching all changes into one final push. An interrupt before it loses
  everything.
- Committing locally but never pushing. Local commits die with the runner.
- Resuming from the pre-kill local checkout, which is stale or partial.
- Rewriting the remote branch to "clean up" checkpoint history.

## Red Flags

- "I'll commit once I finish the whole thing."
- "The local commit is enough; I'll push later."
- "I'm almost done, no need to checkpoint now."

These mean: push what you have now.
