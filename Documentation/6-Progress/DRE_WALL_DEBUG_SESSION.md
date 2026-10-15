# dRE!Wall Door Debug Session - 2026-01-23

## Problem Statement
The dRE!Wall door allows users to type wall entries (characters echo correctly via JH_WRITE), but the entries are not saved to the `dRE!WAll.dAtA` file.

## Investigation Timeline

### Phase 1: Initial Analysis
- Examined door logs showing successful JH_HK character delivery
- Confirmed msg.string[0] contains typed characters
- Confirmed JH_WRITE echoes characters back to screen
- Data file unchanged after door exit

### Phase 2: Double replyMsg Bug (FIXED)
**Discovery**: JH_HK handler was calling `replyMsg()` twice:
1. Once inside `reply()` method
2. Again explicitly after `reply()`

**Impact**: Double reply corrupted door message state, potentially preventing proper input handling.

**Fix**: Removed explicit `replyMsg()` call after `reply()` in `io.ts`.

### Phase 3: ximPort Investigation (FIXED)
**Discovery**: Backend log showed `ximPort=1` being written to `msg.command`.

**Express.e Reference** (lines 3436-3447):
```e
CASE JH_HK
  ch:=readChar(doorTimeout)
  msg.string[0]:=ch
  msg.string[1]:=0
  msg.command:=ximPort  // XIMPort=1 for console, 2 for serial
```

**Express.e Reference** (line 28730):
```e
IF logonType=LOGON_TYPE_REMOTE THEN ximPort:=SERIAL_PORT
```

**Root Cause**: `getXimPort()` was returning 1 (CONSOLE_PORT) when it should return 2 (SERIAL_PORT) for remote users. For a web-based BBS, ALL connections are remote.

**Fix**: Changed `getXimPort()` to always return 2:
```typescript
// io.ts:1561-1564
private getXimPort(): number {
  // Web BBS: all users are remote, so always return SERIAL_PORT (2)
  return 2;  // SERIAL_PORT
}
```

### Phase 4: Testing (PENDING)
Fix applied but requires interactive testing:
1. Connect to BBS at http://localhost:8080
2. Run WALL door
3. Add a new entry
4. Verify entry persists in data file

## Technical Details

### XIM Message Structure (jhMessage)
| Offset | Field | Size | Notes |
|--------|-------|------|-------|
| 0x14 | msg.string | 128 | Character buffer |
| 0xDC | msg.data | 4 | Result code (1=success, -1=error) |
| 0xE0 | msg.command | 4 | ximPort (1=console, 2=serial) |

### Data File Format
- File: `Doors/dRE/dRE!WAll/dRE!WAll.dAtA`
- Size: 100 bytes fixed
- Contains: Username + message text with color codes

### Hypothesis
The dRE!WAll door checks `msg.command` to determine the connection type. When receiving CONSOLE_PORT (1) instead of SERIAL_PORT (2), the door may skip storing characters because it thinks it's running on a local console session.

## Files Modified
- `web/backend/src/amiga-emulation/xim/io.ts`
  - Line ~749: Removed duplicate replyMsg() call
  - Lines 1561-1564: Changed getXimPort() to return SERIAL_PORT (2)

## Verification Script
```bash
/tmp/check-wall.sh
```
Shows: Latest door log, wall data contents, recent JH_HK/ximPort log entries.

## Next Steps If Fix Fails
1. Disassemble dRE!WAll binary to understand msg.command usage:
   ```bash
   r2 -q -c "e asm.arch=m68k; e asm.bits=32; aaa; pdf" Doors/dRE/dRE!WAll/dRE!WAll
   ```
2. Add more debug logging around DOS Write() to trace buffer contents
3. Check if door uses different storage path based on ximPort
