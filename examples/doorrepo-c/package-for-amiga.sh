#!/bin/sh
# Builds the DoorRepo release archive: the m68k binary, the complete source
# and tests, the two documents, and a set of REAL responses captured from the
# live server as client fixtures.
#
# This exists because the first two archives were assembled by hand, which
# makes "what exactly did I send him?" unanswerable and every rebuild a fresh
# chance to forget a file. Everything below is checked rather than assumed:
# the tests must pass before anything is packed, the packed source must build
# and test again after extraction, and the binary's digest must survive the
# round trip.
#
# LHA rather than ZIP: the recipient is an Amiga sysop.
#
# Usage: ./package-for-amiga.sh [output.lha] [ReadMe.txt]
set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../.." && pwd)

OUT=${1:-$REPO/thoughts/spot/outgoing/DoorRepo-for-Phantasm.lha}
README=${2:-$REPO/thoughts/spot/outgoing/DoorRepo-ReadMe.txt}
HOST=${DOORREPO_HOST:-http://bbs.uprough.net}

command -v lha >/dev/null || { echo "[ERROR] lha not found"; exit 1; }
[ -f "$README" ] || { echo "[ERROR] cover letter not found: $README"; exit 1; }

STAGE=$(mktemp -d)
CHECK=$(mktemp -d)
trap 'rm -rf "$STAGE" "$CHECK"' EXIT

echo "[INFO] building and testing"
make -C "$HERE" clean >/dev/null
make -C "$HERE" test  >/dev/null || { echo "[ERROR] unit tests failed; nothing packed"; exit 1; }
make -C "$HERE" amiga >/dev/null

PKG=$STAGE/DoorRepo
mkdir -p "$PKG/bin" "$PKG/src/tests" "$PKG/src/tools" "$PKG/docs" "$PKG/samples"

echo "[INFO] assembling"
cp "$HERE/doorrepo.amiga"       "$PKG/bin/DoorRepo"
chmod 755                        "$PKG/bin/DoorRepo"
# The cover letter names the build it describes, so the commit is stamped in
# here rather than typed by hand into a file that then goes stale. A dirty
# source tree is refused outright: an archive whose "Built: git <sha>" line
# does not describe its own contents is worse than no line at all.
if [ -n "$(git -C "$REPO" status --porcelain -- "$HERE" "$REPO/docs/DOOR-REPO-API.md")" ]; then
  echo "[ERROR] doorrepo-c has uncommitted changes; commit them so the archive can name its build"
  exit 1
fi
SHA=$(git -C "$REPO" rev-parse --short HEAD)
sed "s/git HEAD, vbcc/git $SHA, vbcc/" "$README" > "$PKG/ReadMe.txt"
cp "$HERE/DoorRepo.cfg.example"  "$PKG/DoorRepo.cfg.example"
cp "$HERE/Makefile"              "$PKG/src/Makefile"
for f in "$HERE"/*.c "$HERE"/*.h; do cp "$f" "$PKG/src/"; done
for f in "$HERE"/tests/*.c "$HERE"/tests/*.h; do cp "$f" "$PKG/src/tests/"; done
for f in "$HERE"/tools/*.c; do cp "$f" "$PKG/src/tools/"; done

# The two documents go in as plain text under names an Amiga reader expects.
# Only the docs are transliterated to ASCII: UTF-8 punctuation reads as
# mojibake on an Amiga. The SAMPLES are left byte-exact on purpose - they are
# captured ISO-8859-1 responses whose high-bit bytes ARE the data (DIZ art),
# and "fixture" means nothing if it has been rewritten.
ascii_only() {
  python3 - "$1" "$2" <<'PY'
import sys
src, dst = sys.argv[1], sys.argv[2]
text = open(src, encoding='utf-8').read()
for bad, good in (('—', '--'), ('–', '-'), ('‘', "'"),
                  ('’', "'"), ('“', '"'), ('”', '"'),
                  ('…', '...'), (' ', ' ')):
    text = text.replace(bad, good)
open(dst, 'w', encoding='ascii').write(text)
PY
}
ascii_only "$HERE/README.md"          "$PKG/docs/DoorRepo.txt"
ascii_only "$REPO/docs/DOOR-REPO-API.md" "$PKG/docs/DoorRepoAPI.txt"

echo "[INFO] capturing live samples from $HOST"
api=$HOST/api/door-repo
curl -fsS "$api/health"                        -o "$PKG/samples/health.json"
curl -fsS "$api/list.txt"    | head -c 3000    > "$PKG/samples/list-first-lines.txt"
curl -fsS "$api/files/TELSER40.LHA"            -o "$PKG/samples/files-TELSER40.txt"
curl -fsS "$api/diz/ABS-PLC2.LHA"              -o "$PKG/samples/diz-ABS-PLC2.txt"
curl -fsS "$api/doc/TELSER40.LHA" | head -c 2000 > "$PKG/samples/doc-TELSER40.txt"
curl -fsS "$api/manifest?q=AETRIV10"           -o "$PKG/samples/manifest-AETRIV10.json"
curl -fsS -D "$PKG/samples/archive-headers.txt" -o /dev/null "$api/archive/AETRIV10.LHA"

echo "[INFO] packing"
mkdir -p "$(dirname "$OUT")"
rm -f "$OUT"
( cd "$STAGE" && lha a "$OUT" DoorRepo >/dev/null )

echo "[INFO] verifying the archive by using it"
( cd "$CHECK" && lha x "$OUT" >/dev/null )
before=$(md5 -q "$HERE/doorrepo.amiga" 2>/dev/null || md5sum "$HERE/doorrepo.amiga" | cut -d' ' -f1)
after=$(md5 -q "$CHECK/DoorRepo/bin/DoorRepo" 2>/dev/null || md5sum "$CHECK/DoorRepo/bin/DoorRepo" | cut -d' ' -f1)
[ "$before" = "$after" ] || { echo "[ERROR] binary digest changed in the round trip"; exit 1; }
make -C "$CHECK/DoorRepo/src" test   >/dev/null || { echo "[ERROR] packed source fails its own tests"; exit 1; }
make -C "$CHECK/DoorRepo/src" native >/dev/null || { echo "[ERROR] packed source does not build"; exit 1; }

# The docs must be ASCII; the samples must NOT have been touched.
for f in "$CHECK/DoorRepo/ReadMe.txt" "$CHECK/DoorRepo/docs/DoorRepo.txt" "$CHECK/DoorRepo/docs/DoorRepoAPI.txt"; do
  if LC_ALL=C grep -qa '[^ -~	]' "$f"; then
    echo "[ERROR] non-ASCII byte in $f"; exit 1
  fi
done

echo "[OK] $OUT"
echo "[OK] binary md5 $before, $(lha l "$OUT" | tail -1)"
