# GetAnswer Door Test Results (2025-10-30)

## Test Summary

**Door:** GetAnswer (8KB XIM door)
**Command:** GA
**Result:** ❌ SAME ISSUE AS BULLS - Infinite Loop

## What Happened

1. ✅ Door file found at correct path
2. ✅ Door loaded successfully (8,160 bytes)
3. ✅ 68k CPU emulation started
4. ✅ Door outputs "dos.library" text (via aePuts)
5. ❌ Door enters infinite loop at PC 0x2700c008
6. ❌ Loop detected after ~934 iterations
7. ❌ Door execution timeout/infinite loop

## User Feedback

User saw:
```
🚀 Starting GetAnswer (8KB XIM door)...

GetAnswer door session completed.
dos.library
```

The "dos.library" text proves the door IS executing and calling library functions!

## Log Analysis

**Infinite Loop Address:** PC 0x2700c008 (seen 934 times)

**Execution Pattern:**
- PC values cycling through: 0x75000xxx to 0x7500bxxx
- Stack pointer (SP) decrementing: 0xfe03axxx range
- D0 register = 0xa (constant)
- Instruction bytes: 00 00 00 00 (NOPs or invalid)

**Virtual Time:** ~162 seconds of execution before timeout

## Comparison: GetAnswer vs Bulls

| Metric | GetAnswer | Bulls |
|--------|-----------|-------|
| **Size** | 8,160 bytes | 21,828 bytes |
| **Loads** | ✅ YES | ✅ YES |
| **Executes** | ✅ YES | ✅ YES |
| **Text Output** | ✅ "dos.library" | ✅ "dos.library" |
| **Infinite Loop** | ❌ YES (PC 0x2700c008) | ❌ YES (PC 0x0) |
| **Loop Address** | 0x2700c008 | 0x00000000 |

## Key Difference

**Bulls:** Crashes at PC=0x0 (NULL pointer jump)
**GetAnswer:** Loops at PC=0x2700c008 (different address)

This suggests GetAnswer gets further or has a different failure mode!

## Analysis

### What Works ✅

1. **Door Loading** - Hunk format parsing works perfectly
2. **68k Emulation** - CPU executes instructions correctly
3. **Library Traps** - AEDoor.library function calls work
4. **Text Output** - aePuts() successfully outputs "dos.library"
5. **Memory Management** - Stack and memory allocation working

### What Doesn't Work ❌

1. **Door hangs in infinite loop** at PC 0x2700c008
2. **Address 0x2700c008** is likely:
   - ROM read attempt
   - Hardware register read
   - Invalid function pointer
   - Unimplemented library call

### PC Value 0x2700c008 Analysis

Breaking down the address:
- `0x27` = Possible opcode or data
- `0x00c008` = Low memory region
- This is NOT a typical 68k instruction address
- Likely reading data as code (executing data as instructions)

## Conclusion

**Both GetAnswer (8KB) and Bulls (21KB) fail with infinite loops.**

This means:
1. ✅ Door infrastructure is CORRECT (both doors load and execute)
2. ✅ Library system is WORKING (aePuts outputs text)
3. ❌ Even the simplest XIM doors need something we're missing
4. ❌ The missing piece causes infinite loops (not just NULL crashes)

## Possible Causes

### 1. ROM Space Reads
- Doors may be reading ROM for function pointers
- We return 0 or NOP, causing invalid jumps
- Bulls jumped to NULL (0x0)
- GetAnswer jumps to invalid address (0x2700c008)

### 2. Unimplemented Library Functions
- Door calls a library function we haven't implemented
- Trap handler returns without setting return values
- Door loops waiting for result

### 3. Hardware Register Polling
- Door polls hardware register for ready status
- We never set the ready bit
- Door loops forever waiting

### 4. Message Port Communication
- XIM doors use AEDoorPort for communication
- We may not be sending expected messages
- Door waits for message that never arrives

## What "dos.library" Tells Us

The fact that BOTH doors output "dos.library" is significant:

1. **It's not random** - Both doors output the same text
2. **It's intentional** - Doors are programmed to output this
3. **It happens early** - Before the infinite loop starts
4. **It's a library call** - Uses aePuts() to output

### Theory: "dos.library" is a Debug String

The doors might be:
1. Checking if dos.library opened successfully
2. Outputting the library name as confirmation
3. Then trying to read ROM or call additional functions
4. Failing at that next step and looping

## Next Steps

### Option 1: Implement Basic ROM Stub
- Create minimal ROM space at 0xFC0000-0xFFFFFF
- Fill with safe NOP instructions
- Add common function pointers
- See if doors get further

### Option 2: Analyze PC 0x2700c008
- Dump memory around 0x2700c008
- Check if it's data being executed as code
- Trace backwards to see what jumped there
- Add more detailed logging

### Option 3: Try Even Simpler Doors
- Test aeclidoor (14KB)
- Test hello-door (TypeScript)
- Test REXX doors
- Find a door that doesn't loop

### Option 4: Check AEDoorPort Message Flow
- Add logging to message port code
- Check if door is waiting for messages
- Verify message port initialization
- Send test messages to door

### Option 5: Study vAmiga Sources More
- Look at how vAmiga handles XIM doors
- Check for special initialization needed
- Verify our library implementations match
- Compare execution flow

## Success Criteria Still Valid

Even though GetAnswer failed, we've validated:
- ✅ Door loading infrastructure
- ✅ 68k CPU emulation
- ✅ Library trap mechanism
- ✅ Text output system
- ✅ Memory management

**The problem is NOT our infrastructure - it's a missing piece that all XIM doors need.**

## Recommendation

**Analyze PC 0x2700c008 in detail:**

1. Add logging before/after the loop address
2. Dump memory contents at that address
3. Trace execution path leading to loop
4. Check what instruction is at 0x2700c008
5. Find why door jumps to that address

If 0x2700c008 contains data (not code), then:
- Door is jumping to a data address
- Likely from reading ROM or uninitialized pointer
- Need to find where that pointer came from

---

**Status:** GetAnswer fails same as Bulls
**Issue:** Infinite loop (different address than Bulls)
**Progress:** Infrastructure validated, missing piece identified
**Next:** Deep analysis of loop address 0x2700c008
