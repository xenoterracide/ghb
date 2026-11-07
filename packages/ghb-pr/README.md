<!--
SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# @xenoterracide/ghb-pr

The `pr` command family for the `ghb` CLI: keep a PR branch current and
prove it is mergeable and green.

## Usage

```bash
# Sync the current branch with its remote and the default branch
# Prints one line: merged N commits, reset to remote, or up to date
# Exits 1 when local and remote diverged, on a merge conflict,
# or when tracked files or colliding untracked files would be lost
ghb pr sync

# Verify the current PR is current, mergeable, and every check passes
# Prints pass, or one line per failed dimension
# Exits 0 on pass, 1 on failure, 2 when checks stay pending past the timeout
ghb pr verify [--interval SECONDS] [--timeout SECONDS] [PR NUMBER | URL | BRANCH]
```

Both commands are quiet on success and loud on failure. Reads are structured
(`--json`, `git rev-list --count`); no human table is ever parsed.

## Development

Part of the [ghb monorepo](../../README.md). Run the checks from the root:

```bash
pnpm check
```
