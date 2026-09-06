# Moira 68K Debugging Guide

This document describes the debugging capabilities available in the Moira 68000 CPU emulator used for AmiExpress 68K door execution.

## Quick Reference

### Environment Variables (TypeScript-level debugging)
```bash
DEBUG_68K=1           # Verbose 68K execution tracing
DEBUG_LIBRARY_TRAPS=1 # Log library trap calls (dos.library, exec.library, etc.)
DEBUG_FILE_OPS=1      # Log file operations (Open, Read, Write, Close)
```

### Moira Native Debugger (WASM-level, runtime toggleable)

Access via the `cpu` object in MoiraEmulator:

```typescript
// Enable master debug (logs to console)
cpu.setDebug(true);

// Use native Moira disassembler
const disasm = cpu.nativeDisassemble(0x1000);  // Returns "MOVE.L D0,D1" etc.
const size = cpu.nativeDisassembleSize(0x1000); // Returns instruction size in bytes
```

---

## Debugging Features

### 1. Native Breakpoints

Set breakpoints on PC addresses. Execution pauses when PC reaches the address.

```typescript
// Set a breakpoint
cpu.nativeSetBreakpoint(0x1234);

// Check if hit after execute()
if (cpu.hasNativeBreakpointHit()) {
  const addr = cpu.getNativeBreakpointAddr();
  console.log(`Breakpoint hit at 0x${addr.toString(16)}`);
  cpu.clearNativeBreakpointHit();
}

// Manage breakpoints
cpu.nativeRemoveBreakpoint(0x1234);
cpu.nativeEnableBreakpoint(0x1234);   // Re-enable without re-adding
cpu.nativeDisableBreakpoint(0x1234);  // Disable without removing
cpu.nativeClearAllBreakpoints();
cpu.nativeBreakpointCount();  // Get count
```

### 2. Native Watchpoints (Memory Access Monitoring)

Monitor reads/writes to specific memory addresses.

```typescript
// Watch a memory address
cpu.nativeSetWatchpoint(0x4000);  // Triggers on any read/write to 0x4000

// Check if triggered
if (cpu.hasNativeWatchpointHit()) {
  const addr = cpu.getNativeWatchpointAddr();
  console.log(`Memory access at 0x${addr.toString(16)}`);
  cpu.clearNativeWatchpointHit();
}

// Manage watchpoints
cpu.nativeRemoveWatchpoint(0x4000);
cpu.nativeClearAllWatchpoints();
cpu.nativeWatchpointCount();
```

### 3. Native Catchpoints (Exception Catching)

Catch CPU exceptions by vector number.

```typescript
// Common exception vectors:
// 2  = Bus Error
// 3  = Address Error
// 4  = Illegal Instruction
// 5  = Zero Divide
// 6  = CHK Instruction
// 7  = TRAPV Instruction
// 8  = Privilege Violation
// 9  = Trace
// 10 = Line-A Emulator
// 11 = Line-F Emulator
// 32-47 = TRAP #0-15

cpu.nativeSetCatchpoint(4);  // Catch illegal instruction

if (cpu.hasNativeCatchpointHit()) {
  const vector = cpu.getNativeCatchpointVector();
  console.log(`Exception vector ${vector} triggered`);
  cpu.clearNativeCatchpointHit();
}
```

### 4. Step Execution

Single-step through code:

```typescript
cpu.nativeStepInto();  // Execute one instruction, step into JSR/BSR
cpu.nativeStepOver();  // Execute one instruction, step over JSR/BSR
```

### 5. Instruction Logging (256-entry circular buffer)

Moira maintains a circular buffer of the last 256 executed instructions.

```typescript
// Enable logging
cpu.nativeEnableLogging();

// ... execute some code ...

// Check logged instructions
const count = cpu.nativeLoggedInstructions();
for (let i = 0; i < count; i++) {
  const pc = cpu.nativeGetLogEntryPC(i);  // i=0 is oldest
  const disasm = cpu.nativeDisassemble(pc);
  console.log(`0x${pc.toString(16)}: ${disasm}`);
}

// Clear and disable
cpu.nativeClearLog();
cpu.nativeDisableLogging();
```

### 6. Native Disassembler

Disassemble instructions at any address:

```typescript
const addr = 0x1000;
const disasm = cpu.nativeDisassemble(addr);      // "MOVE.L D0,D1"
const size = cpu.nativeDisassembleSize(addr);    // 2, 4, 6, etc.
const srText = cpu.nativeDisassembleSR();        // "T-S--III---XNZVC"
```

### 7. Register Dumps

```typescript
cpu.dumpRegisters();  // Logs D0-D7, A0-A7, PC, SR to console
cpu.dumpStack(8);     // Logs 8 longwords from SP
```

### 8. Statistics

```typescript
cpu.dumpStatistics();  // Logs instruction count, reads, writes, JSR/RTS counts

// Individual stats
cpu.getReadCount();
cpu.getWriteCount();
cpu.getJsrCount();
cpu.getRtsCount();
cpu.getBranchCount();
cpu.getTrapCount();
cpu.getInstructionCount();
cpu.resetStatistics();
```

---

## Custom Debug Features (Our Implementation)

### Execution Trace Buffer

Circular buffer of last 256 PC values:

```typescript
cpu.enableTrace(true);
// ... execute ...
cpu.dumpTrace();  // Logs all PCs
cpu.getTraceEntry(0);  // Get specific entry
cpu.clearTrace();
```

### Memory Protection

Detect writes to protected memory ranges:

```typescript
cpu.enableMemoryProtection(0x1000, 0x2000);  // Protect range
// ... execute ...
if (cpu.hasCorruptionDetected()) {
  const addr = cpu.getLastCorruptedAddress();
  console.log(`Memory corrupted at 0x${addr.toString(16)}`);
}
```

### Stack Monitoring

Detect stack overflow:

```typescript
cpu.setStackBounds(0x80000, 0x70000);  // Base=0x80000, limit=0x70000
// ... execute ...
if (cpu.hasStackOverflow()) {
  console.log(`Stack overflow! Max depth: 0x${cpu.getMaxStackDepth().toString(16)}`);
}
```

### Call Tracking

Track JSR/RTS call stack:

```typescript
cpu.enableCallTracking(true);
// ... execute ...
cpu.dumpCallStack();
const depth = cpu.getCallStackDepth();
for (let i = 0; i < depth; i++) {
  const retAddr = cpu.getCallStackEntry(i);
  const callSite = cpu.getCallSite(i);
  console.log(`Called from 0x${callSite.toString(16)} -> return to 0x${retAddr.toString(16)}`);
}
```

### Wild Pointer Detection

Detect accesses outside valid memory:

```typescript
cpu.setValidMemoryRange(0x0, 0x200000);  // Valid: 0-2MB
// ... execute ...
if (cpu.hasWildAccessDetected()) {
  console.log(`Wild pointer: 0x${cpu.getLastWildAccess().toString(16)}`);
}
```

---

## Debugging Workflow

### 1. Initial Investigation

```bash
# Check existing door logs first!
ls -t logs/door-68k-{DOORNAME}* | head -3
grep -i "error\|fail\|not found" logs/door-68k-{DOORNAME}* | tail -20
```

### 2. Enable Appropriate Debug Flags

```bash
# For file issues
DEBUG_FILE_OPS=1 npx tsx src/doors/run-amiga-door.ts DOORNAME

# For library call issues
DEBUG_LIBRARY_TRAPS=1 npx tsx src/doors/run-amiga-door.ts DOORNAME

# For full execution trace
DEBUG_68K=1 npx tsx src/doors/run-amiga-door.ts DOORNAME
```

### 3. Use Native Debugger for Specific Issues

```typescript
// In DoorLifecycleManager or test script:
const emulator = new MoiraEmulator();
await emulator.initialize();

// Set breakpoint at suspicious address
emulator.cpu.nativeSetBreakpoint(0x1234);

// Enable logging to capture execution history
emulator.cpu.nativeEnableLogging();

// Execute and check
while (!emulator.cpu.hasNativeBreakpointHit()) {
  emulator.cpu.executeInstruction();
}

// Dump state
emulator.cpu.dumpRegisters();
emulator.cpu.dumpStack(16);

// Disassemble around current PC
const pc = emulator.getRegister(CPURegister.PC);
for (let i = -10; i <= 10; i++) {
  const addr = pc + i * 2;
  console.log(`0x${addr.toString(16)}: ${emulator.cpu.nativeDisassemble(addr)}`);
}
```

### 4. Use radare2 for Static Analysis

```bash
# Disassemble at specific address
r2 -q -c "e asm.arch=m68k; e asm.bits=32; s 0x1156; pd 20" doors/DOORNAME/door

# Find all JSR instructions
r2 -q -c "e asm.arch=m68k; /ad jsr" doors/DOORNAME/door
```

### 5. Compare with vamos (Reference Implementation)

```bash
# Test with vamos to verify correct behavior
vamos doors/DOORNAME/door

# Trace execution
vamos --log-file=/tmp/vamos.log doors/DOORNAME/door
```

---

## Common Issues and Debug Approaches

### Door Hangs / Infinite Loop
1. Enable instruction logging: `cpu.nativeEnableLogging()`
2. Run with timeout, then dump log to see where it's stuck
3. Set breakpoint at suspected loop address
4. Check if it's polling hardware (CIA timers, custom chips)

### Illegal Instruction
1. Set catchpoint: `cpu.nativeSetCatchpoint(4)`
2. Get PC when triggered
3. Disassemble: `cpu.nativeDisassemble(pc)`
4. Check if it's a valid 68K instruction or memory corruption

### File Not Found
1. Enable `DEBUG_FILE_OPS=1`
2. Check logs for Open() calls and paths
3. Verify case-sensitivity (use amigafs module)

### Memory Corruption
1. Enable memory protection on suspicious range
2. Use watchpoints on specific addresses
3. Enable call tracking to see what function corrupted it

### Library Call Failures
1. Enable `DEBUG_LIBRARY_TRAPS=1`
2. Check return values in D0
3. Verify IoErr() values

---

## Moira Configuration (MoiraConfig.h)

Current settings:
- `MOIRA_ENABLE_DASM true` - Disassembler enabled
- `MOIRA_BUILD_INSTR_INFO_TABLE true` - Instruction info available
- `MOIRA_VIRTUAL_API true` - Virtual functions for callbacks
- `MOIRA_PRECISE_TIMING false` - Performance over accuracy
- `MOIRA_EMULATE_ADDRESS_ERROR false` - Disabled for speed

To enable more instruction callbacks, modify:
```cpp
#define MOIRA_WILL_EXECUTE    I == Instr::STOP || I == Instr::TAS || I == Instr::BKPT
#define MOIRA_DID_EXECUTE     I == Instr::RESET
```

---

## References

- Moira Documentation: https://dirkwhoffmann.github.io/Moira/docs/
- vAmiga (uses Moira): https://github.com/dirkwhoffmann/vAmiga
- 68000 Programmer's Reference Manual
- AmigaOS NDK 3.2 (for library calls)
