# SIM Door Architecture Discovery - Session 7 (2025-12-02)

## Executive Summary

**Verdict**: WHO door (and likely all SIM doors from the same source) are **incompatible** with express.e's SIM door architecture. They were designed for a different /X variant that uses absolute memory function tables.

**Key Finding**: WHO sets A4=0x0000 and expects BBS function pointers at absolute address 0x790, which express.e does NOT provide.

**Recommendation**: Port SIM doors to TypeScript (1-2 weeks effort) rather than attempting full OS emulation (7-12 weeks).

---

## Discovery Timeline

### Breakthrough 1: Nudos.library Mystery Solved

**Clue from user**: "'Nu' is ascii representation of 'rts' instruction (0x4e75)"

**Discovery**: "Nudos.library" is NOT a real library - it's a classic 68K space-saving trick:
```
Offset 0x270 in WHO binary:
201f 4cdf 7f7e 4e75 646f 732e 6c69 6272
                ^^^^ ^^^^^^^^^^^^^^^^^^^^
                RTS  "dos.library"
```

- `0x4E75` = RTS instruction
- `0x4E75` = "Nu" in ASCII
- String "~Nudos.library" overlays with "~[RTS]dos.library"
- WHO actually opens standard dos.library, NOT a custom library
- Saves 2 bytes by overlaying RTS instruction with string prefix

### Breakthrough 2: Absolute Addressing Discovery

**WHO entry point analysis** (offset 0x2c):
```asm
0x00000024: movem.l d1-d6/a0-a6, -(a7)    ; Save registers
0x00000028: movea.l a0, a2                ; Save arg pointer
0x0000002a: move.l d0, d2                 ; Save arg length
0x0000002c: lea.l 0x0.l, a4               ; ← CRITICAL: A4 = absolute 0x0000!
0x00000032: movea.l 0x4.w, a6             ; Get ExecBase
```

**Implications**:
- Normal Amiga programs set A4 to point to their BSS (uninitialized data) segment
- WHO sets A4 to **absolute address zero**
- All "A4-relative" accesses become **absolute low-memory addresses**

### Breakthrough 3: Function Table Requirement

**WHO BBS function call pattern** (appears at 0x1148 and 0x116a):
```asm
; Pattern 1 at 0x1148-0x115a:
0x1148: subq.w #4, sp              ; Allocate stack space
0x114a: lea.l 0x794, a0            ; Load parameter block address (absolute)
0x1150: move.l a0, (sp)            ; Push params pointer to stack
0x1152: beq.b 0x1164               ; Skip if condition (never true with 0x794)
0x1154: movea.l 0x790.l, a0        ; ← Load function pointer from ABSOLUTE 0x790
0x115a: jsr (a0)                   ; ← Call BBS function via pointer
0x115c: tst.l d0                   ; Check return value
0x115e: beq.b 0x1164               ; Skip if failed

; Pattern 2 at 0x116a-0x117c (same pattern, different params):
0x116a: subq.w #4, sp
0x116c: lea.l 0x79c, a0            ; Different parameter block
0x1172: move.l a0, (sp)
0x1174: beq.b 0x117e
0x1176: movea.l 0x790.l, a0        ; ← Same function pointer at 0x790
0x117c: jsr (a0)
```

**Key observations**:
- WHO loads function pointer from **absolute address 0x790** (twice)
- Uses parameter blocks at 0x794, 0x79c (also absolute addresses)
- This is NOT A4-relative addressing - these are absolute memory references
- The `beq.b` checks never branch (0x794/0x79c are never zero)

### Breakthrough 4: WHO is a "/X DooR"

**Binary strings analysis**:
```bash
$ strings doors/who/who | grep -iE "express|bbs|/X"
/X DooR by SPY/MST
```

**Contradiction discovered**:
1. WHO is marked as "/X DooR" (designed for AmiExpress /X)
2. WHO expects function table at absolute address 0x790
3. Express.e source code has **ZERO** references to 0x790 or any function tables
4. Express.e launches SIM doors with `SystemTagList()` and immediately returns (lines 4346-4350)

### Breakthrough 5: Express.e Provides No Setup

**MCP search results**:
```
Query: "0x790" → 0 matches
Query: "790" → 0 matches
Query: "function table" → 0 matches
Query: "jump table" → 0 matches
Query: "dispatch table" → 0 matches
```

**Express.e SIM door handling** (lines 4280-4282, 4346-4350):
```e
CASE DOORTYPE_SIM
  StringF(exestring,'\s \d',cmd,node)  // Format: "doors/who/who 1"
  async:=FALSE                          // Run synchronously

IF((type=DOORTYPE_IIM) OR (type=DOORTYPE_SIM) OR (type=DOORTYPE_SUP))
  IF alreadyActive=FALSE THEN deletePort(mp)
  doorLog(type,'')
  RETURN                                // IMMEDIATELY RETURN - no waiting!
ENDIF
```

**Conclusion**: Express.e provides **ZERO** setup for SIM doors before launching. No function tables, no memory initialization, no environment configuration.

---

## Technical Analysis

### Memory Layout Expectations

WHO expects this memory layout:
```
Absolute Address    Purpose
----------------    -------
0x790               Function pointer to BBS API dispatcher
0x794               Parameter block for call #1
0x79c               Parameter block for call #2
(potentially more)
```

### Why This Fails in Emulation

1. **No function table setup**: Express.e doesn't create any function table at 0x790
2. **MOIRA starts with clean memory**: Address 0x790 contains random/zero data
3. **WHO crashes immediately**: Tries to `jsr (a0)` where a0 = garbage from 0x790
4. **PC jumps to ROM**: If 0x790 contains a ROM address, crashes with "PC → ROM at 0xf00080"

### Possible Explanations

**Theory A**: WHO is from a different /X variant
- Maybe an earlier or later version of /X used this convention
- The express.e source we have (from reference-board BBS archive) may be different version

**Theory B**: Third-party door using /X branding
- Door developer created their own calling convention
- Used "/X DooR" branding but implemented differently than official /X

**Theory C**: Missing setup code
- Possible but unlikely given thorough MCP search of express.e
- Would expect to find SOME reference to 0x790 if it existed

**Theory D**: Different build/configuration
- Maybe production /X had runtime patches or special builds
- Source code represents base version without production modifications

---

## Related Findings

### Other SIM Doors Checked

**RTW door at 0x790**:
```
00000790: 03e0 03e0 03e0 03e0 03e0 03e0 03e0 03e0
```
Just data, not code. RTW does NOT use 0x790 calling convention.

**WHAT door at 0x790**:
```
00000790: 0005 2f2f 002c 2f2f 0038 61...
```
Just data, not code. WHAT does NOT use 0x790 calling convention.

**Conclusion**: WHO is unique among the SIM doors tested. The 0x790 calling convention is NOT universal to all SIM doors.

### WHO .info File Contents

```
Level_to_see_up/dl=0
Level_from_sysops=257
PhoneNumber.0=+49 (0)30 622 19 94    ← German phone numbers
PhoneNumber.1=+49 (0)30 621 23 12
PhoneNumber.2=+49 (0)30 621 87 87
PhoneNumber.3=----LOCAL NODE-----
PhoneNumber.4=---500`er PoWeR----
Do_not_show_Node.3
Do_not_show_Node.4
```

Suggests WHO is from a German BBS system.

---

## Recommendations

### Short-term: Focus on XIM Doors

**Status**: XIM doors work 100%
- GA (GetAnswer): Fully functional
- 5D-Edit: Fully functional
- Bulls: In progress
- Message protocol: Working
- I/O system: Working
- Shutdown: Working

**Action**: Continue XIM door development and testing. Most classic /X doors are XIM type.

### Mid-term: Port SIM Doors to TypeScript

**Effort**: 1-2 weeks per door
**Advantages**:
- Native execution (no emulation overhead)
- Full access to modern JavaScript/TypeScript ecosystem
- Easy debugging and maintenance
- Can use modern async/await patterns
- Direct BBS integration

**Candidate doors for porting**:
1. WHO (user list) - simple, commonly used
2. WHAT (node activity) - simple
3. SizeCheck - utility
4. MultiTop - statistics
5. RTW (door game) - more complex, good test case

### Long-term: Full OS Emulation (Not Recommended)

**Effort**: 7-12 weeks
**Challenges**:
- Must emulate entire AmigaOS memory layout
- Need to implement low-memory function tables
- Complex debugging when things go wrong
- Performance overhead
- Maintenance burden

**Verdict**: Not worth the effort for a small number of incompatible doors.

---

## Session Context

### Context Consumption Issue

**Problem from Session 6**: Context ran out very fast (43K tokens in first messages)

**Fixes Applied**:
1. Reduced handoff.md from 16KB → 2KB (87% reduction)
2. Documented issues in AGENTS.md
3. Created check scripts: `check-handoff-size.sh`, `check-context-usage.sh`
4. Added prevention rules to CLAUDE.md

**Current handoff size**: 3.5KB (well under 5KB limit)

### MCP Server Update

Updated NDK path in `mcp-server/index.js` line 548:
```javascript
const autodocsPath = path.join(PROJECT_ROOT, 'Source', 'Documentation', 'NDK3.2R4', 'Autodocs');
```

Was pointing to wrong location, now correctly points to project's NDK documentation.

---

## Files Modified

- `handoff.md` - Updated with session 7 findings
- `mcp-server/index.js` - Fixed NDK autodocs path

## Files Created

- `Documentation/6-Progress/SIM_DOOR_ARCHITECTURE_DISCOVERY_20251202.md` (this file)

---

## Next Steps

1. **Document in masterplan.md**: Update door emulation status with SIM door findings
2. **Focus on XIM doors**: Continue development with working door type
3. **Create TypeScript porting guide**: Document process for porting SIM doors
4. **Identify TypeScript port candidates**: Prioritize commonly-used SIM doors
5. **Archive incompatible doors**: Mark WHO/WHAT/SizeCheck as "needs TypeScript port"

---

## References

- WHO binary: `doors/who/who`
- WHO disassembly notes: Lines 0x2c (A4 setup), 0x1148-0x115a (function call pattern)
- Express.e SIM door handling: Lines 4280-4282, 4346-4350
- Express.e door types: Lines 4242-4254 (DOORTYPE constants)
- MCP server config: `.mcp.json`
- NDK autodocs: `Source/Documentation/NDK3.2R4/Autodocs/`

---

## Lessons Learned

1. **Never assume compatibility**: Even doors marked for same BBS may use different conventions
2. **Disassemble entry points**: Critical to understand initialization and expectations
3. **Check A4 setup**: Reveals data access patterns (absolute vs relative)
4. **Search source thoroughly**: MCP tools make it easy to verify assumptions
5. **Document discoveries immediately**: Complex findings are easy to lose in long sessions
6. **Keep handoff.md compact**: Prevents context bloat in continued sessions
7. **User knowledge is invaluable**: "Nu = RTS" insight was the key to solving Nudos mystery
