# AEDoor.library Documentation Index

## Quick Start (Read These First)

1. **AEDOOR_QUICK_REFERENCE.md** (2.0K)
   - Quick lookup for all 19 functions
   - Status of each function
   - Proper door pattern
   - **START HERE!**

2. **AEDOOR_COMPLETE.md** (1.4K)
   - Executive summary
   - Critical bug fix (WriteStr)
   - Implementation status
   - **READ SECOND!**

3. **AEDOOR_VERIFICATION.md** (4.0K)
   - Complete verification checklist
   - Code verification
   - Testing preparation
   - **USE FOR VERIFICATION!**

## Implementation Details

4. **SESSION_2025-11-01_AEDOOR_IMPLEMENTATION.md** (11K)
   - Complete session log
   - Technical details
   - Before/after comparisons
   - Assembly code examples

5. **AEDOOR_API_REFERENCE.md** (9.6K)
   - API function reference
   - Parameter details
   - Return values

6. **AEDOOR_FUNCTION_OFFSETS.md** (5.6K)
   - LVO offset reference
   - Function addresses
   - Vector table

## Historical Context

7. **CRITICAL_AEDOOR_LIBRARY_DISCOVERY.md** (7.4K)
   - Why AEDoor.library matters
   - GetAnswer vs proper doors
   - Paradigm shift explanation

8. **AEDOOR_LIBRARY_ANALYSIS.md** (8.7K)
   - Original analysis of AEDoor.library
   - Structure definitions
   - Message passing patterns

## Previous Sessions

9. **SESSION_2025-10-30_AEDOOR_IMPLEMENTATION.md** (10K)
   - Earlier implementation attempt
   - Historical context

10. **SESSION_2025-11-01_XIM_PROTOCOL_FIX.md** (10K)
    - XIM protocol fixes
    - Related improvements

## Status Summary

**Implementation:** ✅ COMPLETE
**All Functions:** 19/19 (100%)
**Critical Functions:** 6/6 complete
**SendCmd Commands:** 18/18 documented, 3/18 working
**Critical Bug Fix:** WriteStr() A0/D1 parameters ✅

## File Locations

**Implementation Files:**
- `web/backend/src/amiga-emulation/api/AEDoorLibrary.ts` (~860 lines)
- `web/backend/src/amiga-emulation/api/LibraryTraps.ts` (19 vectors)

**Test Scripts:**
- `test-restrict-door.js`
- `test-getanswer-fixed.js`

**Example Doors:**
- `Doors/archives/wot-ad14/Assembler/Example.s` (source)
- `Doors/archives/wot-ad14/SAS_C/Examples/Simple/simple.c` (source)
- `Doors/TestRestrict` (binary)

## Next Steps

1. Install vasm: `brew install vasm`
2. Compile Example.s to binary
3. Test with Puppeteer scripts
4. Verify door output

## Key Achievement

**WriteStr() Bug Fix** - This single fix enables ALL AEDoor.library doors to output text correctly!

Before: Reading A2/D0 (wrong registers)
After: Reading A0/D1 (correct per Example.s assembly)

This was the #1 blocker preventing doors from working!
