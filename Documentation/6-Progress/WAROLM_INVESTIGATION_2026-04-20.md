# WAROLM (`Olm`) Investigation — 2026-04-20

## Status: ROOT CAUSE IDENTIFIED + FIX APPLIED

The prior session's hypotheses (field offsets, stats[] gating, semaphore
ownership) all turned out to be wrong. The real bug was much simpler: we
were clobbering `ENV:STATS@N` on every door launch, wiping out the
logged-in user's status back to 22 (AWAITCONNECT).

## Original symptom

Two users logged in (`sysop`, `spot`). Each running Olm saw:

```
| 00 |                   |                         |                  |
|>01<| ================= | ======================= | Awating Connect  |
| 02 | ================= | ======================= | Awating Connect  |
| 03 | ================= | ======================= | Awating Connect  |
```

17 `=` in handle, 23 `=` in location, "Awating Connect" action — all nodes.

## How WAROLM actually reads node state

WAROLM does **not** read from MULTICOM memory (singlePort handle/location
fields). It reads the status from a file:

```
fopen("ENV:STATS@<nodeid>", "r")
fread(buf, 1, 0x50, file)
fclose(file)
```

It then parses **two ASCII digits at buffer offset 0x24 (36 decimal)** as a
status code — this matches the express.e format `\l\s[35]-\d[2]` (38 bytes:
35-char padded username + `-` + 2-digit code), with the digits at byte
positions 36–37.

## The branch that draws `=====`

Disassembled at WarOLM code offset 0x0704 onward (the per-node loop):

```
0x0714: bsr 0x1286           ; read ENV:STATS@<i>, return status in d0
0x0724: if d0 == 0xFF → "No Node Present" branch (0x7D8)
0x072C: if d0 == 22 (AWAITCONNECT) → placeholder branch (0x7A6)
0x0732: if d0 == 24 (SHUTDOWN)    → placeholder branch (0x7A6)
0x0734: ... normal rendering path (real handle/location) ...
```

So status 22 (AWAITCONNECT) or 24 (SHUTDOWN) produces the `=================`
placeholders for handle + location, with the action string pulled from
WAROLM's own action table (hunk1+0xCE):

```
[ 0] Idle            [ 3] Using A Door         [17] Chatting
[ 1] Download        [ 4] Read/Write Mail      [18] Logging Off
[ 2] Upload ???      [ 5] Reviewing Stats      [21] Logging On
[ 8] Viewing Dirs    [10] Viewing A File       [22] Awating Connect
[23] Scanning Mail   [24] Node Shutdown
```

## Root cause

`DosLibrary.initializeEnvironment()` (called every time a door launches)
invokes `initializeENVFiles('/tmp/ram/ENV', {...})`. That function seeded
STATS@1..STATS@8 with `{35 spaces}-22` **unconditionally**, overwriting
whatever had been written there by `setEnvStat(session, EnvStat.IDLE)` at
login.

Backend log trail confirming the race:

```
648:   [EnvStat] Writing /tmp/ram/ENV/STATS@2 (node 2, stat 0)   ← login
659:   [EnvStat] Writing /tmp/ram/ENV/STATS@1 (node 1, stat 0)   ← login
…
69964: [ENV Initializer] Created ENV:STATS@1 = "{35sp}-22"        ← door init wipes it
69965: [ENV Initializer] Created ENV:STATS@2 = "{35sp}-22"
…etc…
```

After the initializer ran, every STATS@N held `-22`, so WAROLM saw every
logged-in user as AWAITCONNECT and drew placeholder rows.

## Fix

`web/backend/src/amiga-emulation/utils/env-initializer.ts` —
`initializeENVFiles` now only creates STATS@N when the file doesn't
already exist. `setEnvStat` (acs.util.ts) owns runtime updates;
initializer just seeds the slot on first boot.

```ts
for (let i = 1; i <= totalNodes; i++) {
  const statsPath = path.join(envPath, `STATS@${i}`);
  if (!fs.existsSync(statsPath)) {
    createENVFile(envPath, `STATS@${i}`, ' '.repeat(35) + '-22');
  }
}
```

Typecheck: clean (`npx tsc --noEmit`).

## How to verify

1. Restart backend so the new code is loaded (door-watcher only watches
   `Doors/`, not `web/backend/`).
2. Remove stale STATS files: `rm /tmp/ram/ENV/STATS@*` (server must be off
   or the files will re-seed to `-22`, which is fine).
3. Log in as two users, each on a separate node.
4. Each user runs Olm — both rows should show the real handle (not `=====`)
   and the other user's status ("Idle" if at menu).
5. Check the STATS@N files mid-session: `xxd /tmp/ram/ENV/STATS@1` —
   should show the user's name left-justified, `-`, `00`.

## Follow-up applied — STATS@N reflects door status

`AmigaDoorSession.ts` previously updated only MULTICOM memory on door
launch/exit, so file-based pollers (WarOLM, MultiTop, Bulls) showed users as
"Idle" while they were in a door. Now mirrors the transition into
`ENV:STATS@<nodeId>`:

- After `multicomManager.updateNode(nodeId, username, location, ENV_DOORS)`
  on launch → `setEnvStat(bbsSession, EnvStat.DOORS)`.
- After `multicomManager.clearNode(nodeId)` on cleanup →
  `setEnvStat(bbsSession, EnvStat.IDLE)`.

Guarded on `this.config.bbsSession` being present (door-harness runs without
a BBS session should no-op).

## Remaining follow-up (not applied)

- `MulticomManager.updateNode()` still writes only to singlePort memory. If
  a door reads status from MULTICOM memory directly (WAROLM does not), the
  memory status and the file status would drift. Either align them inside
  `updateNode`, or leave memory as the stale-OK cache and make the file the
  source of truth.

## What we ruled out this session

- Wrong field offset in singlePort — WAROLM doesn't read memory at all.
- `stats[]` gating — same reason.
- `ss` semaphore ownership — same reason.
- Multi-session memory interference — same reason.
- The `=====` literals at hunk1+0x3EA/0x3FC/0x414 being emitted by
  accident: confirmed they are intentional placeholders, copied from
  offsets 0x3EA (handle) and 0x3FC (location) by the code at 0x7A6–0x7D6,
  reached via the status==22/24 compare.
