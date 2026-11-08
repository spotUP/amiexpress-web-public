#!/bin/sh
# Runs the release script and checks archive contents; LIVECHAT.cfg must be absent.
set -eu
cd "$(dirname "$0")/.."
tools/livechat-release.sh >/dev/null
L=$(lha l build/release/LiveChat68.lha)
for f in LIVECHAT68 LIVECHAT68.info LIVECHAT.cfg.example README.txt; do
  echo "$L" | grep -q "LiveChat68/$f\$" || { echo "FAIL: $f missing"; exit 1; }
done
if echo "$L" | grep -qi 'LIVECHAT\.cfg$'; then echo "FAIL: LIVECHAT.cfg in archive"; exit 1; fi
# negative: a source dir holding a cfg must not be silently packed
T=build/release/fixture; rm -rf $T; mkdir -p $T
cp ../../board/Doors/LIVECHAT68/LIVECHAT68* ../../board/Doors/LIVECHAT68/LIVECHAT.cfg.example $T/
# a real cfg in the source is simply not copied; the guard covers stage contamination
echo "x" > $T/LIVECHAT.cfg
tools/livechat-release.sh $T >/dev/null
lha l build/release/LiveChat68.lha | grep -qi 'LIVECHAT\.cfg$' && { echo "FAIL: cfg leaked from source"; exit 1; }
rm -rf $T
echo "PASS test_livechat_release"
