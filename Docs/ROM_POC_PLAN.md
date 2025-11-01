# ROM-Based Door Execution - Proof of Concept Plan

**Date:** 2025-11-01
**Status:** Planning Phase
**Goal:** Test if using Kickstart ROM for library handling fixes the RTE/Supervisor issues

---

## Current Problem

The door crashes because:
1. Library traps return but PC ends up at wrong address (0xf00084 instead of return address)
2. RTE instructions return to invalid addresses (0xffffxx range)
3. Manual Supervisor() implementation doesn't handle nested ROM calls correctly

**Root Cause:** We're manually managing CPU state transitions that the ROM already knows how to do correctly.

---

## Proposed Solution: ROM-Based Hybrid Approach

Instead of intercepting ALL library traps, we:
1. **Load Kickstart ROM** into memory at 0xF80000 (already implemented in KickstartRom.ts)
2. **Let ROM handle low-level functions** like Supervisor(), exception handling, RTE
3. **Only intercept XIM protocol functions** we need (PutMsg, GetMsg for XIM messages)

### How It Works

```
Door calls library function:
├─ Is it XIM-related? (PutMsg to AEDoorPort, GetMsg, etc.)
│  ├─ YES → Intercept and handle in our code
│  └─ NO  → Let CPU jump to ROM, ROM handles it
│
ROM function executes:
├─ ROM sets up stack frames correctly
├─ ROM handles Supervisor mode transitions
├─ ROM does RTE with correct return address
└─ CPU returns to door code naturally
```

---

## Implementation Steps

### Step 1: Modify LibraryTraps to be Selective

Current code intercepts ALL trap addresses. Change to:

```typescript
// In LibraryTraps.handleTrap():
const trapName = this.getTrapName(pc);

// Only intercept XIM-critical functions
const interceptedFunctions = [
  'PutMsg',    // XIM messages to AEDoorPort
  'GetMsg',    // XIM messages from AEDoorPort
  'WaitPort',  // Door waiting for messages
  'FindPort',  // Finding AEDoorPort
  'AllocSignal', // For message ports
  'AddPort',   // Making ports public
];

if (interceptedFunctions.includes(trapName)) {
  // Handle it ourselves
  return this.handleFunction(trapName, ...);
} else {
  // Let it fall through to ROM
  console.log(`[LibraryTraps] Letting ROM handle: ${trapName}`);
  return false; // Don't intercept
}
```

### Step 2: Load ROM into Emulator Memory

In AmigaDoorSession.start():

```typescript
// Load Kickstart ROM
import { KickstartRom } from './KickstartRom';
const kickstart = new KickstartRom();

// Map ROM into emulator memory at 0xF80000
const romData = kickstart.getRomData();
for (let i = 0; i < romData.length; i++) {
  this.emulator.writeMemory(0xF80000 + i, romData[i]);
}

console.log('[AmigaDoorSession] Kickstart ROM loaded at 0xF80000');
```

### Step 3: Don't Continue After Trap - Let CPU Execute

In AmigaDoorSession, when trap is NOT intercepted:

```typescript
if (this.libraryTraps && this.libraryTraps.isTrapAddress(pc)) {
  const handled = this.libraryTraps.handleTrap(pc);

  if (handled) {
    // We handled it, skip to next iteration
    continue;
  } else {
    // ROM will handle it, just continue executing
    // CPU will naturally JSR into ROM code
    console.log(`[AmigaDoorSession] Letting CPU execute ROM code at PC=0x${pc.toString(16)}`);
    // DON'T continue here - let execute() run
  }
}
```

### Step 4: Expand Valid PC Range

Allow PC in ROM range (0xF80000 - 0xFFFFFF):

```typescript
// In valid PC check:
const isInDoorCode = (pc >= 0x1000 && pc < 0x3000);
const isInROM = (pc >= 0xF80000 && pc <= 0xFFFFFF);

if (!isInDoorCode && !isInROM) {
  console.log(`[AmigaDoorSession] Invalid PC: 0x${pc.toString(16)}`);
  this.terminate();
}
```

---

## Expected Results

### If It Works ✅
- Door executes past iteration 1194 (current crash point)
- No more "PC=0xf00084" followed by crash
- RTE returns to correct addresses
- Door continues to XIM communication phase

### If It Fails ❌
- ROM might get stuck waiting for hardware (CIA timer, VBLANK, etc.)
- Will need to stub those hardware registers
- But at least we'll know if the approach is sound

---

## Quick Test

Flags to add to AmigaDoorSession:

```typescript
// At top of class
private USE_ROM_FOR_TRAPS = true;  // Enable ROM-based execution
```

Then run:
```bash
node test-rom-door.js
```

Check logs for:
- "Kickstart ROM loaded"
- "Letting ROM handle: [function]"
- Does it get past iteration 1203?

---

## Advantages of This Approach

1. **Correctness** - ROM code is tested and known to work
2. **Less Code** - We don't reimplement Supervisor(), RTE handling, etc.
3. **Proper State Management** - ROM handles CPU state transitions correctly
4. **Focus on XIM** - We only implement what's unique to BBS (message passing)

## Risks

1. **ROM Might Need Hardware** - May get stuck on VBLANK/CIA waits
2. **Performance** - ROM code might be slower than direct emulation
3. **Debugging Harder** - Harder to trace through ROM code

But the proof-of-concept will tell us if it's worth pursuing!
