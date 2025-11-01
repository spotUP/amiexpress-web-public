# ROM-Based Door Crash - Offset Trap Detection Solution

**Date:** 2025-11-01
**Status:** IN PROGRESS - Collision Issue Discovered
**Branch:** Offset-based trap detection implementation

---

## Problem Summary

Door crashes at iteration 1186 when calling `Supervisor()` with A6=0x0:

1. Door sets A6=0x0 (corrupted library base)
2. Executes `JSR -30(A6)` → PC = 0xFFFFFFE2
3. LibraryTraps.isTrapAddress(0xFFFFFFE2) = FALSE (only recognizes 0x10000 + offset)
4. CPU executes ROM padding (0xFFFF) at that address
5. Crash at PC=0x3

---

## Root Cause Analysis

**Initial Setup (CORRECT)**:
- ✅ ROM loaded at 0xF80000-0xFFFFFF (524KB)
- ✅ ExecBase created at 0x010000, pointer at 0x000004
- ✅ A6 initialized to 0x010000
- ✅ LibraryTraps configured for base addresses

**What Goes Wrong**:
1. Door code overwrites A6 to 0xfffe (unknown reason)
2. Door later sets A6=0x0
3. Door calls Supervisor() with invalid A6
4. Trap detection fails because it only checks pre-calculated absolute addresses

---

## Solution Attempted: Offset-Based Trap Detection

### Concept

Instead of checking if PC matches a known trap address, check if the OFFSET from A6 matches a known library vector:

```typescript
offset = PC - A6
if (offset == -30) { // Supervisor
  handleTrap();
}
```

This works regardless of what A6 contains.

### Implementation

**Files Modified:**
1. `web/backend/src/amiga-emulation/AmigaDoorSession.ts` (lines 597-627)
2. `web/backend/src/amiga-emulation/api/LibraryTraps.ts` (added offsetMap)

**Key Code Changes:**

```typescript
// AmigaDoorSession.ts - Offset calculation
const traceA6 = this.emulator.getRegister(14);
let offset = tracePc - traceA6;

// Sign-extend negative offsets
if (offset > 0x7FFFFFFF) {
  offset = offset - 0x100000000;
}

// Check if offset matches known vector
if (offset < 0 && offset >= -2000 &&
    this.libraryTraps.isTrapOffset(offset)) {
  this.libraryTraps.handleTrapByOffset(offset, traceA6);
}
```

```typescript
// LibraryTraps.ts - New data structures
private offsetMap: Map<number, LibraryVector> = new Map();
private offsetLibraryMap: Map<number, any> = new Map();

// Store vectors by offset during installation
this.offsetMap.set(vector.offset, vector);
this.offsetLibraryMap.set(vector.offset, library);
```

---

## Critical Issue Discovered: Offset Collision

**Problem:** Multiple libraries use the same offsets!

Example:
- Exec.library Supervisor: offset -30 at 0x010000 + (-30) = 0xFFE2
- DOS.library Open: offset -30 at 0x020000 + (-30) = 0x1FFE2

When we do:
```typescript
this.offsetMap.set(-30, vector);  // First: Supervisor
this.offsetMap.set(-30, vector);  // Second: Open (OVERWRITES!)
```

The second vector overwrites the first, breaking trap detection for Supervisor.

---

## Why This Matters

When A6=0 and offset=-30:
1. We detect offset=-30 is a library call ✓
2. We look up offsetMap.get(-30)
3. We get DOS.library Open (wrong!) instead of Exec Supervisor
4. Handler fails or produces incorrect behavior

---

## Solutions to Explore

### Option 1: Store Array of Vectors Per Offset

```typescript
private offsetMap: Map<number, LibraryVector[]> = new Map();

// During installation
if (!this.offsetMap.has(vector.offset)) {
  this.offsetMap.set(vector.offset, []);
}
this.offsetMap.get(vector.offset).push(vector);

// During lookup - try all matching vectors
const vectors = this.offsetMap.get(offset);
for (const vector of vectors) {
  if (tryHandle(vector)) break;
}
```

**Pros:** Handles all collisions
**Cons:** Ambiguous which handler to call

### Option 2: Infer Library From Context

When A6=0, use heuristics:
- Check recent A6 values (was it 0x010000 or 0x020000?)
- Check stack for clues
- Default to Exec.library for common offsets

**Pros:** More accurate
**Cons:** Complex, fragile

### Option 3: Special Case Common Offsets

For collision-prone offsets like -30, hardcode priority:
```typescript
if (offset === -30 && A6 === 0) {
  // Door with A6=0 is likely calling Exec Supervisor
  return handleExecSupervisor();
}
```

**Pros:** Simple, handles known cases
**Cons:** Not general, requires manual updates

### Option 4: Hybrid Approach

Combine offset detection with ROM-based execution:
- For A6=valid base: Use offset-based detection
- For A6=0 or invalid: Let ROM handle it, intercept XIM functions only

**Pros:** Leverages actual ROM code
**Cons:** Requires proper ROM initialization (original option 3 from earlier)

---

## Current Status

- ✅ Offset calculation working correctly (PC=0xFFFFFFE2, A6=0x0 → offset=-30)
- ✅ offsetMap populated during vector installation
- ❌ Offset collision prevents Supervisor detection (overwritten by DOS Open)
- ❌ Door still crashes at iteration 1186

---

## Recommended Next Steps

1. **Implement Option 1** - Store arrays of vectors per offset
2. **Add fallback logic** - If multiple vectors match, try each until one succeeds
3. **Add logging** - Track which vector handler succeeded for debugging
4. **Test** - Verify Supervisor trap is detected and handled with A6=0

---

## Alternative: Fix A6 Corruption

Instead of working around A6=0, investigate WHY A6 becomes 0:
- Is the door intentionally clearing A6?
- Is there a missing data structure we should provide?
- Check AmiExpress door calling convention documentation

This might be the cleaner long-term solution.

---

## Testing

**Current test**: `node test-ga-door.js`

**Expected behavior after fix**:
- Door reaches iteration 1186
- Trap detected: "LIBRARY TRAP at PC=0xffffe2 (A6=0x0, offset=-30)"
- Supervisor handler executes
- Door continues past iteration 1203

**Current behavior**:
- No trap detected
- ROM padding (0xFFFF) executed
- Crash at PC=0x3

---

## Code Locations

**Trap Detection:**
- `web/backend/src/amiga-emulation/AmigaDoorSession.ts:597-627`

**Offset Maps:**
- `web/backend/src/amiga-emulation/api/LibraryTraps.ts:468-472`

**Vector Installation:**
- `web/backend/src/amiga-emulation/api/LibraryTraps.ts:520-522` (Exec)
- `web/backend/src/amiga-emulation/api/LibraryTraps.ts:554-556` (DOS)
- `web/backend/src/amiga-emulation/api/LibraryTraps.ts:588-590` (AEDoor)

**New Methods:**
- `LibraryTraps.isTrapOffset()` - Line 750
- `LibraryTraps.handleTrapByOffset()` - Line 759

---

## Related Documents

- `Docs/ROM_POC_PLAN.md` - Original ROM-based approach plan
- `Docs/GA_DOOR_INFINITE_LOOP_FIX.md` - Previous door debugging
- `Docs/XIM_DOOR_DEBUG_SESSION_2025_10_31.md` - XIM protocol work
