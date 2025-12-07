# RTW Early Exit Investigation - November 11, 2025

## Summary

RTW exits early with return code 30 **before reaching its main IPC code**. The issue is NOT code corruption - execution flow takes an early exit path that prevents RTW from calling FindPort/FindSemaphore.

## Key Findings

### 1. No Code Corruption

**CONFIRMED**: The "code corruption" hypothesis was FALSE. The code is correct:
- File offset 0x4E contains `26 c1` (MOVE.L D1,(A3)+)
- Memory address 0x1022 correctly contains `26 c1`
- This is the BSS clearing loop - SUPPOSED to be there
- The loop executes correctly and completes

### 2. RTW Execution Path

**What RTW Does**:
1. Starts at PC=0x1000 (C startup code)
2. Clears BSS memory (loop at 0x1022/0x1024) ✓
3. Saves SP/A6, gets Task structure ✓
4. Calls AllocMem for stack space ✓ (succeeds)
5. Calls SetTaskPri, SetProgramName, FindTask ✓
6. **EXITS at PC=0x4232** → CloseLibrary → Return code 30

**What RTW Should Do** (based on vamos):
1-5. Same as above
6. **Continue to PC=0x3120** and call FindPort(port_name)
7. Call AllocSignal() at PC=0x468e
8. Attempt IPC with AmiExpress
9. Display "Couldn't create reply port" and exit (vamos behavior)

### 3. The Early Exit

RTW never reaches PC=0x3120 (FindPort call). Instead:
- Highest user-space PC reached: 0x4232
- RTW then cleanups and exits with D0=30
- This is ~6KB of code BEFORE the IPC initialization

### 4. What Causes The Exit?

**Theory**: RTW checks for a required condition that fails, causing early exit.

Possible checks (in order of likelihood):
1. **Command-line argument validation** - RTW expects specific args?
2. **Environment variable check** - Missing ENV: or ENVARC: variable?
3. **File existence check** - Required config file missing?
4. **Working directory check** - Wrong current directory?
5. **AmigaDOS version check** - Requires specific OS version?

### 5. Comparison with Vamos

**Vamos** (gets further):
- Reaches PC=0x30EA (FindPort code)
- Reaches PC=0x468e (AllocSignal)
- Fails with "Couldn't create reply port" (expected behavior)

**Our Emulator** (stops early):
- Never reaches PC=0x30EA
- Exits at PC=0x4232 with code 30
- Missing something that vamos provides

## Library Calls Made

RTW successfully calls:
- OpenLibrary(dos.library) ✓
- Input() ✓
- Output() ✓
- Open("*") ✓ (returns BPTR 2)
- AllocMem() × 2 ✓ (both succeed)
- FreeMem() × 1 ✓
- StackSwap() ✓
- SetTaskPri() ✓ (implied)
- Close() ✓
- FreeMem() × 2 ✓
- CloseLibrary() ✓

RTW **NEVER** calls:
- FindSemaphore() ✗
- FindPort() ✗
- AllocSignal() ✗
- Any IPC functions ✗

## Exit Code 30 Meaning

**D0=30 (decimal)** = 0x1E (hex)

This is **NOT** a standard AmigaDOS error code. Standard errors are 103-226 (ERROR_*).

**Likely**: Door-specific error code meaning "initialization failed" or "environment check failed".

## Investigation Approaches

### Approach 1: Trace Execution Path

Add logging to show EVERY PC value from 0x1028 (after BSS loop) to 0x4232 (exit point). This will show exactly which branch is taken.

### Approach 2: Check Command-Line Args

RTW is launched with args "rtw 2" (node number). Verify:
- Args are passed correctly to the door
- Args are in the expected format
- Node number is valid (2 is valid)

### Approach 3: Check Working Directory

RTW might expect to be run from a specific directory. Check:
- Current directory when RTW launches
- Whether RTW tries to access files with relative paths
- If file access fails silently

### Approach 4: Compare with WHO

WHO door (same binary as RTW) also exits with code 30. Both share the same early exit condition, suggesting:
- The check is in shared code (not door-specific)
- The missing requirement affects BOTH doors equally
- Likely an environment/setup issue, not a door bug

### Approach 5: Vamos Comparison

Run vamos with detailed logging to see:
- What working directory vamos uses
- What environment variables vamos provides
- What file operations RTW attempts
- Which checks pass in vamos but fail in our emulator

## Next Steps

**Recommended**: Approach 1 (Trace Execution Path)

Add detailed PC logging from 0x1028 to 0x4232 to see:
1. Which conditional branches are taken
2. What values are checked (TST, CMP instructions)
3. Which branch leads to the cleanup code
4. What specific condition causes the early exit

**Implementation**:
```typescript
// In AmigaDoorSession.ts
if (pc >= 0x1028 && pc < 0x5000 && this.iterationCount < 200) {
  const instr = this.emulator.readMemory16(pc);
  console.log(`[RTW-TRACE] PC=0x${pc.toString(16)} Instr=0x${instr.toString(16).padStart(4,'0')}`);

  // Log register state at branches
  if ((instr & 0xF000) === 0x6000) { // Bcc instructions
    const d0 = this.emulator.getRegister(0);
    const sr = this.emulator.getStatusRegister();
    console.log(`[RTW-BRANCH] D0=0x${d0.toString(16)}, SR=0x${sr.toString(16)}`);
  }
}
```

## Files Involved

- `web/backend/src/amiga-emulation/AmigaDoorSession.ts` - Door execution
- `web/backend/src/amiga-emulation/loader/HunkLoader.ts` - Binary loading (working correctly)
- `doors/RTW/rtw` - RTW binary (correct, no corruption)

## Related Documentation

- False alarm: `RTW_CODE_CORRUPTION_BUG_20251111.md` (INCORRECT hypothesis)
- Relocation debugging: `RTW_RELOCATION_DEBUGGING_20251111.md` (based on false premise)
- Conclusion: `RTW_NO_CODE_CORRUPTION_CONCLUSION_20251111.md` (CORRECT - proves no corruption)
- No output analysis: `RTW_WHO_NO_OUTPUT_ANALYSIS_20251111.md` (CORRECT - identifies missing IPC)

## Confidence Level

**HIGH** - The analysis is sound:
- RTW executes correctly until early exit
- The exit is deterministic (always at same point with same code)
- Vamos reaches further, proving RTW code is functional
- The issue is a missing environment condition, not a code bug

The next step is definitively identifying WHICH condition check fails.
