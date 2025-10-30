# AEDoor.library Analysis & Implementation Plan

**Date:** 2025-10-30
**Status:** In Progress - Analyzing Amiga ROM files for proper library implementations

## Overview

This document provides analysis of the AEDoor.library binary and creates an implementation plan for fixing the door execution crash (where doors output "dos.library" then hang).

## Files Analyzed

### 1. AEDoor.library Binary
**Location:** `~/Code/amiexpress-web/Libs/AEDoor.library`
**Size:** 1,1KB (1,128 bytes)
**Type:** AmigaOS loadseg()able executable/binary
**Version:** AEDoorLib 2.7 (18 May 1996)

### 2. Kickstart ROMs Available
**Location:** `~/Code/amiexpress-web/web/backend/data/amiga-roms/`

- Kickstart v1.3 rev 34.5 (256KB/512KB)
- Kickstart v2.0 rev 36.143 (512KB)
- Kickstart v2.04 rev 37.175 (512KB)
- Kickstart v2.05 rev 37.300 (512KB)
- Kickstart v3.1 rev 40.55-40.70 (512KB)

**Note:** dos.library and exec.library are embedded in these ROMs, not separate files.

### 3. Door Source Code Examples
**AquaWho Door:** `~/Code/amiexpress-web/Doors/AquaWho/`
**What Door:** `~/Code/amiexpress-web/Doors/What/SOURCECODE/`

## AEDoor.library Binary Analysis

### String Table (from hexdump)
```
0x00040: "AEDoor.library"
0x00050: "$VER: AEDoorLib 2.7 (18 May 1996)\r\n"
0x00070: "dos.library"
0x00410: "AEDoorPort"
0x00420: "DoorReplyPort"
```

### Jump Table Analysis (offsets at 0x00080-0x000B0)
```
00000080  00 30 00 00  00 6e 00 00  00 a0 00 00  00 c0 ff ff
00000090  00 72 00 80  00 96 00 de  00 e2 01 ea  02 64 02 44
000000a0  02 24 02 34  02 9e 02 a4  02 aa 02 c2  03 00 03 06
000000b0  03 0c 03 12  03 18 03 32  03 48 03 62  03 70 ff ff
```

This appears to be a function jump table. Each 32-bit value (big-endian) represents an offset.

### Discovered Function Offsets (from testing)

From our door execution testing, we discovered these offsets are being called:

#### AEDoor.library (base 0xFF4000):
- `-16655` (0xFFFFBEF1) - **aeGetCh()** - Read character (non-blocking)
- `-16657` (0xFFFFBEEF) - **CheckInput()** - Check if input available
- `0xFF0000` (16711680) - Unknown (maybe WriteChar?)
- `0xFF0001` (16711681) - Unknown
- `0xFF0002` (16711682) - Unknown
- `0xFF0003` (16711683) - Unknown
- `0xFF0005` (16711685) - Unknown
- `16743716` (0xFF7D04) - Unknown
- `16743718` (0xFF7D06) - Unknown
- `16743898` (0xFF7DDA) - Unknown
- `16744034` (0xFF7E62) - Unknown
- `16744036` (0xFF7E64) - Unknown
- `16744142` (0xFF7ECE) - Unknown
- `16744144` (0xFF7ED0) - Unknown
- `-28` - Unknown

#### exec.library (base 0xFFFF8000):
- `-32492` - Unknown (likely custom AX extension)
- `-32490` - Unknown (likely custom AX extension)
- `-32748` - Unknown (likely custom AX extension)

### Known AEDoor Functions (from door source code)

From analyzing `~/Code/amiexpress-web/Doors/What/SOURCECODE/What.c`:

```c
DoorStart(argv[1]);                          // Initialize door
putuserstring(177, WRITE, "WHAT v2.0");     // Get/set user data
getuserstring(bbspath, 128);                 // Get user data
sendmessage("text\r\n");                     // Output to user
end();                                        // Close door
```

From express.e source code:
```
aePuts(string)          // Output string
aeGetCh()               // Get character (non-blocking)
aePutCh(char)           // Output character
```

## Current Implementation Status

### What Works ✅
- Door loads successfully (4 hunk segments)
- 68k CPU executes ~1.6M instructions
- Library trap mechanism works (JSR to base+offset)
- Output to browser works (saw "dos.library" text)
- Input from browser works (previous session verified)
- NIL: device opens successfully (handle 99)
- Console ("*") opens successfully (handle 2)
- All 19 discovered offsets have NOP handlers

### What Doesn't Work ❌
- **Door crashes to garbage memory** (PC 0x27093dda)
- Instruction bytes at crash point are `00 00 00 00` (zeros)
- Door expects real implementations, not NOPs
- Library functions return 0 instead of proper values

### Root Cause

The problem is that our stub implementations return 0 or success codes, but the door expects:
- **Function pointers** (not 0)
- **Valid memory addresses**
- **Proper library base addresses**
- **Actual file handles with operations**

When a stub returns 0 instead of a valid pointer, the door tries to use it and jumps to invalid memory.

## Implementation Plan

### Phase 1: Extract Function Vectors from AEDoor.library 📋

**Goal:** Reverse-engineer the AEDoor.library binary to map offset → function name

**Approach:**
1. Analyze the jump table at offset 0x80-0xB0
2. Disassemble the library code sections
3. Match known function calls (aePuts, aeGetCh) to offsets
4. Cross-reference with door source code usage

**Tools needed:**
- objdump with m68k support
- Hex editor analysis
- Comparison with known Amiga library structures

### Phase 2: Analyze dos.library & exec.library from Kickstart ROM 📋

**Goal:** Extract real implementations of dos.library and exec.library functions

**Approach:**
1. Load Kickstart v3.1 ROM (most common)
2. Find library base addresses in ROM
3. Extract function jump tables
4. Disassemble critical functions:
   - dos.library: Open, Close, Read, Write, WaitForChar
   - exec.library: AllocMem, FreeMem

**Challenge:** Kickstart ROMs are 512KB of 68k code - we need to find the library structures

### Phase 3: Implement Critical Functions 🎯

**Priority 1 - I/O Functions:**
```typescript
// AEDoor.library
aePuts(string)          // Output string - CRITICAL
aePutCh(char)           // Output character - CRITICAL
aeGetCh()               // Get character - CRITICAL (already implemented)
```

**Priority 2 - Door Lifecycle:**
```typescript
// AEDoor.library
DoorStart()             // Initialize door - CRITICAL
DoorEnd()               // Cleanup door - CRITICAL
putuserstring()         // Get/set user data
getuserstring()         // Get user data
```

**Priority 3 - System Functions:**
```typescript
// dos.library (already partially implemented)
Open()                  // Open file - needs real file system
Close()                 // Close file
Read()                  // Read from file
Write()                 // Write to file - working but limited
WaitForChar()           // Wait for input - working

// exec.library (already partially implemented)
AllocMem()              // Allocate memory - working
FreeMem()               // Free memory - working
```

### Phase 4: Test Incrementally 🧪

After implementing each function:
1. Deploy to backend
2. Run door via BBS interface
3. Check backend logs for errors
4. Note which new offset is called
5. Implement that offset
6. Repeat until door completes

### Phase 5: Document & Refine 📝

Create complete documentation:
- All AEDoor.library function offsets
- All dos.library function offsets
- All exec.library function offsets
- Implementation notes for each
- Testing results

## Next Steps

**Immediate Action Required:**

1. **Analyze AEDoor.library binary structure**
   - Extract jump table
   - Map offsets to code locations
   - Identify function signatures

2. **Extract dos.library from Kickstart ROM**
   - Load Kickstart v3.1 ROM
   - Find dos.library base address
   - Extract function implementations

3. **Implement aePuts() first**
   - Most critical missing function
   - Door calls it to output "dos.library"
   - Need to map correct offset

4. **Deploy and test**
   - See if door progresses further
   - Log next missing function
   - Implement that function

## Resources

### Documentation Links
- Amiga ROM Kernel Manual (dos.library): http://amigadev.elowar.com/read/ADCD_2.1/Includes_and_Autodocs_2._guide/node059A.html (SSL cert issue)
- AmiExpress Wiki: https://github.com/dmcoles/AmiExpress/wiki
- AquaWho Door Doc: `~/Code/amiexpress-web/Doors/AquaWho/AquaWho.doc`

### Source Code References
- AmiExpress main: `~/Code/amiexpress-web/AmiExpress-Sources/express.e`
- Door examples: `~/Code/amiexpress-web/Doors/`
- What door source: `~/Code/amiexpress-web/Doors/What/SOURCECODE/What.c`

### Binary Files
- AEDoor.library: `~/Code/amiexpress-web/Libs/AEDoor.library`
- Kickstart ROMs: `~/Code/amiexpress-web/web/backend/data/amiga-roms/`
- AquaWho door: `~/Code/amiexpress-web/Doors/AquaWho/AquaWho` (multiple versions)

## Progress Tracking

- [x] Discovered 19 library offsets being called
- [x] Added NOP handlers for all discovered offsets
- [x] Fixed NIL: device support
- [x] Door successfully outputs text to browser
- [ ] Extract AEDoor.library function vectors
- [ ] Analyze Kickstart ROM structure
- [ ] Implement aePuts() with proper offset
- [ ] Implement DoorStart() initialization
- [ ] Test door with real implementations
- [ ] Document all function offsets

---

**Status:** Ready to begin Phase 1 - AEDoor.library analysis
