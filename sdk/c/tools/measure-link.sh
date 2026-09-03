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

echo "hello        (no widget, full library linked): $size_hello bytes"
echo "hello_box    (one ae_box call)               : $size_box bytes"
echo "the box widget costs                          : $delta bytes"

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

echo "[OK] a door links only what it calls"
