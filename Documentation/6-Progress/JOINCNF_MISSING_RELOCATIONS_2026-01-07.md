# JoinCnf Missing Relocations Analysis - 2026-01-07

## Summary

The joincnf door crashes because it contains absolute addresses that aren't marked for relocation. However, it works on real Amiga hardware (vamos), suggesting we're missing something fundamental about how AmigaDOS loads executables.

## Evidence

### 1. Binary Structure
```
joincnf: 3 hunks, 148 relocations total
- Segment 0 (CODE): 24488 bytes, 117 relocations
- Segment 1 (BSS):  21076 bytes, 0 relocations
- Segment 2 (DATA): 37824 bytes, 31 relocations
```

### 2. Missing Relocations in Startup Code
```m68k
; At CODE offset 0x0C (file offset 0x30):
lea.l 0x8000.l, a4  ; Opcode: 49F9 0000 8000
```

**Problem:** This loads A4 with absolute address 0x8000, but there's NO relocation entry for offset 0x0C.

**Impact:** When loaded at base 0x1000:
- We set A4 = 0x14306 (DATA + 0x7FFE)
- Door overwrites with A4 = 0x8000
- All A4-relative memory accesses use wrong base

### 3. Relocation Distribution
```
CODE segment relocations:
- First relocation at offset 0x1ff6 (near end of 24KB segment)
- NO relocations in first 0x1ff6 bytes (~8KB of startup code)
```

This means the door's entire startup sequence contains hardcoded absolute addresses.

### 4. Execution Pattern
1. Door starts at PC=0x1008 ✓
2. Successfully sends 12 XIM messages ✓
3. After BB_CONFNUM reply, jumps to invalid addresses:
   - 0x1edea2, 0x1f7ae2, 0x1d1792, 0x1db3d2, 0x1e5012, 0x1eec52, 0x1f8892
4. All these addresses are beyond loaded region (ends at 0x156c8)
5. Ends up in AEDoor.library infinite loop at 0xc00000+

### 5. The Mystery: Door Works on Vamos

```bash
$ vamos --quiet doors/emp_tools/joincnf
$VER: JoinCnf 4.0  [/X DOOR]  (02-01-95) - ©1994/1995: EMPiRE/MYSTiC

 JoinCnf 4.0 is a XIM DOOR for AmiExpress 3.38+
```

**Door prints banner and runs successfully on vamos.** This proves:
- Binary is valid
- Can be loaded at arbitrary addresses
- Works on real Amiga hardware emulation

## Hypotheses

### H1: Missing Segment in pr_SegList
Maybe we're not setting up the segment list correctly and the door can't find its CODE segments?

**Status:** ✗ REJECTED - Checked segment setup, identical to working Bulls door

### H2: Wrong Base Address
Maybe door expects to be loaded at specific base (0x200000)?

**Status:** ✗ REJECTED - Tested loading at 0x200000, door jumped to addresses BEFORE CODE segment

### H3: Vamos Uses Different Loading Strategy
Maybe vamos patches the binary or applies additional relocations?

**Status:** ⚠ POSSIBLE - Would explain why door works there but not here

### H4: AmigaDOS Has Special Handling for Unrelocated Code
Maybe real AmigaDOS has some compatibility mode or special handling we're missing?

**Status:** ⚠ POSSIBLE - Would explain hardware vs emulator difference

## Addresses Analysis

Door jumps to: 0x1edea2, 0x1f7ae2, 0x1d1792, 0x1db3d2, 0x1e5012, 0x1eec52, 0x1f8892

**If door expects base 0x0:**
- These would be 0x1ed - 0x1f8 KB into memory (beyond all segments)

**If door expects base 0x200000:**
- CODE would be 0x200000 - 0x206000
- These addresses (0x1d-0x1f range) are BEFORE CODE start

**If door expects base 0x1000 (our load address):**
- CODE ends at 0x6fb0, DATA ends at 0x156c8
- These addresses are 0x182 - 0x1e3 KB beyond loaded region

**No pattern matches!** The addresses don't correspond to any logical load base.

## Stack Analysis

When crashed, stack contains:
```
SP+0  = 0x2002ec  (return address)
SP+16 = 0x200262  (return address)
```

These ARE in the 0x200000 region! If CODE were at 0x200000:
- 0x2002ec = CODE offset 0x2ec ✓
- 0x200262 = CODE offset 0x262 ✓

But we're loading at 0x1008, not 0x200000.

**Conclusion:** Door contains unrelocated absolute addresses expecting base 0x200000, yet somehow works on vamos at arbitrary base.

## Next Steps

1. **Examine vamos source code** to see how it handles unrelocated binaries
2. **Test joincnf on real Amiga hardware** (not just vamos) to verify it actually works
3. **Check if door binary is corrupted** - maybe original has relocations we're missing?
4. **Implement special handling** for binaries missing relocations in startup code
5. **Contact door author** (EMPiRE/MYSTiC) if still reachable for compilation details

## References

- HunkLoader.ts: Lines 562-583 (allocateSegmentAddresses)
- HunkLoader.ts: Lines 359-417 (applyRelocations)
- DoorLoader.ts: Lines 403-440 (A4 initialization)
- Binary structure: xxd analysis at offsets 0x00-0x30, 0x5fd0
- vamos test: Successfully prints banner, no crash
