# AmigaFS Migration Guide

## Problem

AmigaOS is **case-insensitive** - `AquaScan.EXE`, `aquascan.exe`, and `AQUASCAN.exe` all refer to the same file.

macOS/Linux are **case-sensitive** by default, causing bugs where doors/files can't be found due to case mismatches.

## Solution

Use `amigafs` module instead of Node.js `fs` module for ALL file operations in BBS code.

## Quick Migration

### Before (WRONG)
```typescript
import * as fs from 'fs';

if (fs.existsSync('/Doors/aquascan/AquaScan.000')) {
  const data = fs.readFileSync('/Doors/aquascan/AquaScan.000');
}
```

### After (CORRECT)
```typescript
import * as amigafs from '../utils/amigafs';

if (amigafs.existsSync('/Doors/aquascan/AquaScan.000')) {
  const data = amigafs.readFileSync('/Doors/aquascan/AquaScan.000');
}
```

## Supported Operations

**ALL** standard fs sync operations are supported with complete case-insensitivity:

### File Operations
- `existsSync(path)` - Check if file/directory exists
- `readFileSync(path, encoding?)` - Read file contents
- `writeFileSync(path, data, options?)` - Write file
- `appendFileSync(path, data, options?)` - Append to file
- `unlinkSync(path)` - Delete file
- `openSync(path, flags, mode?)` - Open file and return file descriptor
- `truncateSync(path, len?)` - Truncate file to specified length
- `chmodSync(path, mode)` - Change file permissions
- `utimesSync(path, atime, mtime)` - Change file timestamps

### Directory Operations
- `readdirSync(path)` - List directory contents
- `mkdirSync(path, options?)` - Create directory
- `rmdirSync(path, options?)` - Remove directory
- `rmSync(path, options?)` - Remove files/directories (modern API)

### File Stats
- `statSync(path)` - Get file stats
- `lstatSync(path)` - Get link stats
- `accessSync(path, mode?)` - Check file permissions

### Path Operations
- `renameSync(oldPath, newPath)` - Rename/move file
- `copyFileSync(src, dest, flags?)` - Copy file
- `realpathSync(path)` - Resolve real path
- `linkSync(existingPath, newPath)` - Create hard link
- `symlinkSync(target, linkPath, type?)` - Create symbolic link
- `readlinkSync(linkPath, options?)` - Read symbolic link target

### Important Notes
- **Every character** in the path is case-insensitive
- `aMiGa.eXe`, `AMIGA.exe`, `amiga.EXE` all resolve to the same file
- Works for ALL path components: directories, filenames, and extensions

## Migration Steps

1. **Find all fs imports**:
   ```bash
   grep -r "import.*from 'fs'" web/backend/src --include="*.ts"
   grep -r "require('fs')" web/backend/src --include="*.ts"
   ```

2. **Replace imports**:
   ```typescript
   // Old
   import * as fs from 'fs';

   // New
   import * as amigafs from '../utils/amigafs';
   import * as fs from 'fs'; // Keep for non-BBS operations if needed
   ```

3. **Replace calls**:
   ```bash
   # Use sed or manual replacement
   # Replace fs.existsSync → amigafs.existsSync
   # Replace fs.readFileSync → amigafs.readFileSync
   # etc.
   ```

4. **Test thoroughly**:
   - Test with lowercase paths: `aquascan.exe`
   - Test with uppercase paths: `AQUASCAN.EXE`
   - Test with mixed case: `AquaScan.EXE`
   - All should work identically

## When NOT to Use AmigaFS

- Operations on system paths outside BBS root (e.g., `/tmp`, `/var`)
- Operations where exact case must be preserved
- Performance-critical code where case-sensitivity is guaranteed

## Priority Areas for Migration

### HIGH PRIORITY (breaks doors)
1. `/web/backend/src/doors/` - Door loading and management
2. `/web/backend/src/amiga-emulation/api/` - AmigaDOS emulation
3. `/web/backend/src/handlers/` - Command handlers

### MEDIUM PRIORITY (breaks features)
4. `/web/backend/src/services/` - BBS services
5. `/web/backend/src/utils/` - Utility modules

### LOW PRIORITY (cosmetic)
6. `/web/backend/src/database/` - Database operations
7. `/web/backend/src/server/` - Server setup

## Testing

After migration, test these scenarios:

```bash
# Test case-insensitive door loading
echo "Testing with lowercase..."
# Rename Doors/AquaScan to Doors/aquascan
# Run: AquaScan door should still work

echo "Testing with uppercase..."
# Rename to Doors/AQUASCAN
# Run: AquaScan door should still work

echo "Testing with mixed case..."
# Rename to Doors/AqUaScAn
# Run: AquaScan door should still work
```

## Implementation Status

- [x] Created amigafs.ts module (2024-12-05)
- [ ] Migrate door loading code
- [ ] Migrate AmigaDOS emulation
- [ ] Migrate command handlers
- [ ] Migrate all remaining fs calls
- [ ] Add automated tests for case-insensitivity

## See Also

- `web/backend/src/utils/amigafs.ts` - Main module
- `web/backend/src/utils/fs-amiga.util.js` - Legacy utilities (being replaced)
- `CLAUDE.md` - Development guidelines
