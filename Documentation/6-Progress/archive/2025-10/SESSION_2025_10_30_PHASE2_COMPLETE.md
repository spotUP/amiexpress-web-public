# Session 2025-10-30 - Phase 2 Complete: Command-Line Arguments

## Summary

Continued door execution work. Implemented command-line arguments (argc/argv) for doors, but discovered that GetAnswer door still exits at 203 instructions regardless of arguments provided.

## Work Completed

### 1. Documented Door Architecture

Created `DOOR_ARCHITECTURE_ANALYSIS.md` with complete analysis of:
- Why GetAnswer exits early (203 instructions)
- AEDoor message port protocol
- Implementation plan for message port functions
- Expected behavior after full implementation

**Key Finding:** Door exits because it's completing its `main()` function. Without C runtime, when main() does RTS, it returns to garbage address (0x0).

### 2. Implemented Command-Line Arguments

**File Modified:** `web/backend/src/amiga-emulation/AmigaDoorSession.ts` (lines 232-264)

**Implementation:**
```typescript
// Set up command-line arguments (argc/argv)
const ARGV_BASE = 0x0F0000;
const ARGV_ARRAY = ARGV_BASE;         // Array of pointers
const ARG0_STRING = ARGV_BASE + 0x100; // "GetAnswer" string
const ARG1_STRING = ARGV_BASE + 0x200; // "0" string (node number)

// Write argv[0] = "GetAnswer"
// Write argv[1] = "0" (node number)
// Write argv[2] = NULL

// Set argc=2, argv in registers (SAS C calling convention)
this.emulator.setRegister(0, 2);           // D0 = argc
this.emulator.setRegister(8, ARGV_ARRAY);  // A0 = argv
```

**Result:**
```
D0 (argc): 2
A0 (argv): 0xf0000
  argv[0]: "GetAnswer" at 0xf0100
  argv[1]: "0" at 0xf0200
```

### 3. Testing Results

**Before argc/argv:**
- Instructions: 203
- Exit at PC=0x0

**After argc/argv:**
- Instructions: 203 (SAME!)
- Exit at PC=0x0 (SAME!)

**Conclusion:** GetAnswer door does NOT use command-line arguments, or has additional requirements we're not meeting.

## Analysis: Why GetAnswer Exits

Possible reasons:

### Theory 1: GetAnswer Expects Environment Variables
- AmigaExpress may set environment variables for doors
- Door checks for specific env vars and exits if missing
- We don't provide any environment setup

### Theory 2: GetAnswer Expects to be Launched via RunCommand()
- Amiga OS has `Execute()` and `RunCommand()` functions
- These set up proper C runtime, environment, etc.
- Our direct jump to entry point bypasses all this

### Theory 3: GetAnswer is Not a Standalone Door
- May need to be launched by AmiExpress via specific door protocol
- Express.e has `executeDoor()` function (lines 17500+)
- Sets up special memory structures before launching door

### Theory 4: GetAnswer Checks for Intuition.library
- strings output showed "intuition.library"
- Door may try to open intuition.library
- If it fails, door exits early
- We haven't implemented intuition.library at all

## Next Steps

### Option A: Implement Message Port Functions Anyway
Even if GetAnswer doesn't use them yet, we'll need these for other doors:
1. CreateMsgPort() - LVO -666
2. DeleteMsgPort() - LVO -672
3. PutMsg() - LVO -366
4. GetMsg() - LVO -372
5. WaitPort() - LVO -384

### Option B: Test with a Different Door
Find a door that:
- Uses AEDoor.library (confirmed via strings)
- Is simpler than GetAnswer
- Has source code available for reference

Example doors with source:
- `~/Code/amiexpress-web/Docs/Doors_with_Source/AEDOORS/AmiExpress/Sources/example.e`
- Simple example that just writes text and gets input

### Option C: Implement Intuition.library Stubs
If GetAnswer needs intuition.library:
1. Add OpenLibrary() stub for "intuition.library"
2. Return fake library base
3. See if door progresses further

### Option D: Study GetAnswer with Disassembler
Use objdump or similar to disassemble GetAnswer:
```bash
objdump -D -b binary -m m68k GetAnswer > GetAnswer.asm
```
Understand what it's actually trying to do in those first 203 instructions.

## Recommendation

**I recommend Option B + Option A:**

1. **Find and test the example door** from AEDoor sources
   - It's designed to demonstrate door I/O
   - Uses WriteStr(), Prompt(), GetDT() functions
   - Much simpler than GetAnswer
   - Has source code we can reference

2. **Implement message port functions** in parallel
   - Even if example door uses AEDoor.library (which abstracts message ports)
   - AEDoor.library itself uses message ports internally
   - We'll need these eventually

## Files Modified This Session

1. `~/Code/amiexpress-web/web/backend/src/amiga-emulation/AmigaDoorSession.ts`
   - Lines 232-264: argc/argv implementation
   - Lines 247-255: Node ID from bbsSession with fallback to 0

## Metrics

**Current State:**
- Instructions executed: 203
- argc/argv: ✅ Implemented and working
- Door uses argc/argv: ❌ No effect observed
- Message ports: ❌ Not yet implemented

**Code Changes:**
- Lines added: ~35
- Files modified: 1
- Documentation created: 2 (DOOR_ARCHITECTURE_ANALYSIS.md, this file)

## Conclusion

Successfully implemented argc/argv support for doors, but discovered that GetAnswer door doesn't use these arguments (or has other blockers causing early exit).

**Next session should:**
1. Try example door from AEDoor sources (simple.c or example.e compiled)
2. Implement message port functions
3. If still blocked, investigate intuition.library requirements

---
*Session Date: 2025-10-30*
*Status: Phase 2 Complete - Ready for Phase 3 (Message Ports) or Door Switch*
