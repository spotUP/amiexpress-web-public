# ROM Integration Status (2025-10-30)

## Summary

**Kickstart ROM has been successfully loaded and integrated!** However, doors still fail with infinite loops.

## What We Accomplished ✅

### 1. Created ROM Loader (`KickstartRom.ts`)
- Loads Kickstart 3.1 ROM (512KB) from disk
- Provides methods to read bytes/words/longs from ROM
- Extracts exception vectors and system pointers
- Displays ROM information for debugging

### 2. Integrated ROM into AmigaDoorSession
- ROM loads on every door execution
- ROM is mapped to memory at 0xF80000-0xFFFFFF
- Exception vectors copied from ROM to low memory (0x000000-0x0003FF)
- All 524,288 bytes of ROM successfully mapped

### 3. Removed ROM Read Interception
- Previously we were intercepting ROM reads and returning 0
- Now CPU can read actual ROM data from memory
- ROM contains all Kickstart 3.1 OS functions and data

## ROM Loading Confirmation

From the logs:
```
[ROM] Loaded 524288 bytes (512KB)
[ROM] Kickstart 3.1 loaded successfully
[ROM] Mapped to memory range: 0xF80000 - 0xFFFFFF
[ROM] Initial SSP: 0x11164ef9
[ROM] Initial PC:  0x002000d2
[ROM] Exception Vectors:
  Vector 0 (Initial SSP): 0x11164ef9
  Vector 1 (Initial PC): 0x002000d2
  Vector 2 (Bus Error): 0x0000ffff
  Vector 3 (Address Error): 0x00280044
  ...
[AmigaDoorSession] Mapping ROM to memory 0xF80000 - 0xFFFFFF...
[AmigaDoorSession] Mapped 524288 bytes of ROM
[AmigaDoorSession] Initializing exception vectors from ROM...
[AmigaDoorSession] Exception vectors initialized
```

**ROM is definitely loading and mapping correctly!**

## The Remaining Problem ❌

### Doors Still Fail with Infinite Loops

**GetAnswer door:**
- Loads ✅
- Executes ✅
- Outputs "dos.library" ✅ (proves aePuts works)
- Then enters infinite loop with PC jumping around:
  - PC values like: 0x2739d250, 0x273da2e0, 0x27417370...
  - Instruction bytes: 00 00 00 00 (NOPs or uninitialized memory)
  - Stack pointer stable at 0xfe098
  - D0 register = 0x75

**Bulls door:**
- Same behavior
- Infinite loop at different addresses

### Analysis

The PC values (0x27...) are **way outside normal memory range**:
- Normal Amiga memory: 0x000000 - 0x1FFFFF (chip RAM)
- ROM: 0xF80000 - 0xFFFFFF
- Our door code: 0x001000 - 0x00FFFF

**PC at 0x27xxxxx is executing random memory or wrapping around!**

## Possible Causes

### 1. Missing Library Initialization
- ROM contains library function tables
- Programs expect libraries to be initialized (exec.library base pointers set up)
- We load ROM but don't RUN the ROM boot code
- ROM boot code normally:
  - Initializes hardware
  - Sets up library base pointers in low memory
  - Creates system tasks and processes
  - Sets up interrupt vectors

**We skip all this and jump directly to the door!**

### 2. Exception Vector Mismatch
- We copy exception vectors from ROM to low memory
- But ROM exception vectors point to ROM code
- When an exception happens, CPU jumps to ROM code
- ROM code expects a fully initialized system
- System isn't initialized → crash

### 3. Library Base Pointers Not Set
- Programs call libraries via base pointers in A6
- Base pointers stored in low memory (set by ROM boot code)
- We don't run ROM boot code
- Base pointers are garbage or 0
- Library calls fail

### 4. System Structures Missing
- ROM expects various system structures in memory:
  - ExecBase at 0x000004
  - Interrupt vectors
  - Task lists
  - Device lists
- We don't create these
- Any code that accesses them gets garbage

## What "dos.library" Output Tells Us

The fact that BOTH doors output "dos.library" before crashing is significant:

1. **Our library trap system works** ✅
2. **aePuts() function works** ✅
3. **Text I/O works** ✅
4. **Doors execute code successfully** ✅

The crash happens AFTER successful library calls, probably when:
- Door tries to call a ROM function
- Door checks a system structure
- Door reads a library base pointer
- Exception occurs and ROM exception handler fails

## Solutions

### Option 1: Initialize System Structures (Recommended)
Instead of running full ROM boot code, manually initialize the minimum required:

```typescript
// Set up ExecBase pointer at 0x000004
memory[0x000004] = pointer to fake ExecBase structure

// Create minimal ExecBase structure:
struct ExecBase {
  LibNode (library header)
  ChkBase, ColdCapture, CoolCapture, WarmCapture
  SysStkUpper, SysStkLower
  MaxLocMem
  ... etc
}

// Point exception vectors to safe handlers that just return
for (let i = 0; i < 256; i++) {
  memory[i * 4] = pointer to safe exception handler
}

// Set up library base pointers
memory[0x000004] = ExecBase
// dos.library base
// intuition.library base
// etc.
```

**Pros:**
- Gives doors what they expect
- Minimal implementation
- No ROM code execution needed

**Cons:**
- Complex - need to understand all required structures
- May miss something doors need

### Option 2: Run ROM Boot Code
Execute ROM boot code up to the point where system is initialized:

```typescript
// Set PC to ROM Initial PC (0x002000d2 from ROM)
// Set SP to ROM Initial SSP (0x11164ef9 from ROM)
// Let ROM boot code run until it's ready
// Then jump to door code
```

**Pros:**
- Proper Amiga initialization
- Everything set up correctly

**Cons:**
- ROM boot code expects hardware (chips, drives, etc.)
- May try to access hardware we don't emulate
- Very complex to get right

### Option 3: Hybrid - Stub System Functions
Keep our current approach but add stubs for ROM functions doors might call:

```typescript
// When door calls ROM function:
// - Check if it's a known function (Open, Close, Read, Write, etc.)
// - If yes: execute our stub
// - If no: return safe default

// Example ROM function stubs:
function romOpen(name, mode) {
  // Implement file open
  return fileHandle;
}

function romClose(handle) {
  // Close file
}
```

**Pros:**
- Incremental approach
- Add stubs as needed

**Cons:**
- May need many stubs
- Hard to know what's needed

## Recommended Next Step

**Implement minimal ExecBase and library base pointers:**

1. Create fake ExecBase structure at 0x000004
2. Set up exception vectors to point to safe handlers
3. Initialize library base pointers for:
   - exec.library
   - dos.library
   - AEDoor.library (our custom library)
4. Test doors again

This gives doors the minimum system environment they expect without having to run ROM boot code or emulate hardware.

## Files Modified

1. `web/backend/src/amiga-emulation/KickstartRom.ts` (NEW)
   - ROM loader class

2. `web/backend/src/amiga-emulation/AmigaDoorSession.ts`
   - Added ROM loading
   - Added ROM mapping
   - Added exception vector initialization

3. `web/backend/src/amiga-emulation/api/AmigaDosEnvironment.ts`
   - Removed ROM read interception (was returning 0)

## Current Status

- ✅ ROM loads successfully
- ✅ ROM maps to memory
- ✅ Exception vectors initialize
- ❌ Doors still fail (infinite loops)
- ❌ Missing system structure initialization

## Success Criteria

Doors will work when:
- They can call ROM functions (or our stubs)
- System structures exist in expected locations
- Library base pointers are valid
- Exception handlers work correctly

---

**We're very close!** The infrastructure is correct - we just need to provide the system environment doors expect.
