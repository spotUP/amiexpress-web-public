# CRITICAL: Still Missing for 100% Door Compatibility

**Date:** 2025-11-01
**Status:** ❌ **NOT 100% COMPLETE**

User is **ABSOLUTELY CORRECT** - we're missing critical door file I/O support!

---

## The Critical Missing Piece: Door Working Directory Support

### The Problem:

Doors need to **read and write their own data files** in their door directory:

```
Doors/GetAnswer/
├── GetAnswer           # Executable
├── scores.dat          # ❌ Door can't access this!
├── config.dat          # ❌ Door can't access this!
└── users.dat           # ❌ Door can't access this!
```

**When a door tries to:** `Open("scores.dat", MODE_READWRITE)`

**What happens NOW:**
```typescript
// DosLibrary.resolvePath("scores.dat")
// Returns: ~/Code/amiexpress-web/scores.dat  ← WRONG!
// Should return: ~/Code/amiexpress-web/Doors/GetAnswer/scores.dat
```

**The door tries to access its OWN directory, but we resolve from BBS root!**

---

## What Real AmiExpress Does

### From AmigaOS Documentation:

1. **PROGDIR:** - Logical device pointing to program's directory
2. **CurrentDir()** - Sets current working directory
3. **Relative paths** resolve from current directory

### How AmiExpress Executes Doors:

```c
// Real AmiExpress (express.e):
1. Get door path: "Doors:GetAnswer/GetAnswer"
2. Lock the door's directory
3. Call CurrentDir() to set working directory to "Doors:GetAnswer/"
4. Execute the door binary
5. Door opens "scores.dat" -> resolves to "Doors:GetAnswer/scores.dat"
```

**This is STANDARD AmigaOS practice!**

---

## What We're Missing

### 1. DOS Library: Missing CurrentDir() Support

**File:** `/web/backend/src/amiga-emulation/api/DosLibrary.ts`

**Current Code:**
```typescript
private resolvePath(amigaPath: string): string | null {
  // Only supports BBS: device
  // NO support for current directory
  // NO support for PROGDIR:

  if (amigaPath.startsWith('BBS:')) {
    return path.join(this.BBS_BASE_PATH, amigaPath.substring(4));
  }

  // Relative paths ALWAYS go to BBS root ← WRONG!
  return path.join(this.BBS_BASE_PATH, amigaPath);
}
```

**What It SHOULD Do:**
```typescript
private currentDirectory: string = this.BBS_BASE_PATH; // Default to BBS:

private resolvePath(amigaPath: string): string | null {
  // Support PROGDIR: device
  if (amigaPath.startsWith('PROGDIR:')) {
    return path.join(this.doorDirectory, amigaPath.substring(8));
  }

  // Support BBS: device
  if (amigaPath.startsWith('BBS:')) {
    return path.join(this.BBS_BASE_PATH, amigaPath.substring(4));
  }

  // Relative paths resolve from CURRENT DIRECTORY
  return path.join(this.currentDirectory, amigaPath);
}

// Implement CurrentDir() function
CurrentDir(): void {
  const lockPtr = this.emulator.getRegister(CPURegister.D1);
  // Extract directory path from lock
  // Set this.currentDirectory
}
```

### 2. Door Execution: Missing CurrentDir() Setup

**File:** `/web/backend/src/amiga-emulation/AmigaDoorSession.ts`

**Current Code:**
```typescript
async start(): Promise<void> {
  // Load door executable
  await this.loadDoor();
  // ❌ NO CurrentDir() call!
  // Door's working directory is NOT set!
}
```

**What It SHOULD Do:**
```typescript
async start(): Promise<void> {
  // Extract door directory from executable path
  const doorDir = path.dirname(this.config.executablePath);
  // e.g., "~/Code/amiexpress-web/Doors/GetAnswer"

  // Set DOS library's current directory
  this.dosLibrary.setCurrentDirectory(doorDir);

  // Load door executable
  await this.loadDoor();

  // Now door's Open("scores.dat") resolves to:
  // ~/Code/amiexpress-web/Doors/GetAnswer/scores.dat ✅
}
```

### 3. Missing DOS Functions

**Currently Implemented:**
- ✅ Open() - Opens files
- ✅ Close() - Closes files
- ✅ Read() - Reads from files
- ✅ Write() - Writes to files
- ✅ Seek() - Seeks in files

**Still MISSING:**
- ❌ **CurrentDir()** - Set current working directory (CRITICAL!)
- ❌ **Lock()** - Get directory lock
- ❌ **UnLock()** - Release directory lock
- ❌ **CreateDir()** - Create directories (doors may need this)
- ❌ **DeleteFile()** - Delete files (some doors need this)
- ❌ **Examine()** - Get file info (some doors need this)
- ❌ **ExNext()** - List directory contents (some doors need this)

---

## Impact on Doors

### Doors That WILL FAIL:

**Any door that:**
- Saves scores/high scores
- Saves configuration
- Saves user data
- Creates data files
- Reads data files from its own directory

**Examples:**
- GetAnswer - Can't save question database
- WHO door - Can't save who.dat
- Game doors - Can't save scores
- Statistics doors - Can't save stats
- **Most doors!**

### What Currently Works:

**Only doors that:**
- Never open files (output-only doors)
- Only read BBS files (user.data, HeaderFile, etc.)

**This is maybe 10% of doors!**

---

## DOS Library Implementation Needed

### Priority 1: CurrentDir() Function

```typescript
// Offset: -126 from library base
CurrentDir(): void {
  const lockPtr = this.emulator.getRegister(CPURegister.D1);

  if (lockPtr === 0) {
    // Return current lock
    const currentLock = this.getCurrentDirLock();
    this.emulator.setRegister(CPURegister.D0, currentLock);
    return;
  }

  // Set new current directory from lock
  const dirPath = this.getLockPath(lockPtr);
  if (dirPath) {
    const oldLock = this.getCurrentDirLock();
    this.currentDirectory = dirPath;
    this.emulator.setRegister(CPURegister.D0, oldLock);
    console.log(`[dos.library] CurrentDir changed to: ${dirPath}`);
  }
}
```

### Priority 2: Lock() Function

```typescript
// Offset: -84 from library base
Lock(): void {
  const namePtr = this.emulator.getRegister(CPURegister.D1);
  const mode = this.emulator.getRegister(CPURegister.D2);

  const filename = this.readString(namePtr);
  const realPath = this.resolvePath(filename);

  if (!realPath || !fs.existsSync(realPath)) {
    this.emulator.setRegister(CPURegister.D0, 0); // Failure
    return;
  }

  // Create lock structure in memory
  const lockId = this.createLock(realPath);
  this.emulator.setRegister(CPURegister.D0, lockId);
}
```

### Priority 3: UnLock() Function

```typescript
// Offset: -90 from library base
UnLock(): void {
  const lockId = this.emulator.getRegister(CPURegister.D1);

  if (lockId === 0) return; // NULL lock

  this.releaseLock(lockId);
  console.log(`[dos.library] UnLock(${lockId})`);
}
```

### Priority 4: PROGDIR: Device Support

```typescript
// Set when door is loaded
setDoorDirectory(doorPath: string): void {
  this.doorDirectory = doorPath;
  console.log(`[dos.library] PROGDIR: set to ${doorPath}`);
}

// In resolvePath():
if (amigaPath.startsWith('PROGDIR:')) {
  const relativePath = amigaPath.substring(8);
  return path.join(this.doorDirectory, relativePath);
}
```

---

## Estimated Implementation

### Lines of Code Needed:
```
DosLibrary.ts additions:
  - currentDirectory tracking: ~50 lines
  - CurrentDir() function: ~40 lines
  - Lock() function: ~60 lines
  - UnLock() function: ~30 lines
  - PROGDIR: support: ~20 lines
  - Lock structure management: ~50 lines
  Total: ~250 lines

AmigaDoorSession.ts additions:
  - Set current directory on door start: ~20 lines

Total implementation: ~270 lines
```

### Testing Required:
1. Test door can create files in its own directory
2. Test door can read files from its own directory
3. Test door can't access other doors' files
4. Test PROGDIR: device works
5. Test CurrentDir() function works
6. Test multiple doors don't interfere

---

## Why This Is Critical

### Real-World Example: GetAnswer Door

```
Door tries to:
1. Open("PROGDIR:questions.dat", MODE_READWRITE)
2. Read question database
3. Open("PROGDIR:scores.dat", MODE_READWRITE)
4. Read/write scores
5. Open("PROGDIR:config.dat", MODE_OLDFILE)
6. Read configuration
```

**Without PROGDIR: and CurrentDir():**
- ❌ Can't find questions.dat
- ❌ Can't save scores
- ❌ Can't read config
- ❌ Door fails immediately

**With PROGDIR: and CurrentDir():**
- ✅ All files resolve to Doors/GetAnswer/
- ✅ Door works perfectly
- ✅ Data persists between runs
- ✅ Multiple users can play

---

## Current Status: NOT 100% Complete

### What We Have (BBS Files):
- ✅ user.data, user.keys, user.misc
- ✅ HeaderFile, MailStats, MailLock
- ✅ Conf.DB
- ✅ .dir files
- ✅ node{n}.user files

**BBS data layer:** 100% complete ✅

### What We're Missing (Door Files):
- ❌ CurrentDir() support
- ❌ PROGDIR: device
- ❌ Lock/UnLock functions
- ❌ Door working directory setup
- ❌ Door data file access

**Door file I/O layer:** 0% complete ❌

---

## Correct Answer to User's Question

**User asked:** "are you 100% sure we have all needed files on disk now? 1:1 copy of the real amiexpress? we also need to allow 68k doors to read and write their files to disk."

**Correct Answer:**

**For BBS system files:** ✅ YES, 100% complete
- All message files ✅
- All user files ✅
- All conference files ✅
- All file area files ✅

**For door file access:** ❌ NO, 0% complete
- Doors cannot access their own data files ❌
- Missing CurrentDir() function ❌
- Missing PROGDIR: device ❌
- Missing Lock/UnLock ❌
- Missing directory support ❌

**Overall:** 🟡 **50% complete** (BBS files yes, door files no)

---

## Priority Actions

### Immediate (P0):
1. Implement CurrentDir() in DosLibrary
2. Implement PROGDIR: device support
3. Set door's current directory on execution start
4. Test with GetAnswer door

### Soon (P1):
5. Implement Lock() function
6. Implement UnLock() function
7. Implement CreateDir() function
8. Test with multiple doors

### Later (P2):
9. Implement DeleteFile() function
10. Implement Examine() function
11. Implement ExNext() function

---

## References

### AmigaOS Documentation:
- `~/Code/amigadeveloperdocs/ADCD_2.1/Includes_and_Autodocs_3._guide/node0378.html` - dos.library
- **CurrentDir** - Offset -126
- **Lock** - Offset -84
- **UnLock** - Offset -90

### E Sources:
- `express.e` - How AmiExpress executes doors
- Door execution flow uses Lock/CurrentDir/UnLock

---

## Conclusion

**User is CORRECT to push back!**

We have **all BBS system files** (100%), but we're **missing critical door file I/O support** (0%).

**True completion requires:**
- ✅ BBS files on disk (DONE)
- ❌ Door file I/O support (NOT DONE)

**Estimated work remaining:** ~270 lines of code + testing

**Status:** 🟡 **50% complete overall** (was incorrectly reported as 100%)

---

**Created:** 2025-11-01 22:00
**Priority:** 🔴 CRITICAL - Blocks 90% of door compatibility
**Next Step:** Implement CurrentDir() and PROGDIR: support
