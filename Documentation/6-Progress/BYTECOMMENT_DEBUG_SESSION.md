# ByteComment Door Debug Session - 2026-01-23

## Problem Summary

The ByteComment (FAKE) door finds files and adds comment markers to Dir1, but the actual comment text is NOT being stored in Fakelist.2. The door writes 162 bytes of zeros instead of the comment.

## What Works

1. **MODE_OLDFILE fix** - AmigaDOS MODE_OLDFILE now allows writes (changed from 'r' to 'rw')
2. **File search fixed** - Removed test entry (sample.lha) from Dir1; door now finds correct file (AD-KMHH1.LHA)
3. **Comment marker** - Door successfully adds marker to Dir1 file listing
4. **Input received** - Debug logging confirmed user input ("dummy") IS written correctly to message buffer

## The Core Issue

The door writes a 162-byte record with ZEROS to Fakelist.2, even though we confirmed the input string was correctly written to memory. This suggests a disconnect between where we write and where the door reads.

## Architecture Understanding

### Message Flow
1. Door calls `getStr()` or `prompt()` in AEDoorLibrary
2. `dispatchCommand()` sends JH_LI message via `putMsg(bbsPortAddr, state.messageAddr)`
3. XIM handler receives, pauses emulator, waits for input
4. User types input, `completeLineInput()` writes to `msg.msgAddr + MESSAGE_STRING_OFFSET`
5. `reply()` calls `replyMsg()` to put message on door's reply port
6. Door's `waitForReply()` receives message, reads from `state.stringPtr`

### Key Memory Locations
- **DoorInfo structure** allocated at `difaceAddr`
- **jhMessage** embedded at `difaceAddr + 0x46` (DIFACE_MSG_OFFSET)
- **Embedded string** at `messageAddr + 0x14` (MESSAGE_STRING_OFFSET)
- **DoorInfo.dif_String** at `difaceAddr + 0x20` = pointer to `messageAddr + 0x14`

### The Consistency Check
- XIM writes to: `msg.msgAddr + 0x14`
- Door reads from: `state.stringPtr` = `state.messageAddr + 0x14`
- These SHOULD be the same if `msg.msgAddr == state.messageAddr`

## Debug Logging Added

### In io.ts (completeLineInput)
```typescript
console.log(`[DEBUG JH_LI] msgAddr=0x${msg.msgAddr.toString(16)} stringPtr=${msg.stringPtr ? '0x' + msg.stringPtr.toString(16) : 'NULL'}`);
console.log(`[DEBUG JH_LI] Writing result: "${result}" (${result.length} chars)`);
console.log(`[DEBUG JH_LI] MESSAGE_STRING_OFFSET=0x${DoorConstants.MESSAGE_STRING_OFFSET.toString(16)} (${DoorConstants.MESSAGE_STRING_OFFSET} decimal)`);
// + verification that string was written correctly
```

### In AEDoorLibrary.ts
- `getString()` - Logs stringPtr and content read
- `copyStr()` - Logs source address, destination, and content copied
- `getStr()` - Logs result string after command completes
- `prompt()` - Logs result string after command completes

## Hypotheses to Test

1. **Message address mismatch** - `msg.msgAddr` (from XIM) != `state.messageAddr` (from AEDoorLibrary)
2. **Timing issue** - String written but cleared before door reads
3. **Door bug** - ByteComment has internal bug that zeros the buffer
4. **Different input method** - Door might use method other than JH_LI for comment input

## Next Steps

1. **Run the door with new logging** - Server was started, need to test and check console output
2. **Verify address consistency** - Compare `msg.msgAddr` in XIM vs `state.messageAddr` in AEDoorLibrary
3. **Check if door calls copyStr** - If door copies string, trace where it copies from/to
4. **Compare with working doors** - Test another door that uses line input to verify our implementation

## Files Modified This Session

- `~/Code/amiexpress-web/web/backend/src/amiga-emulation/xim/io.ts` - Added debug logging
- `~/Code/amiexpress-web/web/backend/src/amiga-emulation/api/AEDoorLibrary.ts` - Added debug logging to getString, copyStr, getStr, prompt

## Server Status

Backend server was started but may need restart to pick up the TypeScript changes.

## Commands to Test

```bash
# Start servers
cd ~/Code/amiexpress-web && ./dev/scripts/start-servers.sh

# Then in BBS:
# 1. Login
# 2. Go to conference 2 (J 2)
# 3. Run FAKE door
# 4. Enter filename: AD-KMHH1.LHA
# 5. Enter comment: test123
# 6. Check console for [DEBUG JH_LI] and [AEDoorLibrary] logs
```
