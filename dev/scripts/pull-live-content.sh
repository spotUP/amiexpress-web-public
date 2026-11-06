#!/usr/bin/env bash
#
# LOCALHOST FOLLOWS LIVE.
#
# The sysop authors on the live board - screens, themes, bulletins,
# conference art - and the live board writes them to its Docker volume,
# which nothing ever brought back. Localhost reads the CHECKOUT
# (`BBS_DATA_DIR` was the repo root), so it showed whatever git happened to
# hold: months-old art, and a working tree permanently dirty with
# `Bulletins/bull1.txt` and `Conf1/ctop.data` because the dev board wrote
# into it. "as long as local follow live its ok i make all edits on the live
# server" (the sysop, 2026-09-24).
#
# ONE DIRECTION ONLY, live -> local. There is no sync back and there must
# not be: the live board rewrites bulletins at every logoff and `ctop.data`
# as callers move, so a dev box writing to that volume would fight it - and
# a SECOND board pointed at `amiexpress-bbs-data` steals the real one's
# pages, which this board has been bitten by before.
#
# The snapshot lands in `data/live/` (gitignored). The repo keeps its own
# job: it is the SEED a fresh install is built from - the tracked `Node<n>/`
# and `Screens/` the image collapses - and that is why this writes nowhere
# near it.
#
# Usage:
#   dev/scripts/pull-live-content.sh              # show what would change
#   dev/scripts/pull-live-content.sh --apply      # actually pull
#   dev/scripts/pull-live-content.sh --apply --all-conf-files   # file areas too
#
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEST="${BBS_LIVE_SNAPSHOT:-$REPO_ROOT/data/live}"
HOST="${LIVE_HOST:-root@bbs.uprough.net}"
CONTAINER="${LIVE_CONTAINER:-amiexpress-bbs}"
REMOTE_ROOT="/app/data/bbs"

APPLY=0
ALL_CONF_FILES=0
for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=1 ;;
    --all-conf-files) ALL_CONF_FILES=1 ;;
    -h|--help) sed -n '2,28p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "[ERROR] unknown argument: $arg" >&2; exit 2 ;;
  esac
done

# WHAT THE BOARD READS, named rather than excluded.
#
# An include list because the volume is 2.2 GB and almost none of it is
# board content: `amiga-gcc` alone is 1.1 GB of toolchain, `Teletext` is the
# 355 MB pack archive that is volume-only by the sysop's own decision,
# `Archives`, `logs`, `_conf-backups` and the vendored game source trees
# account for most of the rest. An exclude list would have to be corrected
# every time one of those grew a sibling; this one only grows when the board
# genuinely reads somewhere new.
INCLUDE_DIRS=(
  Screens Themes Bulletins Prompts HELP Languages
  Access Commands System Env Devs Storage
  Conf1 Conf2 Conf3 Conf4 Conf5
  Magazine
)

# Per-node directories: art and per-node state. Enumerated live rather than
# guessed - this board has Node0 through Node156, not a contiguous range.
#
# `-type d`, because `Node[0-9]*` also matches the `Node<n>.info` tooltype
# files sitting beside them: 71 directories, 327 glob hits. Those .info
# files are carried by the root globs below, once.
node_dirs() {
  ssh -o BatchMode=yes -o ConnectTimeout=15 "$HOST" \
    "docker exec $CONTAINER sh -c 'cd $REMOTE_ROOT && find . -maxdepth 1 -type d -name \"Node[0-9]*\" | sed \"s|^\./||\" | sort'" 2>/dev/null
}

# The loose root files that are really there.
root_files() {
  ssh -o BatchMode=yes -o ConnectTimeout=15 "$HOST" \
    "docker exec $CONTAINER sh -c 'cd $REMOTE_ROOT && find . -maxdepth 1 -type f \\( $ROOT_FILE_PATTERNS \\) | sed \"s|^\./||\" | sort'" 2>/dev/null
}

# Which of the named content directories this board actually has. A board
# with four conferences must not fail the pull over the fifth.
present_dirs() {
  ssh -o BatchMode=yes -o ConnectTimeout=15 "$HOST" \
    "docker exec $CONTAINER sh -c 'cd $REMOTE_ROOT && for d in ${INCLUDE_DIRS[*]}; do [ -d \"\$d\" ] && echo \"\$d\"; done'" 2>/dev/null
}

# The loose files at the volume root: the .info tooltype files the board
# reads its own configuration from, Conf.DB, the help text.
#
# Enumerated on the remote, never passed to tar as a GLOB. A pattern that
# matches nothing reaches tar as its own literal text, tar reports the
# member as missing and exits non-zero - and under `pipefail` that failed
# the whole pull after it had already written a correct archive. Asking
# `find` which files exist means tar is only ever handed members it can
# open.
# user.keys and user.misc carry no extension the patterns above catch; without
# them the pull brought user.data alone and every account was half today's,
# half the last time these were copied by hand.
ROOT_FILE_PATTERNS='-name "*.info" -o -name "*.DB" -o -name "*.TXT" -o -name "*.txt" -o -name "*.data" -o -name "*.cfg" -o -name "*.CFG" -o -name "user.keys" -o -name "user.misc"'

# `Conf<n>/Files` and `Upload` are the FILE AREAS - 14 MB on Conf1 alone and
# not something a dev box needs to render a screen. Skipped unless asked.
TAR_EXCLUDES=()
if [ "$ALL_CONF_FILES" -eq 0 ]; then
  for n in 1 2 3 4 5; do
    TAR_EXCLUDES+=("--exclude=Conf$n/Files" "--exclude=Conf$n/Upload" "--exclude=Conf$n/Partial")
  done
fi
# Never worth carrying: logs, backups, and the caller-session debris.
TAR_EXCLUDES+=(
  "--exclude=*/Backups" "--exclude=*.bak" "--exclude=*.log"
  "--exclude=*/tmp" "--exclude=*/Work"
)
# The MAG video clip cache: up to 500 MB, rebuilt on demand from the story.
TAR_EXCLUDES+=("--exclude=Magazine/video")

echo "[INFO] live   : $HOST ($CONTAINER:$REMOTE_ROOT)"
echo "[INFO] local  : $DEST"
echo

mapfile -t NODES < <(node_dirs)
if [ "${#NODES[@]}" -eq 0 ]; then
  echo "[ERROR] could not list the live volume - is the host reachable and the container up?" >&2
  exit 1
fi
echo "[INFO] ${#NODES[@]} node directories"

mapfile -t PRESENT < <(present_dirs)
mapfile -t ROOTFILES < <(root_files)
REMOTE_LIST=("${PRESENT[@]}" "${NODES[@]}" "${ROOTFILES[@]}")
echo "[INFO] ${#ROOTFILES[@]} loose root files"

# WHAT IT WOULD COST, before anything is written. A pull that silently
# replaces a directory is a pull nobody can check.
SIZE=$(ssh -o BatchMode=yes -o ConnectTimeout=15 "$HOST" \
  "docker exec $CONTAINER sh -c 'cd $REMOTE_ROOT && du -sch ${REMOTE_LIST[*]} 2>/dev/null | tail -1'" 2>/dev/null)
echo "[INFO] remote size: ${SIZE:-unknown}"

if [ -d "$DEST" ]; then
  echo "[INFO] local snapshot exists: $(du -sh "$DEST" 2>/dev/null | cut -f1), last pulled $(date -r "$DEST" '+%Y-%m-%d %H:%M' 2>/dev/null)"
else
  echo "[INFO] local snapshot does not exist yet"
fi

if [ "$APPLY" -eq 0 ]; then
  echo
  echo "[INFO] dry run. These directories would be replaced under $DEST:"
  printf '         %s\n' "${PRESENT[@]}"
  echo "         ${#NODES[@]} x Node<n>"
  echo "         ${#ROOTFILES[@]} loose root files"
  [ "$ALL_CONF_FILES" -eq 0 ] && echo "[INFO] conference Files/Upload areas are SKIPPED (pass --all-conf-files to include them)"
  echo
  echo "[INFO] re-run with --apply to pull."
  exit 0
fi

# EXTRACTED FRESH, THEN SWAPPED IN - never merged over the old snapshot.
#
# The snapshot is the dev board's DATA directory, so the board writes into
# it: `Conf1/Hold` is a zero-byte file on the volume and a directory here,
# created by a dev caller holding a file. tar cannot replace a non-empty
# directory with a file, so the second pull failed with "Can't replace
# existing directory with non-directory" after the first had succeeded.
#
# Replacing wholesale also makes the snapshot mean what it says: a file
# DELETED on live disappears here too, where a merge would leave it behind
# for ever - which is the same add-only trap the Doors volume has.
STAGE="$DEST.incoming"
rm -rf "$STAGE"
mkdir -p "$STAGE" || { echo "[ERROR] cannot create $STAGE" >&2; exit 1; }

echo "[INFO] pulling..."
# Streamed through tar rather than rsync: nothing is installed on the host
# beyond docker, and `docker exec ... tar -cf -` reads the volume from
# inside the container, which is the only place its permissions make sense.
if ! ssh -o BatchMode=yes -o ConnectTimeout=30 "$HOST" \
  "docker exec $CONTAINER tar -cf - -C $REMOTE_ROOT ${TAR_EXCLUDES[*]} ${REMOTE_LIST[*]} 2>/dev/null" \
  | tar -xf - -C "$STAGE"; then
  echo "[ERROR] pull failed - the old snapshot at $DEST is untouched" >&2
  rm -rf "$STAGE"
  exit 1
fi

# The swap. The old snapshot is kept until the new one is in place, so an
# interrupted pull leaves a working board rather than half a board.
if [ -d "$DEST" ]; then
  rm -rf "$DEST.previous"
  mv "$DEST" "$DEST.previous" || { echo "[ERROR] cannot move the old snapshot aside" >&2; exit 1; }
fi
mv "$STAGE" "$DEST" || { echo "[ERROR] cannot put the new snapshot in place" >&2; exit 1; }
rm -rf "$DEST.previous"

# DOORS STAY THE CHECKOUT'S.
#
# The live volume carries 197 MB of built doors, and the deploy puts them
# there FROM this repo - so pulling them back would be a round trip that
# overwrites the door you are working on with the last one you shipped.
# A symlink keeps the board finding them where it expects while door work
# stays where it belongs.
#
# local-doors-link.sh keeps the link pointing at board/Doors.
"$REPO_ROOT/dev/scripts/local-doors-link.sh" "$DEST" "$REPO_ROOT" || exit 1

echo "[OK] snapshot is $(du -sh "$DEST" 2>/dev/null | cut -f1) at $DEST"
echo "[OK] restart the dev stack to pick it up: ./dev/scripts/kill-servers.sh && ./dev/scripts/start-servers.sh --bbs-only"
