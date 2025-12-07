# Amiga Door Emulation - Implementation Notes

## Phase 1: Library Call Trap Mechanism - COMPLETE ✅

### Overview
Successfully implemented a complete library call interception system for running Amiga door programs in WebAssembly using the Moira 68000 emulator.

### Critical Discovery: 24-bit Address Bus

The **key breakthrough** was understanding the Motorola 68000's 24-bit address bus architecture:

- The 68000 CPU only has a 24-bit address bus (0x000000 - 0xFFFFFF)
- Upper 8 bits of 32-bit addresses are ignored by the CPU
- When code calls `JSR 0xFFFFFFC4`, the CPU actually jumps to `0x00FFFFC4`

#### Problem
Initial implementation checked for library addresses using:
```cpp
if (addr >= 0xFFFF0000)  // 4,294,901,760
```

But actual addresses seen were:
```cpp
0x00FFFFC4  // 16,777,156 - WAY below threshold!
```

#### Solution
Detect library addresses in the correct 24-bit range:
```cpp
if (addr >= 0x00FF0000 && addr <= 0x00FFFFFF)
```

### Architecture

#### 1. Library Call Detection (`moira-wrapper.cpp`)

When the CPU tries to fetch an instruction from a library address:

1. `read16()` detects address in range `0x00FF0000 - 0x00FFFFFF`
2. Sign-extends the 24-bit address to get proper negative offset:
   - `0x00FFFFC4` → `0xFFFFFFC4` → `-60` (dos.library Output())
   - `0x00FFFFD0` → `0xFFFFFFD0` → `-48` (dos.library Write())
3. Calls JavaScript trap handler with offset
4. Returns RTS instruction (0x4E75) so execution continues

#### 2. Library Implementation (`DosLibrary.ts`, `ExecLibrary.ts`)

JavaScript implementations of AmigaDOS libraries that:
- Receive library call offsets from trap handler
- Read parameters from CPU registers
- Perform I/O operations (file access, console output)
- Set return values in CPU registers

#### 3. Environment Integration (`AmigaDosEnvironment.ts`)

Connects the emulator to library implementations:
- Routes library calls to appropriate library
- Manages output/input callbacks
- Provides high-level API for door execution

### Why RTS Injection Works

Unlike modifying PC in `willExecute()` (which breaks Moira's execution flow), RTS injection allows the JSR instruction to execute normally:

1. JSR pushes return address to stack and jumps to library address
2. CPU tries to fetch instruction from library address
3. `read16()` detects library address and returns RTS opcode
4. RTS pops return address from stack and continues execution
5. **No PC manipulation needed** - execution flow remains intact

### Implementation Details

#### Address Sign Extension

```cpp
i32 offset;
if (addr >= 0x00FF8000) {
    // Upper half: sign-extend from 24-bit to 32-bit
    offset = (i32)(addr | 0xFF000000);
} else {
    offset = (i32)addr;
}
```

This converts 24-bit library addresses to proper negative offsets used by AmigaDOS.

#### MoiraConfig.h Change

Removed JSR from `MOIRA_WILL_EXECUTE` macro:
```cpp
// BEFORE (caused execution to hang):
#define MOIRA_WILL_EXECUTE    I == Instr::STOP || I == Instr::TAS || I == Instr::BKPT || I == Instr::JSR

// AFTER (allows normal JSR execution):
#define MOIRA_WILL_EXECUTE    I == Instr::STOP || I == Instr::TAS || I == Instr::BKPT
```

Calling JavaScript from `willExecute()` interferes with Moira's internal execution state, causing the CPU to hang.

### Test Results

All tests passing:

✅ **test-moira-basic.ts** - Basic CPU emulation (D0 = 0x1234)
✅ **test-hunk-loader.ts** - Binary loading (D0 = 0xABCD)
✅ **test-amigados-trap.ts** - Library calls ("Hello from Amiga!" output)

### Components Implemented

1. **Moira CPU Emulator** (WASM)
   - 68000 instruction execution
   - Memory access hooks
   - Library address detection

2. **exec.library**
   - AllocMem / FreeMem
   - OpenLibrary / CloseLibrary

3. **dos.library**
   - Input / Output (file handles)
   - Read / Write (I/O operations)

4. **Hunk Loader**
   - Parse Amiga executable format
   - Load CODE/DATA/BSS segments
   - Apply relocations
   - Set entry point

## Phase 2: Extended Library Support - COMPLETE ✅

### Additional dos.library Functions Implemented

1. **IoErr()** (offset -132)
   - Returns last DOS error code
   - Supports standard AmigaDOS error codes (205, 202, 103)
   - Error tracking across all file operations

2. **DateStamp()** (offset -192)
   - Returns current date/time in AmigaDOS format
   - Days since Jan 1, 1978
   - Minutes past midnight (0-1439)
   - Ticks past minute (0-2999, 50 ticks/sec)

3. **Delay()** (offset -198)
   - Accepts tick count (50 ticks = 1 second)
   - No-op in synchronous mode (documented limitation)
   - Ready for async implementation

4. **WaitForChar()** (offset -204)
   - Checks if character available in input buffer
   - Supports timeout parameter
   - Returns -1 if data available, 0 if timeout

### Error Handling

All library functions now:
- Set `lastError` on failure
- Return proper error codes (-1 for failures)
- Clear error on success
- Support IoErr() for error checking

## Phase 3: BBS Integration - COMPLETE ✅

### Socket.io Integration

Created complete door session management system:

#### AmigaDoorSession Class

Manages individual door execution sessions with:
- Real-time I/O streaming via Socket.io
- Execution timeout handling (default 5 minutes)
- Memory management (configurable, default 1MB)
- Graceful cleanup on disconnect
- Output callback for live streaming

#### Door Handler Module

Socket.io event handlers:
- `door:launch` - Start a door session
- `door:input` - Send user input to running door
- `door:output` - Receive door output (emitted to client)
- `door:status` - Session status updates
- `door:error` - Error notifications
- `door:terminate` - Force termination

#### Server Integration

- Handlers attached to all Socket.io connections
- Cleanup on SIGTERM/SIGINT
- Active session tracking
- One session per socket connection

### Test Door

Generated test door executable (`doors/test-door`):
- Outputs welcome message
- Prompts for input
- Reads from stdin
- Outputs goodbye message
- Proper STOP instruction
- 304 bytes Hunk file

## Next Steps

#### Phase 4: Production Features
- Add door registry/database
- Implement door time limits and quotas
- Add door usage statistics
- Multi-user locking (prevent simultaneous access)
- Door state persistence between sessions

#### Phase 5: Real Door Testing
- Test with actual compiled Amiga door binaries
- Identify missing library functions
- Implement graphics/intuition stubs
- Handle edge cases and errors

#### Phase 6: Performance Optimization
- Implement async execution with yields
- Add execution rate limiting
- Optimize memory access patterns
- Profile CPU usage

### File Locations

- CPU wrapper: `backend/src/amiga-emulation/cpu/moira-wrapper.cpp`
- TypeScript interface: `backend/src/amiga-emulation/cpu/MoiraEmulator.ts`
- Libraries: `backend/src/amiga-emulation/api/`
- Tests: `backend/src/amiga-emulation/test/`
- Build script: `backend/src/amiga-emulation/cpu/build-wasm.sh`

### Performance Notes

- WASM binary: ~4.2MB
- JavaScript glue: ~46KB
- Build time: ~30 seconds (Emscripten compilation)
- Execution: Native speed (68000 instructions via WASM)

### References

- Moira emulator: https://github.com/dirkwhoffmann/Moira
- AmigaDOS library documentation: Includes/Releases (RKM)
- Hunk format: http://amigadev.elowar.com/read/ADCD_2.1/Includes_and_Autodocs_3._guide/node02D7.html
- 68000 architecture: 24-bit address bus, big-endian, 8 data + 8 address registers

## Socket.io API

### Client → Server Events

```javascript
// Launch a door
socket.emit('door:launch', {
  doorId: 'test-door',      // Door identifier
  doorPath: '/path/to/exe'  // Optional: direct path (for testing)
});

// Send input to door
socket.emit('door:input', 'text\r\n');

// Request status
socket.emit('door:status-request');

// Terminate door
socket.emit('door:terminate');
```

### Server → Client Events

```javascript
// Receive door output
socket.on('door:output', (data) => {
  console.log('Door output:', data);
});

// Status updates
socket.on('door:status', (status) => {
  console.log('Door status:', status.status);
  // status: 'initializing' | 'running' | 'completed' | 'terminated'
});

// Error notifications
socket.on('door:error', (error) => {
  console.error('Door error:', error.message);
});
```

### Example Test Session

```javascript
const io = require('socket.io-client');
const socket = io('http://localhost:3001');

socket.on('connect', () => {
  console.log('Connected');

  // Launch test door
  socket.emit('door:launch', { doorId: 'test-door' });
});

socket.on('door:output', (data) => {
  console.log('OUTPUT:', data);

  // Respond to prompts
  if (data.includes('Press ENTER')) {
    socket.emit('door:input', '\r\n');
  }
});

socket.on('door:status', (status) => {
  console.log('STATUS:', status.status);
});
```

---

**Last Updated:** October 16, 2025
**Status:** Phases 1-3 Complete ✅
**Production Ready:** Door sessions, I/O streaming, library functions
