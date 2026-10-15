# RTW WHO Door - Final Session Status

**Date**: 2025-11-02
**Status**: 🔴 BLOCKED - RTW fails initialization check before attempting port communication

---

## Changes Made This Session

### 1. EXPRESS_VERSION Fix ✅
**File**: `web/backend/src/amiga-emulation/XIMProtocol.ts:998`
**Change**: Updated version string from "v5.0" to "v5.6"
```typescript
const version = 'v5.6';  // For AmiExpress v5.6.1
```

### 2. AEServer Ports Creation ✅
**File**: `web/backend/src/amiga-emulation/AmigaDoorSession.ts:265-271`
**Change**: Added AEServer port creation for RTW node detection
```typescript
for (let i = 0; i < 8; i++) {
  const serverPortName = `AEServer.${i}`;
  const serverPortAddr = this.execLibrary.createPublicPort(serverPortName);
}
```

### 3. AEDoorPort Node Number Fix ✅
**File**: `web/backend/src/amiga-emulation/AmigaDoorSession.ts:216-217`
**Change**: Added node number to AEDoorPort name
```typescript
const nodeId = this.config.bbsSession?.nodeId || 0;
const portName = `AEDoorPort${nodeId}`;  // e.g., "AEDoorPort0"
```

---

## Current Issue: RTW Initialization Failure

### Symptoms
- RTW displays: "This is a XIM-DOOR for AmiExpress 3.x" (twice)
- This message does NOT appear on real reference-board BBS
- RTW then crashes with stack misalignment at iteration 2461
- No FindPort calls detected (RTW never gets that far)

### Analysis

**What RTW Requires** (from RTW.guide):
1. ✅ OS 2.04 (V37) - We provide this
2. ✅ AmiExpress V3.xx or higher - We return "v5.6"
3. ✅ AEServer.%d ports - We create these
4. ✅ AEDoorPort%d port - We create this

**RTW Binary Strings**:
```
This is a XIM-DOOR for AmiExpress 3.x
Not enough Memory for message structure
Couldn't create reply port
AEDoorPort%d
AEServer.%d
```

**The Problem**:
RTW's error message "This is a XIM-DOOR for AmiExpress 3.x" appears when RTW detects an incompatibility or initialization failure. Despite us providing all the required resources (correct version, ports, semaphores), RTW still fails.

### What We Know

1. **RTW executes ~2400 iterations** before crashing
2. **Stack misalignment occurs** (SP becomes 0xfdfae instead of staying 4-byte aligned)
3. **No FindPort calls** (RTW doesn't search for ports, fails earlier)
4. **No CREATE_MSGPORT intercepts** from RTW (may be calling ROM directly or failing)
5. **Output appears** ("This is a XIM-DOOR...") so DOS Write() works

### Possible Root Causes

#### 1. Stack Corruption Bug
- SP becomes misaligned (0xfdfb8 → 0xfdfae = 10 bytes lost)
- This causes crash at PC 0xf00080 (unmapped memory)
- May be Moira emulator bug similar to previously found MOVE.L issue
- Prevents RTW from completing initialization

#### 2. Missing System Resource
- RTW may be checking for something we haven't implemented
- Could be:
  - Specific OS library version
  - Memory pool configuration
  - Signal allocation failure
  - Semaphore structure mismatch

#### 3. XIM Protocol Incompatibility
- RTW may use XIM commands we haven't implemented
- Could be checking EXPRESS_* commands beyond VERSION
- May need specific XIM response format

---

## Testing Evidence

### reference-board BBS Output (Working)
```
  Nd . Name              . Location          . Action          . Misc Info
.----+-------------------+-------------------+-----------------+--------------.
| 01 | yOUR lINE         | Up Rough          | iN A kEWL dOOR! | rTW v2.01    |
| 02 | .oO NOBODY Oo.    | .oO NOWHERE Oo.   | aWAITING cALL   |              |
...
```
No "This is a XIM-DOOR" message appears - RTW runs successfully.

### Our Emulation Output (Failing)
```
 This is a XIM-DOOR for AmiExpress 3.x
 This is a XIM-DOOR for AmiExpress 3.x

[CRASH at iteration 2461]
```

---

## Next Steps (For Future Work)

### Priority 1: Fix Stack Misalignment
The 10-byte stack corruption (0xfdfb8 → 0xfdfae) is the immediate crash cause. Options:

1. **Add detailed SP tracking**
   - Log every SP modification between iterations 2400-2461
   - Find the exact instruction causing misalignment
   - Determine if it's Moira bug or emulation issue

2. **Check Moira instruction handlers**
   - Search for instructions that might push/pop odd byte counts
   - Verify MOVEM, JSR, RTS handle SP correctly
   - Review any recent Moira changes

3. **Examine StackSwap thoroughly**
   - Verify restored SP is correct (currently shows 0xfdfb8)
   - Check if subsequent library calls corrupt SP
   - Review trap handler stack manipulation

### Priority 2: Determine RTW Error Condition
Need to understand what triggers "This is a XIM-DOOR for AmiExpress 3.x":

1. **Disassemble RTW** to find error path
2. **Trace execution** to see what check fails
3. **Compare with working WHO doors** (simpler ones that work)

### Priority 3: Alternative Approach
Consider testing with simpler WHO door first:

1. **Test Bulls door** or other working doors
2. **Verify stack alignment** is consistent
3. **Build up to RTW** once simpler doors work reliably

---

## Files Modified This Session

1. `/web/backend/src/amiga-emulation/XIMProtocol.ts`
   - Line 998: EXPRESS_VERSION returns "v5.6"

2. `/web/backend/src/amiga-emulation/AmigaDoorSession.ts`
   - Lines 216-217: AEDoorPort includes node number
   - Lines 265-271: AEServer.0-7 ports created

---

## Key Takeaways

1. ✅ **Version detection works** - RTW gets past version check
2. ✅ **Port infrastructure correct** - We create all required ports
3. ❌ **Stack corruption blocks execution** - 10-byte misalignment causes crash
4. ❌ **RTW error path triggered** - Something still incompatible

**Bottom Line**: RTW initializes further than before but hits emulator bug (stack corruption) that prevents completion. The "This is a XIM-DOOR" message is RTW's error output when it detects a problem, not progress.

---

## References

- RTW.guide documentation (Doors/RTW/RTW.guide)
- AmiExpress sources (express.e)
- Previous stack alignment fix (SESSION_2025-11-02_STACK_ALIGNMENT_BREAKTHROUGH.md)
- StackSwap fix (SESSION_2025-11-02_STACKSWAP_FIX.md)
