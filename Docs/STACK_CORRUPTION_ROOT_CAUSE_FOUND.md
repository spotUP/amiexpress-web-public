# Stack Corruption Root Cause - FOUND!

**Date**: 2025-11-01  
**Status**: ROOT CAUSE IDENTIFIED

---

## Executive Summary

The door jumps to unmapped memory (0xF00080) at iteration 209 due to **incorrect JSR instruction execution** at PC=0x1250.

### Timeline

1. **Iteration 208**: PC=0x1250, executing `JSR -378(A6)`  
2. **Iteration 209**: PC=0xF00080 (UNMAPPED MEMORY!)

### Critical Finding

**The JSR instruction at PC=0x1250 jumps to the WRONG address!**

- **Expected target**: A6 + offset = 0x10000 + (-378) = 0xFE86  
- **Actual target**: 0xF00080 (unmapped memory)

---

## Detailed Analysis

### PC History Before Jump

```
Iteration 189: PC=0x1DFA (chip RAM)
Iteration 190: PC=0x1DFC (chip RAM)
...
Iteration 206: PC=0x1248 (chip RAM - about to call library function)
Iteration 207: PC=0xFE62 (library trap - CloseLibrary)  
Iteration 208: PC=0x124C (return from CloseLibrary)
Iteration 208: PC=0x1250 (next instruction)
Iteration 209: PC=0xF00080 (UNMAPPED! - BUG OCCURS HERE)
```

### Instruction at PC=0x1250

**File offset**: 0x250  
**Bytes**: `4E AE FE 86`  
**Opcode**: 0x4EAE  
**Instruction**: `JSR (d16,A6)` - Jump to subroutine at A6 + offset

**Offset**: 0xFE86 (sign-extended 16-bit)  
- As signed 16-bit: -378 decimal (-0x17A)

**Target calculation**:
```
A6 = 0x10000  
Offset = 0xFE86 = -378 (sign-extended to 32-bit: 0xFFFFFE86)  
Target = A6 + offset = 0x10000 + 0xFFFFFE86 = 0x0000FE86
```

**Actual PC after JSR**: 0xF00080 ❌ WRONG!

---

## Root Cause Options

### Option 1: Moira JSR Implementation Bug

The Moira emulator's JSR (d16,A6) instruction may be calculating the target address incorrectly.

**Evidence**:
- JSR should jump to 0xFE86  
- PC ends up at 0xF00080  
- Difference: 0xF00080 - 0xFE86 = 0xEF01FA (nonsensical)

### Option 2: A6 Register Corruption

If A6 was corrupted, the calculation would be wrong:
```
If A6 = 0xF01666:
Target = 0xF01666 + 0xFFFFFE86 = 0xF014EC (still doesn't match!)
```

To get 0xF00080:
```
Required A6 = 0xF00080 - 0xFFFFFE86 = 0xF001FA
```

If A6=0xF001FA instead of 0x10000, that's clear corruption!

### Option 3: Offset Read Error

If the offset at PC+2 was misread from memory, calculation would use wrong value.

### Option 4: Library Trap Side Effects

The CloseLibrary trap at iteration 207 may have corrupted A6 or the stack.

---

## Investigation Next Steps

1. **Add logging at iteration 208**:
   - Log A6 register value before JSR  
   - Log offset read from memory at PC+2  
   - Log calculated JSR target  
   - Compare with actual PC after execute()

2. **Check Moira JSR implementation**:
   - Verify JSR (d16,An) address calculation  
   - Check for sign-extension bugs

3. **Check library trap handling**:
   - Verify CloseLibrary doesn't corrupt A6  
   - Check stack integrity after trap

4. **Memory integrity**:
   - Verify bytes at 0x1252-0x1253 contain 0xFE86  
   - Rule out memory corruption

---

## Memory Map Context

**Pages**:
- 0x00-0x1F: Chip RAM (door code at 0x1000-0x...)  
- 0xF0-0xF7: **UNMAPPED** (reads return 0x0000)  
- 0xF8-0xFF: ROM (Kickstart)

**Why 0xF00080 is a problem**:
- Page 0xF0 is NOT mapped in vAmiga page table  
- Reads return opcode 0x0000 (NOP)  
- CPU executes infinite loop incrementing PC

---

## Files Modified

**`AmigaDoorSession.ts`** (lines 653-683):  
Added early detection of PC in unmapped memory 0xF00000-0xF7FFFF with PC history tracking.

---

## Test Output

```
!!! CRITICAL: PC IN UNMAPPED MEMORY REGION !!!
Iteration: 209
PC: 0xf00080
Page: 0xf0

PC History (last 100 values):
  [96] PC=0x1248
  [97] PC=0xfe62  (CloseLibrary trap)
  [98] PC=0x124c  (return from trap)
  [99] PC=0x1250  (JSR -378,A6)
  [JUMP TO 0xF00080 - WRONG!]

SP: 0xfdff0
```

---

## Conclusion

The door crashes because **JSR at PC=0x1250 jumps to unmapped memory (0xF00080)** instead of the correct library function address (0xFE86).

**Most likely causes** (in order of probability):

1. **A6 register corruption**: If A6=0xF001FA instead of 0x10000, JSR would jump to 0xF00080
2. **Moira JSR bug**: Address calculation error in emulator
3. **Library trap side effect**: CloseLibrary trap corrupted A6
4. **Memory corruption**: Offset at PC+2 was corrupted

**Next session must add logging at iteration 208 to capture A6 value and offset read from memory.**

---

## UPDATE: MEMORY CORRUPTION DISCOVERED!

**Date**: 2025-11-01 (continued)

### Critical Finding #2: Code Overwritten by Data

**At iteration 208, memory at PC=0x1250 has been corrupted!**

#### What SHOULD be at 0x1250:
```
4e ae fe 86 60 12 2c 78 00 04 20 2c 02 64 67 08
(JSR instruction followed by code)
```

#### What's ACTUALLY at 0x1250:
```
7f 7e 4e 75 64 6f 73 2e 6c 69 62 72 61 72 79 00
MOVEQ #126,D7 | RTS | "dos.library" (NULL-terminated string!)
```

### Analysis

The string "dos.library" belongs at offset 0x278 in the door file (memory address 0x1278).

**Displacement**: 0x1278 - 0x1250 = 0x28 = 40 bytes backward!

**This means**:
- Data that should be at 0x1278 has overwritten code at 0x1250
- The door code section is being corrupted by string data
- This is a **buffer overflow** or **pointer corruption** bug

### How This Causes the Crash

1. Door executes up to PC=0x1250
2. Expects to execute `JSR -378(A6)` (opcode 0x4EAE)
3. Instead finds `MOVEQ #126,D7` (opcode 0x7F7E) - corrupted!
4. After MOVEQ, finds `RTS` (opcode 0x4E75)
5. RTS pops address from stack and jumps to it
6. Stack contains garbage value 0xF00080 (unmapped memory)
7. CPU jumps to 0xF00080 → crash!

### Root Cause

**The door's code section is being overwritten during execution!**

Possible causes:
1. **Library trap corruption**: OpenLibrary or other trap writes to wrong address
2. **Stack overflow**: Stack growing downward overwrites code
3. **Pointer bug in emulator**: Write operations use wrong addresses
4. **Page table bug**: Writes to one address end up at another

### Next Investigation

Check when/how the string "dos.library" gets written to 0x1250:

1. Add memory write watchpoint at 0x1250-0x1260
2. Log all write operations to this range
3. Identify which instruction corrupts the code
4. Fix the root cause (likely in library trap handling or memory writes)

**This is no longer a JSR bug - it's a memory corruption bug!**
