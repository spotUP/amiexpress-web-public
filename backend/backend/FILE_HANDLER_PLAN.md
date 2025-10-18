# File Operations Handler - Extraction Plan

## Overview
The file operations code in `index.ts` consists of 14 functions totaling ~1,100 lines. This document outlines the extraction strategy.

## Challenges

### Global State Dependencies
```typescript
// Current global arrays accessed by file functions:
let fileEntries: any[] = [];  // Line 2815
let fileAreas: any[] = [];    // Line 2814
let conferences: any[] = [];  // Line 2812
```

All file functions directly access these globals. Refactoring requires either:
1. **Pass as parameters** - Simple but verbose
2. **Service class with state** - Clean but requires state management
3. **Dependency injection** - Best practice, more refactoring

### Session State Mutations
Many functions directly modify `session.subState`, `session.tempData`, `session.menuPause`. The handler must maintain this behavior.

### Socket.IO Direct Emission
Functions emit ANSI directly: `socket.emit('ansi-output', ...)`. Should be refactored to use `AnsiUtil` but maintaining compatibility is critical.

## Recommended Approach

### Phase 1: Create FileService
```typescript
// services/file.service.ts
export class FileService {
  constructor(
    private fileAreas: any[],
    private fileEntries: any[],
    private conferences: any[]
  ) {}

  // Pure business logic - no socket/session coupling
  getFilesInArea(areaId: number): any[] {
    return this.fileEntries.filter(f => f.areaId === areaId);
  }

  getFileAreasByConference(confId: number): any[] {
    return this.fileAreas.filter(a => a.conferenceId === confId);
  }

  searchFiles(query: string): any[] {
    // File search logic
  }

  // ... other business logic methods
}
```

### Phase 2: Create FileHandler
```typescript
// handlers/file.handler.ts
export class FileHandler {
  constructor(
    private db: Database,
    private fileService: FileService
  ) {}

  // Display methods - handle socket emission
  displayFileAreaContents(socket: any, session: BBSSession, area: any) {
    const files = this.fileService.getFilesInArea(area.id);

    socket.emit('ansi-output', AnsiUtil.clearScreen());
    socket.emit('ansi-output', AnsiUtil.headerBox(area.name));
    // ... rest of display logic using AnsiUtil
  }

  // ... 13 more methods
}
```

### Phase 3: Update index.ts
```typescript
// In index.ts after initializeData()
const fileService = new FileService(fileAreas, fileEntries, conferences);
const fileHandler = new FileHandler(db, fileService);

// Replace function calls
// Before:
displayFileAreaContents(socket, session, area);

// After:
fileHandler.displayFileAreaContents(socket, session, area);
```

## Function Inventory

### Display Functions (8 functions)
1. `displayFileAreaContents` - Lines 319-349 (30 lines)
   - Shows files in a specific area
   - Formats DIR-style listing
   - Transitions to FILE_LIST state

2. `displayFileList` - Lines 352-424 (72 lines)
   - Main file listing function
   - Parses params (NS, R flags)
   - Shows all file areas

3. `displayDirectorySelectionPrompt` - Lines 425-431 (6 lines)
   - Shows directory selection prompt
   - Transitions to FILE_DIR_SELECT state

4. `displaySelectedFileAreas` - Lines 432-459 (27 lines)
   - Displays file areas in a range
   - Handles reverse and non-stop modes

5. `displayFileMaintenance` - Lines 460-495 (35 lines)
   - Shows file maintenance menu
   - For sysops only (secLevel >= 100)

6. `displayFileStatus` - Lines 770-824 (54 lines)
   - Shows file statistics
   - Total files, sizes, upload counts

7. `displayNewFiles` - Lines 825-881 (56 lines)
   - Shows files since a date
   - Parses date from params

8. `displayNewFilesInDirectories` - Lines 882-1366 (484 lines!)
   - Most complex function
   - Paginates through directories
   - Shows new files with descriptions
   - Handles download prompts

### Action Functions (6 functions)
9. `handleFileDelete` - Lines 496-588 (92 lines)
   - Validates permissions (secLevel >= 100)
   - Parses file area number
   - Lists files for deletion
   - Transitions to FILE_DELETE state

10. `handleFileMove` - Lines 589-674 (85 lines)
    - Validates permissions
    - Shows files to move
    - Prompts for destination
    - Transitions to FILE_MOVE state

11. `handleFileSearch` - Lines 675-769 (94 lines)
    - Searches file names/descriptions
    - Case-insensitive matching
    - Shows results with area info

12. `handleFileDownload` - Lines 1367-1419 (52 lines)
    - Validates file exists
    - Creates download session
    - Uses protocol manager

13. `handleFileDeleteConfirmation` - Lines 3060-3109 (49 lines)
    - Processes delete confirmation
    - Parses file numbers or "ALL"
    - Deletes from database
    - Updates fileEntries array

14. `handleFileMoveConfirmation` - Lines 3110-3192 (82 lines)
    - Processes move confirmation
    - Validates destination area
    - Updates database
    - Updates fileEntries array

## Dependencies to Extract First

### 1. ParamsUtil ✅ CREATED
```typescript
// utils/params.util.ts
export class ParamsUtil {
  static parse(paramString: string): string[]
  static hasFlag(params: string[], flag: string): boolean
  static extractRange(params: string[]): { start: number; end: number } | null
  static extractNumber(params: string[]): number | null
  static extractDate(params: string[]): Date | null
}
```

### 2. FilePermissions Util
```typescript
// utils/permissions.util.ts
export class PermissionsUtil {
  static canDeleteFiles(user: any): boolean {
    return user.secLevel >= 100;
  }

  static canMoveFiles(user: any): boolean {
    return user.secLevel >= 100;
  }

  static canAccessFileMaintenance(user: any): boolean {
    return user.secLevel >= 100;
  }
}
```

## Testing Strategy

1. **Before extraction:** Document current behavior
   - Test file listing (L command)
   - Test new files (N command)
   - Test file search (S command)
   - Test file maintenance (sysop only)

2. **During extraction:** Incremental testing
   - Extract one function at a time
   - Test after each extraction
   - Verify state transitions work

3. **After extraction:** Regression testing
   - All file commands work
   - State machine intact
   - No global variable issues

## Estimated Impact

**Lines Reduced from index.ts:** ~1,100 lines (30%)

**New Files Created:**
- `utils/params.util.ts` (95 lines) ✅ DONE
- `utils/permissions.util.ts` (30 lines)
- `services/file.service.ts` (200 lines)
- `handlers/file.handler.ts` (900 lines)

**Benefits:**
- File operations testable in isolation
- Business logic separated from presentation
- Reusable ParamsUtil for other commands
- Permission checks centralized

## Risk Assessment

**HIGH RISK AREAS:**
1. `displayNewFilesInDirectories` (484 lines, very complex)
2. Global state management (fileEntries mutations)
3. State transitions between FILE_* substates

**MITIGATION:**
- Extract simpler functions first
- Keep integration tests running
- Maintain backward compatibility
- Document any behavior changes

## Timeline Estimate

- Phase 1 (FileService): 2-3 hours
- Phase 2 (FileHandler): 4-5 hours
- Phase 3 (Integration): 1-2 hours
- Testing & fixes: 2-3 hours

**Total: 9-13 hours** of focused development time

## Next Steps

1. ✅ Create ParamsUtil (DONE)
2. Create PermissionsUtil
3. Extract FileService business logic
4. Create FileHandler with display methods
5. Update index.ts to use handler
6. Test thoroughly
7. Document any changes

---

**Status:** ParamsUtil created, ready for Phase 1
**Last Updated:** 2025-10-18
