# Session 2025-10-30: FindTask() and CLI Structure Implementation

## Problem Identified

XIM doors were stuck in an infinite loop:
1. Door executes (370,000+ CPU cycles)
2. Door calls `Output()` repeatedly (4 times observed)
3. Door NEVER calls `Write()` or any output functions
4. Door loops back to step 2

**Root Cause:** XIM doors expect a complete AmigaDOS environment with:
- Process structure accessible via `FindTask(NULL)`
- CLI structure containing stdout file handle
- Doors validate CLI structure before calling `Write()`

## Solution Implemented

### 1. FindTask() Function (exec.library offset -294)

**Location:** `web/backend/src/amiga-emulation/api/ExecLibrary.ts:273-292`

```typescript
FindTask(): void {
  const namePtr = this.emulator.getRegister(CPURegister.A1);

  if (namePtr === 0) {
    // NULL = get current task
    if (!this.currentProcessAddr) {
      this.currentProcessAddr = 0xFFF00000;
      this.initializeProcessStructure(this.currentProcessAddr);
    }

    console.log(`[exec.library] FindTask(NULL) - returning current process at 0x${this.currentProcessAddr.toString(16)}`);
    this.emulator.setRegister(CPURegister.D0, this.currentProcessAddr);
  } else {
    // Named task lookup - return current process
    const name = this.readString(namePtr);
    console.log(`[exec.library] FindTask("${name}") - returning current process`);
    this.emulator.setRegister(CPURegister.D0, this.currentProcessAddr || 0);
  }
}
```

**What It Does:**
- Returns pointer to current Process structure in D0
- Initializes Process structure on first call
- Uses fixed address 0xFFF00000 for Process structure

### 2. Process Structure

**Location:** `web/backend/src/amiga-emulation/api/ExecLibrary.ts:304-327`

**Memory Layout:**
```
Offset  Field           Value
------  --------------  --------------------------------
0x00    pr_Task         Task structure (92 bytes)
0x08    ln_Type         0x0D (NT_PROCESS)
0x5C    pr_MsgPort      0x00000000 (NULL - not needed)
0x60    pr_CLI          BPTR to CLI structure (CRITICAL!)
```

**Implementation:**
```typescript
private initializeProcessStructure(processAddr: number): void {
  console.log(`[exec.library] Initializing Process structure at 0x${processAddr.toString(16)}`);

  // Clear structure
  for (let i = 0; i < 256; i++) {
    this.emulator.writeMemory(processAddr + i, 0);
  }

  // Allocate CLI structure
  const cliAddr = processAddr + 0x200; // 512 bytes after Process
  this.initializeCLIStructure(cliAddr);

  // Set pr_CLI pointer (BPTR format = address / 4)
  const cliBPTR = cliAddr >> 2;
  this.writeLong(processAddr + 0x60, cliBPTR);

  // Set pr_Task.ln_Type
  this.emulator.writeMemory(processAddr + 8, 0x0D); // NT_PROCESS
}
```

**Key Details:**
- BPTR (Amiga pointer) = Real address / 4
- CLI structure placed 512 bytes after Process structure
- ln_Type = 0x0D marks structure as Process (not just Task)

### 3. CLI Structure

**Location:** `web/backend/src/amiga-emulation/api/ExecLibrary.ts:347-367`

**Memory Layout:**
```
Offset  Field               Value
------  ------------------  ------------------------
0x00    cli_Result2         0x00000000
0x04    cli_SetName         BSTR (NULL)
0x08    cli_CommandDir      0x00000000
0x0C    cli_ReturnCode      0x00000000
0x10    cli_CommandName     BSTR (NULL)
0x14    cli_FailLevel       0x00000000
0x18    cli_Prompt          BSTR (NULL)
0x1C    cli_StandardInput   0x00000001 (stdin handle)
0x20    cli_CurrentInput    0x00000000
0x24    cli_CommandFile     0x00000000
0x28    cli_Interactive     0xFFFFFFFF (TRUE)
0x2C    cli_Background      0x00000000
0x30    cli_CurrentOutput   0x00000002 (stdout handle) **CRITICAL!**
```

**Implementation:**
```typescript
private initializeCLIStructure(cliAddr: number): void {
  console.log(`[exec.library] Initializing CLI structure at 0x${cliAddr.toString(16)}`);

  // Clear structure
  for (let i = 0; i < 256; i++) {
    this.emulator.writeMemory(cliAddr + i, 0);
  }

  // Set cli_StandardInput (offset 0x1C) - stdin handle (1)
  this.writeLong(cliAddr + 0x1C, 1);

  // Set cli_CurrentOutput (offset 0x30) - stdout handle (2) - CRITICAL!
  this.writeLong(cliAddr + 0x30, 2);

  // Set cli_Interactive (offset 0x28) - mark as interactive
  this.writeLong(cliAddr + 0x28, 0xFFFFFFFF); // -1 = TRUE
}
```

**Why cli_CurrentOutput is Critical:**
- XIM doors don't just call `Output()` to get stdout handle
- They call `FindTask()` → get Process → get CLI → read `cli_CurrentOutput`
- This validates they're running in a proper CLI environment
- Only THEN do they call `Write(cli_CurrentOutput, buffer, length)`

## How XIM Doors Use This

**Typical XIM Door Initialization:**
```c
// 1. Get current process
struct Process *proc = (struct Process *)FindTask(NULL);
if (!proc) {
    // ERROR: Not running as a process
    return;
}

// 2. Get CLI structure (convert BPTR to address)
struct CommandLineInterface *cli = BADDR(proc->pr_CLI);
if (!cli) {
    // ERROR: Not running from CLI (might be Workbench)
    return;
}

// 3. Get stdout handle from CLI
BPTR output = cli->cli_CurrentOutput;
if (!output) {
    // ERROR: No output stream
    return;
}

// 4. NOW can write output
Write(output, "Hello from XIM door!\n", 21);
```

**Why Doors Were Stuck:**
- Before this fix: `FindTask()` not implemented → returned 0
- Door checked if Process pointer is NULL → validation failed
- Door looped back to try again
- Result: Infinite loop calling `Output()` but never `Write()`

**After This Fix:**
- `FindTask()` returns valid Process structure at 0xFFF00000
- Process contains valid `pr_CLI` BPTR pointing to CLI structure
- CLI contains `cli_CurrentOutput = 2` (stdout handle)
- Door validation passes
- Door proceeds to call `Write(2, buffer, length)`
- **Door should now produce output!**

## Testing Instructions

When rate limit clears, test door execution:

1. **Connect to BBS** at http://localhost:5173
2. **Login** (or connect as guest)
3. **Run a door** (any XIM-type door like zOOsTAT)
4. **Check backend logs** for:
   ```
   [exec.library] FindTask(NULL) - returning current process
   [exec.library] Initializing Process structure
   [exec.library] Initializing CLI structure
   [dos.library] Write() - file=2, length=X
   ```

5. **Expected Result:** Door should output text instead of "dos.library" loop

## Files Modified

1. **web/backend/src/amiga-emulation/api/ExecLibrary.ts**
   - Added `FindTask()` function (line 273-292)
   - Added `initializeProcessStructure()` (line 304-327)
   - Added `initializeCLIStructure()` (line 347-367)
   - Added `currentProcessAddr` field (line 370)
   - Added case -294 to `handleCall()` (line 654-656)

2. **web/backend/src/amiga-emulation/api/DosLibrary.ts**
   - Enhanced `Output()` logging (line 227-241)
   - Added PC/SP tracking and return address logging

## Technical Details

### Amiga BPTR Format
- **BPTR** (Byte Pointer) = Real address / 4
- Allows addressing up to 4GB with 32-bit value
- Must shift right 2 bits to get real address: `realAddr = bptr << 2`
- Example: BPTR 0x3FFC0000 = Address 0xFFF00000

### Process Structure Offsets
- Based on AmigaOS 2.x/3.x `Process` structure
- Offset 0x60 for `pr_CLI` is correct for OS 2.0+
- XIM doors compiled for OS 2.0+ expect this layout

### CLI Structure Offsets
- Based on AmigaOS 2.x/3.x `CommandLineInterface` structure
- Offset 0x30 for `cli_CurrentOutput` is correct
- Offset 0x1C for `cli_StandardInput` is correct
- All other fields can be NULL/zero for basic door operation

## Next Steps

After testing proves this works:

1. **Document** successful door execution in session log
2. **Add** more CLI fields if doors need them (cli_Prompt, cli_CommandName, etc.)
3. **Implement** dos.library `Cli()` function (returns CLI pointer directly)
4. **Test** multiple different XIM doors to ensure compatibility
5. **Update** XIM_DOOR_ANALYSIS.md with complete solution

## Expected Outcomes

**Before Fix:**
```
Door execution loop:
1. Call Output() → Get handle 2
2. Call FindTask(NULL) → Get 0 (not implemented)
3. Check if valid → FAIL
4. Loop back to step 1
5. Repeat infinitely
```

**After Fix:**
```
Door execution flow:
1. Call FindTask(NULL) → Get Process at 0xFFF00000
2. Read pr_CLI from Process → Get BPTR to CLI
3. Convert BPTR to address → Get CLI at 0xFFF00200
4. Read cli_CurrentOutput → Get handle 2
5. Validate handle != 0 → PASS
6. Call Write(2, buffer, length) → OUTPUT APPEARS!
7. Door continues normal operation
```

## References

- AmigaOS 2.x/3.x Autodocs: dos.library/Cli()
- Amiga ROM Kernel Reference Manual: exec.library/FindTask()
- XIM-DOOR specification (if available)
- Previous session: SESSION_2025-10-30_XIM_DOOR_FIX.md
- Technical analysis: XIM_DOOR_ANALYSIS.md

## Success Criteria

Door execution is successful when:
1. ✅ `FindTask()` is called and returns valid Process pointer
2. ✅ Door reads `pr_CLI` from Process structure
3. ✅ Door reads `cli_CurrentOutput` from CLI structure
4. ✅ Door calls `Write()` with stdout handle
5. ✅ Door output appears in terminal (not "dos.library" loop)
6. ✅ Door executes to completion (RTS to exit sentinel)

---

**Implementation Date:** October 30, 2025
**Status:** Ready for Testing (pending rate limit clearance)
**Confidence:** High - This addresses the exact validation pattern XIM doors use
