# Session 2025-11-02: DOS Library Fixes for WHO Door

## Summary

Fixed multiple critical bugs in DOS.library implementation while attempting to get the WHO door working. Although the WHO door still has issues, these fixes are essential for all doors that use DOS I/O.

## Fixes Made

### 1. Fixed Open() to Handle Console Device Specifications ✅

**Problem:** Open() only recognized exact matches like "*", "CON:", "CONSOLE:" but failed on parameterized console specifications like "con:10/10/320/80/Output/auto/close/wait"

**Solution:** Updated Open() to recognize ANY string starting with "con:" (case-insensitive) as a console device.

**Code Changed:** `web/backend/src/amiga-emulation/api/DosLibrary.ts:216-238`

**Before:**
```typescript
if (filename === '*' || filename === 'CONSOLE:' || filename === 'CON:') {
  // Handle console
}
```

**After:**
```typescript
const isConsoleDevice = filename === '*' ||
                       filename.toUpperCase() === 'CONSOLE:' ||
                       filename.toUpperCase().startsWith('CON:');

if (isConsoleDevice) {
  // Handle all console specifications
  fileId = this.nextFileId++;
  this.openFiles.set(fileId, {
    id: fileId,
    name: filename,
    mode: mode,
    position: 0,
    isConsole: true,
    buffer: undefined,
    realPath: undefined
  });
  console.log(`[dos.library] Open: Console device "${filename}" -> handle ${fileId}`);
}
```

**Impact:** Doors can now open console windows with specific dimensions and parameters

**Test Result:** WHO door successfully opens `con:10/10/320/80/Output/auto/close/wait` and gets handle 4

### 2. Input()/Output() Return Inherited Handles (Previous Session) ✅

**Problem:** Input() and Output() returned hardcoded handles (1, 2) instead of inherited handles from parent process.

**Solution:** Added `inheritedInput` and `inheritedOutput` fields (default 0) to match how AmiExpress launches doors with `SYS_INPUT=0, SYS_OUTPUT=0` (from express.e:3325).

**Code Changed:** `web/backend/src/amiga-emulation/api/DosLibrary.ts:538-579`

**Impact:** Doors correctly detect they don't have stdin/stdout and open console explicitly

### 3. Close() 100% AmigaDOS Spec-Compliant (Previous Session) ✅

**Changes:**
- Handle Close(0) → return success (V47+ behavior)
- Standard handles (1-3) cannot be closed → return success without closing
- Always deallocate handle even on write failure (per spec)
- Restore IoErr() on success, set on failure only

**Code Changed:** `web/backend/src/amiga-emulation/api/DosLibrary.ts:306-374`

### 4. Fixed DOS Function Signatures (Previous Session) ✅

**Problem:** All DOS functions (Open, Close, Read, Write, etc.) returned `void` instead of `number`.

**Solution:** Changed all signatures to return `number` with proper values.

### 5. Fixed LibraryTraps Return Value Handling (Previous Session) ✅

**Problem:** Library trap handlers were ignoring function return values or hardcoding 0.

**Solution:** All handlers now return the actual function result.

## WHO Door Analysis

### Observed Behavior

The WHO door (`Doors/who/who`):

1. ✅ Calls Input() → gets 0 (correct)
2. ✅ Calls Output() → gets 0 (correct)
3. ✅ Calls WaitPort()/GetMsg() early (checking for startup messages - returns 0)
4. ✅ Opens "con:10/10/320/80/Output/auto/close/wait" → gets handle 4
5. ✅ Opens "*" → gets handle 5
6. ✅ Writes banner "/X DooR by SPY/MST\n" **twice** → both succeed
7. ✅ Closes handle 4 → succeeds (-1)
8. ❌ **Loops forever calling Close(4)** → fails (0) repeatedly

### Expected Behavior

Based on .info file (TYPE=XIM) and strings in executable:
- Door should use XIM protocol (JH_REGISTER, JH_WRITE, etc.)
- Door looks for "S:Count.dat" file
- Door searches for "AEServer.%d" ports to detect active nodes

### Actual Behavior

- Door **NEVER** calls PutMsg() to send XIM messages
- Door gets stuck in infinite loop calling Close(4)
- No XIM protocol communication observed

### Possible Causes

1. **Door Bug:** The door may have a bug in its error handling/cleanup code
2. **Missing Files:** Door may fail when S:Count.dat doesn't exist (tested - still loops)
3. **Environment Issue:** Door may expect specific startup conditions we don't provide
4. **Hybrid Door:** Door may use DOS I/O for output but expect different communication method

### Loop Analysis

PC addresses in loop:
- 0x2614 → JSR Close()
- 0x2618 → (return address)
- 0x261c → (instruction, loops back)

The door appears to be stuck in code that repeatedly calls Close(4) even after it succeeds once. This suggests:
- Door may be checking Close() return value incorrectly
- Door may be in error cleanup path that loops
- Door may have logic bug

## Files Modified

1. `web/backend/src/amiga-emulation/api/DosLibrary.ts` - Fixed Open() console handling
2. `CLAUDE.md` - Added critical rules about sloppy implementations and MOIRA (previous session)

## Testing

**Test Script:** `Scripts/test-who-simple.ts`

**Results:**
- Console devices open successfully
- DOS I/O works correctly
- Banner displays (twice for some reason)
- Door loops instead of completing

## Recommendations

### For WHO Door Specifically

1. Try different WHO door executables (rtw/rtw vs who/who)
2. Create proper node information files
3. Check if door needs specific BBS environment variables
4. Consider that door may be incompatible or buggy

### For General Door Support

The fixes made are solid and follow AmigaDOS specifications. They will help:
- Doors that open console windows with parameters
- Doors that check Input()/Output() before opening console
- Doors that rely on proper Close() behavior
- All doors that use DOS library functions

## Next Steps

1. Test other doors to verify fixes work correctly
2. Focus on XIM protocol doors that actually use PutMsg()
3. Investigate why WHO door loops (may require disassembly)
4. Consider alternative WHO door implementations

## References

- AmigaDOS Specification: `NDK3.2R4/Autodocs/AG/dos`
- AmiExpress Sources: `AmiExpress-Sources/express.e` (line 3325 for door launching)
- WHO Door Strings: Shows expected files "S:Count.dat", ports "AEServer.%d", "AEDoorPort%d"
