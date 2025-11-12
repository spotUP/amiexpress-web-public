# 68K Door pr_CLI Initialization Fix - November 12, 2025

## The Breakthrough

Fixed critical bug preventing 68K Amiga doors from initializing properly. Bulls and RTW doors now run successfully!

## The Problem

**Bulls door failed with**: "Couldn't create reply port"

**Root Cause**: Bulls door uses `pr_CLI` (Process CLI pointer at offset 0xAC) as an **initialization flag**:
- If `pr_CLI == 0` → First run, execute initialization code, call CreatePort
- If `pr_CLI != 0` → Already initialized, skip initialization

Our emulation was setting `pr_CLI = 0x24000` (BPTR to CLI structure) **before** the door started, making Bulls think it was already initialized!

## The Investigation

### Disassembly Analysis (Bulls binary at doors/EmP_Tools/Bulls)

```asm
PC 0x1108:  tst.l 0xac(a3)      ; Test pr_CLI at A3+0xAC
PC 0x110C:  beq.w 0x18c         ; If ZERO, branch to initialization (0x118C)
            ; ... (if non-zero, continue and skip init)
PC 0x18A:   bra.b 0x1d6         ; Skip CreatePort, already initialized

; Initialization path (only if pr_CLI was zero):
PC 0x118C:  ; ... setup code ...
PC 0x1198:  jsr -0x174(a6)      ; CreatePort call (LVO -372)
```

### Debug Logs Showed

```
[BULLS-INIT] PC=0x1108, A3=0x70000
[BULLS-INIT] *** Testing value at A3+0xAC (0x700ac) = 0x24000
```

Bulls found pr_CLI = 0x24000 (non-zero), took the branch at 0x18A, and skipped CreatePort entirely!

## The Fix

**File**: `web/backend/src/amiga-emulation/AmigaDoorSession.ts:928`

**Before**:
```typescript
// Set pr_CLI to point to CLI structure
this.emulator.writeMemory32(taskAddr + prCliOffset, cliStructAddr >> 2); // pr_CLI = 0x24000
```

**After**:
```typescript
// CRITICAL FIX: Leave pr_CLI = 0 initially so doors like Bulls can detect first run
// Bulls checks pr_CLI at A3+0xAC - if ZERO, initializes and calls CreatePort
// If non-zero, Bulls assumes already initialized and skips CreatePort!
this.emulator.writeMemory32(taskAddr + prCliOffset, 0); // pr_CLI = 0 (first run!)
```

## Why This Works

Setting `pr_CLI = 0` allows:

1. **Bulls-style doors** (use pr_CLI as init flag) to detect first run and initialize properly
2. **RTW-style doors** (don't check pr_CLI) to run normally - they don't care about the value

Both door patterns now work correctly!

## Test Results

### Bulls Door (2.2)
```
Starting B...
$VER: Bulls 2.2  [/X DOOR]  (07-01-94) - ©1994: EMPiRE/MYSTiC
Bulls 2.2 is a XIM DOOR for AmiExpress 3.xx
Press ENTER to continue...
```
✅ **SUCCESS** - Creates port and runs!

### RTW Door (Realtime Who)
```
Starting RTW...
This is a XIM-DOOR for AmiExpress 3.x
Press ENTER to continue...
```
✅ **SUCCESS** - Runs normally!

## Technical Details

### AmigaOS Process Structure

```c
struct Process {
    struct Task pr_Task;
    struct MsgPort pr_MsgPort;
    // ... other fields ...
    BPTR   pr_CLI;           // Offset 0xAC - CLI structure pointer
    // ...
};
```

### CLI Initialization Pattern

Many Amiga programs use this pattern:
1. Check if `pr_CLI` is NULL
2. If NULL: First run, allocate and initialize CLI structure
3. If non-NULL: Already initialized, reuse existing CLI

This allows programs to detect warm starts vs. cold starts.

### Bulls Implementation

Bulls checks pr_CLI to decide between:
- **Cold start** (pr_CLI = 0): Full initialization with CreatePort, AllocMem, etc.
- **Warm start** (pr_CLI ≠ 0): Skip initialization, use existing resources

## Impact

This fix enables:
- ✅ Bulls bulletin reader door
- ✅ RTW realtime who door
- ✅ Potentially dozens of other 68K doors that use pr_CLI initialization pattern
- ✅ Doors that don't check pr_CLI continue working

## Related Files

- `web/backend/src/amiga-emulation/AmigaDoorSession.ts` - Door session execution
- `web/backend/src/amiga-emulation/api/ExecLibrary.ts` - CreatePort/CreateMsgPort implementation
- `web/backend/src/amiga-emulation/api/LibraryTraps.ts` - LVO -372 CreatePort/GetMsg handler

## Developer Response

When asked about Bulls CreatePort behavior, the AmiExpress E developer replied:

> "It's hard for me to answer in depth as I don't fully understand how this works. Message ports are a very specific Amiga thing so how does your system emulate them? Also I can't easily answer exactly what functions the door is using and how without disassembling it."

We disassembled Bulls with radare2 and traced execution to find the pr_CLI check pattern.

## Lessons Learned

1. **Disassembly is essential** - Radare2 analysis revealed the exact initialization logic
2. **Don't assume doors need CLI structure** - Some doors create their own
3. **Trust MOIRA** - The bug was in our setup code, not the emulator
4. **Memory layout matters** - Process structure initialization affects door behavior
5. **Initialization flags** - Many Amiga programs use NULL pointers as "first run" flags

## Next Steps

1. Test additional 68K doors from the 80+ available doors
2. Monitor for other initialization patterns
3. Document any new door startup requirements
4. Consider if other Process structure fields need specific initialization

## Commit Message

```
fix(68k-doors): Set pr_CLI to 0 to allow door initialization

Bulls door was failing with "Couldn't create reply port" because
we initialized pr_CLI to 0x24000 before the door started.

Bulls checks pr_CLI at A3+0xAC as an initialization flag:
- pr_CLI = 0: First run, initialize and call CreatePort
- pr_CLI ≠ 0: Already initialized, skip initialization

By setting pr_CLI = 0, doors can detect first run and initialize
properly. This pattern is common in Amiga software.

Tested:
- Bulls 2.2: Now creates port and runs successfully
- RTW: Still works, doesn't check pr_CLI

This fix likely enables dozens of other 68K doors that use
the pr_CLI initialization pattern.
```

## References

- Original Bulls binary: `doors/EmP_Tools/Bulls`
- RTW binary: `doors/RTW/rtw`
- Bulls.info: `Commands/BBSCmd/B.info`
- RTW.info: `Commands/BBSCmd/RTW.info`
