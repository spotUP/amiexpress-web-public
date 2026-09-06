# 68K Door Emulation Debugging Workflow

**Status**: Emulation in rough shape after Kickstart ROM switch
**Goal**: Systematically identify and fix emulation issues
**Last Updated**: 2025-12-24

## Philosophy

1. **NEVER blame MOIRA** - The CPU emulator is battle-tested and correct
2. **Use vamos as ground truth** - If it works in vamos, bug is in YOUR code
3. **Test incrementally** - Fix one thing at a time, verify with multiple doors
4. **Document findings** - Keep this file updated with what you learn

## Toolchain

### Essential Tools

```bash
# Install amitools (includes vamos)
pip3 install amitools

# Verify installation
vamos --version
vda68k --version  # Disassembler
```

### Test Script
```bash
./dev/scripts/test-68k-library-functions.sh
```

## Testing Strategy

### Level 1: Vamos Baseline

**For ANY door that fails in your emulator:**

```bash
# Run in vamos (ground truth)
vamos Doors/who/who

# With detailed logging
vamos --log-file=/tmp/vamos-who.log --log-level=debug Doors/who/who

# Check exit code
echo $?  # Should be 0 for success
```

**If it fails in vamos → door is broken, not emulator**
**If it works in vamos → bug is in YOUR emulator**

### Level 2: Minimal Test Cases

Start with simplest possible doors:

1. **WHO** - Minimal dos.library usage, just file open/read
2. **Bulls** - Simple file operations
3. **MultiTop** - More complex, uses DateStamp, file ops
4. **Diagnostic** - Complex, many library calls (test last)

### Level 3: Execution Trace Comparison

```bash
# 1. Get vamos trace
vamos --log-file=/tmp/vamos-trace.log Doors/who/who

# 2. Run in your emulator, get door log
# Logs are in: logs/door-68k-{DOORNAME}-{TIMESTAMP}.-N{NODE}.log

# 3. Compare side-by-side
# Look for first divergence point
```

## Common Issues to Check

### 1. ROM Loading

**Verify** (check backend.log on startup):
```
[ROM] Loading Kickstart ROM from: /path/to/Kickstart v3.1...
[ROM] Kickstart 3.1 loaded successfully
[ROM] Mapped to memory range: 0xF80000 - 0xFFFFFF
```

**Test**:
- ROM should be 512KB (524288 bytes)
- Mapped at 0xF80000-0xFFFFFF
- Library vectors should point into ROM range

### 2. Library Base Addresses

**Check** DosLibrary.ts, ExecLibrary.ts initialization:
```typescript
// dos.library base should be set correctly
// exec.library base at 0x4 (SysBase)
```

**Verify in logs**:
```
[dos.library] Initialized at base 0x...
[exec.library] SysBase at 0x00000004
```

### 3. LVO Offsets

**CRITICAL**: Library Vector Offsets must match NDK exactly

Use MCP to verify:
```
mcp__amiexpress-docs__search_ndk_autodocs "Open"
mcp__amiexpress-docs__search_ndk_autodocs "Read"
```

**Check LibraryTraps.ts** - Are offsets correct?

Common mistakes:
- PrintFault was at -396, should be -474 ✓ (FIXED)
- SetFileDate should be at -396 ✓ (FIXED)

### 4. Function Implementations

**For each dos.library function:**

1. Does it read parameters correctly? (D1, D2, D3, A0, A1...)
2. Does it set return value correctly? (D0)
3. Does it set lastError correctly?
4. Does it handle NULL/error cases?

**Example check:**
```typescript
// SetFileDate(namePtr: D1, datePtr: D2): BOOL D0
SetFileDate(): void {
  const namePtr = this.emulator.getRegister(CPURegister.D1);  // ✓
  const datePtr = this.emulator.getRegister(CPURegister.D2);  // ✓

  // ... do work ...

  this.emulator.setRegister(CPURegister.D0, -1);  // Success = -1 (TRUE)
  this.lastError = this.ERROR_NO_ERROR;  // ✓
}
```

### 5. Memory Layout

**Check stack, heap, segment placement:**

From door logs:
```
[HUNK] Segment 0: CODE at 0x1008, size=11908 bytes
[HUNK] Segment 1: DATA at 0x3f08, size=1472 bytes
[INFO] Entry point: 0x1008
[CPU] PC=0x1008 ... SP=0x64dc A4=0xbf06
```

**Verify**:
- Code segment in low memory ✓
- Data segment after code ✓
- Stack pointer reasonable (0x6000-0x7000 range) ✓
- No overlaps ✓

### 6. Trapped vs Native Functions

**CRITICAL RULE**: Only trap when absolutely necessary

**From CLAUDE.md**:
- dos.library → Native 68K from ROM (DON'T trap)
- exec.library → Native 68K from ROM (DON'T trap)
- AEDoor.library → Native binary from ./Libs/AEDoor.library
- ONLY trap: PutMsg/GetMsg (BBS communication), utility functions

**Check LibraryTraps.ts**:
- Are you trapping functions that should execute natively?
- Remove unnecessary traps and let ROM handle them

## Debugging Specific Issues

### RawDoFmt Callback Timeout

**Symptom**: "RawDoFmt putch callback did not return within 1000 steps"

**Cause**: maxSteps = 1000 too low for some callbacks

**Fix**:
```typescript
// ExecLibrary.ts line 4917
const maxSteps = 10000;  // Increase from 1000
```

**Verify**: Callback should complete and return to stub

### Stack Region False Positive

**Symptom**: Door exits immediately, logs say "PC reached stack region"

**Cause**: Overly aggressive check treating valid stack trampolines as exit

**Fix**: Already disabled in DoorLifecycleManager.ts ✓

### File Not Found Errors

**Symptom**: Door can't find files that exist

**Check**:
1. Amiga assigns (BBS:, Doors:, Node1:) set correctly?
2. Path resolution working? (case-insensitive on Amiga)
3. Using amigafs module for file ops?

**Debug**:
```bash
# Check door logs for file operations
grep "Open.*ami=" logs/door-68k-{DOORNAME}*.log
```

## Success Criteria

A door is "working" when:

1. ✓ Loads and executes (doesn't crash)
2. ✓ Produces same output as vamos
3. ✓ Returns same exit code as vamos
4. ✓ File operations succeed
5. ✓ Date/time functions work
6. ✓ No timeout warnings in logs

## Current Status

### Working Doors
- ByteKillHandler ✓ (see logs, completes successfully)
- WHO ✓ (needs verification)
- Bulls ✓ (needs verification)

### Broken Doors
- Diagnostic (RawDoFmt timeout, SetFileDate issues)
- AquaScan (needs testing)
- MultiTop (needs testing)

### Known Issues
1. RawDoFmt callback maxSteps too low (1000 → 10000)
2. SetFileDate stubbed out (needs proper implementation)
3. Some doors may be calling functions that aren't in ROM

## Next Steps

1. **Immediate**: Test WHO door in both vamos and emulator, compare output
2. **Short-term**: Fix RawDoFmt maxSteps, test diagnostic again
3. **Medium-term**: Create minimal test doors for each library function
4. **Long-term**: Comprehensive regression suite

## Resources

- **NDK AutoDocs**: `mcp__amiexpress-docs__search_ndk_autodocs "<function>"`
- **Vamos source**: `dev/docs/amitools/amitools/vamos/`
- **LVO offsets**: `https://github.com/deplinenoise/amiga-sdk/blob/master/sdkinclude/lvo/dos_lib.i`
- **Door logs**: `logs/door-68k-*.log`
- **XIM debug**: Set `XIM_DEBUG=1` for protocol logs

## Template: Debugging a New Issue

```bash
# 1. Reproduce the issue
./dev/scripts/start-servers.sh
# Run door, note error

# 2. Test in vamos
vamos Doors/{DOORNAME}/{binary}
# Does it work? If yes → bug is in YOUR emulator

# 3. Get execution trace
vamos --log-file=/tmp/vamos.log Doors/{DOORNAME}/{binary}

# 4. Get emulator trace
# Check: logs/door-68k-{DOORNAME}-{TIMESTAMP}.-N*.log

# 5. Compare traces
# Find first divergence point

# 6. Identify root cause
# - Missing function implementation?
# - Wrong LVO offset?
# - Incorrect parameter handling?
# - Memory layout issue?

# 7. Fix and verify
# - Make minimal fix
# - Test with multiple doors
# - Document in this file
```
