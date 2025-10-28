# Amiga Door Emulation - Quick Start Guide

## Overview

The Amiga door emulation system supports **two modes** for library loading:

1. **Stub Mode (Default)** - JavaScript implementations, no library files needed
2. **Hybrid Mode (Optional)** - Real Amiga library files + JavaScript fallbacks

## Quick Start: Stub Mode (Recommended)

For most BBS doors, the default stub mode works perfectly:

```typescript
import { MoiraEmulator } from './cpu/MoiraEmulator';
import { AmigaDosEnvironment } from './api/AmigaDosEnvironment';
import { HunkLoader } from './loader/HunkLoader';
import * as fs from 'fs';

// 1. Initialize CPU emulator
const emulator = new MoiraEmulator();
await emulator.initialize();

// 2. Create AmigaDOS environment (stubs only - default)
const environment = new AmigaDosEnvironment(emulator);

// 3. Set up I/O callbacks
environment.setOutputCallback((data) => {
  console.log('[Door Output]', data);
});

// 4. Load and run a door program
const doorData = fs.readFileSync('/path/to/door-program');
const loader = new HunkLoader();
const hunkFile = loader.parse(doorData);
const entryPoint = loader.loadIntoMemory(emulator, hunkFile);

// 5. Execute door
emulator.execute(entryPoint);
```

**What works in stub mode:**
- ✅ Text-based doors
- ✅ File I/O operations
- ✅ Memory management
- ✅ Console input/output
- ✅ Basic library functions
- ✅ 80%+ of BBS doors

## Quick Start: Hybrid Mode (Advanced)

For doors requiring exact Amiga library behavior:

```typescript
import { MoiraEmulator } from './cpu/MoiraEmulator';
import { AmigaDosEnvironment } from './api/AmigaDosEnvironment';
import * as path from 'path';

// 1. Initialize CPU emulator
const emulator = new MoiraEmulator();
await emulator.initialize();

// 2. Create AmigaDOS environment with native library support
const environment = new AmigaDosEnvironment(emulator, {
  useNativeLibraries: true,
  libraryPaths: [
    path.join(__dirname, '../amiga-libs'),  // Local library directory
    '/usr/local/amiga/libs'                 // System-wide location
  ]
});

// 3. Rest is the same as stub mode
environment.setOutputCallback((data) => {
  console.log('[Door Output]', data);
});

// ... load and execute door
```

**What hybrid mode adds:**
- ✅ Exact Amiga library behavior
- ✅ Complex graphics library functions
- ✅ Advanced GUI features
- ✅ Native 68000 code execution
- ✅ Automatic fallback to stubs

## Obtaining Library Files (Hybrid Mode Only)

**IMPORTANT:** Amiga library files are copyrighted. Obtain them legally:

### Option 1: Amiga Forever (Recommended)
- Purchase: [https://www.amigaforever.com/](https://www.amigaforever.com/)
- Includes licensed ROM and library files
- Extract from: `C:\Users\<user>\Documents\Amiga Files\System\`

### Option 2: Own an Amiga
- Extract from your own Amiga system
- Libraries located in `LIBS:` assign
- Transfer via floppy, serial, or network

### Option 3: WinUAE/UAE
- If you own Kickstart ROMs legally
- Mount Workbench.adf
- Extract from `LIBS:` directory

### Directory Setup

Place library files in a directory structure:

```
backend/amiga-libs/
├── dos.library          (NOT recommended - use stub instead)
├── exec.library         (NOT recommended - use stub instead)
├── graphics.library     ✅ Good candidate for native
├── intuition.library    ✅ Good candidate for native
├── diskfont.library     ✅ Optional
├── layers.library       ✅ Optional
├── gadtools.library     ✅ Optional
└── README.txt           (document versions/sources)
```

**IMPORTANT: Add `amiga-libs/` to `.gitignore` - DO NOT commit library files!**

## Which Libraries Should Be Native?

### ❌ Keep as Stubs (JavaScript)

**dos.library**
- Reason: Handles file I/O, needs to bridge to host filesystem
- Stub version: Redirects to Node.js fs module
- Native version: Would only access emulated filesystem

**exec.library**
- Reason: Memory management, needs to work with emulator
- Stub version: Allocates within emulator's memory space
- Native version: Would conflict with emulator's memory management

### ✅ Good Candidates for Native

**graphics.library**
- Reason: Complex drawing routines, exact behavior important
- Use case: Doors with ANSI graphics, color rendering

**intuition.library**
- Reason: GUI elements, window management
- Use case: Doors with menus, buttons, requesters

**diskfont.library**
- Reason: Font rendering
- Use case: Doors using custom fonts

## Testing Your Setup

### Test 1: Verify CPU Emulation
```bash
cd backend/src/amiga-emulation/test
npx tsx test-moira-basic.ts
```

Expected output:
```
✅ TEST PASSED: All basic tests passed
```

### Test 2: Verify Hunk Loading
```bash
npx tsx test-hunk-loader.ts
```

Expected output:
```
✅ TEST PASSED: Hunk file parsed correctly
```

### Test 3: Verify Library Stubs
```bash
npx tsx test-amigados-trap.ts
```

Expected output:
```
[AmigaDosEnvironment] Initialized (native libraries: disabled)
[dos.library] Output()
✅ TEST PASSED: Output matched expected
```

## Common Issues

### Issue: "Library not found"
```
⚠️  [exec.library] Native library not found, falling back to stub
```

**Solution:** This is normal! The system automatically falls back to JavaScript stubs. No action needed unless you specifically want native libraries.

### Issue: Door crashes with "Unknown library call"
```
[AmigaDOS] Unknown library call: offset=-342, base=0xFFFF2000
```

**Solution:** The door is calling a library function we haven't implemented yet. Options:
1. Implement the function as a stub (see: SUMMARY.md)
2. Load the native library file (see: NATIVE_LIBRARIES.md)

### Issue: Door expects library but gets NULL
```
⚠️  [exec.library] OpenLibrary: Unknown library "unknown.library" - returning NULL
```

**Solution:** The door needs a library we don't support. Options:
1. Add stub implementation (see: SUMMARY.md, section "Implementing Additional Libraries")
2. Obtain and load native library file

## Next Steps

1. **For Production BBS:**
   - Use stub mode (default)
   - Test with your specific doors
   - Add stubs for missing functions as needed

2. **For Advanced Compatibility:**
   - Obtain library files legally (Amiga Forever recommended)
   - Enable hybrid mode
   - Test native libraries with your doors

3. **For Development:**
   - Read: SUMMARY.md (complete system overview)
   - Read: NATIVE_LIBRARIES.md (native library guide)
   - Read: RESEARCH.md (Amiga door technical details)

## Performance Tips

- **Stub mode is faster** - No disk I/O, direct JavaScript execution
- **Native mode is more compatible** - Exact Amiga behavior, but slower
- **Hybrid is best** - Native for graphics, stubs for I/O

## API Reference

### AmigaDosEnvironment Constructor

```typescript
new AmigaDosEnvironment(
  emulator: MoiraEmulator,
  options?: {
    useNativeLibraries?: boolean,  // Default: false
    libraryPaths?: string[]        // Default: ['../amiga-libs', ...]
  }
)
```

### Methods

```typescript
// Set callback for door output
environment.setOutputCallback((data: string) => void)

// Send input to door
environment.queueInput(data: string)

// Get library loader (hybrid mode)
environment.getLibraryLoader(): LibraryLoader

// Check if native libraries enabled
environment.isUsingNativeLibraries(): boolean
```

## Support

- **Documentation:** See `backend/src/amiga-emulation/SUMMARY.md`
- **Native Libraries:** See `backend/src/amiga-emulation/NATIVE_LIBRARIES.md`
- **Research:** See `backend/src/amiga-emulation/RESEARCH.md`

## License Considerations

**Your Code:** MIT/Apache/whatever you choose
**Amiga Library Files:** Copyrighted by Commodore/Amiga Inc.
**Moira CPU Emulator:** GPL (Dirk W. Hoffmann)
**Your BBS:** Can use stubs freely, distribute freely

**Important:** If using native libraries, users must obtain them legally. Do not distribute library files with your BBS software.

---

**Ready to run Amiga doors in your BBS!** 🚀

**Default mode:** Works out of the box, no library files needed
**Hybrid mode:** For maximum compatibility when needed
