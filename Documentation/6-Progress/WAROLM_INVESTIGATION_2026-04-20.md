# WAROLM (`Olm`) Investigation — 2026-04-20

## Current symptom

With two users (`sysop` and `spot`) logged in, each running Olm sees:

```
| 00 |                   |                         |                  |
|>01<| ================= | ======================= | Awating Connect  |
| 02 | ================= | ======================= | Awating Connect  |
| 03 | ================= | ======================= | Awating Connect  |
```

Both users see the same thing: the cursor-highlighted row and the two
active user rows show `=================` (17 `=`) placeholders for
handle, `=======================` (23 `=`) for location, and
`Awating Connect` for action. Neither user sees the other's handle.

## What we know works

1. **MulticomManager writes correctly.** Log confirms:

   ```
   [MulticomManager] VERIFY singlePort[2]: handle="sysop", location="Server Room", status=0
   [MulticomManager] VERIFY singlePort[3]: handle="spot", location="-[uP rOUGH]-", status=3
   ```

   Handle at `singlePort + 0x56`, location at `+0x75`, status at `+0x52`
   — matches `axcommon.e OBJECT singlePort`.

2. **DT_NAME/DT_LOCATION for the current user works.** Olm queries them
   via XIM and the handlers return the running user's name + location
   correctly (post `d3dabc62c` DT_NAME race fix).

3. **myNode[i].s pointer linkage is wired.** `linkNodeStructures()`
   writes `SINGLE_PORTS_BASE + i*512` at `nodeAddr + 0x74` for every
   slot, matching `nodeInfo.s: PTR TO singlePort` in axcommon.e.

## What we don't know

The door has these literals in its data section:

```
0x40fa   =================     (17 bytes, '=' × 17)
0x410c   =================
0x4124   =================
0x4136   ================= No Node Present
0x4168       | %2.2s | %-17.17s | %-23.23s | %-16.16s |
```

The `%-17.17s` format field matches the placeholder width. So the door
is either (a) passing the literal `=================` as the handle
argument when it decides the handle is "not available", or (b) drawing
the placeholder as part of a separator line and the handle field
underneath is empty/spaces.

We haven't confirmed which code path produces it. radare2 can't find
direct references to the format string address because 68K code uses
PC-relative addressing for data loads, so naive `/x` search doesn't
turn them up.

## Likely root causes (in order of suspicion)

1. **Wrong field offset.** WAROLM may read handle from a different
   offset than 0x56. axcommon.e is the shared spec, but the WAROLM
   sources (from `!!!War!!!` group) might have diverged or reference an
   older / forked axcommon header where offsets differ.

2. **Stats array not populated.** `nodeInfo.stats[32]` (offset 0x30,
   64 bytes) is zero-filled by `clearMyNodeInEmulator()` and never
   written by `writeMyNodeToEmulator()`. WAROLM may gate handle display
   on `stats[i]` being non-zero ("this node has made itself visible").

3. **`ss` semaphore ownership check.** Both myNode and singlePort begin
   with an `ss` (SignalSemaphore, 46 bytes) that we zero out but never
   link into a real list. WAROLM might try to `ObtainSemaphore` on that
   address and the stub returns something that makes the door think the
   port is locked/invalid.

4. **Multi-session interference.** MulticomManager registers each
   session's emulator and writes to ALL of them on `updateNode()`. If
   the second user's session emulator init races with the first user's
   still-writing updates, singlePort memory could be transiently wrong
   at the moment WAROLM reads. (Unlikely — writes are synchronous from
   the Node side — but worth ruling out.)

## Confirmed reads via XIM (not a mystery)

WAROLM issues these XIM queries (log evidence):

- `DT_NAME (100)` → returns current user's name ("spot")
- `DT_LOCATION (102)` → returns current user's location ("-[uP rOUGH]-")
- `BB_NODEID (149)` → returns current node id
- `BB_MAINLINE (131)` → empty string (door tolerates)
- `ACTIVE_NODES (XIM)` → returns `"XXXXXXXXX_"` (10 bytes, `X` for
  active nodes, `_` for inactive — derived from per-node user file
  presence)

So WAROLM has the current user's info via XIM. The cross-node info
must come from MULTICOM memory, which is where the bug lives.

## Next-session actionable steps

1. **Install a memory-read probe** on the MULTICOM region (addresses
   0x1E0000–0x1E4000 approx) gated on `DOOR_PROBE_MULTICOM=1`. Log
   every read of that region with PC + bytes read. Run Olm with the
   probe on; diff reads vs what we wrote. First offset that diverges is
   the bug.

2. **Disassemble WAROLM's table-draw routine.** Use the format string
   at 0x4168 as an anchor — find the function that loads it, walk
   backward to the loop that reads per-node data, note the offsets it
   computes from the singlePort pointer.

3. **Test by writing a DISTINCTIVE value** (e.g. `ZZZZZZZZ`) to
   `singlePort + 0x56` and see if it appears on screen. If yes, the
   offset is right and some OTHER condition causes the `=====` fallback.
   If no, the door reads from a different offset.

4. **Check the stats[] field hypothesis.** Write non-zero bytes into
   `nodeInfo.stats` (offset 0x30-0x6F of each nodeInfo) and see if Olm
   starts showing handles.

## Data-section literals in WAROLM (for reference)

```
    | %2.2s | %-17.17s | %-23.23s | %-16.16s |       — row format
    |----^-------------------^-------------------------^------------------|
    |%s%s  Use Cursor Keys To Choose, <-' Enter To Select,  Q or ESC To Quit  %s%s|
Awating Connect                                          — empty-slot action
No Node Present                                          — no-slot message
nODE iS aWATING cONNECT oR hAS bEEN sHUT dOWN…           — abort message
nODE sTATUS: '%s', oLM iS aWAYING fOR uSER tO bECOME iDLE…
%s%s Sorry, But That User Is Ignoring You Stomp On A Key…
```

## Why this didn't get fixed this session

The bug is deep — requires either memory-read instrumentation or 68K
disassembly of the table-draw routine. Both are multi-hour tasks best
tackled with the live server up and a specific hypothesis. The prior
fixes this session (DT_NAME race, MULTICOM offsets matching axcommon.e)
were necessary preconditions — now that those are correct, the remaining
bug is in WAROLM's side of the read or in a field we aren't populating
(stats, semaphore chain, etc.).
