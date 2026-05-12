# 68K Amiga Door Development Guide

**This guide covers legacy 68K Amiga binary doors. For modern TypeScript doors, see [TYPESCRIPT_DOOR_GUIDE.md](TYPESCRIPT_DOOR_GUIDE.md).**

**Detailed postmortems (AquaScan analysis, Bulls notes, SDK plans) live in `archive/`.**

---

## Quick Start - Pure Assembly Door

The fastest way to create a native 68K door is pure assembly. Here's a minimal working example:

### Prerequisites

```bash
# Install vasm (Amiga assembler)
brew install vasm
```

### Minimal Assembly Door

Create `sdk/68k/doors/mydoor/mydoor.asm`:

```asm
; Minimal AmiExpress Door - 68000 Assembly
; Assemble: vasmm68k_mot -Fhunkexe -kick1hunks -nosym -m68000 mydoor.asm -o mydoor

ABSEXECBASE     EQU     4
LVO_OpenLibrary EQU     -552
LVO_CloseLibrary EQU    -414
LVO_CreateComm  EQU     -30         ; AEDoor: initialize comm (TRAPPED)
LVO_DeleteComm  EQU     -36         ; AEDoor: cleanup comm (TRAPPED)
LVO_WriteStr    EQU     -84         ; AEDoor: output text (TRAPPED)

        SECTION text,CODE

start:
        movem.l d0-d7/a0-a6,-(sp)

        ; Open AEDoor.library
        move.l  ABSEXECBASE,a6
        lea     libname(pc),a1
        moveq   #0,d0
        jsr     LVO_OpenLibrary(a6)
        move.l  d0,a5               ; Save AEDoorBase in A5
        beq.s   .exit

        ; Initialize comm channel
        move.l  a5,a6
        jsr     LVO_CreateComm(a6)

        ; Output message
        move.l  a5,a6
        lea     message(pc),a0
        jsr     LVO_WriteStr(a6)

        ; Cleanup
        move.l  a5,a6
        jsr     LVO_DeleteComm(a6)

        ; Close library
        move.l  ABSEXECBASE,a6
        move.l  a5,a1
        jsr     LVO_CloseLibrary(a6)

.exit:
        movem.l (sp)+,d0-d7/a0-a6
        moveq   #0,d0
        rts

libname:    dc.b    'AEDoor.library',0
        EVEN
message:    dc.b    13,10,'Hello from assembly!',13,10,0
        EVEN

        END
```

### Build and Install

```bash
# Assemble
cd sdk/68k/doors/mydoor
vasmm68k_mot -Fhunkexe -kick1hunks -nosym -m68000 mydoor.asm -o mydoor

# Install
mkdir -p ../../../../Doors/MYDOOR
cp mydoor ../../../../Doors/MYDOOR/

# Create door .info
echo "STACK=8192" > ../../../../Doors/MYDOOR/mydoor.info

# Create command .info
cat > ../../../../Commands/BBSCmd/MYDOOR.info << 'EOF'
BBSCMD=MYDOOR
TYPE=AMI
LOCATION=Doors/MYDOOR/mydoor
DESCRIPTION=My assembly door
ACCESS=0
MULTINODE=YES
PRIORITY=SAME
EOF
```

### Test

Restart the BBS and type `MYDOOR` at the prompt.

For diagnosis + regression coverage of a new 68K door (probe LVOs/XIM
ops, freeze a golden, mine cluster reps), see
[../3-Developers/DOOR_TESTING.md](../3-Developers/DOOR_TESTING.md).

---

## AEDoor.library LVO Reference

**CRITICAL**: Use only TRAPPED functions. Non-trapped functions execute native code that doesn't work in the emulator.

| LVO | Name | Status | Description |
|-----|------|--------|-------------|
| -30 | CreateComm | TRAPPED | Initialize communication channel |
| -36 | DeleteComm | TRAPPED | Cleanup communication channel |
| -42 | SendCmd | TRAPPED | Send command to BBS |
| -48 | SendStrCmd | TRAPPED | Send string command |
| -54 | SendDataCmd | TRAPPED | Send data command |
| -60 | SendStrDataCmd | TRAPPED | Send string+data command |
| -66 | GetData | TRAPPED | Get data from BBS |
| -72 | GetString | TRAPPED | Get string from BBS |
| -78 | Prompt | TRAPPED | Display prompt, get input |
| -84 | WriteStr | TRAPPED | Output text to user |
| -90 | ShowGFile | TRAPPED | Display graphics file |
| -96 | ShowFile | TRAPPED | Display text file |
| -102 | SetDT | TRAPPED | Set door data |
| -108 | GetDT | TRAPPED | Get door data |
| -114 | GetStr | TRAPPED | Get string input |
| -120 | CopyStr | TRAPPED | Copy string |
| -126 | HotKey | TRAPPED | Wait for hotkey |
| -132 | PreCreateComm | NOT TRAPPED | Do not use |
| -138 | PostDeleteComm | NOT TRAPPED | Do not use |

---

## Technical Considerations

### Executable Format

Use `-Fhunkexe` for proper executable format:

```bash
# CORRECT - creates executable with HUNK_HEADER (0x3F3)
vasmm68k_mot -Fhunkexe -kick1hunks -nosym -m68000 door.asm -o door

# WRONG - creates object file with HUNK_UNIT (0x3E7)
vasmm68k_mot -Fhunk -kick1hunks -nosym -m68000 door.asm -o door
```

### PC-Relative Addressing Limits

68000 PC-relative addressing has a 16-bit signed displacement limit (+/- 32KB). For doors with >32KB of data:

1. **Use a single CODE section** (required for `-Fhunkexe`)
2. **Use offset tables** instead of absolute pointers
3. **Calculate addresses at runtime** using base registers

Example for large data:

```asm
        ; Get base addresses
        lea     start(pc),a5
        add.l   #data_table-start,a5    ; A5 = data table base

        ; Access data using offset
        move.l  (a5,d0.l),d1            ; Get offset
        lea     start(pc),a0
        add.l   #string_data-start,a0   ; A0 = string data base
        add.l   d1,a0                   ; A0 = actual string address
```

### No Relocations

`-Fhunkexe` does not include relocation hunks. All address references must be:
- PC-relative (within 32KB range), or
- Calculated at runtime using base registers

### Register Clobbering - CRITICAL

**AmigaOS library functions clobber D0, D1, A0, and A1.** Always save important values BEFORE calling any library function.

Common mistake:

```asm
        ; Calculate something important in D0
        divu.w  #999,d0             ; D0 = result we need

        ; WRONG: Call library function before saving D0
        move.l  ABSEXECBASE,a6
        move.l  somelib,a1
        jsr     LVO_CloseLibrary(a6) ; CLOBBERS D0!

        ; D0 is now garbage, not our result
        move.l  d0,saved_value      ; WRONG - D0 was destroyed
```

Correct approach:

```asm
        ; Calculate something important in D0
        divu.w  #999,d0             ; D0 = result we need

        ; CORRECT: Save D0 BEFORE any library call
        move.l  d0,saved_value      ; Save while D0 is valid

        ; Now safe to call library
        move.l  ABSEXECBASE,a6
        move.l  somelib,a1
        jsr     LVO_CloseLibrary(a6) ; D0 clobbered, but we saved it
```

**Registers clobbered by library calls:**
- D0 - Return value (always clobbered)
- D1 - Scratch (always clobbered)
- A0 - Scratch (always clobbered)
- A1 - Scratch (always clobbered)

**Registers preserved by library calls:**
- D2-D7 - Safe across calls
- A2-A6 - Safe across calls (A6 is usually library base)

**Rule of thumb:** If you compute something in D0/D1/A0/A1, save it to memory or a safe register (D2-D7, A2-A5) BEFORE calling any library function.

---

## Working Example: CP Listan

See `sdk/68k/doors/cplistan/` for a complete working example featuring:

- 999 embedded strings (46KB total)
- Random number generation using dos.library DateStamp()
- Offset table for large data handling (>32KB PC-relative limit)
- Proper AEDoor.library integration
- Correct register preservation (saves D0 before CloseLibrary)

---

## 1. Workflow
- Door runs use the harness `node web/backend/dist/scripts/run-amiga-door.js <door> <node> <command>` and log to `logs/door-68k.log`, `/tmp/bulls.out`, and `/tmp/*.log`. Use `DEBUG_XIM_OUTPUT=1` for extra tracing.
- The backend follows express.e's AEDoor/doorInfo expectations; consult `archive/Bulls_DISASM_NOTES.md` and `archive/AEDoor_LIBRARY_NOTES.md` for offsets.
- When parsing Dir files, the system now honors art lines by storing them in the continuation block; art lines no longer truncate before ASCII logos.

## 2. Protocols & Parsers
- XIM doors (AquaScan, WHO) use the 135-command implementation in `XIMProtocol.ts`, handling `JH_*`, `DT_*`, `BB_*`, and system commands exactly as express.e does.
- SIM doors remain deferred but documented; `archive/SIM_DOOR_0x790_IMPLEMENTATION_PLAN.md` covers the synchronous execution differences (async=FALSE) and the port cleanup behavior.
- Door input uses `petscii` screen files routed through `Screens/` and the 33-space continuation block (matching `express.e`'s `buildDescriptionLines`).

## 3. Tools & Reference Sources
- Use `Documentation/7-Reference Sources/Doors_with_Source/` for preserved door binaries, and `vAmiga` for emulator references—their README files describe how the AI harnessed them.
- The `Door Manager` logs door statuses, handles pause prompts, and adapts to per-user screen height so the FR pause now matches express.e's expected behavior.
- Run `dev/scripts/test-all-doors.sh` to exercise each door; inspect `dev/scripts/door-test-results.txt` for `pass/fail/timeout` counts.

## 4. Key Achievements
- AquaScan debugging logs and root cause fix descriptions now live in `archive/AQUASCAN_*` documents, showing how the parser now treats art lines and identifies `DIR1` creation issues.
- The summary of 68k emulator progress (`archive/68K_DOOR_EMULATION_SUMMARY.md`) partners with the debugging log from `archive/DOOR_DEBUG_SUMMARY.md`, capturing the last steps before pausing 68k emulation.
- `Doors/` folder now contains door data files sanitized to match express.e; replicating the ASCII art and pause prompts ensures FR output matches the BBS.

**Need deeper detail?** Jump into the archived investigations for step-by-step root cause analysis, disassembly notes, and SDA door research references.
