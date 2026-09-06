#!/usr/bin/env bash
#
# Install the repo's git hooks.
#
# The hooks live here, in version control, because .git/hooks is not tracked:
# a fix made there exists on one machine only. This was not theoretical - the
# pre-commit hook's door-rebuild step had a path bug that silently skipped any
# door whose sources sit at the door root (Arkanoid), shipping a stale bundle,
# and the fix would otherwise have lived on a single laptop.
#
# Run from anywhere:  ./dev/hooks/install.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HOOK_DIR="$REPO_ROOT/.git/hooks"

# core.ignorecase - the setting that makes a case collision POSSIBLE.
#
# On a case-insensitive filesystem (macOS/APFS) with core.ignorecase=false,
# `git add GWALL.cfg` while `gwall.cfg` is tracked writes a SECOND index entry
# instead of recognising the same file. Only one of the two can exist on disk
# here, so nobody sees the duplicate until it reaches the Linux container that
# serves the board - or until a cherry-pick refuses to start. Measured in a
# scratch repo:
#
#     ignorecase=false -> index holds BOTH GWALL.cfg and gwall.cfg
#     ignorecase=true  -> index holds gwall.cfg only, content updated
#
# `true` is the value git autodetects for APFS; this repo's config and the
# user's global gitconfig both override it to false. Set it per-repo (worktrees
# share this config file, so they inherit the protection). On Linux the
# filesystem keeps the spellings apart and false is correct - leave it alone.
if [ "$(uname -s)" = "Darwin" ]; then
  if [ "$(git -C "$REPO_ROOT" config --get core.ignorecase || true)" != "true" ]; then
    git -C "$REPO_ROOT" config core.ignorecase true
    echo "[OK] set core.ignorecase=true (was not: a case-insensitive disk needs it)"
  else
    echo "[OK] core.ignorecase already true"
  fi
fi

mkdir -p "$HOOK_DIR"
for hook in "$REPO_ROOT"/dev/hooks/*; do
  name="$(basename "$hook")"
  case "$name" in
    install.sh|README.md) continue ;;
  esac
  cp "$hook" "$HOOK_DIR/$name"
  chmod +x "$HOOK_DIR/$name"
  echo "[OK] installed $name"
done
