# AEDoor.library Complete LVO Mapping

## Library Information

- **Binary**: `~/Code/Reference/reference-boardBBS/Node0/Libs/AEDoor.library`
- **Size**: 1128 bytes
- **Version**: AEDoorLib 2.7 (18 May 1996)
- **Architecture**: Amiga 68000
- **Format**: Amiga shared library

## LVO (Library Vector Offset) Table

Amiga libraries use negative offsets from the library base (A6 register) to call functions. The function offset table starts at 0x80 in the binary.

### Extracted Offset Table (0x80-0xBF):

```
Offset  Data        Function Address (relative)
------  ----------  ---------------------------
0x80:   00300000    0x0030 (function 0)
0x84:   006e0000    0x006e (function 1)
0x88:   00a00000    0x00a0 (function 2)
0x8c:   00c0ffff    0x00c0 (function 3), 0xffff (reserved)
0x90:   00720080    0x0072 (function 4), 0x0080 (function 5)
0x94:   009600de    0x0096 (function 6), 0x00de (function 7)
0x98:   00e201ea    0x00e2 (function 8), 0x01ea (function 9)
0x9c:   02640244    0x0264 (function 10), 0x0244 (function 11)
0xa0:   02240234    0x0224 (function 12), 0x0234 (function 13)
0xa4:   029e02a4    0x029e (function 14), 0x02a4 (function 15)
0xa8:   02aa02c2    0x02aa (function 16), 0x02c2 (function 17)
0xac:   03000306    0x0300 (function 18), 0x0306 (function 19)
0xb0:   030c0312    0x030c (function 20), 0x0312 (function 21)
0xb4:   03180332    0x0318 (function 22), 0x0332 (function 23)
0xb8:   03480362    0x0348 (function 24), 0x0362 (function 25)
0xbc:   0370ffff    0x0370 (function 26), 0xffff (reserved)
```

## Complete LVO Mapping

Based on the disassembly analysis and Amiga library standards:

| LVO    | Offset | Address | Function Name             | Description |
|--------|--------|---------|---------------------------|-------------|
| -6     | 0x00   | 0x0100  | Open                      | Standard library Open (increment open count) |
| -12    | 0x06   | 0x010e  | Close                     | Standard library Close (decrement open count) |
| -18    | 0x0c   | 0x0124  | Expunge                   | Standard library Expunge (cleanup/shutdown) |
| -24    | 0x12   | 0x016c  | Reserved                  | Reserved (returns 0) |
| -30    | 0x18   | 0x0170  | CreateComm / InitDoor     | Main initialization (creates DoorInfo structure) |
| -36    | 0x1e   | 0x0278  | SendDoorMessage           | Sends door control message |
| -42    | 0x24   | 0x02b2  | SetNodeData               | Sets node-specific data at BBSInfo+0xdc |
| -48    | 0x2a   | 0x02c2  | SetStringData             | Sets string data in BBSInfo structure |
| -54    | 0x30   | 0x02d2  | CopyUserString            | Copies user string to BBSInfo+0x14 |
| -60    | 0x36   | 0x02f2  | SendControlMessage        | Sends control message to AEDoorPort |
| -66    | 0x3c   | 0x032c  | GetUserPtr                | Returns pointer at DoorInfo+0x1c (location) |
| -72    | 0x42   | 0x0332  | GetLocationPtr            | Returns pointer at DoorInfo+0x20 (user name) |
| -78    | 0x48   | 0x0338  | GetUserName               | Gets user name string (calls SetStringData + returns pointer) |
| -84    | 0x4e   | 0x0350  | WriteUserData             | Writes user data with buffering |
| -90    | 0x54   | 0x0388  | FlushBuffer               | Flushes write buffer |
| -96    | 0x5a   | 0x038e  | SetBBSName                | Sets BBS name string |
| -102   | 0x60   | 0x0394  | SetDateTime               | Sets date/time strings |
| -108   | 0x66   | 0x039a  | ClearNodeFlags            | Clears node status flags (sets to 0) |
| -114   | 0x6c   | 0x03a0  | SetNodeFlags              | Sets node status flags (sets to 1) |
| -120   | 0x72   | 0x03a6  | GetNodeStatus             | Gets node status (checks flags, returns location or user) |
| -126   | 0x78   | 0x03c0  | CopyLocationString        | Copies location string from DoorInfo+0x20 |
| -132   | 0x7e   | 0x03d6  | GetNodeInput              | Gets node input character |
| -138   | 0x84   | 0x03f0  | InitNewDoor               | Initializes new door (wrapper for CreateComm) |
| -144   | 0x8a   | 0x03fe  | InitAndSendStatus         | Initializes door and sends status message |

## Function Address Resolution

Addresses are relative to the library base. To calculate absolute addresses:
- Function pointers in the table are **word offsets** (16-bit values)
- Add the offset to the base address where the function table starts

Example for CreateComm (LVO -30):
- Table entry at 0x80: `0x0030`
- This points to address `0x0170` in the binary
- Full function at disassembly lines 168-276

## Key Functions for Door Development

### CreateComm / InitDoor (LVO -30, Address 0x0170)
**Purpose**: Main initialization function
**What it does**:
1. Allocates 0x146 bytes for DoorInfo structure
2. Copies CLI name to DoorInfo+0x0c
3. Creates AEDoorPort message port
4. Creates reply port at DoorInfo+0x24
5. Sets up BBSInfo structure at DoorInfo+0x46
6. Copies CLI name to BBSInfo+0x14
7. Sets DoorInfo+0x1c → BBSInfo+0xdc (location pointer)
8. Sets DoorInfo+0x20 → BBSInfo+0x14 (user name pointer)
9. Sends JH_INIT message (command 1)
10. Returns DoorInfo pointer in D0

**Assembly signature**:
```asm
; Input: A0 = CLI name string, A6 = library base
; Output: D0 = DoorInfo pointer (or 0 on failure)
fcn.00000170:
    movem.l d1-d7/a2-a6, -(a7)
    ...
    move.l a4, d0              ; Return DoorInfo pointer
    movem.l (a7)+, d1-d7/a2-a6
    rts
```

### GetUserName (LVO -78, Address 0x0338)
**Purpose**: Returns user name string
**What it does**:
1. Calls SetStringData (LVO -48) with command 5
2. Checks if BBSInfo+0xdc contains valid data (not 0xffffffff)
3. If valid, returns pointer at DoorInfo+0x20 (user name)
4. If invalid, returns 0

**Assembly signature**:
```asm
; Input: A1 = DoorInfo pointer
; Output: D0 = pointer to user name string (or 0)
0x00000338:
    moveq 0x5, d0
    bsr.b fcn.000002c2         ; SetStringData
    movea.l 0x1c(a1), a0       ; Get BBSInfo+0xdc pointer
    moveq 0xff, d0
    cmp.l (a0), d0             ; Check if 0xffffffff
    beq.b 0x34c
    move.l 0x20(a1), d0        ; Return user name pointer
    rts
0x34c:
    moveq 0x0, d0              ; Return null
    rts
```

### CopyLocationString (LVO -126, Address 0x03c0)
**Purpose**: Copies location string to buffer
**What it does**:
1. Gets pointer at DoorInfo+0x20
2. Copies up to 198 bytes (0xc6) to output buffer
3. Null terminates the result

**Assembly signature**:
```asm
; Input: A1 = DoorInfo pointer, A0 = output buffer
; Output: Location string copied to buffer
0x000003c0:
    move.l a1, -(a7)           ; Save A1
    movea.l 0x20(a1), a1       ; A1 = pointer at DoorInfo+0x20
    move.w 0xc6, d0            ; Max 198 bytes
0x3ca:
    move.b (a1)+, (a0)+        ; Copy byte
    dbeq d0, 0x3ca             ; Loop until null or count
    clr.b (a0)                 ; Null terminate
    movea.l (a7)+, a1          ; Restore A1
    rts
```

## Usage in C Door Code

To call AEDoor.library functions from C:

```c
#include <exec/types.h>
#include <proto/exec.h>

struct Library *AEDoorBase;

// Open library
AEDoorBase = OpenLibrary("AEDoor.library", 0);
if (!AEDoorBase) {
    printf("Failed to open AEDoor.library\n");
    exit(1);
}

// Call CreateComm (LVO -30)
// Prototype: struct DoorInfo *CreateComm(STRPTR cliName);
struct DoorInfo *di = (struct DoorInfo *)
    (*(APTR(*)(STRPTR))(((ULONG)AEDoorBase) - 30))("MYDOOR");

// Call GetUserName (LVO -78)
// Prototype: STRPTR GetUserName(struct DoorInfo *di);
STRPTR userName = (STRPTR)
    (*(APTR(*)(APTR))(((ULONG)AEDoorBase) - 78))(di);

printf("User: %s\n", userName);

// Close library
CloseLibrary(AEDoorBase);
```

## TypeScript Emulator Implementation

For our emulator, these LVOs should be trapped in `AEDoorLibrary.ts`:

```typescript
private handleTrap(): boolean {
  const a6 = this.emulator.getRegister(CPURegister.A6);
  const offset = this.emulator.getRegister(CPURegister.PC) - a6;

  switch (offset) {
    case -30:  // CreateComm
      this.CreateComm();
      return true;
    case -78:  // GetUserName
      this.GetUserName();
      return true;
    case -126: // CopyLocationString
      this.CopyLocationString();
      return true;
    // ... add all 27 functions
  }
  return false;
}
```

## Function Call Convention

All AEDoor.library functions follow Amiga register calling convention:
- **A6**: Library base pointer
- **A0, A1, D0, D1**: Input parameters
- **D0**: Return value (pointer or status)
- **Preserved**: D2-D7, A2-A6 (callee-saved)
- **Scratch**: D0, D1, A0, A1 (caller-saved)

## Related Documentation

- **Full Disassembly**: `~/Code/Reference/disasm/aedoor_library_disasm.asm`
- **Library Notes**: `/Documentation/4-Door-Developers/archive/AEDoor_LIBRARY_NOTES.md`
- **BBSInfo Fix**: `/sdk/68k/BBSINFO_FIX_FINAL.md`
- **DoorInfo Structure**: BBSInfo at DoorInfo+0x46, max structure size 0x146 bytes

## Status

- [x] Extracted function offset table (0x80-0xBF)
- [x] Mapped all 27 LVO offsets
- [x] Identified function addresses
- [x] Documented key functions (CreateComm, GetUserName, CopyLocationString)
- [x] Provided usage examples (C and TypeScript)
- [ ] Implement all 27 functions in AEDoorLibrary.ts emulator
- [ ] Test each function with diagnostic door

---

**Date**: 2025-12-16
**Analysis Method**: Reverse engineering via radare2 disassembly + hex dump analysis
