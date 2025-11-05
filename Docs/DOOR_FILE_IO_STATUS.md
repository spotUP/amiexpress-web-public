# Door File I/O Status - 2025-11-01

## Current Implementation Status

### ✅ What's Working (40% Complete)

**File I/O Functions - FULLY IMPLEMENTED:**
```typescript
Open()   - Opens files with BBS: device support
Close()  - Closes files and flushes to disk
Read()   - Reads from files into emulated memory
Write()  - Writes from emulated memory to files
Seek()   - Seeks to position in file
```

**What Doors Can Do NOW:**
- ✅ Open files using BBS: device (e.g., "BBS:user.data")
- ✅ Read BBS system files (user.data, HeaderFile, etc.)
- ✅ Write to files (buffered, flushed on Close)
- ✅ Seek to any position in file
- ✅ Open console handles (STDIN/STDOUT)

### ❌ What's Broken (60% Missing)

**All Directory Management Functions are STUBS:**

1. **DeleteFile()** (offset -72) - STUB
   - Returns success but doesn't delete anything
   - Doors cannot clean up old files

2. **Lock()** (offset -84) - STUB
   - Returns fake lock value (0x1000)
   - Doesn't track actual directories
   - Doors cannot get locks on directories

3. **UnLock()** (offset -90) - STUB
   - Does nothing
   - Doesn't free any resources

4. **Examine()** (offset -102) - STUB
   - Zeros out FileInfoBlock structure
   - Doors cannot get file info
   - Doors cannot check if file/dir exists

5. **ExNext()** (offset -108) - STUB
   - Always returns "no more entries"
   - Doors cannot list directory contents

6. **CreateDir()** (offset -120) - STUB
   - Returns fake lock (0x2000)
   - Doesn't create directories
   - Doors cannot organize their data

7. **CurrentDir()** (offset -126) - STUB
   - Returns fake lock (0x3000)
   - Doesn't change working directory
   - Doors always use BBS root as current dir

### 🔴 CRITICAL MISSING: Path Resolution

**Current resolvePath() Implementation:**
```typescript
// Line 115-136 of DosLibrary.ts
private resolvePath(amigaPath: string): string | null {
  // BBS: device works
  if (amigaPath.toUpperCase().startsWith('BBS:')) {
    const relativePath = amigaPath.substring(4);
    const resolved = path.join(this.BBS_BASE_PATH, relativePath);
    return resolved;
  }

  // Absolute paths work
  if (amigaPath.startsWith('/')) {
    return amigaPath;
  }

  // ❌ PROBLEM: All relative paths go to BBS root
  const resolved = path.join(this.BBS_BASE_PATH, amigaPath);
  return resolved;
}
```

**Missing Features:**
- ❌ No current directory tracking
- ❌ No PROGDIR: device support
- ❌ No door directory context
- ❌ Relative paths always resolve from BBS root

**What This Breaks:**

Example: GetAnswer door tries to save high scores:
```c
// Door code (GetAnswer):
BPTR fh = Open("scores.dat", MODE_NEWFILE);
```

**Current behavior:**
- Resolves to: `~/Code/amiexpress-web/scores.dat` (BBS root) ❌
- Should be: `~/Code/amiexpress-web/Doors/GetAnswer/scores.dat` ✅

**Why it's wrong:**
- All doors write to same BBS root directory
- Files collide between different doors
- Can't organize door data

## Implementation Requirements

### Phase 1: Current Directory Support (P0 - Critical)

**Add to DosLibrary.ts (~70 lines):**

```typescript
// 1. Add tracking fields
private currentDirectory: string = this.BBS_BASE_PATH;
private doorDirectory: string = '';
private locks: Map<number, Lock> = new Map();
private nextLockId: number = 1;

interface Lock {
  id: number;
  path: string;
  mode: number;
}

// 2. Implement CurrentDir()
CurrentDir(): void {
  const lockId = this.emulator.getRegister(CPURegister.D1);

  if (lockId === 0) {
    // Return current directory lock
    const currentLock = this.createLockForPath(this.currentDirectory);
    this.emulator.setRegister(CPURegister.D0, currentLock);
    return;
  }

  const lock = this.locks.get(lockId);
  if (!lock) {
    this.emulator.setRegister(CPURegister.D0, 0);
    return;
  }

  // Save old directory
  const oldLock = this.createLockForPath(this.currentDirectory);

  // Set new current directory
  this.currentDirectory = lock.path;

  this.emulator.setRegister(CPURegister.D0, oldLock);
}

// 3. Implement real Lock()
Lock(): void {
  const namePtr = this.emulator.getRegister(CPURegister.D1);
  const mode = this.emulator.getRegister(CPURegister.D2);
  const filename = this.readString(namePtr);

  const realPath = this.resolvePath(filename);
  if (!realPath || !fs.existsSync(realPath)) {
    this.emulator.setRegister(CPURegister.D0, 0);
    this.lastError = this.ERROR_OBJECT_NOT_FOUND;
    return;
  }

  const lockId = this.nextLockId++;
  this.locks.set(lockId, {
    id: lockId,
    path: realPath,
    mode: mode
  });

  this.emulator.setRegister(CPURegister.D0, lockId);
  this.lastError = this.ERROR_NO_ERROR;
}

// 4. Implement real UnLock()
UnLock(): void {
  const lockId = this.emulator.getRegister(CPURegister.D1);
  if (lockId === 0) return;

  this.locks.delete(lockId);
  this.lastError = this.ERROR_NO_ERROR;
}

// 5. Add PROGDIR: support to resolvePath()
private resolvePath(amigaPath: string): string | null {
  // PROGDIR: device - door's own directory
  if (amigaPath.toUpperCase().startsWith('PROGDIR:')) {
    const relativePath = amigaPath.substring(8);
    return path.join(this.doorDirectory, relativePath);
  }

  // BBS: device - BBS system files
  if (amigaPath.toUpperCase().startsWith('BBS:')) {
    const relativePath = amigaPath.substring(4);
    return path.join(this.BBS_BASE_PATH, relativePath);
  }

  // Absolute paths
  if (amigaPath.startsWith('/')) {
    return amigaPath;
  }

  // Relative paths resolve from CURRENT directory
  return path.join(this.currentDirectory, amigaPath);
}

// 6. Add method to set door directory
setDoorDirectory(doorPath: string): void {
  this.doorDirectory = doorPath;
  console.log(`[dos.library] PROGDIR: set to ${doorPath}`);
}
```

### Phase 2: File Management (P1 - High)

**Implement CreateDir() (~30 lines):**
```typescript
CreateDir(): void {
  const namePtr = this.emulator.getRegister(CPURegister.D1);
  const filename = this.readString(namePtr);
  const realPath = this.resolvePath(filename);

  if (!realPath) {
    this.emulator.setRegister(CPURegister.D0, 0);
    this.lastError = this.ERROR_OBJECT_NOT_FOUND;
    return;
  }

  try {
    fs.mkdirSync(realPath, { recursive: true });

    // Return lock to new directory
    const lockId = this.nextLockId++;
    this.locks.set(lockId, {
      id: lockId,
      path: realPath,
      mode: 0
    });

    this.emulator.setRegister(CPURegister.D0, lockId);
    this.lastError = this.ERROR_NO_ERROR;
  } catch (error) {
    this.emulator.setRegister(CPURegister.D0, 0);
    this.lastError = this.ERROR_WRITE_PROTECTED;
  }
}
```

**Implement DeleteFile() (~25 lines):**
```typescript
DeleteFile(): void {
  const namePtr = this.emulator.getRegister(CPURegister.D1);
  const filename = this.readString(namePtr);
  const realPath = this.resolvePath(filename);

  if (!realPath || !fs.existsSync(realPath)) {
    this.emulator.setRegister(CPURegister.D0, 0);
    this.lastError = this.ERROR_OBJECT_NOT_FOUND;
    return;
  }

  try {
    fs.unlinkSync(realPath);
    this.emulator.setRegister(CPURegister.D0, -1); // DOSTRUE
    this.lastError = this.ERROR_NO_ERROR;
  } catch (error) {
    this.emulator.setRegister(CPURegister.D0, 0);
    this.lastError = this.ERROR_WRITE_PROTECTED;
  }
}
```

### Phase 3: Directory Listing (P2 - Medium)

**Implement Examine() (~60 lines):**
```typescript
Examine(): void {
  const lockId = this.emulator.getRegister(CPURegister.D1);
  const fibPtr = this.emulator.getRegister(CPURegister.D2);

  const lock = this.locks.get(lockId);
  if (!lock) {
    this.emulator.setRegister(CPURegister.D0, 0);
    this.lastError = this.ERROR_OBJECT_NOT_FOUND;
    return;
  }

  try {
    const stats = fs.statSync(lock.path);

    // Write FileInfoBlock structure
    // fib_DiskKey (4 bytes)
    this.writeLong(fibPtr, 0);

    // fib_DirEntryType (4 bytes) - negative = file, positive = dir
    this.writeLong(fibPtr + 4, stats.isDirectory() ? 2 : -3);

    // fib_FileName (108 bytes BCPL string)
    const fileName = path.basename(lock.path);
    this.writeBCPLString(fibPtr + 8, fileName, 107);

    // fib_Protection (4 bytes)
    this.writeLong(fibPtr + 116, 0);

    // fib_EntryType (4 bytes)
    this.writeLong(fibPtr + 120, stats.isDirectory() ? 2 : -3);

    // fib_Size (4 bytes)
    this.writeLong(fibPtr + 124, stats.isFile() ? stats.size : 0);

    // fib_NumBlocks (4 bytes)
    this.writeLong(fibPtr + 128, 0);

    // fib_Date (12 bytes DateStamp)
    const mtime = stats.mtime;
    const epoch = new Date('1978-01-01T00:00:00Z');
    const days = Math.floor((mtime.getTime() - epoch.getTime()) / (1000 * 60 * 60 * 24));
    const minutes = mtime.getHours() * 60 + mtime.getMinutes();
    const ticks = mtime.getSeconds() * 50;

    this.writeLong(fibPtr + 132, days);
    this.writeLong(fibPtr + 136, minutes);
    this.writeLong(fibPtr + 140, ticks);

    // fib_Comment (80 bytes BCPL string)
    this.writeBCPLString(fibPtr + 144, '', 79);

    this.emulator.setRegister(CPURegister.D0, -1); // DOSTRUE
    this.lastError = this.ERROR_NO_ERROR;
  } catch (error) {
    this.emulator.setRegister(CPURegister.D0, 0);
    this.lastError = this.ERROR_OBJECT_NOT_FOUND;
  }
}
```

**Implement ExNext() (~70 lines):**
```typescript
private dirIterators: Map<number, string[]> = new Map();
private dirIteratorIndex: Map<number, number> = new Map();

ExNext(): void {
  const lockId = this.emulator.getRegister(CPURegister.D1);
  const fibPtr = this.emulator.getRegister(CPURegister.D2);

  const lock = this.locks.get(lockId);
  if (!lock) {
    this.emulator.setRegister(CPURegister.D0, 0);
    this.lastError = this.ERROR_OBJECT_NOT_FOUND;
    return;
  }

  try {
    // Get or create directory iterator
    if (!this.dirIterators.has(lockId)) {
      const files = fs.readdirSync(lock.path);
      this.dirIterators.set(lockId, files);
      this.dirIteratorIndex.set(lockId, 0);
    }

    const files = this.dirIterators.get(lockId)!;
    const index = this.dirIteratorIndex.get(lockId)!;

    if (index >= files.length) {
      // No more entries
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = this.ERROR_NO_MORE_ENTRIES;

      // Clean up iterator
      this.dirIterators.delete(lockId);
      this.dirIteratorIndex.delete(lockId);
      return;
    }

    const fileName = files[index];
    const filePath = path.join(lock.path, fileName);
    const stats = fs.statSync(filePath);

    // Write FileInfoBlock (same as Examine)
    this.writeLong(fibPtr, index);
    this.writeLong(fibPtr + 4, stats.isDirectory() ? 2 : -3);
    this.writeBCPLString(fibPtr + 8, fileName, 107);
    this.writeLong(fibPtr + 116, 0);
    this.writeLong(fibPtr + 120, stats.isDirectory() ? 2 : -3);
    this.writeLong(fibPtr + 124, stats.isFile() ? stats.size : 0);

    // Increment iterator
    this.dirIteratorIndex.set(lockId, index + 1);

    this.emulator.setRegister(CPURegister.D0, -1); // DOSTRUE
    this.lastError = this.ERROR_NO_ERROR;
  } catch (error) {
    this.emulator.setRegister(CPURegister.D0, 0);
    this.lastError = this.ERROR_OBJECT_NOT_FOUND;
  }
}
```

### Phase 4: Door Session Integration

**Update AmigaDoorSession.ts (~25 lines):**

```typescript
async start(): Promise<void> {
  console.log(`[AmigaDoorSession] Starting door: ${this.config.doorName}`);

  // Extract door directory from executable path
  const doorDir = path.dirname(this.config.executablePath);
  console.log(`[AmigaDoorSession] Door directory: ${doorDir}`);

  // Set PROGDIR: device in DOS library
  if (this.dosLibrary) {
    this.dosLibrary.setDoorDirectory(doorDir);

    // Create lock for door directory
    // Lock the door directory
    // Set as current directory via CurrentDir()
    // This requires calling Lock() and CurrentDir() via emulation
    // For now, just set the door directory - doors will use PROGDIR:
  }

  // Continue with door loading...
  await this.loadDoor();
}
```

## Estimated Work

**Total: ~280 lines of code**

1. Current directory support: ~70 lines
2. CreateDir/DeleteFile: ~55 lines
3. Examine: ~60 lines
4. ExNext: ~70 lines
5. AmigaDoorSession update: ~25 lines

## Testing Plan

### Test 1: Door uses PROGDIR: device
```c
// Door code:
BPTR fh = Open("PROGDIR:scores.dat", MODE_NEWFILE);
Write(fh, "Score: 100\n", 11);
Close(fh);
```

**Expected:**
- File created at: `Doors/GetAnswer/scores.dat`

### Test 2: Door uses relative paths
```c
// Door code:
BPTR lock = Lock("PROGDIR:", ACCESS_READ);
BPTR oldDir = CurrentDir(lock);
BPTR fh = Open("config.txt", MODE_OLDFILE);
Close(fh);
CurrentDir(oldDir);
UnLock(lock);
```

**Expected:**
- Opens: `Doors/GetAnswer/config.txt`

### Test 3: Door reads BBS files
```c
// Door code:
BPTR fh = Open("BBS:user.data", MODE_OLDFILE);
Read(fh, buffer, 232);
Close(fh);
```

**Expected:**
- Reads: `~/Code/amiexpress-web/user.data`

### Test 4: Door creates directory
```c
// Door code:
BPTR lock = CreateDir("PROGDIR:data");
UnLock(lock);
```

**Expected:**
- Directory created: `Doors/GetAnswer/data/`

### Test 5: Door lists directory
```c
// Door code:
BPTR lock = Lock("PROGDIR:", ACCESS_READ);
BPTR fib = AllocMem(260, MEMF_CLEAR);
if (Examine(lock, fib)) {
  while (ExNext(lock, fib)) {
    // Process each file
  }
}
FreeMem(fib, 260);
UnLock(lock);
```

**Expected:**
- Lists all files in door directory

## Priority Order

1. **P0 (Critical):** Current directory + PROGDIR: support (~70 lines)
   - Without this, doors cannot access their own files

2. **P1 (High):** CreateDir/DeleteFile (~55 lines)
   - Needed for doors to manage their data files

3. **P2 (Medium):** Examine/ExNext (~130 lines)
   - Needed for doors that browse directories
   - Many doors work without directory listing

## Current Capability Assessment

**What doors can do RIGHT NOW:**
- ✅ Read BBS system files (user.data, HeaderFile, etc.)
- ✅ Write output to console
- ✅ Read input from console

**What doors CANNOT do:**
- ❌ Save persistent data (scores, config)
- ❌ Access their own directory
- ❌ Create/delete files
- ❌ List directory contents
- ❌ Use relative paths correctly

**Completion Level:**
- File I/O: 40% complete
- Directory Management: 0% complete
- **Overall Door Support: 20% complete**

## Next Session Tasks

1. Implement Lock/UnLock with real filesystem tracking
2. Implement CurrentDir with real directory changes
3. Add PROGDIR: device support
4. Update resolvePath() to use current directory
5. Add setDoorDirectory() method
6. Update AmigaDoorSession to call setDoorDirectory()
7. Test with GetAnswer door creating scores.dat

**After this, doors will be 60% functional.**
**Examine/ExNext can wait - most doors don't need directory listing.**
