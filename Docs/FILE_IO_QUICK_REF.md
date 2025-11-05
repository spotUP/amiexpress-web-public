# DOS.library File I/O - Quick Reference

**Complete implementation in DosLibrary.ts**

## Function Summary

| Function | Offset | Purpose | Returns |
|----------|--------|---------|---------|
| Open()   | -30    | Open file | Handle or 0 |
| Close()  | -36    | Close file | -1 or 0 |
| Read()   | -42    | Read bytes | Bytes read or -1 |
| Write()  | -48    | Write bytes | Bytes written or -1 |
| Seek()   | -66    | Change position | Old position or -1 |

## Mode Constants

```c
MODE_OLDFILE   = 1005  // Open existing file (read)
MODE_NEWFILE   = 1006  // Create/overwrite file (write)
MODE_READWRITE = 1004  // Open existing (read/write)
```

## Seek Modes

```c
OFFSET_BEGINNING = -1  // Seek from start of file
OFFSET_CURRENT   = 0   // Seek from current position
OFFSET_END       = 1   // Seek from end of file
```

## File Handles

```
1   = STDIN   (console input)
2   = STDOUT  (console output)
3   = STDERR  (console error)
99  = NIL:    (null device)
4+  = Real files
```

## Path Mapping

```
BBS:Node1/node1.user     → ~/Code/amiexpress-web/Node1/node1.user
Node1/test.txt           → ~/Code/amiexpress-web/Node1/test.txt
/tmp/file.txt            → /tmp/file.txt
```

## Common Patterns

### Read File
```c
BPTR fh = Open("BBS:file.txt", MODE_OLDFILE);
if (fh) {
    char buf[256];
    LONG n = Read(fh, buf, 256);
    Close(fh);
}
```

### Write File
```c
BPTR fh = Open("BBS:output.txt", MODE_NEWFILE);
if (fh) {
    Write(fh, data, size);
    Close(fh);
}
```

### Seek & Read
```c
BPTR fh = Open("BBS:data.dat", MODE_OLDFILE);
if (fh) {
    Seek(fh, 100, OFFSET_BEGINNING);
    Read(fh, buf, 50);
    Close(fh);
}
```

## Error Handling

```c
BPTR fh = Open("BBS:file.txt", MODE_OLDFILE);
if (!fh) {
    LONG err = IoErr();
    printf("Error: %ld\n", err);
}
```

## Error Codes

```
0   = ERROR_NO_ERROR
205 = ERROR_OBJECT_NOT_FOUND (file not found)
214 = ERROR_WRITE_PROTECTED (cannot write)
204 = ERROR_READ_PROTECTED (cannot read)
```

## Implementation Notes

- Files loaded into memory on Open()
- Files written to disk on Close()
- Read/Write operate on memory buffer
- Seek changes buffer position
- Fast operations (no disk I/O during read/write)
- Suitable for files <1MB

## Debugging

Check backend logs:
```bash
tail -f /tmp/backend.log | grep "dos.library"
```

## Documentation

- **Complete spec:** `Docs/DOS_FILE_IO_IMPLEMENTATION.md`
- **Usage examples:** `Docs/DOOR_FILE_IO_USAGE.md`
- **Changelog:** `Docs/CHANGELOG_2025-11-01_FILE_IO.md`

## Status

**COMPLETE ✓** - Ready for door testing
