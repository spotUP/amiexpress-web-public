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
for f in LIVECHAT68 LIVECHAT68.info LIVECHAT.cfg.example; do
  [ -f "$SRC/$f" ] || { echo "livechat-release: missing $SRC/$f" >&2; exit 1; }
  cp "$SRC/$f" "$STAGE/$f"
done
cat > "$STAGE/README.txt" <<'TXT'
LiveChat68 - live chat door for AmiExpress.
Copy LIVECHAT68 and LIVECHAT68.info into Doors:, copy LIVECHAT.cfg.example to LIVECHAT.cfg and fill in Host and BoardKey.
(Full install notes to follow.)
TXT
# Safety: no cfg (it may hold a real key) may ever be staged. Case-insensitive.
if find "$STAGE" -iname 'LIVECHAT.cfg' | grep -q .; then
  echo "livechat-release: LIVECHAT.cfg would be staged - refusing" >&2
  exit 1
fi
command -v lha >/dev/null 2>&1 || { echo "livechat-release: no lha on PATH (brew install lha)" >&2; exit 1; }
(cd "$OUT/stage" && lha -aq2 ../LiveChat68.lha LiveChat68)
echo "livechat-release: $OUT/LiveChat68.lha"
