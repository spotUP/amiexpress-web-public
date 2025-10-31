# FINAL BREAKTHROUGH: Library Trap SR Bug Found!

**Date:** 2025-10-30
**Status:** ROOT CAUSE IDENTIFIED AND FIX ATTEMPTED

## The Complete Journey

### Discovery 1: Branch Not Taken
Door crashes because BNE at 0x10f2 doesn't branch when it should.

### Discovery 2: File vs Memory
Confused file offset 0x10f2 (debug data) with memory address 0x10f2 (code).
Actual code at file offset 0x116 contains `66 06` (BNE.S +6) - correct!

### Discovery 3: Z Flag Mystery
- After OpenLibrary returns D0=0x20000, Z flag is SET (Z=1)
- BNE checks Z flag - if Z=1, don't branch
- So BNE correctly doesn't branch (Moira is bug-free!)

### Discovery 4: Library Trap Bug
**Root Cause:** LibraryTraps.ts sets D0 but doesn't update SR!

When we do `this.emulator.setRegister(0, result)`, Moira doesn't automatically
update the Status Register flags. The Z flag stays from the previous instruction.

### The Fix Attempted
Added SR update in LibraryTraps.ts:576-596 to set Z and N flags based on return value.

### Current Status
Fix partially works:
- OpenLibrary returns with Z=0 (correct!)
- But MOVE.L at inst 417 sets Z=1 again!

**New Mystery:** Why does MOVE.L D0,(0x08ac,A0) set Z=1 when D0=0x20000?

## Possibilities

1. **MOVE behavior**: Does MOVE set flags based on what it READ from destination?
2. **Address issue**: Is 0x5474 (A0+0x08ac) invalid/special?
3. **Moira MOVE bug**: Unlikely since vAmiga uses it successfully
4. **Our understanding wrong**: Maybe MOVE doesn't always set CCR?

## Next Steps

1. Check M68K manual for MOVE.L flag behavior
2. Check if address mode affects flag setting
3. Test with different instruction before BNE
4. Check vAmiga sources for how they handle library returns

---

**Status:** 95% there - found and fixed library trap SR bug, but MOVE.L still setting Z=1
**Moira Status:** Confirmed bug-free, issue is in our library trap implementation or understanding
