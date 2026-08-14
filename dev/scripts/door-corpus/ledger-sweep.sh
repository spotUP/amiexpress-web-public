#!/usr/bin/env bash
#
# ledger-sweep.sh — Tier 2 measurement. Run each 68K corpus door through the
# single-door harness with LEDGER=1, collect its [ledger-json] line, and merge
# into a ranked real/stub/missing backlog. Uses the single-door harness (not
# the corpus runner, which hangs on state pollution).
#
# Serial only — the project rule is never >2 sustained 68K emulators
# (feedback_avoid_parallel_emulator_heat). Each door is hard-killed by its own
# process group after PER_DOOR_TIMEOUT so a hanging door can't leak an emulator
# (feedback_subprocess_timeout_leaks_emulators).
#
# Usage:
#   ledger-sweep.sh [N]        # sweep first N XIM doors (default 25)
#   ledger-sweep.sh --ids a,b  # sweep specific corpus ids
#
# Output: dev/scripts/door-corpus/triage/library-call-ledger.{json,md}

set -u
cd "$(dirname "$0")/../../.."
ROOT="$(pwd)"
PER_DOOR_TIMEOUT="${PER_DOOR_TIMEOUT:-25}"
OUTDIR="$ROOT/dev/scripts/door-corpus/triage"
mkdir -p "$OUTDIR"
RAW="$(mktemp -t ledger-raw-XXXXXX)"
trap 'rm -f "$RAW"' EXIT

# Build the (id, binary, command) work list from corpus.json.
LIST=$(python3 - "$@" <<'PY'
import json, sys
c = json.load(open('dev/scripts/door-corpus/corpus.json'))
d = c if isinstance(c, list) else c.get('doors', c)
byid = {x['id']: x for x in d}
args = sys.argv[1:]
if args and args[0] == '--ids':
    ids = args[1].split(',')
    rows = [byid[i] for i in ids if i in byid]
else:
    n = int(args[0]) if args else 25
    seen, rows = set(), []
    for x in d:
        if x.get('doorType') != 'XIM' or not x.get('binary') or not x.get('integration'):
            continue
        if x['binary'] in seen:
            continue
        seen.add(x['binary'])
        rows.append(x)
        if len(rows) >= n:
            break
for x in rows:
    print('\t'.join([x['id'], x['binary'], (x.get('command') or x['id'])]))
PY
)

total=$(printf '%s\n' "$LIST" | grep -c .)
echo "[sweep] $total doors, ${PER_DOOR_TIMEOUT}s each (serial)"
i=0
while IFS=$'\t' read -r id binary command; do
  [ -z "$id" ] && continue
  i=$((i + 1))
  printf '[sweep] %d/%d %s ... ' "$i" "$total" "$id"
  # setsid + killpg: kill the whole emulator process group on timeout.
  # Redirect to a file (never pipe — a closed pipe gives false EXIT via
  # SIGPIPE and can drop the final stderr line). SIGTERM at timeout lets the
  # harness dump the ledger; -k adds a SIGKILL fallback.
  DOORLOG=$(mktemp -t ledger-door-XXXXXX)
  # </dev/null: the door process must NOT read the loop's heredoc stdin, or it
  # consumes the rest of the work-list and the sweep stops after door #1.
  ( cd web/backend && SKIP_DB_INIT=1 SKIP_NETWORK_LISTENERS=1 LEDGER=1 \
      timeout -k 4 "$PER_DOOR_TIMEOUT" \
        npx tsx src/scripts/run-amiga-door.ts "../../$binary" 1 \
          --doortype XIM --timeout $((PER_DOOR_TIMEOUT - 5)) --command "$command" \
      > "$DOORLOG" 2>&1 < /dev/null )
  # Reap any emulator that outlived its wrapper (timeout kills the npx wrapper,
  # not always the detached tsx grandchild — feedback_subprocess_timeout_leaks).
  pkill -f "run-amiga-door.*$binary" 2>/dev/null
  json=$(grep -aE '^\[ledger-json\] ' "$DOORLOG" | tail -1 | sed 's/^\[ledger-json\] //')
  rm -f "$DOORLOG"
  if [ -n "$json" ]; then
    echo "$id"$'\t'"$json" >> "$RAW"
    echo "ok"
  else
    echo "no-data"
  fi
done <<< "$LIST"

# Merge all per-door snapshots into one ranked backlog.
python3 - "$RAW" "$OUTDIR" <<'PY'
import json, sys
raw, outdir = sys.argv[1], sys.argv[2]
RANK = {'missing': 0, 'stub': 1, 'real': 2}
agg = {}   # (lib, offset) -> entry
for line in open(raw):
    line = line.rstrip('\n')
    if not line:
        continue
    door, js = line.split('\t', 1)
    try:
        data = json.loads(js)
    except Exception:
        continue
    for e in data.get('entries', []):
        key = (e['library'], e['offset'])
        a = agg.get(key)
        if not a:
            a = {'library': e['library'], 'offset': e['offset'], 'name': e['name'],
                 'resolution': e['resolution'], 'count': 0, 'doors': set()}
            agg[key] = a
        a['count'] += e['count']
        a['doors'].update(e.get('doors', []))
        a['doors'].add(door)
        if RANK[e['resolution']] > RANK[a['resolution']]:
            a['resolution'] = e['resolution']
        if (a['name'].startswith('offset') or a['name'].startswith('unknown')) and not (e['name'].startswith('offset') or e['name'].startswith('unknown')):
            a['name'] = e['name']

entries = sorted(agg.values(), key=lambda e: (RANK[e['resolution']], -e['count']))
summary = {'real': 0, 'stub': 0, 'missing': 0}
for e in entries:
    summary[e['resolution']] += 1
out = [{**e, 'doors': sorted(e['doors'])} for e in entries]
json.dump({'summary': summary, 'entries': out}, open(f'{outdir}/library-call-ledger.json', 'w'), indent=2)

backlog = [e for e in out if e['resolution'] != 'real']
lines = ['# 68K library-call backlog (LEDGER sweep)', '',
         f"Distinct LVOs: real={summary['real']} stub={summary['stub']} missing={summary['missing']}",
         'Implement-me (stub + missing), ranked by call count:', '',
         '| calls | resolution | library | offset | function | doors |',
         '|------:|------------|---------|-------:|----------|-------|']
for e in backlog:
    ds = e['doors']
    doors = ', '.join(ds) if len(ds) <= 4 else ', '.join(ds[:4]) + f' +{len(ds)-4}'
    lines.append(f"| {e['count']} | {e['resolution']} | {e['library']} | {e['offset']} | {e['name']} | {doors} |")
open(f'{outdir}/library-call-ledger.md', 'w').write('\n'.join(lines) + '\n')
print(f"[sweep] real={summary['real']} stub={summary['stub']} missing={summary['missing']}; "
      f"{len(backlog)} in the implement-me backlog")
print(f"[sweep] report: {outdir}/library-call-ledger.md")
PY
