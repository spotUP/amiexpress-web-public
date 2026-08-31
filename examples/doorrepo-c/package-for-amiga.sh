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

# Shrinkler-packed, because the recipients are Amiga sysops on real hardware
# and slow links: 121,608 bytes becomes ~46,000, and the door decrunches
# itself on startup. See .claude/skills/shrinkler-door-releases.
#
# The PLAIN binary is what this board runs and is NOT replaced here. A
# crunched executable is smaller on disk and BIGGER in memory while it
# decrunches - both images are resident - and DoorRepo crunched needs 513 KB
# against the 500 KB the emulator gives a door, so our own board refuses it
# (memory-map.ts, assertDoorSegmentsFit). A real Amiga has the RAM; the
# emulator's door region does not.
if command -v shrinkler >/dev/null; then
  shrinkler "$HERE/doorrepo.amiga" "$PKG/bin/DoorRepo.shrinkled" >/dev/null
  chmod 755 "$PKG/bin/DoorRepo.shrinkled"
  PLAIN_SIZE=$(wc -c < "$PKG/bin/DoorRepo" | tr -d ' ')
  PACKED_SIZE=$(wc -c < "$PKG/bin/DoorRepo.shrinkled" | tr -d ' ')
  echo "[INFO] shrinkler: $PLAIN_SIZE -> $PACKED_SIZE bytes"
else
  echo "[WARN] shrinkler not found - the archive carries only the plain binary"
fi
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
# .txt as well as source: tests/delete-rule-cases.txt is the table the
# uninstall rules are tested against on BOTH sides of this project, and the
# C tests read it at runtime. Packing the tests without it made the packed
# source fail its own verification - which is what that verification is for.
for f in "$HERE"/tests/*.c "$HERE"/tests/*.h "$HERE"/tests/*.txt; do
  [ -e "$f" ] && cp "$f" "$PKG/src/tests/"
done
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
# Fetch whole, then truncate from the FILE. Piping curl into `head -c` makes
# head close the pipe, curl die of SIGPIPE, and the failure vanish into a
# pipeline exit status nothing checks - it wrote a short sample and reported
# success on the first run of this script.
curl -fsS "$api/list.txt"                      -o "$STAGE/list.txt"
head -c 3000 "$STAGE/list.txt"                 > "$PKG/samples/list-first-lines.txt"
# The archive to sample is CHOSEN FROM THE CATALOG, not named here. The
# first two versions of this script pinned TELSER40.LHA and ABS-PLC2.LHA;
# the catalog is curated, TELSER40 was removed from it, and the next build
# of this archive died on a 404 for a file nobody had touched. Field 10 of
# list.txt is has_doc, so this picks a row that actually has documentation
# to capture.
SAMPLE=$(awk -F'|' 'NR>1 && $10==1 {print $1; exit}' "$STAGE/list.txt")
[ -n "$SAMPLE" ] || { echo "[ERROR] no catalog row with documentation to sample"; exit 1; }
echo "[INFO] sampling $SAMPLE"
SAMPLE_ENC=$(printf '%s' "$SAMPLE" | sed 's/ /%20/g')
curl -fsS "$api/files/$SAMPLE_ENC"             -o "$PKG/samples/files-sample.txt"
curl -fsS "$api/diz/$SAMPLE_ENC"               -o "$PKG/samples/diz-sample.txt" || \
  echo "(this archive has no FILE_ID.DIZ)"     > "$PKG/samples/diz-sample.txt"
curl -fsS "$api/doc/$SAMPLE_ENC"               -o "$STAGE/doc.txt"
head -c 2000 "$STAGE/doc.txt"                  > "$PKG/samples/doc-sample.txt"
printf '%s\n' "$SAMPLE"                        > "$PKG/samples/WHICH-ARCHIVE.txt"
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
