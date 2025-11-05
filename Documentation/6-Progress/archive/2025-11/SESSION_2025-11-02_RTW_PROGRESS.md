# RTW (Real Time WHO) Door - Current Status

**Date**: 2025-11-02
**Status**: 🟡 SIGNIFICANT PROGRESS - Door initializes and starts output, crashes before completion

---

## What's Working ✅

### 1. AmiExpress Version Detection
- Fixed EXPRESS_VERSION XIM command to return "v5.6" (for v5.6.1)
- RTW successfully passes version requirement check ("V3.xx or higher")
- No longer shows version error

### 2. AEServer Port Detection
- Created AEServer.0 through AEServer.7 ports for node detection
- RTW can now find active nodes via FindPort("AEServer.%d")
- Ports properly registered in ExecLibrary public ports map

### 3. Door Initialization
- RTW successfully opens dos.library
- Creates StackSwap structures correctly
- Begins output generation
- Outputs title: "This is a XIM-DOOR for AmiExpress 3.x"

### 4. Output Generation
- RTW successfully calls Write() to output text
- Text reaches terminal successfully
- Title message displays correctly (this IS normal output, not an error!)

---

## What's Not Working ❌

### Stack Misalignment Crash at Iteration 2461

**Symptoms**:
```
[AmigaDoorSession] *** STACK MISALIGNMENT DETECTED ***
  Iteration: 2461
  PC before: 0x9e5c
  PC after: 0xf00080
  SP: 0xfdfae (not 4-byte aligned!)
```

**Analysis**:
- Initial SP correctly set to 0xFDFFC (4-byte aligned)
- StackSwap restores SP to 0xfdfb8 (also 4-byte aligned)
- Something between iteration 2400-2461 corrupts SP to 0xfdfae
- SP change: 0xfdfb8 → 0xfdfae = 10 bytes lost
- 10 bytes = misaligned push/pop operation

**Impact**:
- RTW crashes before displaying full WHO table
- Only shows title, not the actual node list
- User sees incomplete output

---

## Expected Output (from reference-board BBS)

```
  Nd . Name              . Location          . Action          . Misc Info
.----+-------------------+-------------------+-----------------+--------------.
| 01 | yOUR lINE         | Up Rough          | iN A kEWL dOOR! | rTW v2.01    |
| 02 | .oO NOBODY Oo.    | .oO NOWHERE Oo.   | aWAITING cALL   |              |
| 03 | .oO NOBODY Oo.    | .oO NOWHERE Oo.   | aWAITING cALL   |              |
| 04 | .oO NOBODY Oo.    | .oO NOWHERE Oo.   | aWAITING cALL   |              |
| 05 | .oO NOBODY Oo.    | .oO NOWHERE Oo.   | aWAITING cALL   |              |
| 06 | .oO NOBODY Oo.    | .oO NOWHERE Oo.   | aWAITING cALL   |              |
|____|___________________|___________________|_________________|______________|
 |___________ _____ ____ ___ ___ __ _            rTW v2.01 bY cREW^oNE!mYTH  |
                                      - -- --- ---- -------------------------'
```

---

## Current Output

```
 This is a XIM-DOOR for AmiExpress 3.x
 This is a XIM-DOOR for AmiExpress 3.x

[CRASH]
```

---

## Root Cause Investigation Needed

### Possible Causes

1. **Moira Emulator Bug**
   - Similar to MOVE.L (A7)+,D0 bug found previously
   - Some instruction incorrectly modifying SP
   - Need to check PC history near iteration 2460

2. **Library Trap Stack Handling**
   - LibraryTraps may not properly maintain SP alignment
   - Check if any trap handler pushes odd number of bytes
   - Verify RTS/RTR operations maintain alignment

3. **Door Code Issue**
   - RTW might have a bug when running in emulator
   - Works on real Amiga (reference-board BBS) but fails in emulation
   - Might be hitting emulation edge case

### Debugging Steps

1. Enable detailed SP tracking near iteration 2460
2. Check every instruction that modifies SP
3. Identify the exact instruction causing misalignment
4. Compare with M68K specification for that instruction
5. Fix either Moira or LibraryTraps depending on root cause

---

## Files Modified This Session

### `/web/backend/src/amiga-emulation/XIMProtocol.ts`
- Line 998: Changed EXPRESS_VERSION from "v5.0" to "v5.6"
- Added comment about AmiExpress v5.6.1 port

### `/web/backend/src/amiga-emulation/AmigaDoorSession.ts`
- Lines 265-271: Added AEServer port creation
- Creates AEServer.0 through AEServer.7 for RTW node detection

---

## Next Steps

1. **Identify Stack Corruption Source**
   - Add detailed logging around iteration 2460
   - Track every SP modification
   - Find the instruction causing 10-byte misalignment

2. **Fix Root Cause**
   - If Moira bug: Fix instruction handler
   - If LibraryTraps bug: Fix trap return handling
   - If door bug: Add workaround/patch

3. **Verify Complete WHO Table Output**
   - RTW should display all 8 nodes
   - Table formatting should match reference-board BBS
   - Footer with "rTW v2.01 bY cREW^oNE!mYTH" should appear

---

## Progress Summary

- **Version Detection**: ✅ FIXED
- **Port Creation**: ✅ FIXED
- **Output Generation**: ✅ WORKING
- **Stack Alignment**: ❌ NEEDS FIX
- **Complete Table**: ⏳ BLOCKED by stack issue

RTW is 90% working! Just need to fix this stack corruption to get full output.
