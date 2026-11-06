#!/usr/bin/env bash
#
# Point a local board's Doors at the checkout's board/Doors.
#
# The dev backend reads the board from data/live (BBS_DATA_DIR), and its
# Doors entry is a symlink into the checkout, so door work is never
# overwritten by a pull of live content. The link is absolute: moving the
# checkout or the doors (P8.9 moved Doors/ to board/Doors/) leaves it pointing
# at the old place. A stale link that still resolves to a directory is the
# worst case: the board finds Doors/<door>/ with no index.ts and every
# TypeScript door fails to start, while /health stays green.
#
# Test for the link itself (-L), not -e: -e is false for a dangling link.
# A real directory is somebody's data: leave it alone and fail.
#
# Usage: local-doors-link.sh <board-data-dir> <repo-root>
# Exit 0 = <board-data-dir>/Doors is a link to <repo-root>/board/Doors,
#      1 = it is a real directory (left as it is) or the link cannot be made.
set -uo pipefail

DEST="${1:?usage: local-doors-link.sh <board-data-dir> <repo-root>}"
REPO_ROOT="${2:?usage: local-doors-link.sh <board-data-dir> <repo-root>}"
WANT="$REPO_ROOT/board/Doors"

if [ -L "$DEST/Doors" ]; then
  OLD_TARGET="$(readlink "$DEST/Doors")"
  if [ "$OLD_TARGET" != "$WANT" ]; then
    ln -sfn "$WANT" "$DEST/Doors" || { echo "[ERROR] cannot repoint $DEST/Doors" >&2; exit 1; }
    echo "[INFO] Doors symlink repointed: $OLD_TARGET -> $WANT"
  fi
elif [ -d "$DEST/Doors" ]; then
  echo "[ERROR] $DEST/Doors is a real directory, not the checkout's board/Doors; left as it is" >&2
  exit 1
else
  mkdir -p "$DEST" || { echo "[ERROR] cannot create $DEST" >&2; exit 1; }
  ln -s "$WANT" "$DEST/Doors" || { echo "[ERROR] cannot link $DEST/Doors" >&2; exit 1; }
  echo "[INFO] Doors -> the checkout (symlink), so door work is not overwritten by a pull"
fi
exit 0
