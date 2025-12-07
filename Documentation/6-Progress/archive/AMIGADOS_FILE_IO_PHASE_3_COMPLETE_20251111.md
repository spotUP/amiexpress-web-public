# AmigaDOS File I/O Implementation - Phase 3 Complete
**Date:** 2025-11-11
**Status:** Phase 3 Complete - Ready for Phase 4 Integration

## Overview

Implemented complete AmigaDOS file I/O system based on AmigaOS v40 source code analysis. The system uses FileManager/PathManager/FileHandle classes and integrates with DosLibrary via feature flag for backward compatibility.

## What Was Completed

### Phase 1: Infrastructure (COMPLETE ✓)
Created three core classes for file I/O management:

1. **FileHandle.ts** (216 lines)
   - Location: `web/backend/src/amiga-emulation/api/FileHandle.ts`
   - File descriptor management (open/read/write/seek/close)
   - Special device support (console fd=-2, NIL fd=-1)
   - BPTR and memory address tracking
   - Position tracking for seek operations
   - Console output detection (returns consoleData for terminal display)

2. **PathManager.ts** (167 lines)
   - Location: `web/backend/src/amiga-emulation/api/PathManager.ts`
   - AmigaDOS path mapping (doors:, bbs:, sys:, ram:, t:, c:, libs:, devs:)
   - `amiToSysPath()`: "doors:who/node0.txt" → "/path/to/doors/who/node0.txt"
   - Special device detection (NIL:, CONSOLE:, CON:, *, "")
   - Dynamic assign management (add/remove assigns)

3. **FileManager.ts** (288 lines)
   - Location: `web/backend/src/amiga-emulation/api/FileManager.ts`
   - BPTR allocation and registry (Map<BPTR, FileHandle>)
   - Pre-allocated stdin (BPTR=1) and stdout (BPTR=2)
   - Integration with PathManager and FileHandle
   - File handle lifecycle management (open, register, unregister, close)
   - Methods: `open()`, `close()`, `read()`, `write()`, `seek()`, `tell()`

### Phase 2: Integration Started (COMPLETE ✓)
Modified DosLibrary.ts to support new file system:

- Location: `web/backend/src/amiga-emulation/api/DosLibrary.ts`
- Added imports for FileManager and PathManager
- Added private members: `fileManager`, `pathManager`, `useNewFileSystem` flag
- Added `enableNewFileSystem(baseDir)` method for initialization

### Phase 3: DosLibrary Methods Updated (COMPLETE ✓)
Updated all file I/O methods with feature flag for gradual migration:

1. **Open()** - Uses FileManager.open() when enabled
   - Maps AmigaDOS paths to filesystem
   - Handles MODE_OLDFILE (1005), MODE_NEWFILE (1006), MODE_READWRITE (1004)
   - Returns BPTR or 0 on failure

2. **Close()** - Uses FileManager.close() when enabled
   - Handles BPTR validation
   - Protects stdin/stdout from being closed
   - Returns DOSTRUE (-1) or DOSFALSE (0)

3. **Read()** - Uses FileManager.read() when enabled
   - Reads data from file into Buffer
   - Copies Buffer to emulator memory
   - Returns bytes read

4. **Write()** - Uses FileManager.write() when enabled
   - Reads data from emulator memory
   - Writes to file via FileManager
   - Captures console output and sends to callback
   - Returns bytes written

5. **Input()** - Returns stdin BPTR from FileManager when enabled
   - Returns BPTR 1 (stdin)

6. **Output()** - Returns stdout BPTR from FileManager when enabled
   - Returns BPTR 2 (stdout)

**All changes maintain backward compatibility with feature flag.**

### Documentation (COMPLETE ✓)

1. **AMIGAOS_DOS_FILE_IO_IMPLEMENTATION_GUIDE.md** (380 lines)
   - Location: `Documentation/3-Developers/AMIGAOS_DOS_FILE_IO_IMPLEMENTATION_GUIDE.md`
   - Comprehensive guide with 7 parts:
     - Part 1: Function specifications from dos_lib.fd
     - Part 2: FileHandle structure & BPTR system
     - Part 3: Path mapping (AmigaDOS → filesystem)
     - Part 4: CLI environment for SIM doors
     - Part 5: Implementation checklist (5 phases)
     - Part 6: WHO door execution flow
     - Part 7: Comparison with current implementation

2. **CLAUDE.md** - Added CRITICAL zombie process cleanup section
   - Location: `/CLAUDE.md` (lines 41-66)
   - Commands to detect and kill zombie processes
   - Why it matters (context consumption)
   - Signs of zombie process problem

## What Remains

### Phase 4: AmigaDoorSession Integration (1-2 hours)

**File:** `web/backend/src/amiga-emulation/AmigaDoorSession.ts`

**Tasks:**
1. Call `dosLibrary.enableNewFileSystem(baseDir)` during initialization
   - Find where DosLibrary is instantiated
   - Call `this.dosLibrary.enableNewFileSystem(this.baseDir)` after creation
   - This activates FileManager/PathManager

2. Set up CLI structure at memory address 0x90000 (for SIM doors)
   - Allocate CLI structure in emulator memory
   - Parse command line (e.g., "WHO 0")
   - Link process structure to CLI structure
   - Set stdin/stdout BPTRs in process

**Expected behavior after Phase 4:**
- WHO door opens "doors:who/node*.txt" files
- Reads file contents
- Writes to stdout (captured by terminal)
- Terminal displays output

### Phase 5: Testing (1-2 hours)

**Test Plan:**
1. Run WHO door via BBS command
2. Verify console logs show FileManager operations
3. Verify terminal receives output
4. Check for any errors in file I/O

**Test Commands:**
```bash
# You run the servers (not me!)
./dev/scripts/start-servers.sh

# Access BBS at http://localhost:5173
# Login: sysop / sysop
# Command: WHO
# Expected: List of connected users
```

## Key Technical Details

### BPTR System
- BPTR = Byte Pointer = memory_address / 4 (BCPL convention)
- BPTR 1 = stdin (pre-allocated)
- BPTR 2 = stdout (pre-allocated)
- BPTR 3+ = dynamically allocated file handles

### AmigaDOS Mode Constants
```typescript
MODE_OLDFILE = 1005    // Open existing file for reading
MODE_NEWFILE = 1006    // Create new file or overwrite existing
MODE_READWRITE = 1004  // Open existing file for read/write
```

### File I/O Flow
1. Door calls `Open("doors:who/node0.txt", MODE_OLDFILE)`
2. DosLibrary checks `useNewFileSystem` flag → true
3. DosLibrary calls `FileManager.open()`
4. FileManager calls `PathManager.amiToSysPath()` → "/path/to/doors/who/node0.txt"
5. FileManager creates FileHandle, opens file with fs.openSync()
6. FileManager allocates BPTR, registers handle
7. Returns BPTR to door (e.g., 3)
8. Door calls `Read(3, buffer, length)`
9. FileManager reads from file descriptor
10. Data copied to emulator memory
11. Door calls `Write(2, buffer, length)` [stdout]
12. FileManager detects console output
13. Returns consoleData to DosLibrary
14. DosLibrary sends to outputCallback → terminal

## Files Created/Modified

### New Files (3)
1. `web/backend/src/amiga-emulation/api/FileHandle.ts` - 216 lines
2. `web/backend/src/amiga-emulation/api/PathManager.ts` - 167 lines
3. `web/backend/src/amiga-emulation/api/FileManager.ts` - 288 lines

### Modified Files (2)
1. `web/backend/src/amiga-emulation/api/DosLibrary.ts`
   - Added imports (lines 4-5)
   - Added members (lines 62-64)
   - Added enableNewFileSystem() (lines 141-146)
   - Updated Open() (lines 237-248)
   - Updated Close() (lines 374-385)
   - Updated Read() (lines 456-469)
   - Updated Write() (lines 548-571)
   - Updated Input() (lines 678-683)
   - Updated Output() (lines 699-704)

2. `CLAUDE.md`
   - Added zombie process cleanup section (lines 41-66)

### Documentation Files (2)
1. `Documentation/3-Developers/AMIGAOS_DOS_FILE_IO_IMPLEMENTATION_GUIDE.md` - NEW
2. `Documentation/6-Progress/AMIGADOS_FILE_IO_PHASE_3_COMPLETE_20251111.md` - THIS FILE

## Verification

**TypeScript Compilation:** ✓ PASSED
```bash
cd web/backend && npx tsc --noEmit
# No errors
```

## How to Continue (Phase 4)

### Step 1: Find DosLibrary Instantiation

Search for where DosLibrary is created in AmigaDoorSession.ts:

```bash
cd web/backend/src/amiga-emulation
grep -n "new DosLibrary" AmigaDoorSession.ts
```

### Step 2: Enable FileManager

After DosLibrary instantiation, add:

```typescript
this.dosLibrary.enableNewFileSystem(this.baseDir);
```

Where `this.baseDir` is the BBS base directory (e.g., `~/Code/amiexpress-web`).

### Step 3: Test TypeScript Compilation

```bash
cd web/backend
npx tsc --noEmit
```

### Step 4: Ask User to Test

Do NOT run servers yourself. Ask user to:
1. Run `./dev/scripts/start-servers.sh`
2. Access http://localhost:5173
3. Login and run WHO command
4. Report results

## Important Notes

### Context Management
- **Zombie processes were cleaned up** this session (64+ orphaned start-servers.sh processes)
- **NEVER run server scripts** - per CLAUDE.md line 37
- User runs servers, you only implement code
- See CLAUDE.md lines 41-66 for cleanup procedure

### Priority
- **Full 68K binary support is priority 1** (user statement)
- TypeScript door rewrites are secondary
- Focus on getting WHO door working first

### Known Issues
- None currently - all code compiles and is ready for Phase 4

## References

- Express.e Door Types: lines 4680-4698
- Express.e SIM Door Handling: lines 4280-4282, 4346-4349
- Implementation Guide: `Documentation/3-Developers/AMIGAOS_DOS_FILE_IO_IMPLEMENTATION_GUIDE.md`

## Session End Status

✓ Phase 1 Complete - Infrastructure
✓ Phase 2 Complete - Integration Started
✓ Phase 3 Complete - DosLibrary Methods Updated
⏳ Phase 4 Pending - AmigaDoorSession Integration (1-2 hours)
⏳ Phase 5 Pending - Testing (1-2 hours)

**Total Estimated Time Remaining:** 2-4 hours

**Next Step:** Integrate FileManager into AmigaDoorSession.ts by calling `enableNewFileSystem()`.
