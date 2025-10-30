# dos.library Function Reference

**Complete implementation reference for Amiga dos.library functions**

## Quick Reference Table

| Offset | Function | Status | Parameters | Return Value | Use Case |
|--------|----------|--------|------------|--------------|----------|
| **File Operations** |
| -30 | Open | ✅ Working | D1=name, D2=mode | D0=handle | Open console/NIL |
| -36 | Close | ✅ Working | D1=handle | - | Close file handle |
| -42 | Read | ✅ Working | D1=handle, D2=buffer, D3=length | D0=bytes read | Read from stdin |
| -48 | Write | ✅ Working | D1=handle, D2=buffer, D3=length | D0=bytes written | Write to stdout |
| -66 | Seek | ⚠️ Stub | D1=handle, D2=position, D3=mode | D0=old position | Change file position |
| -72 | DeleteFile | ⚠️ Stub | D1=filename | D0=success | Delete a file |
| -78 | Rename | ⚠️ Stub | D1=oldname, D2=newname | D0=success | Rename a file |
| **Console I/O** |
| -54 | Input | ✅ Working | - | D0=stdin handle | Get stdin (handle 1) |
| -60 | Output | ✅ Working | - | D0=stdout handle | Get stdout (handle 2) |
| -204 | WaitForChar | ✅ Working | D1=handle, D2=timeout | D0=-1 if available | Check for input |
| **File/Directory Locking** |
| -84 | Lock | ⚠️ Stub | D1=name, D2=mode | D0=lock | Get file/dir lock |
| -90 | UnLock | ⚠️ Stub | D1=lock | - | Release lock |
| -96 | DupLock | ⚠️ Stub | D1=lock | D0=new lock | Duplicate lock |
| **File Information** |
| -102 | Examine | ⚠️ Stub | D1=lock, D2=FIB | D0=success | Get file info |
| -108 | ExNext | ⚠️ Stub | D1=lock, D2=FIB | D0=success | Next dir entry |
| -114 | Info | ⚠️ Stub | D1=lock, D2=InfoData | D0=success | Get volume info |
| **Directory Operations** |
| -120 | CreateDir | ⚠️ Stub | D1=name | D0=lock | Create directory |
| -126 | CurrentDir | ⚠️ Stub | D1=lock | D0=old lock | Change directory |
| **Error Handling** |
| -132 | IoErr | ✅ Working | - | D0=error code | Get last error |
| **Process Management** |
| -138 | CreateProc | ⚠️ Stub | D1=name, D2=pri, D3=seg, D4=stack | D0=MsgPort | Create process |
| -144 | Exit | ⚠️ Stub | D1=returncode | - | Exit program |
| **Segment Loading** |
| -150 | LoadSeg | ⚠️ Stub | D1=name | D0=seglist | Load executable |
| -156 | UnLoadSeg | ⚠️ Stub | D1=seglist | D0=success | Unload segments |
| **Device/Handler** |
| -162 | DeviceProc | ⚠️ Stub | D1=name | D0=MsgPort | Get device handler |
| **File Attributes** |
| -168 | SetComment | ⚠️ Stub | D1=name, D2=comment | D0=success | Set file comment |
| -174 | SetProtection | ⚠️ Stub | D1=name, D2=protect | D0=success | Set protection bits |
| **Date/Time** |
| -192 | DateStamp | ✅ Working | D1=DateStamp ptr | D0=DateStamp ptr | Get current date/time |
| -198 | Delay | ✅ Working | D1=ticks | - | Delay execution |
| **Special** |
| **-28** | **INVALID** | ⚠️ **Special** | - | D0=-1 | **Not a real function** |

## Function Details

### File Operations

#### Open (-30) ✅ Working
```c
handle = Open(filename, mode)
D0           D1        D2
```

**Modes:**
- MODE_OLDFILE (1005) - Open existing file
- MODE_NEWFILE (1006) - Create new file

**Currently Supported:**
- `"*"` - Console (returns handle 2)
- `"CONSOLE:"` - Console (returns handle 2)
- `"CON:"` - Console (returns handle 2)
- `"NIL:"` - Null device (returns handle 99)

**Not Supported:** Real file system

#### Close (-36) ✅ Working
```c
Close(handle)
      D1
```

Closes file handle (except standard handles 1,2,3).

#### Read (-42) ✅ Working
```c
actual = Read(handle, buffer, length)
D0            D1      D2      D3
```

Reads from stdin (handle 1) only. Returns bytes read.

#### Write (-48) ✅ Working
```c
actual = Write(handle, buffer, length)
D0             D1      D2      D3
```

Writes to stdout/stderr (handles 2/3). Sends to output callback.

#### Seek (-66) ⚠️ Stub
```c
oldpos = Seek(handle, position, mode)
D0            D1      D2        D3
```

**Modes:**
- OFFSET_BEGINNING (-1)
- OFFSET_CURRENT (0)
- OFFSET_END (1)

Stub returns 0 for success, -1 for error.

### Console I/O

#### Input (-54) ✅ Working
```c
handle = Input()
D0
```

Returns stdin handle (1).

#### Output (-60) ✅ Working
```c
handle = Output()
D0
```

Returns stdout handle (2).

#### WaitForChar (-204) ✅ Working
```c
result = WaitForChar(handle, timeout)
D0                   D1      D2
```

**Timeout:**
- 0 = no wait
- -1 = wait forever
- Other = microseconds

Returns -1 if char available, 0 if timeout.

### File/Directory Locking

#### Lock (-84) ⚠️ Stub
```c
lock = Lock(name, mode)
D0          D1    D2
```

**Modes:**
- ACCESS_READ (-2)
- ACCESS_WRITE (-1)

Stub returns fake lock 0x1000.

#### UnLock (-90) ⚠️ Stub
```c
UnLock(lock)
       D1
```

Stub does nothing.

#### DupLock (-96) ⚠️ Stub
```c
newlock = DupLock(lock)
D0                D1
```

Stub returns same lock value.

### Date/Time

#### DateStamp (-192) ✅ Working
```c
result = DateStamp(ds)
D0                 D1
```

**DateStamp structure (3 longs):**
- ds_Days - days since Jan 1, 1978
- ds_Minute - minutes past midnight (0-1439)
- ds_Tick - ticks past minute (0-2999, 50 ticks/sec)

Returns current date/time.

#### Delay (-198) ✅ Working
```c
Delay(ticks)
      D1
```

50 ticks = 1 second. Actually pauses execution.

### Error Handling

#### IoErr (-132) ✅ Working
```c
error = IoErr()
D0
```

**Error codes:**
- 0 = ERROR_NO_ERROR
- 103 = ERROR_NO_FREE_STORE
- 202 = ERROR_OBJECT_IN_USE
- 205 = ERROR_OBJECT_NOT_FOUND

Returns last DOS error code.

## Return Value Conventions

### Success Values
- **DOSTRUE** = -1 (TRUE in Amiga convention)
- **DOSFALSE** = 0 (FALSE in Amiga convention)

### Pointers/Handles
- **0** = NULL/failure
- **Non-zero** = valid pointer/handle

### Special Values
- **-1** = TRUE or error (context-dependent)
- **0** = FALSE or success (context-dependent)

## Common Patterns

### Opening Console for Output

```c
fh = Open("*", MODE_OLDFILE)
if (fh) {
    Write(fh, "Hello\n", 6)
    Close(fh)
}
```

### Checking for Input

```c
if (WaitForChar(Input(), 0)) {
    Read(Input(), buffer, 1)
}
```

### Getting File Information

```c
lock = Lock("filename", ACCESS_READ)
if (lock) {
    Examine(lock, &fib)
    UnLock(lock)
}
```

### Date/Time Operations

```c
DateStamp(&ds)
// ds.ds_Days, ds.ds_Minute, ds.ds_Tick now filled

Delay(50)  // Delay 1 second (50 ticks)
```

## Special Case: Offset -28

**WARNING:** Offset -28 is NOT a valid dos.library function!

If your door calls offset -28, it likely indicates:
- Offset calculation error
- Incorrect library base
- Corrupted function pointer

The implementation handles this by:
1. Logging a warning
2. Returning success (D0=-1)
3. Allowing door to continue

**Do NOT rely on this!** Fix the offset calculation instead.

## Implementation Status Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Fully implemented and working |
| ⚠️ | Stub implementation (returns success but doesn't do much) |
| ❌ | Not implemented (will cause "Unknown library call" error) |

## Upgrading Stubs

To upgrade a stub to full implementation:

1. Locate function in `DosLibrary.ts`
2. Replace stub logic with real implementation
3. Remove "STUB" from log message
4. Update status in this document

Example:

```typescript
// BEFORE (Stub)
Lock(): void {
  console.log(`[dos.library] Lock(...) - STUB, returning fake lock`);
  this.emulator.setRegister(CPURegister.D0, 0x1000);
}

// AFTER (Full implementation)
Lock(): void {
  const name = this.readString(this.emulator.getRegister(CPURegister.D1));
  const lock = this.fileSystem.getLock(name);
  console.log(`[dos.library] Lock("${name}") - returning lock 0x${lock.toString(16)}`);
  this.emulator.setRegister(CPURegister.D0, lock);
}
```

## References

- [Amiga Developer Docs - dos.library](http://amigadev.elowar.com/read/ADCD_2.1/Includes_and_Autodocs_2._guide/node00E2.html)
- [AmigaOS include files - dos/dos.h](http://amigadev.elowar.com/read/ADCD_2.1/Includes_and_Autodocs_2._guide/node0047.html)
- [AmigaOS include files - dos/dosextens.h](http://amigadev.elowar.com/read/ADCD_2.1/Includes_and_Autodocs_2._guide/node0048.html)

---

**Last Updated:** 2025-10-30
**Total Functions:** 33 (12 working, 18 stubs, 1 special)
