# Amiga Door Execution Research & Implementation Plan

**Date:** October 16, 2025
**Purpose:** Research findings for implementing native Amiga door execution in AmiExpress-Web BBS

---

## 1. Executive Summary

This document provides comprehensive research on implementing native Amiga door execution in a web-based BBS environment. The approach combines:
- **Moira 68000 CPU emulator** for executing Motorola 68k instructions in WebAssembly
- **AmigaDOS API emulation** based on Vamos reference implementation
- **API-level emulation** rather than full hardware emulation for performance and simplicity

**Key Finding:** A hybrid approach using Moira for CPU emulation with custom AmigaDOS API implementation is technically feasible for web-based Amiga door execution.

---

## 2. Moira 68000 Emulator Analysis

### 2.1 Overview
- **Project:** Moira by Dirk W. Hoffmann
- **License:** MIT (permissive for commercial use)
- **Language:** C++20
- **Version:** 3.0
- **URL:** https://github.com/dirkwhoffmann/Moira

### 2.2 Processor Support
Moira emulates multiple Motorola processors:
- **68000** - 24-bit addressing, original Amiga 500/1000/2000
- **68010** - Virtual memory support
- **68EC020** - 68020 without MMU
- **68020** - Full 32-bit addressing

**Recommendation:** Start with 68000 for maximum compatibility with classic Amiga doors.

### 2.3 Performance Characteristics
- **Cycle-accurate emulation** - Essential for timing-sensitive operations
- **DMA cycle accuracy** - Important for hardware interactions
- **Superior performance** - Faster than Musashi emulator
- **Template-based C++** - Extensive use of templates for speed optimization

### 2.4 WebAssembly Compatibility
**Critical Feature:** Moira's codebase is explicitly compatible with WebAssembly

**Benefits:**
- First-class support for browser-based applications
- Can be compiled to WASM using Emscripten
- Proven in production (used by vAmiga macOS emulator)
- Standard C++20 code compiles with GCC/Clang/MSVC

**Integration Path:**
```
C++ Moira → Emscripten → WebAssembly → Browser/Node.js
```

### 2.5 API Architecture
**Integration Points:**
- Memory access callbacks
- I/O port handlers
- Interrupt handling
- Cycle counting/timing

**Typical Usage Pattern:**
```cpp
// Pseudocode - Moira integration
moira.setMemory(memoryArray);
moira.setReadHandler(readCallback);
moira.setWriteHandler(writeCallback);
moira.execute(cycles);
```

---

## 3. AmigaDOS API Requirements

### 3.1 Core System Architecture

**Two Primary Libraries:**

#### 3.1.1 exec.library (Kernel)
- **Fixed Address:** Address 4 in memory (only fixed address in Amiga)
- **Purpose:** Master library, memory management, task/process management
- **Key Functions:**
  - `OpenLibrary()` - Opens other libraries
  - `AllocMem()` / `FreeMem()` - Memory allocation
  - `CreateTask()` - Task creation
  - `FindTask()` - Task lookup
  - `Wait()` / `Signal()` - Synchronization

#### 3.1.2 dos.library (DOS Operations)
- **Purpose:** File system, I/O, process management, command execution
- **Architecture:** Built on top of Exec, extends tasks to "Processes"
- **Key Concepts:**
  - **Processes** = Tasks + File/I/O handling
  - **Locks** = Directory references
  - **File Handles** = Open file references
  - **Assigns** = Path aliases (like symbolic links)

### 3.2 Door Program Requirements

Based on Amiga BBS door research, doors require:

#### 3.2.1 Standard I/O
- **Input:** Read from stdin or redirected file handle
- **Output:** Write to stdout/stderr
- **Device:** CON: device emulation for console I/O

#### 3.2.2 File System Access
- **Read/Write files:** For data persistence (scores, user data)
- **Directory operations:** List files, create directories
- **Path resolution:** Support for assigns and multi-assigns
- **Case-insensitive paths:** AmigaDOS convention

#### 3.2.3 Door Types Supported
1. **STDIO Doors** - Standard input/output (easiest to implement)
2. **AmigaDOS Doors** - Direct DOS library calls
3. **ARexx Doors** - Scripting language (future enhancement)

#### 3.2.4 Essential DOS Functions
```c
// File Operations
BPTR Open(STRPTR name, LONG accessMode);
LONG Close(BPTR file);
LONG Read(BPTR file, APTR buffer, LONG length);
LONG Write(BPTR file, CONST_APTR buffer, LONG length);
LONG Seek(BPTR file, LONG position, LONG mode);

// Process/Task
struct Process *FindTask(STRPTR name);
LONG Execute(STRPTR string, BPTR input, BPTR output);
LONG SystemTagList(STRPTR command, struct TagItem *tags);

// Locking (Directory References)
BPTR Lock(STRPTR name, LONG accessMode);
BOOL UnLock(BPTR lock);
BPTR CurrentDir(BPTR lock);

// Environment
BOOL SetVar(STRPTR name, CONST_STRPTR buffer, LONG size, LONG flags);
LONG GetVar(STRPTR name, STRPTR buffer, LONG size, LONG flags);

// Device I/O
struct MsgPort *CreateMsgPort(VOID);
struct IORequest *CreateIORequest(struct MsgPort *port, ULONG size);
LONG DoIO(struct IOStdReq *ioRequest);
```

### 3.3 Library Calling Convention

**Amiga Library Call Mechanism:**
- All library functions accessed via **negative offsets** from library base
- Each function entry is **6 bytes** on 68000
- **Jump table** in library structure
- Example: `OpenLibrary` is at offset **-408** from exec.library base

**Calling Sequence:**
```assembly
; A6 contains library base address
; Parameters in registers (A0-A1, D0-D7)
JSR -408(A6)  ; Call OpenLibrary
; Result in D0 or A0
```

---

## 4. Vamos Implementation Analysis

### 4.1 Architecture Overview

**Project:** Vamos (Virtual AmigaOS) from amitools
**URL:** https://github.com/cnvogelg/amitools
**Purpose:** API-level emulator for running Amiga CLI programs on modern systems

**Key Insight:** Vamos does **NOT** emulate hardware; it emulates the **software interface** (APIs)

### 4.2 Core Components

#### 4.2.1 CPU Emulation
- Uses **Musashi** m68k CPU emulator
- Executes native Motorola 68000 code
- **Alternative:** Could use Moira for WebAssembly compatibility

#### 4.2.2 Library Trap System
**How it works:**
1. Program calls library function (JSR to negative offset)
2. CPU emulator traps the jump
3. Vamos intercepts and routes to **Python implementation**
4. Python function emulates AmigaDOS behavior
5. Results returned to emulated program

**Example:**
```python
# Vamos Python implementation
class DosLibrary:
    def Open(self, name, mode):
        # Convert Amiga path to host path
        host_path = self.path_mgr.ami_to_sys_path(name)
        # Open host file
        fh = open(host_path, mode)
        # Return Amiga file handle
        return self.fh_mgr.create_handle(fh)
```

#### 4.2.3 File System Mapping
**Virtual Volumes:**
- Maps host directories to Amiga volumes
- Default `root:` volume = host filesystem root
- Custom volumes can be defined

**Path Resolution:**
- Case-insensitive matching (AmigaDOS convention)
- Supports assigns (path aliases)
- Multi-assigns (search multiple paths)
- Auto-assign feature for undefined names

**Example Mapping:**
```
Host: /home/user/bbs/doors/tradewars
Amiga: DH0:Doors/TradeWars
```

#### 4.2.4 Memory Management
- **Stack:** Configurable (default 4 KiB)
- **Unified memory space:** No Chip/Fast distinction
- **Heap:** Managed by emulated exec.library functions

#### 4.2.5 Process Management
- Emulates AmigaDOS **Processes** (tasks + I/O)
- Maps stdin/stdout to host console
- File handle management
- Environment variable support

### 4.3 Vamos Limitations (For Our Use Case)

**Not Suitable As-Is Because:**
1. **Python-based** - Not web-compatible
2. **Musashi CPU** - No WebAssembly support
3. **Desktop-focused** - Not designed for web browsers
4. **Single-threaded** - One program at a time

**What We Can Learn:**
- ✅ Library trap mechanism
- ✅ File system mapping approach
- ✅ Path resolution logic
- ✅ API implementation patterns

---

## 5. Core Components Needed for Implementation

### 5.1 Component Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Web Browser                         │
│  ┌───────────────────────────────────────────────┐  │
│  │         AmiExpress-Web Frontend               │  │
│  │    (React, Socket.io, Terminal Display)       │  │
│  └─────────────────────┬─────────────────────────┘  │
│                        │ Socket.io                   │
└────────────────────────┼─────────────────────────────┘
                         │
┌────────────────────────┼─────────────────────────────┐
│              Backend Server (Node.js)                │
│  ┌─────────────────────▼─────────────────────────┐  │
│  │        AmigaDoor Execution Manager            │  │
│  │  - Session management                         │  │
│  │  - I/O redirection                            │  │
│  │  - File system mapping                        │  │
│  └─────────────────────┬─────────────────────────┘  │
│                        │                             │
│  ┌─────────────────────▼─────────────────────────┐  │
│  │     Moira WASM CPU Emulator (C++ → WASM)     │  │
│  │  - 68000 instruction execution                │  │
│  │  - Memory management                          │  │
│  │  - Trap handling                              │  │
│  └─────────────────────┬─────────────────────────┘  │
│                        │                             │
│  ┌─────────────────────▼─────────────────────────┐  │
│  │    AmigaDOS API Emulation Layer (TypeScript) │  │
│  │  - exec.library implementation                │  │
│  │  - dos.library implementation                 │  │
│  │  - Library trap handlers                      │  │
│  │  - File system bridge                         │  │
│  └───────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

### 5.2 Detailed Component Breakdown

#### Component 1: Moira WASM Build
**Technology:** C++20 → Emscripten → WebAssembly
**Purpose:** Execute 68000 machine code in browser/Node.js

**Required Work:**
- [ ] Compile Moira to WebAssembly using Emscripten
- [ ] Create JavaScript/TypeScript bindings
- [ ] Implement memory array interface
- [ ] Add trap handlers for library calls
- [ ] Performance profiling

**Integration:**
```typescript
// TypeScript interface to Moira WASM
class MoiraEmulator {
  constructor();
  loadProgram(buffer: Uint8Array, address: number): void;
  setMemory(memory: Uint8Array): void;
  setTrapHandler(callback: TrapHandler): void;
  execute(cycles: number): number;
  reset(): void;
}
```

#### Component 2: AmigaDOS API Emulation Layer
**Technology:** TypeScript/Node.js
**Purpose:** Implement exec.library and dos.library functions

**Sub-components:**

**2.1 Library Manager**
- Track loaded libraries
- Manage library base addresses
- Route function calls to implementations

**2.2 exec.library Implementation**
- Memory allocation (AllocMem/FreeMem)
- Library opening (OpenLibrary)
- Task management (FindTask, CreateTask)
- Basic synchronization

**2.3 dos.library Implementation**
- File operations (Open/Close/Read/Write/Seek)
- Directory operations (Lock/UnLock/Examine)
- Process management (Execute, SystemTagList)
- Path resolution and assigns
- Environment variables (SetVar/GetVar)

**2.4 Trap Handler**
- Intercept library calls (JSR to negative offsets)
- Extract parameters from CPU registers
- Call TypeScript implementation
- Return results to emulated code

**Example Implementation:**
```typescript
class DosLibrary {
  // dos.library function table
  private functionTable = {
    [-30]: this.Open.bind(this),      // Open
    [-36]: this.Close.bind(this),     // Close
    [-42]: this.Read.bind(this),      // Read
    [-48]: this.Write.bind(this),     // Write
    // ... more functions
  };

  public Open(namePtr: number, mode: number): number {
    // Read string from emulated memory
    const fileName = this.readString(namePtr);

    // Convert Amiga path to host path
    const hostPath = this.pathManager.amiToHost(fileName);

    // Open file on host
    const handle = fs.openSync(hostPath, this.modeToFlags(mode));

    // Store handle and return Amiga file handle
    return this.handleManager.create(handle);
  }
}
```

#### Component 3: File System Bridge
**Purpose:** Map Amiga paths to server file system

**Features:**
- Virtual volumes (DH0:, DH1:, etc.)
- Assign management (like symbolic links)
- Case-insensitive path matching
- Security: Jail to specific directories
- Multi-assign support (search paths)

**Implementation:**
```typescript
class FileSystemBridge {
  private volumes: Map<string, string>;    // DH0: → /path/to/doors
  private assigns: Map<string, string[]>;  // C: → [DH0:C, DH1:C]

  public amiToHost(amiPath: string): string {
    // Parse: "DH0:Doors/TradeWars/tw2002"
    const [volume, ...pathParts] = amiPath.split(/[:\/]/);

    // Resolve volume
    const hostBase = this.volumes.get(volume);

    // Build host path
    return path.join(hostBase, ...pathParts);
  }

  public resolveAssign(name: string): string[] {
    // Return all paths for assign
    return this.assigns.get(name) || [];
  }
}
```

#### Component 4: Door Execution Manager
**Purpose:** Manage door sessions, I/O, and lifecycle

**Responsibilities:**
- Create isolated emulator instance per door session
- Set up I/O redirection (stdin/stdout → Socket.io)
- Load door binary into emulated memory
- Configure virtual file system
- Handle door termination
- Clean up resources

**Implementation:**
```typescript
class DoorExecutionManager {
  private sessions: Map<string, DoorSession>;

  public async executeDoor(
    socketId: string,
    doorPath: string
  ): Promise<DoorSession> {
    // Create emulator instance
    const emulator = new MoiraEmulator();

    // Create AmigaDOS environment
    const dosEnv = new AmigaDosEnvironment(emulator);

    // Set up I/O redirection
    dosEnv.setStdout((data) => {
      io.to(socketId).emit('door-output', data);
    });

    // Load door binary
    const binary = await this.loadHunkFile(doorPath);
    emulator.loadProgram(binary.code, binary.entryPoint);

    // Start execution
    const session = new DoorSession(emulator, dosEnv);
    this.sessions.set(socketId, session);

    session.run();
    return session;
  }
}
```

#### Component 5: Hunk File Loader
**Purpose:** Parse and load Amiga executable format

**Hunk Format:**
- Amiga's loadable binary format
- Contains code, data, BSS segments
- Relocation information
- Symbol tables

**Reference:** Use amitools hunk parser as reference

**Implementation:**
```typescript
interface HunkFile {
  segments: HunkSegment[];
  entryPoint: number;
  relocations: Relocation[];
}

class HunkLoader {
  public parse(buffer: Buffer): HunkFile {
    // Parse hunk format
    // Handle HUNK_CODE, HUNK_DATA, HUNK_BSS
    // Process relocations
    // Return loaded segments
  }

  public load(emulator: MoiraEmulator, hunk: HunkFile): void {
    // Allocate memory for segments
    // Apply relocations
    // Set entry point
  }
}
```

### 5.3 Supporting Infrastructure

#### Memory Management
- Allocate unified memory space (e.g., 512KB - 16MB)
- Track allocations for FreeMem
- Implement memory pools

#### I/O Redirection
- Capture stdout → send to web client via Socket.io
- Buffer stdin from web client → provide to door
- Handle ANSI escape codes for colors

#### Security Sandbox
- Restrict file access to designated door directories
- Prevent access to system files
- CPU cycle limits to prevent runaway programs
- Memory limits per door

---

## 6. Implementation Approach

### 6.1 Phase 1: Proof of Concept (2-3 weeks)

**Goal:** Execute simple "Hello World" Amiga program

**Tasks:**
1. **Compile Moira to WebAssembly**
   - Set up Emscripten toolchain
   - Build Moira as WASM module
   - Create TypeScript bindings
   - Test basic execution

2. **Implement Minimal exec.library**
   - Library base at address 4
   - Basic memory allocation
   - OpenLibrary stub

3. **Implement Minimal dos.library**
   - Simple Write() for stdout
   - Basic process initialization

4. **Create Test Program**
   - Write simple 68000 assembly "Hello World"
   - Assemble to binary
   - Load and execute

**Success Criteria:**
- ✅ Moira WASM runs in Node.js
- ✅ Can load binary into memory
- ✅ Execute JSR instruction
- ✅ Trap library call
- ✅ Output "Hello World" to console

### 6.2 Phase 2: Core AmigaDOS Functions (3-4 weeks)

**Goal:** Run simple STDIO door programs

**Tasks:**
1. **Expand dos.library**
   - File I/O: Open, Close, Read, Write, Seek
   - Directory: Lock, UnLock, CurrentDir
   - Process: Execute basics

2. **File System Bridge**
   - Volume mapping
   - Path resolution
   - Case-insensitive matching
   - Basic assign support

3. **Hunk Loader**
   - Parse Amiga executable format
   - Load code/data segments
   - Apply relocations

4. **I/O Redirection**
   - Connect stdin/stdout to Socket.io
   - Buffer management
   - ANSI code handling

**Success Criteria:**
- ✅ Load real Amiga door binary
- ✅ Door can read/write files
- ✅ I/O appears in web terminal
- ✅ Door exits cleanly

### 6.3 Phase 3: Advanced Features (4-6 weeks)

**Goal:** Run complex multi-file doors

**Tasks:**
1. **Advanced exec.library**
   - Task management
   - Signals and waiting
   - Library dependencies

2. **Extended dos.library**
   - Examine (directory listing)
   - SetVar/GetVar (environment)
   - SystemTagList (command execution)
   - Multi-assign support

3. **Door Session Management**
   - Multiple concurrent doors
   - Resource isolation
   - Timeout handling
   - Clean termination

4. **Security & Performance**
   - Sandboxing
   - CPU cycle limits
   - Memory limits
   - Performance profiling

**Success Criteria:**
- ✅ Run popular Amiga doors (TradeWars, LORD, etc.)
- ✅ Multiple users in different doors
- ✅ Proper resource cleanup
- ✅ No security vulnerabilities

### 6.4 Phase 4: Integration & Polish (2-3 weeks)

**Goal:** Production-ready feature

**Tasks:**
1. **BBS Integration**
   - Add DOOR menu command
   - Door configuration system
   - Access control
   - Usage tracking

2. **User Experience**
   - Loading indicators
   - Error messages
   - Door timeout warnings
   - Graceful disconnects

3. **Administration**
   - Door installation wizard
   - Configuration editor
   - Usage statistics
   - Log viewing

4. **Documentation**
   - Door developer guide
   - SysOp configuration guide
   - Troubleshooting guide
   - API reference

**Success Criteria:**
- ✅ Easy door installation
- ✅ Smooth user experience
- ✅ Reliable execution
- ✅ Complete documentation

---

## 7. Technical Challenges & Solutions

### Challenge 1: WebAssembly Performance
**Issue:** WASM overhead, especially for I/O operations

**Solutions:**
- Batch I/O operations
- Use SharedArrayBuffer where possible
- Profile hotspots and optimize
- Consider WebWorkers for parallelism

### Challenge 2: File System Access
**Issue:** Web browsers don't have direct file system access

**Solutions:**
- Server-side file operations (we're already doing this)
- Virtual file system in backend
- Optional: IndexedDB for client-side caching

### Challenge 3: Timing Accuracy
**Issue:** JavaScript timing is not precise enough for cycle-accurate emulation

**Solutions:**
- Relaxed timing for most operations
- Critical sections only (where doors check timing)
- Use Performance API for better accuracy

### Challenge 4: Binary Compatibility
**Issue:** Some doors use direct hardware access

**Solutions:**
- Trap hardware access attempts
- Provide sensible defaults
- Document compatibility limitations
- Focus on DOS-compliant doors

### Challenge 5: Debugging
**Issue:** Debugging 68000 code in WASM is difficult

**Solutions:**
- Implement logging at trap level
- Memory dump utilities
- Step-through debugger (future)
- Extensive testing with known doors

---

## 8. Alternative Approaches Considered

### 8.1 Full System Emulation (e.g., vAmiga in Browser)
**Pros:**
- Maximum compatibility
- Exact hardware behavior

**Cons:**
- Massive overhead (need Kickstart ROM, full Amiga OS)
- Slow performance for simple doors
- Complex integration with BBS
- ROM licensing issues

**Verdict:** ❌ Overkill for CLI doors

### 8.2 ARexx-Only Doors
**Pros:**
- Easy to implement (script interpreter)
- No CPU emulation needed
- Fast execution

**Cons:**
- Limited door availability
- Can't run native binaries
- Missing many popular doors

**Verdict:** ✅ Good complementary feature, but not sufficient alone

### 8.3 Port Doors to Modern Code
**Pros:**
- Native performance
- No emulation overhead
- Easy debugging

**Cons:**
- Requires source code (often unavailable)
- Massive porting effort per door
- Destroys authenticity

**Verdict:** ❌ Not scalable

### 8.4 Hybrid: Moira + API Emulation (RECOMMENDED)
**Pros:**
- Runs native Amiga binaries
- Good performance (API-level, not hardware-level)
- Reasonable complexity
- Authentic experience
- Proven approach (Vamos)

**Cons:**
- Requires AmigaDOS API implementation
- Some doors may not work (hardware-dependent)

**Verdict:** ✅ Best balance of authenticity, performance, and feasibility

---

## 9. Dependencies & Tools

### 9.1 Required Libraries

**Moira:**
- Source: https://github.com/dirkwhoffmann/Moira
- License: MIT
- Build: Emscripten

**Emscripten:**
- Compiler toolchain for WASM
- Version: Latest stable
- Documentation: https://emscripten.org

**Node.js Packages:**
- `@types/emscripten` - TypeScript types for WASM
- `buffer` - Binary data handling
- (existing Socket.io, Express, etc.)

### 9.2 Development Tools

**Amiga Cross-Development:**
- **vbcc** - Amiga C compiler (for testing)
- **vasm** - Amiga assembler
- **vlink** - Amiga linker

**Analysis Tools:**
- **amitools** - Reference for Hunk format, Vamos study
- **IDA Pro** or **Ghidra** - Disassembler for reverse engineering doors

**Testing:**
- Collection of Amiga door binaries
- Reference outputs from real Amiga
- Automated test suite

---

## 10. Success Metrics

### Functionality Metrics
- [ ] Execute simple "Hello World" program
- [ ] Load and run real Amiga door binary
- [ ] File I/O operations work correctly
- [ ] Path resolution and assigns work
- [ ] Multiple concurrent door sessions
- [ ] Run at least 3 popular doors without errors

### Performance Metrics
- [ ] Door startup < 2 seconds
- [ ] Responsive I/O (< 100ms latency)
- [ ] CPU usage < 50% per door session
- [ ] Memory usage < 100MB per door session
- [ ] Can handle 10+ concurrent doors

### Quality Metrics
- [ ] Zero security vulnerabilities
- [ ] Graceful error handling
- [ ] Complete error logging
- [ ] Comprehensive documentation
- [ ] Unit test coverage > 70%

---

## 11. Risk Assessment

### High Risk
- **Moira WASM compilation issues** → Mitigation: Start early, have fallback to Musashi
- **Performance problems** → Mitigation: Profile early, optimize hotspots
- **Door compatibility issues** → Mitigation: Focus on STDIO doors first

### Medium Risk
- **Binary format parsing errors** → Mitigation: Use amitools as reference, extensive testing
- **Memory management bugs** → Mitigation: Strict validation, memory guards
- **Timing issues** → Mitigation: Relaxed timing, document requirements

### Low Risk
- **I/O redirection complexity** → Mitigation: Well-understood problem
- **File system mapping** → Mitigation: Proven approach from Vamos
- **Integration with existing BBS** → Mitigation: Clean interfaces

---

## 12. Recommendations

### Immediate Next Steps (This Sprint)
1. ✅ **Complete this research document** (DONE)
2. **Set up Emscripten development environment**
3. **Compile Moira to WebAssembly (proof of concept)**
4. **Create minimal TypeScript bindings**
5. **Test basic 68000 execution**

### Short Term (Next 2 Sprints)
1. **Implement minimal exec.library and dos.library**
2. **Create "Hello World" test program**
3. **Achieve end-to-end execution**
4. **Begin Hunk file loader implementation**

### Long Term (Next Quarter)
1. **Expand AmigaDOS API coverage**
2. **Build door session manager**
3. **Test with real Amiga doors**
4. **Performance optimization**
5. **Production deployment**

---

## 13. Conclusion

Implementing native Amiga door execution in a web-based BBS is **technically feasible** using a hybrid approach:

**✅ Moira 68000 CPU Emulator** (WebAssembly-compatible, MIT licensed, high performance)
**✅ AmigaDOS API Emulation** (Based on Vamos approach, TypeScript implementation)
**✅ File System Bridge** (Map Amiga paths to server filesystem)
**✅ I/O Redirection** (Socket.io integration for terminal I/O)

This approach provides:
- ✅ **Authenticity** - Runs native Amiga binaries
- ✅ **Performance** - API-level emulation (not hardware-level)
- ✅ **Compatibility** - Focus on STDIO/DOS doors (majority of popular doors)
- ✅ **Feasibility** - Proven approach (Vamos) with modern tools (Moira + WASM)

**Estimated Development Time:** 12-16 weeks for production-ready implementation

**Recommended Action:** Proceed with Phase 1 (Proof of Concept) to validate approach

---

## 14. References

1. **Moira 68000 Emulator**
   https://dirkwhoffmann.github.io/Moira/
   https://github.com/dirkwhoffmann/Moira

2. **Vamos & amitools**
   https://github.com/cnvogelg/amitools
   https://github.com/cnvogelg/amitools/blob/master/docs/vamos.md

3. **AmigaDOS Documentation**
   https://en.wikipedia.org/wiki/AmigaDOS
   https://wiki.amigaos.net/wiki/DOS_Library
   https://wiki.amigaos.net/wiki/Exec_Libraries

4. **AmigaOS Developer Documentation**
   http://amigadev.elowar.com/read/ADCD_2.1/

5. **Amiga BBS Door Programming**
   https://www.amibay.com/threads/bbs-door-programming.26947/

6. **Emscripten Documentation**
   https://emscripten.org/docs/

---

**Document Status:** ✅ Complete - Ready for implementation planning
**Next Review:** After Phase 1 completion
**Author:** Claude Code Assistant
**Last Updated:** October 16, 2025
