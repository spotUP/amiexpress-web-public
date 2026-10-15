# dRE!WAll — Debug Handoff (2026-04-20 — third session)

**Status:** File save pipeline fully working. Author-name field in saved record is empty (`0x0d` junk). Root cause identified with express.e as source of truth — see below.

## What is working (confirmed end-to-end)

Typing a line at the WALL prompt produces:

```
CopyMem-100 LOAD   src=0x122ee0 dst=0x122f48   (existing record → node[0])
CopyMem-100 INSERT src=0x122e78 dst=0x122ee0   (new record   → node[1])
Write BPTR=4 file="dOORS:dRE/dRE!WAll/dRE!WAll.dAtA" len=100
```

`dRE!WAll.dAtA` updates on disk; the text field at offset `0x1f` contains the typed line. Mission of "make the save work" is complete — that was the primary failing claim in the earlier handoff.

## The remaining bug: `record[0..9]` (username field) is `0x0d 0x00 ... 0x00`

In the original file:
```
0x00: 6b 6f 6b 6b 69 6b 6c 68 73 00   "kokkiklhs\0"
```

In our post-fix file:
```
0x00: 0d 00 00 00 00 00 00 00 00 00   "\r\0\0..."
```

Byte 0 is `0x0d` (CR), followed by nulls. That's not a valid username.

## Where the bug lives — traced via express.e and disassembly

### What express.e says (source of truth)

`mcp__amiexpress-docs__search_express_source "DT_NAME"` → express.e:3494-3499:

```e
CASE DT_NAME
  IF (msg.data)
    AstrCopy(msg.string, loggedOnUser.name, 31)  -- READ: name → msg.string
  ELSE
    AstrCopy(loggedOnUser.name, msg.string, 31)  -- WRITE: msg.string → name
  ENDIF
```

So DT_NAME READ writes the username into `msg.string` — i.e. the **embedded buffer at offset `0x14`** of the jhMessage. Not `msg.strptr` (which express.e only uses for `JH_SMPTR`, line 3412-3413).

### What the door does (disassembled from dRE!WAll binary)

Function `0x4e2` is the AEDoor-library "query string" wrapper. At `0x23c6` (record-build path), position `0x249c` calls `0x4e2` with `D0=0x64 (=100=DT_NAME)`, `A0=SP+8` (stack scratch buffer):

```
0x4e2  : save regs, d7=d0=100, a5=a0=SP+8
0x4ea  : a0 = [A4+0x714]        ; msg buffer addr (0x122d38)
0x4ee  : [a0+0xE0] = d7          ; msg.command = 100
0x4f2  : d0 = 1
0x4f8  : [a0+0xDC] = d0          ; msg.data = 1 (READ)
0x4fc  : bsr 0x482               ; PutMsg + WaitPort + GetMsg the reply
0x4fe  : a0 = [A4+0x714] + 0x14  ; a0 = msg.string
0x506  : a1 = a5                 ; a1 = caller's SP+8
0x508  : move.b (a0)+, (a1)+     ; copy msg.string → caller buffer
0x50a  : bne 0x508               ; until NUL
```

So `0x4e2` expects the BBS to leave the username in `msg.string` (embedded @0x14). The door then copies that string into its scratch buffer.

Back in `0x23c6` after `0x4e2` returns, at `0x24b2`:

```
0x24b2  lea.l   0x8(a7), a0    ; a0 = SP+8 (now contains username from BBS)
0x24b6  movea.l a5, a1          ; a1 = record being built
0x24b8  move.b  (a0)+, (a1)+    ; copy → record[0..]
0x24ba  bne.b   0x24b8
```

This copies the post-`0x4e2` scratch buffer (supposedly the username) into the record's username field (bytes 0–n).

### Why we see `0x0d` at record[0]

Trace evidence (logs/backend.log this session):

For the **first** DT_NAME query (the one `0x4e2` uses to populate the record):

```
line 13789: [XIMMessageParser] Parsed jhMessage: Command: 100 (DT_NAME)
line 13810: [XIMProtocol] handleMessage: cmd=100 (DT_NAME) usedXimInput=true
line 13821: [GetMsg] Door received message: Command=100  String="\r"
line 13829: getMsg raw @msg+0x14..0x27: 0d 00 33 36 6d 45 6e 74 65 72 20 79 6f 75 72 20 4c 69 6e 65
                                                                 ← "\r\0 36m Enter your Line" (leftover!)
```

Between `handleMessage` at 13810 and `GetMsg` at 13821, **`XIMDataQueryHandler.handleDataQuery` does NOT fire** — I added an unconditional trace `[DT_NAME_DEBUG] handleDataQuery ENTRY cmd=100` and it does not appear for this message. It only fires for a **SECOND** DT_NAME query that the door issues LATER (after Write() already happened), and that second call correctly writes "sysop".

So the FIRST DT_NAME gets replied to by **some code path that doesn't write `msg.string`**. The door's `0x4e2` copies msg+0x14 into its scratch, which is still the stale `\r\0 36m Enter your Line` residue from a prior `JH_WRITE`. The NUL at byte 1 terminates the copy, so only `\r` makes it into `record[0]`.

### The duplicate handler to investigate

`web/backend/src/amiga-emulation/session/DoorMessageHandler.ts:876-895` has a **second** `case XIMCommand.DT_NAME` that also reads `user.username`. Its comment at line 580-583 says it should only fire when `this.ximProtocol` is null (fallback). BUT it was written at line 600+ as `processCommand`, and it's unclear whether this case is reachable when XIMProtocol *is* initialized. **Next-session target**: add an unconditional `console.log` at that case entry to confirm which handler actually fires for the first DT_NAME.

Alternative hypotheses to check at the start of next session:

1. `handleMessage` is async; the call to `handleDataQuery(msg)` at `XIMProtocol.ts:665` is **not awaited** (it's fire-and-forget). If the emulator continues executing between `handleMessage` being invoked and `handleDataQuery` writing the reply, the door may GetMsg an unmodified message. The fact that the SECOND DT_NAME DOES succeed suggests timing, not an unreachable branch.
2. XIMProtocol.handleMessage dispatches to `handleIOCommand` which has its own reply path. DT_NAME is NOT in the IO list, so this is unlikely — but worth verifying with the router-trace log I added.
3. There's a SEPARATE reply path for `usedXimInput=true` doors (native-injection injection) that pre-empts data-query handlers.

## Instrumentation added this session (safe to leave, gated on `DREWALL_TRACE=1`)

- `data-query.ts:handleDataQuery` entry log + DT_NAME case: logs user ref, write, verify, reply
- `data-query.ts:reply()`: logs pre- and post-replyMsg embedded string
- `XIMProtocol.ts:handleMessage`: router trace showing isSystem / isIO / isDataQ for cmd=100
- `exec-vectors.ts:GetMsg trap`: raw hex dump at msg+0x00, msg+0x14, msg+0x100 for cmd=100

## Scripted repro (confirmed working multiple times this session)

```bash
# 1. Start backend directly (start-servers.sh blocks on `wait` — don't use it)
cd web/backend
nohup env DREWALL_TRACE=1 BBS_DATA_DIR="$REPO_ROOT" NODE_ENV=development \
  npx tsx src/index.ts > ../../logs/backend.log 2>&1 &

# 2. Open a long-lived TCP client (nc dies on stdin EOF; use the Python helper)
nohup python3 /tmp/tcp_client.py > /tmp/bbs_io.log 2>&1 &

# 3. Drive through ANSI / login (single chars — multi-char packets get dropped)
/tmp/bbs_type.sh "A"       # ANSI
/tmp/bbs_type.sh "sysop"   # username
/tmp/bbs_type.sh "sysop"   # password

# 4. Skip bulletins (many space presses — varies by run)
for i in $(seq 1 25); do printf ' ' > /tmp/bbs_io/in.fifo; sleep 0.5; done

# 5. When you see "Write Anonymous ? (N/y):", press N
printf 'N' > /tmp/bbs_io/in.fifo

# 6. When you see "Enter your Line:", type the message
/tmp/bbs_type.sh "Testing"
```

Expected: TWO `CopyMem-100` events, WALL-LIST dump with 2 nodes, `Write BPTR=4 ... len=100`, file mtime updates. Bug: record[0] is `0x0d` instead of typed username.

## Key files

- `express.e:3494-3499` — DT_NAME protocol definition (source of truth)
- `Doors/dRE/dRE!WAll/dRE!WAll` offset `0x4e2` — AEDoor query-string wrapper
- `Doors/dRE/dRE!WAll/dRE!WAll` offset `0x24b2-0x24ba` — copies DT_NAME result into record[0]
- `web/backend/src/amiga-emulation/xim/data-query.ts:71-116` — XIMProtocol DT_NAME handler (works correctly, called for SECOND DT_NAME only)
- `web/backend/src/amiga-emulation/session/DoorMessageHandler.ts:876-895` — duplicate DT_NAME handler (suspected culprit for FIRST DT_NAME)
- `web/backend/src/amiga-emulation/XIMProtocol.ts:660-667` — data-query routing (`handleDataQuery` is not awaited)

## Prior-session fixes still in place

- `exec-vectors.ts`: CopyMem vector at LVO -624 + CopyMemQuick at LVO -630
- `LibraryTraps.ts`: LVOs.i search path (Documentation/7-Reference Sources)
- `telnet-server.ts`: localhost-only-in-production gate (so local repros can connect)
- `web/backend/src/types/untyped-modules.d.ts`: zmodem.js/pako module declarations
