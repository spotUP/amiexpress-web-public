#!/usr/bin/env bash
#
# Give the local mirror worktree (aew-local) the shared checkout's
# node_modules, one symlink per entry.
#
# The mirror never runs npm install: each node_modules entry is a symlink into
# the shared checkout's matching node_modules, except @amiexpress/bbs-door-sdk
# and @amiexpress/terminal, which point at the mirror's own sdk/ and
# packages/terminal/ so the mirror builds against its own code.
#
# Nothing else creates these links, and they have vanished before (the sdk
# build then failed on "Cannot find module 'events'"). local-refresh.sh runs
# this on every refresh. It only ADDS what is missing: an entry that already
# exists (link or real directory) is left alone, so it is safe to re-run.
#
# Usage: local-mirror-links.sh <shared-checkout> <mirror>
# Exit 0 = every package directory has its links, 1 = an error.
set -uo pipefail

SHARED="${1:?usage: local-mirror-links.sh <shared-checkout> <mirror>}"
MIRROR="${2:?usage: local-mirror-links.sh <shared-checkout> <mirror>}"
# Every link target is absolute: a relative one ("./sdk", from a call with
# ".") resolves against the link's own directory and points at nothing.
SHARED="$(cd "$SHARED" && pwd)" || { echo "[ERROR] no such directory: $1" >&2; exit 1; }
MIRROR="$(cd "$MIRROR" && pwd)" || { echo "[ERROR] no such directory: $2" >&2; exit 1; }

# The package directories the mirror builds or runs, doors added below.
DIRS=(
  .
  sdk
  packages/terminal
  web/backend
  web/frontend
  web/config-app
  dev/console
  dev/mcp/docs
  dev/mcp/debug
)
# Every door with its own install: Doors/ today, board/Doors/ once the board
# moves into board/.
for door in "$SHARED"/Doors/*/ "$SHARED"/board/Doors/*/; do
  [ -d "$door/node_modules" ] || continue
  door="${door%/}"
  DIRS+=("${door#"$SHARED"/}")
done

# Where an @amiexpress package resolves inside the mirror.
own_package() { # name -> mirror path, blank for "link to the shared one"
  case "$1" in
    bbs-door-sdk) echo "$MIRROR/sdk" ;;
    terminal) echo "$MIRROR/packages/terminal" ;;
    *) echo "" ;;
  esac
}

link_one() { # target, link
  [ -e "$2" ] || [ -L "$2" ] && return 1
  ln -s "$1" "$2" || { echo "[ERROR] cannot link $2" >&2; exit 1; }
  return 0
}

total=0
for dir in "${DIRS[@]}"; do
  from="$SHARED/$dir/node_modules"
  to="$MIRROR/$dir/node_modules"
  [ -d "$from" ] || continue
  [ -d "$MIRROR/$dir" ] || continue
  mkdir -p "$to" || { echo "[ERROR] cannot create $to" >&2; exit 1; }
  added=0
  for entry in "$from"/* "$from"/.[!.]*; do
    [ -e "$entry" ] || [ -L "$entry" ] || continue
    name="$(basename "$entry")"
    if [ "$name" = "@amiexpress" ]; then
      mkdir -p "$to/@amiexpress"
      for pkg in "$entry"/*; do
        [ -e "$pkg" ] || [ -L "$pkg" ] || continue
        pname="$(basename "$pkg")"
        target="$(own_package "$pname")"
        link_one "${target:-$pkg}" "$to/@amiexpress/$pname" && added=$((added + 1))
      done
    else
      link_one "$entry" "$to/$name" && added=$((added + 1))
    fi
  done
  [ "$added" -gt 0 ] && echo "[INFO] linked $added missing node_modules entries in $dir"
  total=$((total + added))
done
echo "[OK] mirror node_modules complete ($total links added)"
exit 0
