# JoinCnf Root Cause - 2026-01-07

## Summary

**ROOT CAUSE FOUND:** The door's BSS clear loop overwrites its own CODE segment because the LEA instruction at offset 0x3C has NO relocation entry.

## The Smoking Gun

```m68k
; File offset 0x3A-0x4C (PC 0x2032-0x2044 when loaded at 0x2008):
0x3A: lea.l  $FE0, A3       ; A3 = 0xFE0 (SHOULD be BSS + 0xFE0!)
0x40: moveq  #0, D1         ; D1 = 0
0x42: move.l #$20F8, D0     ; D0 = 8440 (loop counter)
0x48: bra.b  $4C
0x4A: move.l D1, (A3)+      ; [A3] = 0, A3 += 4
0x4C: dbra   D0, $4A        ; Loop 8441 times
```

**Problem:** Offset 0x3C (the operand to LEA) has **NO relocation entry**.

## Memory Layout (when loaded at base 0x2000)

```
CODE: 0x2008 - 0x7FB0 (24488 bytes)
BSS:  0x8000 - 0xD254 (21076 bytes)
DATA: 0xD300 - 0x166C0 (37824 bytes)
```

## What Should Happen

```
A3 = BSS_base + 0xFE0 = 0x8000 + 0xFE0 = 0x8FE0
Loop writes: 0x8FE0 - 0x17CC4 (entirely within BSS+DATA)
```

## What Actually Happens

```
A3 = 0xFE0 (unrelocated literal)
Loop writes: 0xFE0 - 0x93C4
  - Iteration 1043: A3 = 0x202C (INSIDE CODE SEGMENT!)
  - Iteration continues, overwriting CODE
  - When A3 = 0x90000, code at 0x202A already corrupted
  - PC jumps to garbage value
```

## Relocation Analysis

Complete HUNK_RELOC32 structure:
- **111 relocations to segment 1 (BSS):** Offsets 0x30A-0x1FF6
- **6 relocations to segment 2 (DATA):** Offsets 0xA, 0x14, 0x3960, 0x396A, 0x398C, 0x3982

**Offset 0x3C is NOT in either list!**

## Why It Works on Vamos

Vamos loads at address ~0x2104. With BSS at ~0x80B4, the unrelocated write from 0xFE0-0x93C4 doesn't overlap CODE which starts higher.

## Binary Defect

This is a **malformed binary** - compiler/linker bug or intentionally non-relocatable.

## Solution: Synthetic Relocation

Patch HunkLoader to add missing relocation at offset 0x3C to BSS segment.

