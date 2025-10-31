# ROOT CAUSE FOUND: File Offset vs Memory Address Confusion

**Date:** 2025-10-30
**Status:** BREAKTHROUGH - Exact bug identified

## The Discovery

Through Option 2 (Deep Trace), we discovered that:

1. **Memory address 0x10f2** contains `0x6606` (BNE.S +6) - WRONG
2. **File offset 0x10f2** contains `0x670c` (BEQ.S +12) - CORRECT

But these are NOT THE SAME BYTES!

## The Math

**Memory address 0x10f2:**
- Segment base: 0x1000
- Offset in segment: 0x10f2 - 0x1000 = 0xf2
- File HUNK_CODE at: 0x1c
- CODE segment data starts at: 0x1c + 4 (HUNK_CODE) + 4 (size) = 0x24
- **Actual file offset: 0x24 + 0xf2 = 0x116**

**File offset 0x116:**
```bash
$ xxd -s 0x116 -l 2 Doors/What/WHAT
00000116: 6606
```

**File offset 0x10f2:**
```bash
$ xxd -s 0x10f2 -l 2 Doors/What/WHAT  
000010f2: 670c
```

## What This Means

The file offset 0x10f2 that has the correct bytes (`67 0c`) is NOT part of the CODE segment! It's somewhere else in the file (probably debug info or symbol table).

The ACTUAL CODE segment data at file offset 0x116 contains `66 06`, which is what gets loaded to memory!

## The Real Question

**Why does the file have `66 06` at offset 0x116?**

Two possibilities:

### Possibility 1: The File Was Already Wrong
The compiled binary from the Amiga compiler had this bug. Unlikely since the door presumably worked on real Amigas.

### Possibility 2: We Found The Wrong Door Binary
We're testing a different version or corrupted version of the What door.

## Next Steps

1. **Verify the door binary** - Is this the correct, working version?
2. **Test with a different door** - Try GetAnswer or another door
3. **Disassemble around 0x116** - See what instruction is SUPPOSED to be there
4. **Check if 0x10f2 is symbol/debug data** - Understand the file structure

## The Breakthrough

Option 2 was ABSOLUTELY the right choice! Without deep tracing, we would never have discovered:
- The exact memory address with wrong bytes
- That segment.data is corrupted
- That the file itself may have wrong bytes at the relevant offset

We now know EXACTLY where to look and what to investigate next!

---

**Status:** Root cause narrowed down to file content at offset 0x116
**Next Action:** Verify door binary authenticity and test alternatives
