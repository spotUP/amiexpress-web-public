# AmigaFS Migration Status

## Overview

This document tracks the migration from Node.js `fs` module to the case-insensitive `amigafs` module for AmigaOS compatibility.

**Date**: 2025-12-17
**Goal**: Convert all synchronous fs operations to use amigafs for case-insensitive file matching

## Why This Migration is Critical

AmigaOS file systems are case-insensitive. Files like `AquaScan.EXE`, `aquascan.exe`, and `AQUASCAN.exe` all refer to the same file. The standard Node.js `fs` module is case-sensitive on macOS/Linux, causing bugs when accessing Amiga BBS data.

The `amigafs` module (`src/utils/amigafs.ts`) wraps all fs sync operations with case-insensitive matching.

## Completed Files (18 files)

### Root Level (1 file)
- [x] `src/database.ts` - Database initialization

### amiga-emulation Directory (16 files)
- [x] `src/amiga-emulation/xim/io.ts` - XIM I/O operations
- [x] `src/amiga-emulation/api/ExecLibrary.ts` - Exec.library emulation
- [x] `src/amiga-emulation/cpu/MoiraEmulator.ts` - CPU emulator
- [x] `src/amiga-emulation/api/LibraryTraps.ts` - Library trapping
- [x] `src/amiga-emulation/xim/system-commands.ts` - XIM system commands (14 fs calls)
- [x] `src/amiga-emulation/PythonDoorSession.ts` - Python door execution
- [x] `src/amiga-emulation/AREXXDoorSession.ts` - AREXX door execution
- [x] `src/amiga-emulation/doorHandler.ts` - Door session management
- [x] `src/amiga-emulation/KickstartRom.ts` - ROM loading
- [x] `src/amiga-emulation/loader/LibraryLoader.ts` - Library file loading
- [x] `src/amiga-emulation/DoorLogger.ts` - Per-door logging
- [x] `src/amiga-emulation/xim/debug-logger.ts` - XIM debug logging
- [x] `src/amiga-emulation/LibraryManager.ts` (already had amigafs)
- [x] `src/amiga-emulation/DoorLoader.ts` (already had amigafs)
- [x] `src/amiga-emulation/api/PathManager.ts` (already had amigafs)
- [x] `src/amiga-emulation/api/DosLibrary.ts` (already had amigafs)

### handlers Directory (already converted)
- [x] `src/handlers/command.handler.ts` (already had amigafs)
- [x] `src/handlers/screen.handler.ts` (already had amigafs)
- [x] `src/handlers/door.handler.ts` (already had amigafs)
- [x] `src/handlers/content/view-file.handler.ts` (already had amigafs)
- [x] `src/handlers/content/bulletin.handler.ts` (already had amigafs)
- [x] `src/handlers/commands/display-file-commands.handler.ts` (already had amigafs)
- [x] `src/handlers/file/file-listing.handler.ts` (already had amigafs)

### doors Directory (already converted)
- [x] `src/doors/amigaDoorManager.ts` (already had amigafs)
- [x] `src/doors/BBSApi.ts` (already had amigafs)
- [x] `src/doors/door-path.util.ts` (already had amigafs)

### utils Directory (already converted)
- [x] `src/utils/amigafs.ts` (the implementation itself)
- [x] `src/utils/amiga-command-parser.util.ts` (already had amigafs)
- [x] `src/utils/conference-tooltypes.util.ts` (already had amigafs)
- [x] `src/utils/dir-file-reader.util.ts` (already had amigafs)

### api Directory (already converted)
- [x] `src/api/batch-routes.ts` (already had amigafs)
- [x] `src/api/info-editor-routes.ts` (already had amigafs)

### services Directory (already converted)
- [x] `src/services/batch-scheduler.ts` (already had amigafs)

### amiga-emulation/api Directory (already converted)
- [x] `src/amiga-emulation/api/AmigaFileCache.ts` (already had amigafs)
- [x] `src/amiga-emulation/api/FileManager.ts` (already had amigafs)
- [x] `src/amiga-emulation/api/IconLibrary.ts` (already had amigafs)

## Remaining Files (~60 files)

### handlers Directory (~13 files)
- [ ] `src/handlers/command-handler/internal-commands.ts`
- [ ] `src/handlers/command-handler/command-execution.ts`
- [ ] `src/handlers/command-handler/menu.ts`
- [ ] `src/handlers/command-handler/core.ts`
- [ ] `src/handlers/file/download.handler.ts`
- [ ] `src/handlers/user/new-user.handler.ts`
- [ ] `src/handlers/commands/utility-commands.handler.ts`
- [ ] `src/handlers/commands/user-commands.handler.ts`
- [ ] `src/handlers/commands/transfer-misc-commands.handler.ts`
- [ ] `src/handlers/file/file-maintenance.handler.ts`
- [ ] `src/handlers/transfer/batch-download.handler.ts`
- [ ] `src/handlers/content/zippy-search.handler.ts`
- [ ] `src/handlers/admin/wizard.handler.ts`

### services Directory (~25 files)
- [ ] `src/services/UserFileManager.ts`
- [ ] `src/services/conference-setup.service.ts`
- [ ] `src/services/config.service.ts`
- [ ] `src/services/file-areas-loader.ts`
- [ ] `src/services/qwk.service.ts`
- [ ] `src/services/ymodem-transfer.service.ts`
- [ ] `src/services/xmodem-transfer.service.ts`
- [ ] `src/services/punter-transfer.service.ts`
- [ ] `src/services/zmodem-transfer.service.ts`
- [ ] `src/services/SessionLogManager.ts`
- [ ] `src/services/DoorDropFileManager.ts`
- [ ] `src/services/bbs-health-check.service.ts`
- [ ] `src/services/bbs-config-file.service.ts`
- [ ] `src/services/conf-config.service.ts`
- [ ] `src/services/ConferenceFileManager.ts`
- [ ] `src/services/MessageIndexManager.ts`
- [ ] `src/services/MessageFileManager.ts`
- [ ] `src/services/FileAreaManager.ts`
- [ ] `src/services/SequentialFileManager.ts`
- [ ] `src/services/NodeFileManager.ts`
- [ ] `src/services/SamiLogService.ts`
- [ ] `src/services/SamiLogRunner.ts`
- [ ] `src/services/mrc-client.ts`
- [ ] `src/services/import-validation.service.ts`
- [ ] `src/services/UserDatabaseManager.ts`
- [ ] `src/services/CallersLogManager.ts`

### utils Directory (~13 files)
- [ ] `src/utils/acs.util.ts`
- [ ] `src/utils/info-file.util.ts`
- [ ] `src/utils/iff-parser.util.ts`
- [ ] `src/utils/screen-security.util.ts`
- [ ] `src/utils/message-file.util.ts`
- [ ] `src/utils/petscii.util.ts`
- [ ] `src/utils/door-logging.util.ts`
- [ ] `src/utils/lastcallers-generator.ts`
- [ ] `src/utils/quicknew-generator.ts`
- [ ] `src/utils/max-dirs.util.ts`
- [ ] `src/utils/file-flag.util.ts`
- [ ] `src/utils/upload-notify.util.ts`
- [ ] `src/utils/download-logging.util.ts`
- [ ] `src/utils/shortcut.util.ts`
- [ ] `src/utils/ssh-key.util.ts`
- [ ] `src/utils/lzh-parser.ts`
- [ ] `src/utils/extractors/lzx-extractor.ts`

### doors Directory (~4 files)
- [ ] `src/doors/door-api-routes.ts`
- [ ] `src/doors/DoorManagerInfoEditor.ts`
- [ ] `src/doors/DoorManager.ts`
- [ ] `src/doors/client-door-bundler.ts`

### api Directory (~1 file)
- [ ] `src/api/deployment-routes.ts`

### server Directory (~6 files)
- [ ] `src/server/routes-setup.ts`
- [ ] `src/server/socket-handlers.ts`
- [ ] `src/server/initialization.ts`
- [ ] `src/server/file-socket-handlers.ts`
- [ ] `src/server/app.ts`
- [ ] `src/server/file-routes.ts`

### scripts Directory (~4 files)
- [ ] `src/scripts/run-amiga-door.ts`
- [ ] `src/scripts/info-editor.ts`
- [ ] `src/scripts/test-info-parser.ts`
- [ ] `src/scripts/debug-rtw.ts`

## Migration Pattern

For each file:

1. Add import (adjust path depth as needed):
   ```typescript
   import * as amigafs from '../utils/amigafs';
   ```

2. Replace fs calls with amigafs equivalents:
   - `fs.existsSync` → `amigafs.existsSync`
   - `fs.readFileSync` → `amigafs.readFileSync` (cast to `Buffer` or `string` if needed)
   - `fs.writeFileSync` → `amigafs.writeFileSync`
   - `fs.statSync` → `amigafs.statSync`
   - `fs.readdirSync` → `amigafs.readdirSync` (cast to `string[]` if needed)
   - `fs.mkdirSync` → `amigafs.mkdirSync`
   - `fs.unlinkSync` → `amigafs.unlinkSync`
   - `fs.appendFileSync` → `amigafs.appendFileSync`
   - `fs.rmdirSync` → `amigafs.rmdirSync`
   - `fs.renameSync` → `amigafs.renameSync`
   - `fs.copyFileSync` → `amigafs.copyFileSync`

3. Keep the original `fs` import (some code uses async operations or other fs methods)

4. Type assertions needed for:
   - `readFileSync`: Cast to `Buffer` or `string` depending on encoding
   - `readdirSync`: Cast to `string[]`

## Type Check Status

**Current Status**: ✅ PASSING

All converted files pass TypeScript type checking:
```bash
cd ~/Code/AmiExpress/amiexpress-web/web/backend
npx tsc --noEmit
```

Only pre-existing errors (unrelated to amigafs migration).

## Next Steps

1. **Complete remaining files**: Process the ~60 files listed above
2. **Test with mixed-case files**: Create test files with different casing and verify they work
3. **Run full test suite**: Ensure no regressions
4. **Document in CLAUDE.md**: Update the critical rules section if needed

## Script Helper

Run the helper script to identify files that still need conversion:
```bash
~/Code/AmiExpress/amiexpress-web/web/backend/scripts/migrate-to-amigafs.sh
```

## Reference

- **amigafs implementation**: `src/utils/amigafs.ts`
- **Migration guide**: `Documentation/3-Developers/AMIGAFS_MIGRATION.md`
- **CLAUDE.md rules**: Search for "AMIGAOS IS CASE-INSENSITIVE"
