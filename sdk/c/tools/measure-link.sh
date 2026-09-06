#!/bin/sh
# What a door pays for a library it does not use.
#
# Phase 0's proof, in the plan's own words: "build the hello door against the
# full library and record the binary size, then add a widget and record it
# again. If the first number moves, the layering is wrong."
#
# Run from sdk/c as `make measure`.

set -e

hello=build/amiga/hello
hello_box=build/amiga/hello_box

[ -f "$hello" ] || { echo "[ERROR] $hello not built - run: make amiga"; exit 1; }
[ -f "$hello_box" ] || { echo "[ERROR] $hello_box not built - run: make amiga"; exit 1; }

size_hello=$(wc -c < "$hello" | tr -d ' ')
size_box=$(wc -c < "$hello_box" | tr -d ' ')
delta=$((size_box - size_hello))

hello_list=build/amiga/hello_list
[ -f "$hello_list" ] || { echo "[ERROR] $hello_list not built - run: make amiga"; exit 1; }
size_list=$(wc -c < "$hello_list" | tr -d ' ')

echo "hello        (no widget, full library linked): $size_hello bytes"
echo "hello_box    (one ae_box call)               : $size_box bytes"
echo "hello_list   (a bordered list with a scroll bar): $size_list bytes"
echo "the box widget costs                          : $delta bytes"
echo "the list widget and its ANSI layer cost       : $((size_list - size_hello)) bytes"

# The rule, checked rather than described: a door that never calls ae_box
# must not carry its code. If the widget's symbols are IN the plain hello
# binary, the archive is being pulled in whole and the layering is wrong.
if strings "$hello" 2>/dev/null | grep -q "ae_box"; then
  echo "[ERROR] hello carries ae_box symbols - the library is linked whole"
  exit 1
fi

if [ "$delta" -le 0 ]; then
  echo "[ERROR] adding a widget did not grow the binary - the measurement is not measuring"
  exit 1
fi

# The number the plan asked for and nobody had: what a SMALL door costs. It
# was 5,048 bytes the day this was written, against a library holding every
# module. 8 KB is the ceiling; crossing it means the base cost has grown and
# somebody should know why.
if [ "$size_hello" -gt 8192 ]; then
  echo "[ERROR] the smallest door now costs $size_hello bytes, over the 8192 ceiling"
  exit 1
fi

# THE PROOF DOOR, against the 500 KB region.
#
# The plan's Risk 2 is the one nobody had measured: "Nobody has measured what
# a C SDK adds per door. If the library costs 40 KB of code plus static frame
# buffers, some existing doors stop loading." DoorRepo already needs 464 KB of
# the 500 KB available, and a door that overruns fails as DoorTooLargeError on
# this board - or, on a real Amiga with no assertDoorSegmentsFit, as silent
# BSS corruption of ExecBase.
#
# So the real door is measured too, not just the hello variants, and the
# number is checked rather than admired.
door=build/amiga/theme-picker
if [ -f "$door" ]; then
  size_door=$(wc -c < "$door" | tr -d ' ')
  region=512000
  echo "theme-picker (the proof door, widgets + theme + settings): $size_door bytes"
  echo "  that is $((size_door * 100 / region))% of the 500 KB door region"

  # 64 KB: eight times what the door costs today, and still an eighth of the
  # region. A real door crossing it means the SDK's per-door cost has changed
  # character, and the catalogue's tightest doors need re-measuring.
  if [ "$size_door" -gt 65536 ]; then
    echo "[ERROR] the proof door now costs $size_door bytes, over the 65536 ceiling"
    exit 1
  fi
fi

echo "[OK] a door links only what it calls"
