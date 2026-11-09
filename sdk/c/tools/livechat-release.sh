#!/bin/sh
# Build build/release/LiveChat68.lha for outside Amiga sysops.
# Usage: tools/livechat-release.sh [source-dir]   (default ../../board/Doors/LIVECHAT68)
# Needs a host lha (brew install lha). Fails if a LIVECHAT.cfg would be staged.
set -eu
cd "$(dirname "$0")/.."
SRC="${1:-../../board/Doors/LIVECHAT68}"
OUT=build/release
STAGE="$OUT/stage/LiveChat68"
rm -rf "$OUT/stage" "$OUT/LiveChat68.lha"
mkdir -p "$STAGE"
for f in LIVECHAT68 LIVECHAT.cfg.example; do
  [ -f "$SRC/$f" ] || { echo "livechat-release: missing $SRC/$f" >&2; exit 1; }
  cp "$SRC/$f" "$STAGE/$f"
done
# README comes from the door drawer; the release icon is generated (tools/make-lc-icon.ts).
[ -f "$SRC/README.txt" ] || { echo "livechat-release: missing $SRC/README.txt" >&2; exit 1; }
cp "$SRC/README.txt" "$STAGE/README.txt"
[ -f tools/release/LC.info ] || { echo "livechat-release: missing tools/release/LC.info" >&2; exit 1; }
cp tools/release/LC.info "$STAGE/LC.info"
# make livechat-release passes the freshly built door here; otherwise the drawer's binary is used.
if [ -n "${LIVECHAT_BIN:-}" ]; then
  [ -f "$LIVECHAT_BIN" ] || { echo "livechat-release: missing $LIVECHAT_BIN" >&2; exit 1; }
  cp "$LIVECHAT_BIN" "$STAGE/LIVECHAT68"
fi
# The portable source (door + the SDK files it needs, Makefile, LICENSE,
# PORTING.txt) so sysops can rebuild or port it. Same tree as spotUP/livechat68.
tools/livechat-source-tree.sh "$STAGE/src" >/dev/null
# Safety: no cfg (it may hold a real key) may ever be staged. Case-insensitive.
if find "$STAGE" -iname 'LIVECHAT.cfg' | grep -q .; then
  echo "livechat-release: LIVECHAT.cfg would be staged - refusing" >&2
  exit 1
fi
command -v lha >/dev/null 2>&1 || { echo "livechat-release: no lha on PATH (brew install lha)" >&2; exit 1; }
(cd "$OUT/stage" && lha -aq2 ../LiveChat68.lha LiveChat68)
echo "livechat-release: $OUT/LiveChat68.lha"
