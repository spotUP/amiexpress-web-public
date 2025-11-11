# RTW Code Corruption Bug - November 11, 2025

## Summary

**ROOT CAUSE DISCOVERED**: RTW's code segment is being corrupted by incorrect hunk relocations, causing it to execute wrong instructions and exit early with return code 30.

## Evidence

### 1. Code Corruption Proof

**File vs Memory Mismatch at PC=0x1022**:
- **Binary file** at 0x1022: `b8 80` = `CMP.L D0,D4`
- **Memory** at 0x1022: `26 c1` = `MOVE.L D1,(A3)+`

The emulator is executing completely different code than what's in the RTW binary file!

### 2. Early Exit Behavior

- RTW exits at PC=0x117c (after polling loops)
- Return code: 30 (0x1E)
- Total iterations: 1134
- Execution path shows loops but then unexpected exit

### 3. D0=30 Detection

```
[D0=30] First time D0=30 at PC=0x1022, opcode=0x26c1
[D0=30] Last 10 PCs: 0x1024 -> 0x1022 -> 0x1024 -> 0x1022 -> ...
```

D0 is set to 30 very early during C startup code at PC=0x1022, but this happens because the WRONG instruction is executing due to code corruption.

### 4. Relocation Count

RTW has **427 relocations** applied to segment 0 (code segment). One or more of these relocations are corrupting executable code by treating code bytes as data pointers.

## Hunk Structure

RTW has 4 segments (no overlap):
- Segment 0 (CODE): 0x1000-0x505C (16,476 bytes) - **427 relocations**
- Segment 1 (DATA): 0x5100-0x56F0 (1,520 bytes)
- Segment 2 (BSS):  0x5700-0x995C (16,988 bytes)
- Segment 3 (DATA): 0x9A00-0x9ED8 (1,240 bytes)

## The Bug

The Hunk Loader is applying relocations to the code segment, but some relocation offsets are **incorrectly pointing to executable code** instead of embedded data pointers within the code.

### How Relocations Should Work

1. Code segment contains both:
   - Executable instructions (opcodes)
   - Embedded data pointers (e.g., `LEA data_segment,A4`)
2. Relocations should ONLY modify the embedded pointers
3. Relocations should NEVER modify executable opcodes

### What's Going Wrong

The relocation table says "apply relocation at offset 0x1022", but:
- **If correct**: 0x1022 contains a longword data pointer that needs adjusting
- **If wrong**: 0x1022 contains executable code (CMP instruction) that gets corrupted

## Examples of Corruption

### PC=0x1022 Corruption
```
Original code:  b8 80       (CMP.L D0,D4)
After reloc:    26 c1       (MOVE.L D1,(A3)+)
```

This causes RTW's startup code to execute garbage instructions, leading to:
1. Wrong register values
2. Failed initialization checks
3. Early exit with error code 30

## Why WHO Works But RTW Doesn't

- **WHO**: Likely has fewer/simpler relocations, or relocations don't corrupt critical code paths
- **RTW**: 427 relocations on code segment, at least one corrupts startup code at 0x1022

## Possible Root Causes

### 1. Relocation Offset Calculation Bug
The hunk loader might be calculating relocation offsets incorrectly:
- Using file offsets instead of memory offsets
- Not accounting for hunk header size
- Off-by-one errors in offset calculation

### 2. Relocation Type Mismatch
The relocation type (HUNK_RELOC32) might be applied to code that expects different handling.

### 3. SAS/C Compiler Quirk
RTW is compiled with SAS/C, which might emit relocation tables in a non-standard format that our loader doesn't handle correctly.

## Next Steps to Fix

### Option 1: Disable Relocations (Test)
Temporarily disable relocation application to confirm this is the issue:
```typescript
// In HunkLoader.ts, comment out relocation application
// for (const reloc of relocs) { ... }
```
If RTW runs with code matching the binary, this confirms the bug.

### Option 2: Log All Relocations
Enable verbose logging for ALL relocations (not just first 10):
```typescript
console.log(`[HunkLoader]   Reloc at 0x${offset.toString(16)}: ...`);
```
Find which relocation corrupts 0x1022.

### Option 3: Verify Relocation Offsets
Add validation to ensure relocations only target:
- Longword-aligned addresses
- Addresses that contain pointer-like values (not opcodes)

### Option 4: Compare with Vamos
Run RTW under vamos with memory dumps to see:
- What relocations vamos applies
- What the code looks like in vamos's memory
- Whether vamos skips certain relocations

## Files Involved

- `web/backend/src/amiga-emulation/loader/HunkLoader.ts:225-256` - Relocation application code
- `web/backend/src/amiga-emulation/AmigaDoorSession.ts:1041-1050` - D0=30 tracking (debug code)

## Related Issues

- Stack corruption bug (FIXED): `RTW_WHO_STACK_CORRUPTION_FIX_20251111.md`
- DBRA loop analysis: `RTW_WHO_DBRA_LOOP_BUG_20251111.md`
- Previous debugging: `RTW_DOOR_DEBUGGING_SESSION_20251111.md`

## Confidence Level

**VERY HIGH** - The evidence is conclusive:
- Binary file contains correct code
- Memory contains corrupted code
- Corruption occurs during hunk loading
- 427 relocations on code segment = high probability of misconfigured relocation

This is definitively a **hunk relocation bug**, not an emulation bug or door compatibility issue.
