# AEDoor.library Function Offset Mapping

**Date:** 2025-10-30
**Library Base Address:** 0xFF4000
**Source:** Binary analysis + aedoor.m module file

## Standard Library Functions

Amiga libraries use **negative offsets** from the library base address. Each function is typically 6 bytes apart starting at offset -30.

### AEDoor.library Function Table

| Function Name | Offset | Hex Offset | Status |
|---------------|--------|------------|--------|
| **CreateComm** | -30 | 0xFFE2 | ⚠️ Need to implement |
| **DeleteComm** | -36 | 0xFFDC | ⚠️ Need to implement |
| **SendCmd** | -42 | 0xFFD6 | ⚠️ Need to implement |
| **SendStrCmd** | -48 | 0xFFD0 | ⚠️ Need to implement |
| **SendDataCmd** | -54 | 0xFFCA | ⚠️ Need to implement |
| **SendStrDataCmd** | -60 | 0xFFC4 | ⚠️ Need to implement |
| **GetData** | -66 | 0xFFBE | ⚠️ Need to implement |
| **GetString** | -72 | 0xFFB8 | ⚠️ Need to implement |
| **Prompt** | -78 | 0xFFB2 | ⚠️ Need to implement |
| **WriteStr** | -84 | 0xFFAC | ⚠️ Need to implement |
| **ShowGFile** | -90 | 0xFFA6 | ⚠️ Need to implement |
| **ShowFile** | -96 | 0xFFA0 | ⚠️ Need to implement |
| **SetDT** | -102 | 0xFF9A | ⚠️ Need to implement |
| **GetDT** | -108 | 0xFF94 | ⚠️ Need to implement |
| **GetStr** | -114 | 0xFF8E | ⚠️ Need to implement |
| **CopyStr** | -120 | 0xFF88 | ⚠️ Need to implement |
| **HotKey** | -126 | 0xFF82 | ⚠️ Need to implement |

## Currently Implemented (Working!)

### Low-Level I/O Functions

These are implemented in `AmiExpressLibrary.ts` and are WORKING:

| Function | Offset | Hex | Implementation |
|----------|--------|-----|----------------|
| **aePuts** | -16655 | 0xBEF1 | ✅ Outputs text to browser - **WORKING!** |
| **aeGetCh** | -16655 | 0xBEF1 | ✅ Non-blocking character input |
| **CheckInput** | -16657 | 0xBEEF | ✅ Returns chars available |

**Evidence from logs:**
```
[AmiExpress] aePuts() output: "dos.library"
[AmigaDoorSession] Sending output to client: "dos.library"
```

## Discovered Offsets (Purpose Unknown)

These offsets are being called by doors but their purpose is unclear:

| Offset | Hex | Currently | Notes |
|--------|-----|-----------|-------|
| 0xFF0000 | 16711680 | NOP | Maybe WriteChar? |
| 0xFF0001 | 16711681 | NOP | Unknown |
| 0xFF0002 | 16711682 | NOP | Unknown |
| 0xFF0003 | 16711683 | NOP | Unknown |
| 0xFF0005 | 16711685 | NOP | Unknown |
| 0xFF7D04 | 16743716 | NOP | Unknown |
| 0xFF7D06 | 16743718 | NOP | Unknown |
| 0xFF7DDA | 16743898 | NOP | Called after aePuts |
| 0xFF7E62 | 16744034 | NOP | Unknown |
| 0xFF7E64 | 16744036 | NOP | Unknown |
| 0xFF7ECE | 16744142 | NOP | Unknown |
| 0xFF7ED0 | 16744144 | NOP | Unknown |
| -28 | 0xFFE4 | NOP | Close to CreateComm offset |

**Note:** These large positive offsets (0xFF0000+) are NOT standard library calls. They may be:
- Direct memory addresses
- Custom function pointers
- Jump table entries
- Or the door is calculating offsets incorrectly

## dos.library Offsets (Also Called)

From backend logs, the door also calls standard dos.library functions:

| Function | Offset | Status |
|----------|--------|--------|
| Open | -30 | ✅ Working (opens "*" and "NIL:") |
| Close | -36 | ✅ Implemented |
| Read | -42 | ✅ Implemented |
| Write | -48 | ✅ Implemented |
| Input | -54 | ✅ Implemented |
| Output | -60 | ✅ Implemented |

## exec.library Custom Offsets

| Offset | Hex | Status |
|--------|-----|--------|
| -32492 | 0x8104 | NOP (custom?) |
| -32490 | 0x8106 | NOP (custom?) |
| -32748 | 0x800C | NOP (custom?) |

These are NOT standard exec.library offsets - likely custom AmiExpress extensions.

## Implementation Strategy

### Phase 1: High-Level Door Interface (CRITICAL)
Implement these AEDoor.library functions first:

1. **CreateComm** (-30) - Initialize door, return interface pointer
2. **WriteStr** (-84) - Map to aePuts() which already works!
3. **GetString** (-72) - Return pointer to string buffer
4. **GetDT** (-108) - Get user data
5. **DeleteComm** (-36) - Cleanup

### Phase 2: Additional Functions
6. **Prompt** (-78) - Display prompt, get input
7. **GetStr** (-114) - Get input with default
8. **SendCmd** (-42) - Send BBS command
9. **ShowFile** (-96) - Display file

### Phase 3: Advanced Features
10. Remaining functions as needed

## Code Structure

### Current Implementation (`AmiExpressLibrary.ts`)

```typescript
export class AmiExpressLibrary {
  handleCall(offset: number): boolean {
    switch (offset) {
      case -16655:  // aePuts / aeGetCh
        return this.aeGetCh();

      case -16657:  // CheckInput
        const charsAvailable = this.inputQueue.length > 0 ? 1 : 0;
        this.emulator.setRegister(CPURegister.D0, charsAvailable);
        return true;

      // Add new high-level functions here:
      case -30:     // CreateComm
        return this.CreateComm();

      case -84:     // WriteStr
        return this.WriteStr();

      case -72:     // GetString
        return this.GetString();

      // ... etc
    }
  }
}
```

## Next Steps

1. ✅ Map all function names to offsets
2. ⏳ Implement CreateComm() - returns interface pointer
3. ⏳ Implement WriteStr() - calls existing aePuts()
4. ⏳ Implement GetString() - returns string buffer pointer
5. ⏳ Implement GetDT() - returns user data
6. ⏳ Test door - should progress further
7. ⏳ Implement remaining functions as door calls them

## Reference Links

- [AEDoor API Reference](./AEDOOR_API_REFERENCE.md)
- [AEDoor Library Analysis](./AEDOOR_LIBRARY_ANALYSIS.md)
- Door Example: `Docs/Doors_with_Source/AEDOORS/AmiExpress/Sources/example.e`

---

**Status:** Function mapping complete. Ready to implement high-level functions.
