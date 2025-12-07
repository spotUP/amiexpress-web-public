# AquaScan FR (File Reverse) Debugging Session

## Problem Statement

AquaScan FR command showed "Reverse-scanning dir 1... Nothing found!" despite files existing in Conf2/Dir1.

## Root Causes Identified

### 1. Future Date Bug in AquaScan.Date.2

**Issue**: AquaScan.Date.2 contained "01-Jan-26 00:00:00" (January 1, 2026 - a FUTURE date)

**Effect**: All files dated December 5, 2025 appeared "old" to AquaScan's date comparison logic

**Fix Applied**:
```bash
echo "01-Jan-80 00:00:00" > doors/aquascan/AquaScan.Date.1
echo "01-Jan-80 00:00:00" > doors/aquascan/AquaScan.Date.2
```

**Verification**: Both files now contain "01-Jan-80 00:00:00"

### 2. Case-Insensitive File Lookups Missing in DosLibrary

**Issue**: AquaScan opens "DIR1" (uppercase) but actual file is "Dir1" (mixed case). On Unix filesystems, this causes file-not-found errors.

**Root Cause**: `DosLibrary.resolvePath()` method wasn't using the existing `findCaseInsensitive()` utility from `fs-amiga.util.ts`

**Fix Applied**: Added case-insensitive lookups in three locations in `web/backend/src/amiga-emulation/api/DosLibrary.ts`:

#### Location 1: PROGDIR: Device (lines 391-407)
```typescript
// Handle PROGDIR: device - door's own directory
if (amigaPath.toUpperCase().startsWith("PROGDIR:")) {
  const relativePath = amigaPath.substring(8);
  let resolved = path.join(this.doorDirectory, relativePath);

  // Amiga filesystems are case-insensitive
  const { findCaseInsensitive } = require('../../utils/fs-amiga.util');
  const dir = path.dirname(resolved);
  const file = path.basename(resolved);
  const caseInsensitivePath = findCaseInsensitive(dir, file);
  if (caseInsensitivePath) {
    resolved = caseInsensitivePath;
  }

  console.log(`[dos.library] PROGDIR: device -> ${resolved}`);
  return resolved;
}
```

#### Location 2: BBS: Device (lines 417-433)
```typescript
// Handle BBS: device - BBS system files
if (amigaPath.toUpperCase().startsWith("BBS:")) {
  const relativePath = amigaPath.substring(4);
  let resolved = path.join(this.bbsDataPath, relativePath);

  // Amiga filesystems are case-insensitive
  const { findCaseInsensitive } = require('../../utils/fs-amiga.util');
  const dir = path.dirname(resolved);
  const file = path.basename(resolved);
  const caseInsensitivePath = findCaseInsensitive(dir, file);
  if (caseInsensitivePath) {
    resolved = caseInsensitivePath;
  }

  console.log(`[dos.library] BBS: device -> ${resolved}`);
  return resolved;
}
```

#### Location 3: Relative Paths (lines 449-470)
```typescript
// Handle relative paths - resolve from current directory
let resolved = path.join(this.currentDirectory, amigaPath);

// Amiga filesystems are case-insensitive - try case-insensitive lookup
// This handles files like "Dir1" when code asks for "DIR1"
const { findCaseInsensitive } = require('../../utils/fs-amiga.util');
const dir = path.dirname(resolved);
const file = path.basename(resolved);
const caseInsensitivePath = findCaseInsensitive(dir, file);

if (caseInsensitivePath) {
  resolved = caseInsensitivePath;
  console.log(
    `[dos.library] Case-insensitive match: "${amigaPath}" -> ${resolved}`
  );
} else {
  console.log(
    `[dos.library] Relative path from ${this.currentDirectory} -> ${resolved}`
  );
}

return resolved;
```

## Testing Environment Verified

- ✓ NDIRS = 1 (Conf2 has 1 file directory configured)
- ✓ Dir1 file exists at `~/Code/amiexpress-web/Conf2/Dir1` (2731 bytes)
- ✓ Contains 4 valid file entries:
  - ors-sa11.lha P  72K  05-Dec-25
  - otl-st12.lha P  13K  05-Dec-25
  - ott_dms.lha  P   6K  05-Dec-25
  - MTH-RTW2.LHA P  20K  05-Dec-25
- ✓ All files dated "05-Dec-25" (today - December 5, 2025)
- ✓ AquaScan.Date.1 = "01-Jan-80 00:00:00" (past date)
- ✓ AquaScan.Date.2 = "01-Jan-80 00:00:00" (past date)

## Files Modified

1. `~/Code/amiexpress-web/doors/aquascan/AquaScan.Date.1` - Reset to 1980
2. `~/Code/amiexpress-web/doors/aquascan/AquaScan.Date.2` - Reset to 1980
3. `~/Code/amiexpress-web/web/backend/src/amiga-emulation/api/DosLibrary.ts` - Added case-insensitive lookups (lines 391-470)

## Expected Behavior After Fix

When user runs `FR` command in AquaScan:
1. AquaScan opens "Conf2/DIR1" (uppercase)
2. DosLibrary.resolvePath() performs case-insensitive lookup
3. Finds "Conf2/Dir1" (mixed case) successfully
4. AquaScan reads file entries
5. Compares file dates (05-Dec-25) with AquaScan.Date.2 (01-Jan-80)
6. Determines all files are "new" (after Jan 1, 1980)
7. Displays files in reverse chronological order

## Status

✅ **COMPLETE** - Both root causes fixed, ready for testing

## Next Steps

1. Start BBS servers: `./dev/scripts/start-servers.sh`
2. Log in to BBS
3. Run AquaScan door
4. Test FR command: should display 4 files from Conf2/Dir1
5. Check backend logs at `logs/backend.log` for case-insensitive match messages

## Notes

- The case-insensitive fix applies to ALL 68K Amiga doors, not just AquaScan
- Any door opening files with mismatched case will now work correctly
- This matches real Amiga filesystem behavior (case-preserving but case-insensitive)
