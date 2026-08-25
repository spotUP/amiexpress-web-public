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
