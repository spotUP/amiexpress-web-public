# DOS.library Implementation Plan

**Date:** 2025-10-30
**Purpose:** Implement minimal DOS.library to allow C-based Amiga doors to execute

---

## Why DOS.library is Needed

Even though AEDoor.library doors (like the example.e) only call:
- Exec.library (OpenLibrary, CloseLibrary)
- AEDoor.library (CreateComm, WriteStr, etc.)

**C-compiled doors like GetAnswer** use standard C startup code which requires:
- DOS.library for stdin/stdout/stderr
- DOS.library for program initialization
- DOS.library for exit handling

---

## Critical DOS Functions (Priority 1)

These are called by C runtime startup code:

| Function | Offset | Purpose |
|----------|--------|---------|
| Open     | -30    | Open files (including stdin/stdout) |
| Close    | -36    | Close files |
| Read     | -42    | Read from files |
| Write    | -48    | Write to files |
| Input    | -54    | Get current input stream |
| Output   | -60    | Get current output stream |
| IoErr    | -132   | Get last error code |

---

## Secondary DOS Functions (Priority 2)

Commonly used by programs:

| Function | Offset | Purpose |
|----------|--------|---------|
| Seek     | -66    | File positioning |
| Delete   | -72    | Delete files |
| Rename   | -78    | Rename files |
| Lock     | -84    | Lock a file/directory |
| UnLock   | -90    | Release a lock |
| CreateDir| -120   | Create directory |
| DateStamp| -192   | Get current date/time |
| Delay    | -198   | Wait specified time |

---

## Implementation Strategy

### Phase 1: Minimal Stubs

Implement just enough to let C programs start:

```typescript
class DOSLibrary {
  // File I/O
  open(): number      // Return fake handles
  close(): number     // No-op
  read(): number      // Return 0 (EOF)
  write(): number     // Return length (success)

  // Standard streams
  input(): number     // Return STDIN handle
  output(): number    // Return STDOUT handle

  // Error handling
  ioErr(): number     // Return last error
}
```

### Phase 2: Functional I/O

Make stdin/stdout actually work:

- Write() to stdout → emit to Socket.IO
- Read() from stdin → block until user input
- Proper error codes

### Phase 3: File System (if needed)

- Virtual filesystem in memory
- Lock/UnLock for file access control
- Directory operations

---

## Standard I/O Handles

DOS.library uses BPTR (BCPL pointers) for file handles:

```
STDIN  = Process->pr_CIS (standard input)
STDOUT = Process->pr_COS (standard output)
STDERR = Process->pr_CES (standard error - usually same as stdout)
```

We'll use fake addresses:
```typescript
STDIN_HANDLE  = 0x00001000
STDOUT_HANDLE = 0x00002000
STDERR_HANDLE = 0x00003000
```

---

## Special Files

| File Name | Behavior |
|-----------|----------|
| `*`       | Standard I/O (stdin for read, stdout for write) |
| `NIL:`    | Null device (discards all writes, returns EOF on reads) |
| `CON:`    | Console device (we treat as stdout) |

---

## Function Signatures (from AROS)

### Open
```c
BPTR Open(CONST_STRPTR name, LONG accessMode)
// D1 = name, D2 = mode
// Returns: file handle or 0
```

### Close
```c
BOOL Close(BPTR file)
// D1 = file
// Returns: success/failure
```

### Read
```c
LONG Read(BPTR file, APTR buffer, LONG length)
// D1 = file, D2 = buffer, D3 = length
// Returns: bytes read, 0=EOF, -1=error
```

### Write
```c
LONG Write(BPTR file, APTR buffer, LONG length)
// D1 = file, D2 = buffer, D3 = length
// Returns: bytes written or -1
```

---

## Testing Plan

1. **Test Open/Close**: Door should be able to open NIL: and *
2. **Test Write**: Door should be able to write to stdout
3. **Test Input/Output**: Door should get correct stream handles
4. **Test Full Door**: GetAnswer should now execute without crashing

---

## Expected Results

With minimal DOS.library implemented:

```
[AmigaDoorSession] Starting door execution...
PC=0x1000  ← Door starts correctly!
[LibraryTraps] Intercepted: OpenLibrary("dos.library", 0)
[ExecLibrary] Opened at 0xff5000, v37.0
[LibraryTraps] Intercepted: Open("*", MODE_OLDFILE)
[DOSLibrary] Returning STDIN handle
[LibraryTraps] Intercepted: OpenLibrary("AEDoor.library", 1)
[AmigaDoorSession] AEDoor.library opened, installing vectors...
[LibraryTraps] Intercepted: CreateComm()
[AEDoorLibrary] CreateComm() → returning diface=0x080000
[LibraryTraps] Intercepted: WriteStr()
[AEDoorLibrary] WriteStr() → emitting to socket
→ Door outputs text! ←
```

---

## References

- AROS DOS.library source: https://github.com/aros-development-team/AROS/tree/master/rom/dos
- AmigaOS LVO table: https://anadoxin.org/blog/amigaos-stdlib-vector-tables.html/
- AmigaOS Developer Docs: http://amigadev.elowar.com/

---

## Next Steps

1. ✅ Create DOSLibrary.ts with all Priority 1 functions
2. ⏳ Add DOS_VECTORS to LibraryTraps.ts
3. ⏳ Wire DOSLibrary to AmigaDoorSession
4. ⏳ Test GetAnswer door
5. ⏳ Add Priority 2 functions if needed
