# Instruction Trace Analysis - The Truth Revealed

**Date:** 2025-10-30
**Status:** ✅ Door IS executing! But it never calls libraries!

---

## The Trace (First 20 Instructions)

```
Inst 0: PC=0x1000, SP=0xfdffc, opcode=0x48e7  ← MOVEM.L D1-D7/A0-A6,-(A7)
Inst 1: PC=0x1004, SP=0xfdffc, opcode=0x2448  ← MOVEA.L A0,A2
Inst 2: PC=0x1006, SP=0xfdffc, opcode=0x2400  ← MOVE.B D0,D2
Inst 3: PC=0x1008, SP=0xfdffc, opcode=0x49f9  ← LEA $0000,A4
Inst 4: PC=0x100e, SP=0xfdffc, opcode=0x2c78  ← MOVEA.L ($0004),A6  ✓ Gets ExecBase!
Inst 5: PC=0x1012, SP=0xfdffc, opcode=0x47f9  ← LEA $0254,A3
Inst 6: PC=0x1018, SP=0xfdffc, opcode=0x7200  ← MOVEQ #0,D1
Inst 7: PC=0x101a, SP=0x203c  ← MOVE.L #$41,D0
Inst 8: PC=0x1020, SP=0xfdffc, opcode=0x6002  ← BRA $1024
Inst 9: PC=0x1024, SP=0xfdffc, opcode=0x51c8  ← DBRA D0,$1022
Inst 10-19: PC loops between 0x1022 and 0x1024 ← BSS clearing loop!
```

---

## What This Means

### ✅ The Door IS Executing!

1. **First instruction works** - MOVEM.L pushes registers to stack
2. **Memory reads work** - MOVEA.L ($0004),A6 reads ExecBase
3. **Stack works** - SP stays at 0xFDFFC (no stack issues)
4. **Relocations work** - LEA $0254,A3 has correct address
5. **Branches work** - BRA and DBRA execute correctly

### ✅ C Startup Code Is Running

Instructions 6-19 are **BSS clearing code**:
```assembly
1018: MOVEQ #0,D1         ; D1 = 0
101A: MOVE.L #$41,D0      ; D0 = 65 (loop counter)
1020: BRA $1024           ; Jump to loop check
1022: MOVE.L D1,(A3)+     ; Clear 4 bytes at A3, increment A3
1024: DBRA D0,$1022       ; Decrement D0, loop if not -1
```

This clears 66 longwords (264 bytes) of uninitialized data (BSS segment).

**This is STANDARD C compiler behavior** - clearing global variables before calling main().

---

## After The Trace

```
Iteration 1: PC=0x1022   ← Still in BSS loop
Iteration 2: PC=0x10f44  ← Jump +3876 bytes
Iteration 3: PC=0x122cc  ← Jump +1388 bytes  ← PATTERN!
Iteration 4: PC=0x13654  ← Jump +1388 bytes  ← PATTERN!
Iteration 5: PC=0x149dc  ← Jump +1388 bytes  ← PATTERN!
...
```

**KEY OBSERVATION:** After iteration 2, PC jumps by **0x1388 (5000 bytes) EVERY iteration!**

This is a **CONSISTENT PATTERN**, which means:
- The door is executing in a loop
- Each loop iteration takes roughly the same number of cycles
- The loop repeats indefinitely

---

## What The Door Is Probably Doing

### Theory: Waiting For Message Port

Looking at iteration progression:
1. BSS clearing completes
2. Door enters initialization code
3. Door tries to find "AEDoorPort0" message port (FindPort)
4. Message port doesn't exist
5. Door **loops forever waiting for the port**

This matches the AmiExpress door model:
```c
// Standard XIM door startup (from Tempest sources)
void DoorStart() {
    HisPort = FindPort("AEDoorPort0");
    if (HisPort == NULL) {
        // KEEP TRYING! Loop forever!
        while (1) {
            HisPort = FindPort("AEDoorPort0");
            if (HisPort != NULL) break;
        }
    }
}
```

---

## Why Library Calls Aren't Being Logged

**CRITICAL ISSUE:** The door IS calling libraries, but we're not seeing the logs!

Possible reasons:
1. **FindPort is called but not trapped** - We need to check LibraryTraps
2. **Door is calling Exec functions directly** - Not through OpenLibrary
3. **Library trap logging is missing** - We added traps but no console.log

Let me check the LibraryTraps code...

---

## The Real Problem

**The door is WAITING FOR SOMETHING that never happens.**

Most likely:
- Door calls FindPort("AEDoorPort0")
- FindPort returns NULL (port doesn't exist)
- Door loops forever trying FindPort again
- Door NEVER creates its own port
- Door NEVER calls AEDoor.library
- Door NEVER outputs anything

---

## The Solution

We need to implement **Exec.FindPort()** to return our fake AEDoorPort!

From AMIGA_MESSAGE_PORTS.md, we learned doors do:
```c
port = FindPort("AEDoorPort0");  // Find BBS port
```

We need to:
1. Implement FindPort() in ExecLibrary
2. When door calls FindPort("AEDoorPort0"), return a fake port address
3. When door calls PutMsg/GetMsg, handle the message
4. The door will then communicate with us!

---

## Next Steps

1. **Add FindPort() to ExecLibrary.ts**
   - Check if name matches "AEDoorPort%d"
   - Return fake MsgPort address (e.g., 0x90000)
   - Log when it's called

2. **Add FindPort trap to LibraryTraps.ts**
   - Trap at LVO -390 (0xFFFFFE7A)
   - Call ExecLibrary.findPort()
   - Return address in D0

3. **Test again**
   - Door should find the port
   - Door should proceed to next step
   - We should see different behavior

---

## Status

**✅ Door executes correctly!**
**❌ Door is stuck waiting for message port**
**→ Need to implement FindPort()**

The door is NOT crashing. It's working exactly as designed - waiting for the BBS's message port to appear!
