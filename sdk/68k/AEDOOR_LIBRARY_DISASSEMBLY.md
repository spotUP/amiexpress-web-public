# AEDoor.library Disassembly Project

## Goal

Map out all LVOs (Library Vector Offsets) in AEDoor.library to understand exactly how functions like `getname()`, `getlocation()`, `getbbsname()`, `GetTheDate()`, and `GetTheTime()` access memory.

## Problem

The BBSInfo population fix writes data to memory at `doorInfoAddr + 0x46`, but the library functions are not finding it. We need to reverse-engineer the library to see where it's actually reading from.

## Library Information

**File:** `~/Code/Reference/reference-boardBBS/Node0/Libs/AEDoor.library`
**Size:** 1128 bytes
**Architecture:** Amiga 68000
**Type:** Static library

## Amiga Library Structure

Amiga libraries use **negative offsets** for function vectors:

```
Library Base (A6)
    -6:  Open
   -12:  Close
   -18:  Expunge
   -24:  Reserved
   -30:  First custom function
   -36:  Second custom function
   -42:  Third custom function
   ...
```

## Functions We Need to Disassemble

From the diagnostic test failures, these are the critical functions:

1. **getname()** - Returns user's name
2. **getlocation()** - Returns user's location
3. **getbbsname()** - Returns BBS name
4. **GetTheDate()** - Returns formatted date
5. **GetTheTime()** - Returns formatted time

## Current Theory vs Reality

### Theory (Based on Documentation)

BBSInfo structure is at `DIFace + 0x46` with layout:
- +0x00: UserName[31]
- +0x1F: Location[30]
- +0x3D: BBSName[41]
- +0x66: SystemDate[20]
- +0x7A: SystemTime[20]
- +0x8E: SysopName[31]

### Reality (From Logs)

We write to:
- doorInfoAddr = 0x100100
- bbsInfoAddr = 0x100146 (0x100100 + 0x46)
- Data: user="sysop", loc="Server Room", bbsName="AmiExpress-Web"

BUT diagnostic shows:
- getname() = (empty)
- getlocation() = ` (garbage backtick)
- getbbsname() = (empty)

**Conclusion:** The library is reading from a DIFFERENT address!

## Disassembly Plan

### Step 1: Extract Jump Table

```bash
# Get library header and function table
r2 -q -c "e asm.arch=m68k; e asm.bits=32; e scr.color=0; s 0; pd 50" AEDoor.library
```

### Step 2: Identify LVO Offsets

Look for patterns like:
```asm
0x00000000:  jmp <function_address>    ; LVO -30
0x00000006:  jmp <function_address>    ; LVO -36
...
```

### Step 3: Disassemble Each Critical Function

For each function (getname, getlocation, etc.):
```bash
# Find function address from jump table
# Disassemble function body
r2 -q -c "e asm.arch=m68k; s <address>; pdf" AEDoor.library
```

### Step 4: Identify Memory Reads

Look for instructions like:
```asm
move.l (a5,0x46),a0    ; Reading from DIFace + 0x46?
move.b (a0,0x00),d0    ; Reading UserName?
```

### Step 5: Document Findings

Create a map of:
- LVO offset → Function name
- Function address → Assembly code
- Memory offsets → What they access

## Expected Findings

We need to determine:

1. **Does the library use A5 as the DIFace base?**
   - Or does it use a different register?
   - Is there a global variable with the DIFace pointer?

2. **What are the actual BBSInfo offsets?**
   - Are they really +0x46, +0x00, +0x1F, etc.?
   - Or are they different?

3. **Does CreateComm() return the DIFace address?**
   - How is this address stored?
   - How do other functions access it?

## Tools

**radare2:** For disassembly
```bash
brew install radare2  # If not installed
r2 -q -c "commands" /path/to/AEDoor.library
```

**vamos:** For runtime tracing
```bash
pip3 install amitools
vamos --log-file=trace.log /path/to/door
```

## Next Steps

1. ✅ Locate AEDoor.library binary
2. ⏳ Extract and document jump table
3. ⏳ Disassemble getname() function
4. ⏳ Disassemble getlocation() function
5. ⏳ Disassemble getbbsname() function
6. ⏳ Disassemble GetTheDate() function
7. ⏳ Disassemble GetTheTime() function
8. ⏳ Map memory layout
9. ⏳ Update door-info.util.ts with correct offsets
10. ⏳ Test diagnostic again

## Alternative Approach

If disassembly is too complex, we could:

1. **Use vamos to trace execution:**
   ```bash
   vamos --log-file=trace.log --log-level=debug doors/DIAGNOSTIC/diagnostic
   ```
   This will show all library calls and memory accesses.

2. **Compare with working Amiga:**
   - Run diagnostic on real Amiga or UAE
   - Capture memory dump
   - Compare with our emulator's memory

3. **Examine other AEDoor.library implementations:**
   - Check if there are open-source versions
   - Look for reference implementations

## Status

**Current:** Investigation phase - library disassembly needed
**Blocker:** Don't know exact memory layout library expects
**Resolution:** Complete disassembly and document all LVOs

---

**Created:** 2025-12-16
**Purpose:** Resolve BBSInfo population issue by understanding library internals
