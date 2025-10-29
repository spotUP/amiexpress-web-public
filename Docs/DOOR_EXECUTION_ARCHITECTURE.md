# Door Execution Architecture - AmiExpress-Web

## Overview

Complete documentation of how Amiga doors are executed through the 68k emulator in AmiExpress-Web.

---

## Execution Flow

### 1. User Input → Command Lookup

```
User types: "FRONTEND"
      ↓
BBSSession reads command
      ↓
processBBSCommand("FRONTEND", "")
      ↓
runBbsCommand("FRONTEND", "")
      ↓
runCommand(socket, session, CommandType.BBSCMD, "FRONTEND", "")
```

**Code:** `handlers/command-execution.handler.ts:141-240`

### 2. Command Cache Lookup

```typescript
// Command cache loaded at startup
const commandCache = {
  syscmd: Map<string, CommandDefinition>,
  bbscmd: Map<string, CommandDefinition>
};

// Lookup in cache
commandDef = commandCache.bbscmd.get("FRONTEND");

// Result:
{
  name: "FRONTEND",
  type: "XIM",                          // ← Key field!
  location: "Doors:AquaWho/AquaWho",    // Amiga path
  access: 0,                             // Public access
  stack: 10000,                          // Stack size
  multinode: true                        // Multi-node safe
}
```

**Code:** `handlers/command-execution.handler.ts:150-163`

### 3. Access Control Check

```typescript
// Check user security level
const userSecLevel = session.user?.secLevel || 0;  // e.g., 255 (sysop)
const requiredAccess = commandDef.access || 0;      // e.g., 0 (public)

if (userSecLevel < requiredAccess) {
  return RESULT_NOT_ALLOWED;  // Access denied
}
```

**Code:** `handlers/command-execution.handler.ts:167-181`

### 4. Door Execution Dispatch

```typescript
// Convert Amiga path to Unix path
// "Doors:AquaWho/AquaWho" → "Doors/AquaWho/AquaWho"
location = location.replace(/:/g, '/');

const doorConfig = {
  name: "FRONTEND",
  type: "XIM",  // ← Determines execution method
  location: "Doors/AquaWho/AquaWho",
  access: 0,
  parameters: "",
  priority: "SAME",
  stack: 10000,
  resident: false,
  expertMode: false
};

await executeDoor(socket, session, doorConfig);
```

**Code:** `handlers/command-execution.handler.ts:206-229`

### 5. Door Type Detection

```typescript
// executeDoor() determines execution method based on type
switch (door.type) {
  case 'web':      // TypeScript/JavaScript door
    await executeWebDoor(...);
    break;

  case 'native':   // Native executable (checks for Amiga binary)
    await executeNativeDoor(...);
    break;

  case 'script':   // Shell script (bash, python, etc.)
    await executeScriptDoor(...);
    break;

  case 'XIM':      // ← Our case!
  case 'AIM':      // eXpress/Amiga/Standard/Text/Interactive Internal Module
  case 'SIM':
  case 'TIM':
  case 'IIM':
    await executeAmigaDoor(socket, session, door, doorSession);
    break;
}
```

**Code:** `handlers/door.handler.ts:179-201`

### 6. Amiga Door Execution Setup

```typescript
async function executeAmigaDoor(socket, session, door, doorSession) {
  console.log(`[executeAmigaDoor] Starting Amiga door: ${door.name} (${door.type})`);

  // Get BBS root directory
  const { getAmigaDoorManager } = require('../doors/amigaDoorManager');
  const amigaDoorMgr = getAmigaDoorManager();
  const bbsRoot = amigaDoorMgr.bbsRoot;  // e.g., ~/Code/amiexpress-web

  // Build full path to door executable
  // door.location = "Doors/AquaWho/AquaWho"
  const doorPath = path.join(bbsRoot, door.location);
  // Result: ~/Code/amiexpress-web/Doors/AquaWho/AquaWho

  // Verify executable exists
  if (!fs.existsSync(doorPath)) {
    socket.emit('ansi-output', 'Door executable not found.');
    return;
  }

  // Create door configuration for AmigaDoorSession
  const doorConfig = {
    executablePath: doorPath,
    timeout: 300,           // 5 minutes
    memorySize: 1024 * 1024 // 1MB RAM
  };

  // Create and start 68k emulator session
  const amigaSession = new AmigaDoorSession(socket, doorConfig);
  await amigaSession.start();
}
```

**Code:** `handlers/door.handler.ts:212-258`

### 7. AmigaDoorSession Initialization

```typescript
class AmigaDoorSession {
  constructor(socket: Socket, config: DoorConfig) {
    this.socket = socket;
    this.config = {
      timeout: 300,
      memorySize: 1024 * 1024,
      ...config
    };

    // Set up Socket.io event handlers for user input
    this.setupSocketHandlers();
  }

  private setupSocketHandlers(): void {
    // User input from terminal
    this.socket.on('door:input', (data: string) => {
      if (this.environment && this.isRunning) {
        this.environment.queueInput(data);
      }
    });

    // User disconnected
    this.socket.on('disconnect', () => {
      this.terminate();
    });

    // Explicit termination request
    this.socket.on('door:terminate', () => {
      this.terminate();
    });
  }
}
```

**Code:** `amiga-emulation/AmigaDoorSession.ts:40-75`

### 8. Door Binary Loading

```typescript
async start(): Promise<void> {
  // 1. Emit status to frontend
  this.socket.emit('door:status', { status: 'initializing' });

  // 2. Initialize 68000 CPU emulator (Moira)
  this.emulator = new MoiraEmulator(this.config.memorySize);
  await this.emulator.initialize();

  // 3. Create AmigaDOS environment (API emulation layer)
  this.environment = new AmigaDosEnvironment(this.emulator);

  // 4. Set up output callback (door output → Socket.io → terminal)
  this.environment.setOutputCallback((data: string) => {
    this.socket.emit('ansi-output', data);
  });

  // 5. Load door executable using HunkLoader
  const binary = fs.readFileSync(this.config.executablePath);
  const hunkLoader = new HunkLoader();
  const hunkFile = hunkLoader.parse(Buffer.from(binary));

  console.log(`Parsed ${hunkFile.segments.length} segments:`);
  // Example output:
  //   Segment 0: CODE at 0x1000, size=24216 bytes
  //   Segment 1: DATA at 0x6F00, size=1096 bytes

  // 6. Load segments into emulator memory
  hunkLoader.load(this.emulator, hunkFile);

  // 7. Verify memory layout
  for (const segment of hunkFile.segments) {
    console.log(`Loaded ${segment.type} at 0x${segment.address.toString(16)}`);
  }
}
```

**Code:** `amiga-emulation/AmigaDoorSession.ts:80-229`

### 9. CPU Initialization

```typescript
// Set up reset vectors (0x000000-0x000007)
const initialSP = 0xFE000;  // Stack pointer near top of memory

// Address 0-3: Initial stack pointer
emulator.writeMemory(0x0, (initialSP >> 24) & 0xFF);
emulator.writeMemory(0x1, (initialSP >> 16) & 0xFF);
emulator.writeMemory(0x2, (initialSP >> 8) & 0xFF);
emulator.writeMemory(0x3, initialSP & 0xFF);

// Address 4-7: Initial program counter
emulator.writeMemory(0x4, (hunkFile.entryPoint >> 24) & 0xFF);
emulator.writeMemory(0x5, (hunkFile.entryPoint >> 16) & 0xFF);
emulator.writeMemory(0x6, (hunkFile.entryPoint >> 8) & 0xFF);
emulator.writeMemory(0x7, hunkFile.entryPoint & 0xFF);

// Reset CPU (reads vectors from address 0 and 4)
emulator.reset();

// NOW set up ExecBase at address 4 (after reset)
const execBaseAddr = 0xFF8000;
emulator.writeMemory(0x4, (execBaseAddr >> 24) & 0xFF);
emulator.writeMemory(0x5, (execBaseAddr >> 16) & 0xFF);
emulator.writeMemory(0x6, (execBaseAddr >> 8) & 0xFF);
emulator.writeMemory(0x7, execBaseAddr & 0xFF);

// Push exit sentinel to stack (for when door executes RTS to exit)
const exitSentinel = 0xDEADBEEF;
const newSP = actualSP - 4;
emulator.writeMemory(newSP, (exitSentinel >> 24) & 0xFF);
emulator.writeMemory(newSP + 1, (exitSentinel >> 16) & 0xFF);
emulator.writeMemory(newSP + 2, (exitSentinel >> 8) & 0xFF);
emulator.writeMemory(newSP + 3, exitSentinel & 0xFF);
emulator.setRegister(15, newSP);  // Update SP

console.log(`When door executes RTS to exit, PC will become 0xDEADBEEF`);
```

**Code:** `amiga-emulation/AmigaDoorSession.ts:138-194`

### 10. Execution Loop Start

```typescript
// Set running flag
this.isRunning = true;

// Set up timeout timer
if (this.config.timeout) {
  this.executionTimer = setTimeout(() => {
    console.log('Execution timeout');
    this.socket.emit('door:error', { message: 'Execution timeout' });
    this.terminate();
  }, this.config.timeout * 1000);
}

// Emit ready status
this.socket.emit('door:status', { status: 'running' });

// Start CPU execution loop
this.runExecutionLoop();
```

**Code:** `amiga-emulation/AmigaDoorSession.ts:196-244`

### 11. CPU Execution Loop

```typescript
private runExecutionLoop(): void {
  if (!this.emulator || !this.isRunning) {
    return;  // Stop if not running
  }

  try {
    // Execute a small number of cycles (allows I/O to be processed)
    const cyclesToExecute = this.iterationCount <= 20 ? 1 : 1000;
    const cyclesExecuted = this.emulator.execute(cyclesToExecute);

    if (cyclesExecuted === 0) {
      // CPU halted or hit invalid instruction
      console.warn('CPU executed 0 cycles - door completed');
      this.socket.emit('door:status', { status: 'completed' });
      this.terminate();
      return;
    }

    // Update virtual time
    this.totalCycles += cyclesExecuted;
    this.virtualTimeMicros = this.totalCycles / 8;  // 8MHz CPU

    // Check for exit sentinel (door executed RTS to exit)
    const pc = this.emulator.getRegister(16);
    if (pc === 0xDEADBEEF) {
      console.log('Door executed RTS to exit sentinel - completed!');
      this.socket.emit('door:status', { status: 'completed' });
      this.socket.emit('ansi-output', '\r\n\r\n[Door completed]\r\n');
      this.terminate();
      return;
    }

    // Schedule next iteration (non-blocking)
    setImmediate(() => this.runExecutionLoop());

  } catch (error) {
    console.error('Execution stopped with error:', error);
    this.socket.emit('door:status', { status: 'completed' });
    this.terminate();
  }
}
```

**Code:** `amiga-emulation/AmigaDoorSession.ts:259-449`

### 12. Socket.io Events

**Events Emitted by Backend:**

```typescript
// Door status updates
socket.emit('door:status', { status: 'initializing' });
socket.emit('door:status', { status: 'running' });
socket.emit('door:status', { status: 'completed' });

// Door output (text, ANSI codes)
socket.emit('ansi-output', 'Welcome to AquaWho!\r\n');

// Door errors
socket.emit('door:error', { message: 'Execution timeout' });
```

**Events Listened by Backend:**

```typescript
// User input from terminal
socket.on('door:input', (data: string) => {
  environment.queueInput(data);
});

// User wants to terminate door
socket.on('door:terminate', () => {
  terminate();
});

// User disconnected
socket.on('disconnect', () => {
  terminate();
});
```

---

## Memory Map After Loading

```
0x000000  ┌─────────────────────────────────┐
          │ Reset Vectors                   │
          │  - 0x000000: Initial SP         │
          │  - 0x000004: ExecBase (0xFF8000)│
          └─────────────────────────────────┘

0x001000  ┌─────────────────────────────────┐
          │ CODE Segment                    │  ← Entry Point (AquaWho)
          │  - First instr: 48 e7 (MOVEM.L) │
          │  - Size: 24,216 bytes           │
          │  - Contains executable code     │
0x006EFF  └─────────────────────────────────┘

0x006F00  ┌─────────────────────────────────┐
          │ DATA Segment                    │
          │  - First bytes: $VER: AquaWho   │
          │  - Size: 1,096 bytes            │
          │  - Contains initialized data    │
0x007347  └─────────────────────────────────┘

0xFDFFC   ┌─────────────────────────────────┐
          │ Exit Sentinel: 0xDEADBEEF       │  ← RTS return address
0xFE000   ├─────────────────────────────────┤
          │ Stack (grows downward)          │
          │  - Initial SP: 0xFE000          │
0xFEFFFF  └─────────────────────────────────┘

0xFF0000  ┌─────────────────────────────────┐
          │ Library Trap Region             │
          │  - Moira intercepts reads here  │
          │  - ExecBase: 0xFF8000           │
          │  - Library function vectors     │
0xFFFFFF  └─────────────────────────────────┘
```

---

## Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Terminal (xterm.js)                                 │   │
│  │   - Displays ANSI output                             │   │
│  │   - Sends user input                                 │   │
│  └──────────────────────────────────────────────────────┘   │
│                           │                                  │
│                           │ Socket.io                        │
│                           │ (ansi-output, door:input)        │
└───────────────────────────┼──────────────────────────────────┘
                            │
┌───────────────────────────┼──────────────────────────────────┐
│                      Backend                                 │
│                           │                                  │
│  ┌────────────────────────▼───────────────────────────────┐ │
│  │  Socket.io Server                                      │ │
│  │   - Receives: door:input, door:terminate               │ │
│  │   - Emits: ansi-output, door:status, door:error        │ │
│  └────────────────────────┬───────────────────────────────┘ │
│                           │                                  │
│  ┌────────────────────────▼───────────────────────────────┐ │
│  │  Command Execution Handler                             │ │
│  │   - Looks up "FRONTEND" in command cache               │ │
│  │   - Finds: TYPE=XIM, LOCATION=Doors/AquaWho/AquaWho   │ │
│  │   - Calls executeDoor()                                │ │
│  └────────────────────────┬───────────────────────────────┘ │
│                           │                                  │
│  ┌────────────────────────▼───────────────────────────────┐ │
│  │  Door Handler                                          │ │
│  │   - executeAmigaDoor() for XIM types                   │ │
│  │   - Creates AmigaDoorSession                           │ │
│  └────────────────────────┬───────────────────────────────┘ │
│                           │                                  │
│  ┌────────────────────────▼───────────────────────────────┐ │
│  │  AmigaDoorSession                                      │ │
│  │   - Manages door lifecycle                             │ │
│  │   - Sets up Socket.io event handlers                   │ │
│  │   - Creates MoiraEmulator                              │ │
│  │   - Creates AmigaDosEnvironment                        │ │
│  └────────────────────────┬───────────────────────────────┘ │
│                           │                                  │
│  ┌────────────────────────▼───────────────────────────────┐ │
│  │  HunkLoader                                            │ │
│  │   - Parses Amiga hunk format                           │ │
│  │   - Loads CODE/DATA/BSS segments                       │ │
│  │   - Applies relocations                                │ │
│  └────────────────────────┬───────────────────────────────┘ │
│                           │                                  │
│  ┌────────────────────────▼───────────────────────────────┐ │
│  │  MoiraEmulator (68000 CPU)                             │ │
│  │   - Executes 68k machine code                          │ │
│  │   - Manages registers (D0-D7, A0-A7, PC, SR)           │ │
│  │   - Emulates instructions (MOVEM, JSR, RTS, etc.)      │ │
│  │   - Memory: 1MB RAM                                    │ │
│  └────────────────────────┬───────────────────────────────┘ │
│                           │                                  │
│  ┌────────────────────────▼───────────────────────────────┐ │
│  │  AmigaDosEnvironment                                   │ │
│  │   - Intercepts library calls (0xFF0000+ region)        │ │
│  │   - Emulates AmigaDOS API:                             │ │
│  │     • Open(), Close(), Read(), Write()                 │ │
│  │     • Output(), Input()                                │ │
│  │     • AllocMem(), FreeMem()                            │ │
│  │   - Routes I/O to Socket.io callback                   │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

---

## Command Types Supported

| Type | Description | Execution Method |
|------|-------------|------------------|
| **XIM** | eXpress Internal Module (Amiga 68k binary) | 68k emulation |
| **AIM** | Amiga Internal Module (Amiga 68k binary) | 68k emulation |
| **SIM** | Standard Internal Module (Amiga 68k binary) | 68k emulation |
| **TIM** | Text Internal Module (Amiga 68k binary) | 68k emulation |
| **IIM** | Interactive Internal Module (Amiga 68k binary) | 68k emulation |
| **web** | TypeScript/JavaScript door | Node.js execution |
| **native** | Native executable | Auto-detect (Hunk = 68k, else Node.js) |
| **script** | Shell script (.sh, .py, etc.) | Shell execution |

---

## Current Status

### ✅ Complete and Working

1. **Command Registration**
   - Commands loaded from `.info` files ✓
   - Command cache populated at startup ✓
   - FRONTEND command registered as XIM type ✓

2. **Command Execution Flow**
   - User input → command lookup ✓
   - Access control checks ✓
   - Door type detection ✓
   - Amiga door dispatch ✓

3. **68k Emulation Stack**
   - MoiraEmulator (CPU) ✓
   - HunkLoader (fixed segment bug) ✓
   - AmigaDoorSession (lifecycle management) ✓
   - AmigaDosEnvironment (API layer) ✓

4. **Socket.io Integration**
   - Event handlers registered ✓
   - Output callback configured ✓
   - Input queue ready ✓

5. **Memory Layout**
   - Segments load at correct addresses ✓
   - Entry point points to CODE ✓
   - Exit sentinel on stack ✓

### 🔄 Ready for Testing

**The complete execution path is in place and ready to test:**

1. User types "FRONTEND" in BBS
2. System executes AquaWho via 68k emulator
3. Door output appears in terminal
4. User can interact with door
5. Door exits cleanly

**Next step:** Actual execution test with user interaction

---

## Testing Checklist

- [x] Commands load from `.info` files
- [x] FRONTEND command registered
- [x] Door type detected as XIM
- [x] HunkLoader parses AquaWho correctly
- [x] Segments load at correct addresses
- [x] Entry point is valid CODE
- [x] Socket.io events configured
- [ ] **Actual door execution** ← Next step
- [ ] Door output appears in terminal
- [ ] User input reaches door
- [ ] AmigaDOS library calls work
- [ ] Door exits cleanly

---

*Document Created: 2025-10-29*
*Status: Architecture Complete - Ready for Execution Testing*
