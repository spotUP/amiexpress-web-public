# RTW MULTICOM Fix - Based on axcommon.e Facts

## Problem
RTW was displaying trash data:
- Node 00: "sMOKING a jOINT" (hardcoded action text)
- Node 01: "z`" (random trash) instead of username "sysop"
- Node 02: "yOUR lINE" (RTW's fallback when handle is empty)
- Location: "*" (RTW's fallback when location is empty)

## Root Cause
We were guessing at the multiPort/nodeInfo structure layout. After examining the ACTUAL structure definition in `~/Code/Reference/AmiExpress-Sources/axcommon.e`, we discovered:

### What We Implemented (WRONG)
```
nodeInfo (12 bytes):
  +0: .s (PTR TO singlePort) - 4 bytes
  +4: .netSocket - 4 bytes
  +8: .offHook - 4 bytes
```

### What axcommon.e Actually Defines (CORRECT)
```e
EXPORT OBJECT nodeInfo
  handle[31]:ARRAY OF CHAR          -> 31 bytes (+0)
  netSocket:LONG                     -> 4 bytes (+31)
  chatColor:LONG                     -> 4 bytes (+35)
  offHook:LONG                       -> 4 bytes (+39)
  private:LONG                       -> 4 bytes (+43)
  stats[MAX_NODES]:ARRAY OF semiNodestat -> 64 bytes (+47)
  t: LONG                            -> 4 bytes (+111)
  s: PTR TO singlePort               -> 4 bytes (+115)
  taskSignal:LONG                    -> 4 bytes (+119)
ENDOBJECT  -> should be 124 bytes total
```

**KEY INSIGHT**: The handle (username) is at offset +0 within nodeInfo, NOT accessed via the singlePort pointer!

### Complete multiPort Structure
```e
EXPORT OBJECT multiPort
  semi:ss  ->length 46              -> 46 bytes (+0 to +45)
  list: mlh  ->length 12            -> 12 bytes (+46 to +57)
  myNode[MAX_NODES]:ARRAY OF nodeInfo -> 32 * 124 = 3968 bytes (+58 to +4025)
  semiName[20]:ARRAY OF CHAR        -> 20 bytes (+4026 to +4045)
ENDOBJECT

CONST MAX_NODES=32
```

## Fix Applied
Modified `~/Code/AmiExpress/amiexpress-web/web/backend/src/amiga-emulation/xim/bbs-info.ts` `handleMulticom()`:

1. **Changed nodeInfo size**: 12 bytes → 124 bytes
2. **Changed MAX_NODES**: 19 → 32 (per axcommon.e)
3. **Changed myNode array base**: +100 → +58 (after 46-byte semi + 12-byte list)
4. **Wrote handle at +0**: RTW reads username directly from nodeInfo.handle, not via pointer
5. **Added all nodeInfo fields**: handle, netSocket, chatColor, offHook, private, stats[32], t, s, taskSignal
6. **Fixed singlePort offsets**: status at +82 (not +84), handle at +86 (not +88), location at +117 (not +119)

## Memory Layout (After Fix)
```
MASTER_NODE_BASE = 0xB0000
  +0:    semi (46 bytes)
  +46:   list/mlh (12 bytes)
  +58:   myNode[0].handle (31 bytes) <- RTW READS THIS FOR USERNAME
  +89:   myNode[0].netSocket (4 bytes)
  +93:   myNode[0].chatColor (4 bytes)
  +97:   myNode[0].offHook (4 bytes)
  +101:  myNode[0].private (4 bytes)
  +105:  myNode[0].stats[32] (64 bytes)
  +169:  myNode[0].t (4 bytes)
  +173:  myNode[0].s -> ptr to singlePort (4 bytes)
  +177:  myNode[0].taskSignal (4 bytes)
  +181:  myNode[1].handle (31 bytes) <- Next node starts here
  ...
  +4026: semiName (20 bytes) "multiPort"
```

## Testing
After restarting backend, RTW should display:
- Node 01: Name = "sysop" (not "z`" or "yOUR lINE")
- Node 01: Location = "Server Room" (not "*")
- All other nodes: Empty (status = -1)

## Evidence-Based Development
This fix demonstrates the correct workflow from CLAUDE.md Rule #4:

1. ❌ **WRONG**: Guessing at structure layouts from partial information
2. ✅ **CORRECT**: `logs → strings → radare2 → express.e → vamos → implement`

We found the EXACT structure definition in axcommon.e by:
```bash
grep -r "multiPort" Documentation/7-Reference\ Sources/
grep -A 50 "OBJECT multiPort" Documentation/7-Reference\ Sources/AmiExpress-Sources/axcommon.e
grep -A 10 "OBJECT nodeInfo" Documentation/7-Reference\ Sources/AmiExpress-Sources/axcommon.e
```

## Next Steps
1. User restarts backend: `./dev/scripts/kill-servers.sh && ./dev/scripts/start-servers.sh`
2. User runs RTW
3. Verify output shows actual usernames and locations
4. If still wrong: Use radare2 to disassemble RTW and see EXACT offsets it reads
