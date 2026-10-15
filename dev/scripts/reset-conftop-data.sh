#!/bin/sh
#
# reset-conftop-data.sh — wipe stale Conftop.Data files so the 68K Conftop
# binary (Doors/Conftop/Conftop020.x) reinitialises from scratch on next run.
#
# Why: Conftop v2.3 (Bobo/Mystic + Looby/Insane) throws 'CONFTOP (ERROR):
# Reset date is out of range.' when the reset-date field in Conf*/Conftop.Data
# falls outside the range it validates against. We've seen this on 2026-04-24
# on live; the data file was ~2025-10 vintage. Deleting the file is safe
# because the binary recreates it (zero entries, fresh reset timestamp) the
# next time the door runs.
#
# Usage:
#   dev/scripts/reset-conftop-data.sh               # local (repo root)
#   docker exec amiexpress-bbs sh -c 'cd /app/data/bbs && sh /app/dev/scripts/reset-conftop-data.sh'
#
# (Or just pass a base dir: dev/scripts/reset-conftop-data.sh /app/data/bbs)

set -e

BASE="${1:-.}"

count=0
for f in "$BASE"/Conf*/Conftop.Data; do
    [ -f "$f" ] || continue
    rm -- "$f"
    count=$((count + 1))
    echo "reset: $f"
done

echo "Reset $count Conftop.Data file(s). Next CONFTOP run will start fresh."
