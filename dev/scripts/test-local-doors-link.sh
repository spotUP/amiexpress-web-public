#!/usr/bin/env bash
#
# Regression test for local-doors-link.sh.
#
# 2026-11-06: TypeScript doors did not start on the local mirror board. Its
# data/live/Doors still linked to <mirror>/Doors, the pre-P8.9 location, which
# only held leftover node_modules links, so the board found Doors/livechat/
# with no index.ts. The repoint ran only on --pull-live.
#
# Usage: dev/scripts/test-local-doors-link.sh   (exit 0 = all pass)
set -uo pipefail

SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/local-doors-link.sh"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/doors-link-test.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
FAILS=0
check() { # name, condition result
  if [ "$2" -eq 0 ]; then echo "[OK] $1"; else echo "[FAIL] $1"; FAILS=$((FAILS + 1)); fi
}

REPO="$WORK/repo"
mkdir -p "$REPO/board/Doors/livechat" "$REPO/Doors/livechat/node_modules"
touch "$REPO/board/Doors/livechat/index.ts"

# A link to the old Doors/ that still resolves is repointed.
DATA="$WORK/stale"; mkdir -p "$DATA"; ln -s "$REPO/Doors" "$DATA/Doors"
"$SCRIPT" "$DATA" "$REPO" >/dev/null
[ "$(readlink "$DATA/Doors")" = "$REPO/board/Doors" ] && [ -f "$DATA/Doors/livechat/index.ts" ]
check "stale link to the old Doors/ is repointed to board/Doors" $?

# A dangling link is repointed.
DATA="$WORK/dangling"; mkdir -p "$DATA"; ln -s "$WORK/gone" "$DATA/Doors"
"$SCRIPT" "$DATA" "$REPO" >/dev/null
[ "$(readlink "$DATA/Doors")" = "$REPO/board/Doors" ]
check "dangling link is repointed" $?

# A missing link is created.
DATA="$WORK/missing"; mkdir -p "$DATA"
"$SCRIPT" "$DATA" "$REPO" >/dev/null
[ "$(readlink "$DATA/Doors")" = "$REPO/board/Doors" ]
check "missing link is created" $?

# A correct link is left alone and passes.
"$SCRIPT" "$DATA" "$REPO" >/dev/null
check "correct link exits 0" $?

# A real directory is left alone and fails.
DATA="$WORK/real"; mkdir -p "$DATA/Doors/keep"
"$SCRIPT" "$DATA" "$REPO" >/dev/null 2>&1
rc=$?
[ "$rc" -eq 1 ] && [ -d "$DATA/Doors/keep" ] && [ ! -L "$DATA/Doors" ]
check "real directory is kept and the script fails" $?

[ "$FAILS" -eq 0 ] && echo "[OK] all pass" || echo "[FAIL] $FAILS failed"
exit "$FAILS"
