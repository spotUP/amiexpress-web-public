# AmigaOS dos.library File I/O Implementation Guide
## For 68K Door Emulation in AmiExpress-Web

**Date**: 2025-11-11
**Source**: AmigaOS v40 source code + amitools analysis
**Purpose**: Enable Amiga doors (like WHO) to perform file I/O operations

---

## Executive Summary

To enable 68K Amiga doors to function, we need to implement complete file I/O support in our dos.library emulation. WHO door (and most Amiga CLI programs) require:

1. **File I/O Functions**: Open(), Read(), Write(), Close()
2. **Console I/O Functions**: Input(), Output()
3. **File Handle Management**: BPTR system, FileHandle structures
4. **Path Mapping**: AmigaDOS paths → host filesystem paths
5. **CLI Environment**: Proper command line argument setup

---

## Part 1: Function Specifications (from dos_lib.fd)

### Open(name, accessMode)
**LVO Offset**: -30 (0xFFE2)
**Registers**: D1 = name pointer, D2 = access mode
**Returns**: D0 = BPTR to FileHandle (or 0 if failed)

**Access Modes**:
- `MODE_OLDFILE = 1005` - Open existing file for reading
- `MODE_NEWFILE = 1006` - Create new file for writing
- `MODE_READWRITE = 1004` - Open for read/write

**Behavior** (from amitools DosLibrary.py:557-586):
```python
def Open(self, ctx):
    name = ctx.mem.r_cstr(ctx.cpu.r_reg(REG_D1))
    mode = ctx.cpu.r_reg(REG_D2)

    # Map mode to file open flags
    if mode == 1006: f_mode = "wb+"   # MODE_NEWFILE
    elif mode == 1005: f_mode = "rb+"  # MODE_OLDFILE
    elif mode == 1004: f_mode = "rwb+" # MODE_READWRITE

    # Special devices
    if name == "" or name == "*" or name.upper().startswith("CON:"):
        # Return console/stdout handle
        return STDOUT_BPTR
    elif name.upper().startswith("NIL:"):
        # Open /dev/null equivalent
        return open_null_device()
    else:
        # Map AmigaDOS path to system path
        sys_path = path_mgr.ami_to_sys_path(name)
        if sys_path == None:
            return 0  # File not found

        # Open file and create FileHandle
        fh = FileHandle(open(sys_path, f_mode), name, sys_path)
        register_file_handle(fh)
        return fh.b_addr  # Return BPTR
```

**Key Points**:
- Returns BPTR (Byte Pointer) = memory address / 4
- BPTR is AmigaDOS convention from BCPL heritage
- Empty string "" or "*" means stdout/console
- Must map AmigaDOS paths (e.g., "doors:who/node0.txt") to real paths

---

### Close(file)
**LVO Offset**: -36 (0xFFDC)
**Registers**: D1 = BPTR to FileHandle
**Returns**: D0 = DOSTRUE (-1)

**Behavior** (from amitools DosLibrary.py:588-595):
```python
def Close(self, ctx):
    fh_b_addr = ctx.cpu.r_reg(REG_D1)
    if fh_b_addr != 0:
        fh = file_mgr.get_by_b_addr(fh_b_addr)
        fh.close()  # Close underlying file object
        unregister_file_handle(fh)
    return DOSTRUE
```

**Key Points**:
- Always returns DOSTRUE even if BPTR is NULL
- Must close underlying file and free FileHandle structure
- Don't close stdin/stdout handles (they persist)

---

### Read(file, buffer, length)
**LVO Offset**: -42 (0xFFD6)
**Registers**: D1 = BPTR, D2 = buffer address, D3 = length
**Returns**: D0 = bytes read (0 = EOF, -1 = error)

**Behavior** (from amitools DosLibrary.py:597-607):
```python
def Read(self, ctx):
    fh_b_addr = ctx.cpu.r_reg(REG_D1)
    buf_ptr = ctx.cpu.r_reg(REG_D2)
    size = ctx.cpu.r_reg(REG_D3)

    fh = file_mgr.get_by_b_addr(fh_b_addr)
    data = fh.read(size)  # Read from file
    ctx.mem.w_block(buf_ptr, data)  # Write to emulator memory
    return len(data)
```

**Key Points**:
- Must copy file data INTO emulator memory at buf_ptr
- Returns actual bytes read (may be less than requested)
- Returns 0 at EOF, -1 on error
- Sets IoErr() on errors

---

### Write(file, buffer, length)
**LVO Offset**: -48 (0xFFD0)
**Registers**: D1 = BPTR, D2 = buffer address, D3 = length
**Returns**: D0 = bytes written (-1 = error)

**Behavior** (from amitools DosLibrary.py:609-619):
```python
def Write(self, ctx):
    fh_b_addr = ctx.cpu.r_reg(REG_D1)
    buf_ptr = ctx.cpu.r_reg(REG_D2)
    size = ctx.cpu.r_reg(REG_D3)

    fh = file_mgr.get_by_b_addr(fh_b_addr)
    data = ctx.mem.r_block(buf_ptr, size)  # Read from emulator memory
    fh.write(data)  # Write to file
    return len(data)
```

**Key Points**:
- Must read data FROM emulator memory at buf_ptr
- For stdout/console: capture output and send to terminal
- Returns bytes written (typically same as requested)
- Auto-flush for stdout/console handles

---

### Input()
**LVO Offset**: -54 (0xFFCA)
**Registers**: None
**Returns**: D0 = BPTR to stdin FileHandle

**Behavior**:
```python
def Input(self):
    return STDIN_BPTR  # Pre-allocated stdin handle
```

---

### Output()
**LVO Offset**: -60 (0xFFC4)
**Registers**: None
**Returns**: D0 = BPTR to stdout FileHandle

**Behavior**:
```python
def Output(self):
    return STDOUT_BPTR  # Pre-allocated stdout handle
```

---

## Part 2: FileHandle Structure

### BPTR System

**What is a BPTR?**
- BPTR = "Byte Pointer" from BCPL (the language AmigaOS was originally written in)
- BPTR = memory address / 4
- To convert: `bptr = address >> 2`
- To get address: `address = bptr << 2`

**Why BPTRs?**
- BCPL only had 16-bit addressing
- Dividing by 4 allows 18-bit address space (256KB → 1MB)
- AmigaOS kept this convention for compatibility

### FileHandle Structure (from amitools FileHandle.py)

```python
class FileHandle:
    def __init__(self, file_obj, ami_path, sys_path):
        self.obj = file_obj          # Python file object (or Node.js stream)
        self.name = os.path.basename(sys_path)
        self.ami_path = ami_path     # AmigaDOS path: "doors:who/node0.txt"
        self.sys_path = sys_path     # System path: "/path/to/doors/who/node0.txt"
        self.b_addr = 0              # BPTR (set during allocation)
        self.need_close = True       # False for stdin/stdout
        self.auto_flush = False      # True for stdout

    def alloc_fh(self, alloc, fs_handler_port):
        # Allocate FileHandleStruct in emulator memory
        self.mem = alloc.alloc_struct(FileHandleStruct)
        self.b_addr = self.mem.addr >> 2  # Convert address to BPTR

        # Initialize structure fields
        self.mem.access.w_s("fh_Args", self.b_addr)  # Identifier
        self.mem.access.w_s("fh_Type", fs_handler_port)  # Port address
        self.mem.access.w_s("fh_End", 1)  # Buffer end marker
        return self.b_addr
```

**TypeScript Implementation**:
```typescript
interface FileHandle {
    obj: any;           // Node.js fs stream or emulated file
    name: string;       // "node0.txt"
    amiPath: string;    // "doors:who/node0.txt"
    sysPath: string;    // "~/Code/amiexpress-web/doors/who/node0.txt"
    bAddr: number;      // BPTR (address / 4)
    needClose: boolean; // false for stdin/stdout
    autoFlush: boolean; // true for stdout
    memAddr: number;    // Address of FileHandleStruct in emulator memory
}

// Registry mapping BPTR → FileHandle
const fileHandles: Map<number, FileHandle> = new Map();
```

---

## Part 3: Path Mapping

### AmigaDOS Path Conventions

**Logical Devices**:
- `SYS:` - System volume (boot disk)
- `WORK:` - Work disk
- `RAM:` - RAM disk
- `T:` - Temporary files
- `DEVS:` - Device drivers
- `LIBS:` - Libraries
- `C:` - Commands
- **Custom assigns** (like `doors:`)

**Path Examples**:
- `doors:who/node0.txt` → `/path/to/doors/who/node0.txt`
- `SYS:C/List` → `/System/Commands/List`
- `RAM:tempfile` → `/tmp/tempfile`
- `NIL:` → `/dev/null`
- `CONSOLE:` or `CON:` → stdout
- `*` or empty string → stdout

### Path Mapping Implementation

```typescript
class PathManager {
    private assigns: Map<string, string> = new Map();

    constructor() {
        // Initialize standard assigns
        this.assigns.set("doors:", "~/Code/amiexpress-web/doors/");
        this.assigns.set("SYS:", "~/Code/amiexpress-web/System/");
        this.assigns.set("RAM:", "/tmp/ram/");
        this.assigns.set("NIL:", "/dev/null");
    }

    amiToSysPath(amiPath: string): string | null {
        // Handle special devices
        if (amiPath === "" || amiPath === "*") return "STDOUT";
        if (amiPath.toUpperCase().startsWith("CON:")) return "STDOUT";
        if (amiPath.toUpperCase().startsWith("NIL:")) return "/dev/null";

        // Find matching assign
        for (const [assign, sysPath] of this.assigns) {
            if (amiPath.toLowerCase().startsWith(assign.toLowerCase())) {
                const relativePath = amiPath.substring(assign.length);
                return sysPath + relativePath;
            }
        }

        // No assign found - try current directory
        return null;
    }
}
```

---

## Part 4: CLI Environment for SIM Doors

### What WHO Door Expects

WHO is a SIM (Standard Internal Module) door executed as:
```
WHO 0
```
Where `0` is the node number passed as the first argument.

### CLI Structure Requirements

From express.e:4280-4282 and amitools analysis:

**Command Line Setup**:
```
Offset  0: Command length (BYTE)
Offset  1: Command string (e.g., "WHO 0")
```

**Process Structure** (simplified):
- `pr_CLI`: BPTR to CLI structure
- `pr_CurrentDir`: BPTR to current directory lock
- `pr_CIS`: BPTR to stdin
- `pr_COS`: BPTR to stdout

**CLI Structure Fields** (key ones):
- `cli_CommandName`: BPTR to command name string
- `cli_CommandFile`: BPTR to script file (0 for direct execution)
- `cli_StandardInput`: BPTR to stdin
- `cli_StandardOutput`: BPTR to stdout
- `cli_CurrentDirName`: BPTR to current directory string

### Minimal CLI Setup for WHO

```typescript
function setupCLIEnvironment(nodeNumber: number): void {
    const CLI_ADDR = 0x90000;  // Fixed address for CLI structure

    // Create command line: "WHO 0"
    const commandLine = `WHO ${nodeNumber}`;
    const cmdAddr = CLI_ADDR + 0x100;
    emulator.writeMemory(cmdAddr, commandLine.length);  // Length byte
    for (let i = 0; i < commandLine.length; i++) {
        emulator.writeMemory(cmdAddr + 1 + i, commandLine.charCodeAt(i));
    }

    // Set up process structure
    const PROCESS_ADDR = 0x8000;  // Current task/process
    emulator.writeMemory32(PROCESS_ADDR + PR_CLI_OFFSET, CLI_ADDR >> 2);  // pr_CLI BPTR
    emulator.writeMemory32(PROCESS_ADDR + PR_CIS_OFFSET, STDIN_BPTR);     // pr_CIS
    emulator.writeMemory32(PROCESS_ADDR + PR_COS_OFFSET, STDOUT_BPTR);    // pr_COS

    // Set up CLI structure
    emulator.writeMemory32(CLI_ADDR + CLI_STDIN_OFFSET, STDIN_BPTR);
    emulator.writeMemory32(CLI_ADDR + CLI_STDOUT_OFFSET, STDOUT_BPTR);
    emulator.writeMemory32(CLI_ADDR + CLI_CURRENTDIR_OFFSET, 0);  // Root directory
}
```

---

## Part 5: Implementation Checklist

### Phase 1: File Handle Management (CRITICAL)

- [ ] Create FileHandle registry (Map<BPTR, FileHandle>)
- [ ] Implement BPTR allocation (address / 4)
- [ ] Pre-allocate stdin (BPTR = 1) and stdout (BPTR = 2)
- [ ] Implement FileHandle.alloc_fh() - allocate FileHandleStruct in memory
- [ ] Implement FileHandle.free_fh() - deallocate structure

### Phase 2: Path Mapping

- [ ] Create PathManager class
- [ ] Add standard assigns (doors:, SYS:, RAM:, etc.)
- [ ] Implement amiToSysPath() mapping
- [ ] Handle special devices (NIL:, CON:, *, "")

### Phase 3: File I/O Functions

- [ ] Implement Open() - LVO -30
  - [ ] Parse access mode (1004/1005/1006)
  - [ ] Map AmigaDOS path to system path
  - [ ] Handle special devices (console, NIL)
  - [ ] Create FileHandle and register BPTR
  - [ ] Allocate FileHandleStruct in emulator memory
  - [ ] Return BPTR (or 0 on failure)

- [ ] Implement Close() - LVO -36
  - [ ] Look up FileHandle by BPTR
  - [ ] Close underlying file
  - [ ] Unregister and free FileHandle
  - [ ] Return DOSTRUE

- [ ] Implement Read() - LVO -42
  - [ ] Look up FileHandle by BPTR
  - [ ] Read data from file
  - [ ] Copy data to emulator memory at buffer address
  - [ ] Return bytes read

- [ ] Implement Write() - LVO -48
  - [ ] Look up FileHandle by BPTR
  - [ ] Read data from emulator memory at buffer address
  - [ ] Write data to file
  - [ ] For stdout: capture and send to terminal
  - [ ] Auto-flush if stdout
  - [ ] Return bytes written

- [ ] Implement Input() - LVO -54
  - [ ] Return STDIN_BPTR

- [ ] Implement Output() - LVO -60
  - [ ] Return STDOUT_BPTR

### Phase 4: CLI Environment

- [ ] Create CLI structure at fixed address (0x90000)
- [ ] Set up command line string ("WHO 0")
- [ ] Link process structure to CLI structure
- [ ] Set stdin/stdout BPTRs in process

### Phase 5: Testing

- [ ] Test Open("doors:who/node0.txt", MODE_OLDFILE)
- [ ] Test Read() - verify data copied to emulator memory
- [ ] Test Write() to stdout - verify terminal output
- [ ] Test Close() - verify file handle cleanup
- [ ] Test WHO door execution end-to-end

---

## Part 6: WHO Door Execution Flow (Expected)

1. **Entry**: WHO binary loaded at 0x1000, PC starts execution
2. **FindTask(0)**: Gets current task pointer (already working ✓)
3. **GetCLI()**: Reads pr_CLI from task structure → CLI structure address
4. **Parse Args**: Reads command line from CLI structure → "WHO 0" → nodeNum = 0
5. **Build Path**: `path = "doors/who/node" + nodeNum + ".txt"` → "doors/who/node0.txt"
6. **Open File**: `fh = Open("doors/who/node0.txt", MODE_OLDFILE)` → returns BPTR
7. **Read Data**: `Read(fh, buffer, size)` → reads node info into memory
8. **Format Output**: Builds output string with user info
9. **Write Output**: `Write(Output(), buffer, length)` → outputs to terminal
10. **Close File**: `Close(fh)` → cleanup
11. **Exit**: Returns to caller

**Current Status**: Steps 1-2 work ✓. Steps 3-11 fail because file I/O not implemented.

---

## Part 7: Comparison with Current Implementation

### What We Have (from DosLibrary.ts grep)

```typescript
Open(): number {
    const namePtr = this.emulator.getRegister(CPURegister.D1);
    const mode = this.emulator.getRegister(CPURegister.D2);
    const filename = this.readString(namePtr);

    // Handles console devices
    if (filename === '' || filename === '*' || filename.toUpperCase().startsWith('CON:')) {
        // Returns console handle
    }

    // MISSING: File handle registry
    // MISSING: Path mapping
    // MISSING: Actual file opening
}
```

### What We Need to Add

1. **File Handle Registry** - Map<BPTR, FileHandle>
2. **Path Mapper** - PathManager class
3. **Real File I/O** - fs.openSync(), fs.readSync(), fs.writeSync()
4. **BPTR Management** - Allocate/free BPTRs correctly
5. **Memory Structures** - FileHandleStruct allocation
6. **CLI Setup** - Command line parsing

---

## Conclusion

The key to getting WHO door working is implementing complete file I/O support:

1. **File Handle Management**: BPTR system, registry, allocation
2. **Path Mapping**: AmigaDOS paths → real filesystem
3. **File I/O**: Actually read/write files
4. **Console I/O**: Capture stdout and send to terminal
5. **CLI Environment**: Command line argument passing

All the information needed is now documented above. The implementation should follow the amitools patterns closely, adapted to TypeScript/Node.js.

**Estimated Effort**: 1-2 days for a complete implementation
**Alternative**: Rewrite WHO as TypeScript door - 1-2 hours

---

**Sources**:
- AmigaOS v40 kickstart/dos/ source code
- dos_lib.fd function descriptors
- amitools vamos DosLibrary.py implementation
- amitools FileManager.py and FileHandle.py
- express.e lines 4280-4282 (SIM door execution)
- NDK 3.2R4 Autodocs (via MCP)
