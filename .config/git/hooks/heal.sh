#!/bin/sh

# SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
#
# SPDX-License-Identifier: MIT

# Heals the toolchain after tool version or lockfile changes. Hooks, direnv,
# and contribute all call it; every step no-ops fast when nothing changed.
# Always exits 0: a failed heal must not break checkout, direnv, or commit.

[ -n "$CI" ] && exit 0

# Work from the repo root regardless of the caller's cwd.
heal_dir=${0%/*}
[ "$heal_dir" = "$0" ] && heal_dir=.
cd "$heal_dir/../../.." || exit 0

# Two shells can heal at once (hook in one, direnv in another); asdf and npm
# take no locks of their own, so serialize here. Skip when the lock is held:
# the next event heals. An unopenable lock file means no locking, not failure.
if command -v flock >/dev/null 2>&1 && git_dir=$(git rev-parse --git-dir 2>/dev/null) && [ -n "$git_dir" ]; then
  if true 2>/dev/null >>"$git_dir/heal.lock"; then
    exec 9>>"$git_dir/heal.lock"
    if ! flock -w "${HEAL_LOCK_WAIT:-300}" 9; then
      echo "heal: another heal holds the lock; skipping" >&2
      exit 0
    fi
  fi
fi

if [ -f .tool-versions ]; then
  asdf install || echo "heal: asdf install failed" >&2
fi

if [ -f package.json ]; then
  corepack --version >/dev/null 2>&1 || {
    npm install --global corepack || echo "heal: corepack install failed" >&2
    asdf reshim nodejs
  }
  corepack enable --install-directory ~/.local/bin || echo "heal: corepack enable failed" >&2
fi

if [ -f package.json ]; then
  if [ -f pnpm-lock.yaml ]; then
    pnpm install --frozen-lockfile --reporter=silent || echo "heal: pnpm install failed" >&2
  else
    pnpm install --reporter=silent || echo "heal: pnpm install failed" >&2
  fi
fi

if [ -f pyproject.toml ]; then
  if [ -f uv.lock ]; then
    uv sync --frozen --quiet || echo "heal: uv sync failed" >&2
  else
    uv sync --quiet || echo "heal: uv sync failed" >&2
  fi
fi

git config core.hooksPath .config/git/hooks || echo "heal: hooksPath config failed" >&2

exit 0
