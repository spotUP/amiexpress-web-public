# Session 2025-10-31: FindPort Not Called Discovery

## Critical Discovery

**ROOT CAUSE IDENTIFIED**: The door is NOT calling FindPort() to locate AEDoorPort0, resulting in garbage port address 0x7500002f!

## Investigation Summary

###  What We Know

1. **AEDoorPort0 exists at 0xa0000** ✓ (correctly created)
2. **Door calls WaitPort(0x7500002f)** ✗ (garbage address)
3. **Door calls GetMsg(0x7500002f)** ✗ (same garbage address)
4. **FindPort vector is installed** ✓ (at 0xfe7a)
5. **FindPort is NEVER called** ✗ (no "Intercepted: FindPort" in logs)

### Evidence from Logs

```
[FindPort] Vector at 0xfe7a (offset -390)    ← Installed
[ExecLibrary] GetMsg(port=0x7500002f)        ← Bad address!
[ExecLibrary] WaitPort: Port not found: 0x7500002f  ← Lookup fails
```

**Key Missing Log**: No "Intercepted: FindPort()" means door never calls it!

## The Problem

GetAnswer door should follow this sequence:
```c
// Expected door code:
port = FindPort("AEDoorPort0");  // ← NEVER HAPPENS!
msg = GetMsg(port);
if (!msg) {
  WaitPort(port);
  msg = GetMsg(port);
}
```

What's actually happening:
```c
// Actual door behavior:
// A0 register contains garbage (0x7500002f)
msg = GetMsg(A0);  // Uses garbage address!
if (!msg) {
  WaitPort(A0);    // Uses same garbage address!
}
```

## Analysis of 0x7500002f

The address 0x7500002f appears to be:
- **Not a valid port address** (ports start at 0xa0000)
- **Possibly uninitialized A0 register**
- **Could be reading from wrong memory location**
- **Might be structure offset confusion**

The 0x75 prefix suggests it might be:
- Part of door's data segment
- Uninitialized global variable
- Stack value that shouldn't be used as pointer

## Why Door Doesn't Call FindPort

Possible reasons:

### Hypothesis 1: Door Uses Hardcoded Address
Maybe GetAnswer expects port address in a specific location (environment variable, global, etc.) instead of calling FindPort().

### Hypothesis 2: Door Created Own Port
Maybe door called CreateMsgPort() for its OWN reply port and is confused about which port to use.

### Hypothesis 3: Missing Initialization
Door might expect AEDoorPort address to be passed via:
- Command line argument (argc/argv)
- Environment variable
- Global memory location
- Door info structure

### Hypothesis 4: XIM Protocol Mismatch
GetAnswer might use different XIM protocol version that doesn't use FindPort().

## Next Steps

### Immediate Actions

1. **Check GetAnswer door source code** (if available) to see how it finds AEDoorPort
2. **Disassemble door startup** to see what it does before GetMsg/WaitPort
3. **Add A0 register logging** to see how 0x7500002f gets there
4. **Check if door creates own port** (CreateMsgPort calls)

### Possible Fixes

**Option A: Set A0 Before Door Runs**
If door expects port address in A0:
```typescript
// In AmigaDoorSession before starting door:
this.emulator.setRegister(8, 0xa0000);  // A0 = AEDoorPort0 address
```

**Option B: Patch Door to Call FindPort**
Intercept first GetMsg/WaitPort and inject FindPort call.

**Option C: Pass Port Via Environment**
Set up environment variable or global that door checks.

**Option D: Fix XIM Protocol Implementation**
Ensure we match exact protocol GetAnswer expects.

## Log Analysis Details

### Port Creation (Correct)
```
[AmigaDoorSession] Creating AEDoorPort for door communication...
[ExecLibrary] Creating public port: "AEDoorPort0"
[ExecLibrary]   Public port "AEDoorPort0" created at 0xa0000
[AmigaDoorSession] Created AEDoorPort0 at 0xa0000
```

### Door Startup (dos.library only)
```
[LibraryTraps] Intercepted: OpenLibrary() at PC=0xfdd8
[ExecLibrary] OpenLibrary("dos.library", 0)
[LibraryTraps] Installing dos.library vectors at base 0x20000
```

**Notable**: No OpenLibrary("aedoor.library")!

### FindPort Vector Installed (But Never Used)
```
[FindPort] Vector at 0xfe7a (offset -390)
```

**Missing**: No "Intercepted: FindPort()" logs

### Door Polling Loop (Using Bad Address)
```
[AmigaDoorSession] *** LIBRARY CALL IN POLLING LOOP ***
[AmigaDoorSession]   Function: GetMsg
[AmigaDoorSession]   PC: 0xfe8c
[AmigaDoorSession]   Iteration: 8133
[ExecLibrary] GetMsg(port=0x7500002f)

[AmigaDoorSession] *** LIBRARY CALL IN POLLING LOOP ***
[AmigaDoorSession]   Function: WaitPort
[AmigaDoorSession]   PC: 0xfe80
[AmigaDoorSession]   Iteration: 8857
[ExecLibrary] WaitPort: Port not found: 0x7500002f
```

## Code Locations

### ExecLibrary.ts - WaitPort Implementation
```typescript
// Line 921-925
waitPort(portAddr: number): number {
  const port = this.messagePorts.get(portAddr);
  if (!port) {
    console.error(`[ExecLibrary] WaitPort: Port not found: 0x${portAddr.toString(16)}`);
    return 0;
  }
  // ...
}
```

### LibraryTraps.ts - WaitPort Handler
```typescript
// Line 373-378
{
  offset: -384,  // LVO -384 (0xFFFFFE80)
  name: 'WaitPort',
  handler: (emu, lib: ExecLibrary) => {
    const portAddr = emu.getRegister(8);   // A0
    return lib.waitPort(portAddr);
  }
}
```

## Related Documentation

- SESSION_2025_10_31_WAITPORT_BREAKTHROUGH.md - Initial WaitPort discovery
- SESSION_2025_10_31_A1_REGISTER_BREAKTHROUGH.md - A1 investigation
- CRITICAL_AEDOOR_DISCOVERY.md - AEDoor protocol details

---

**Priority**: CRITICAL - Door cannot function without correct port address

**Next Session**: Determine how GetAnswer expects to receive AEDoorPort0 address
