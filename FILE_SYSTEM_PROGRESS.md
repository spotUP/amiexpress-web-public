# AmiExpress File System Implementation Progress

## Latest Session: 2025-10-23 (Session 2)

## Overview
Implementing the complete file system for AmiExpress BBS, following the 1:1 port methodology from the original express.e source code. The goal is to implement file listing, flagging, and download functionality to complete the upload-to-download user story.

## Implementation Status

### ✅ Completed (10/14 items)

#### 1. DIR File Reading and Parsing
**File:** `backend/backend/src/utils/dir-file-reader.util.ts`
**Port from:** express.e:27626+ (displayFileList, displayIt, displayIt2)

**Implementation:**
- `isNewFileEntry()` - Detects file entry start lines (filename + status marker)
- `parseDirEntry()` - Parses complete file entry with multi-line descriptions
- `parseDirFile()` - Reads entire DIR file and returns array of entries
- `readDirFile()` - Async function to read DIR file from disk
- `getDirFilePath()` / `getHoldDirFilePath()` - Path helpers

**Format Supported:**
```
filename     P  123K  23-Oct-25  description line 1
                                 description line 2 (33-space indent)
                                 Sent by: username
```

**Status Markers:**
- P = Passed (integrity test passed)
- F = Failed (integrity test failed)
- N = Not tested
- D = Duplicate

#### 2. Directory Range Parsing (getDirSpan)
**File:** `backend/backend/src/utils/dir-span.util.ts`
**Port from:** express.e:26857+ (getDirSpan function)

**Implementation:**
- `parseDirSpan()` - Parse user directory input
- `getDirSpanPrompt()` - Generate security-aware prompt
- `getDirDisplayName()` - Format directory names for display
- `isValidDirNum()` - Validate directory numbers

**Supported Input:**
- `U` - Upload directory only (maxDirs)
- `A` - All directories (1 to maxDirs)
- `H` - HOLD directory (requires permission)
- `L` - LCFILES directory
- `#` - Specific directory number
- (Future: `1-5` for ranges)

#### 3. File Flagging System
**File:** `backend/backend/src/utils/file-flag.util.ts`
**Port from:** express.e:2713-2858, 12486-12600 (flagFiles, addFlagItem, clearFlagItems, etc.)

**Implementation:**
- `FileFlagManager` class - Complete flag management
- `addFlag()` / `addFlags()` - Add files to flag list
- `removeFlag()` - Remove specific files
- `clearAll()` - Clear all flags
- `isFlagged()` - Check if file is flagged
- `getAll()` / `getForConference()` - Retrieve flagged files
- `load()` / `save()` - Persistent storage

**Storage Format:**
```
# File: BBS/Partdownload/flagged{slotNumber}
confNum filename
confNum filename
...
```

**Helper Functions:**
- `getShowFlagsMessage()` - Display flagged files
- `getFlagFilesPrompt()` - Interactive flag prompt
- `getClearFlagsPrompt()` - Clear flags prompt
- `getFlagFromPrompt()` - Flag from specific file onwards

#### 4. Core File Listing Function (displayFileList)
**File:** `backend/backend/src/handlers/file-listing.handler.ts`
**Port from:** express.e:27626+ (displayFileList main function)

**Implementation:**
- `FileListingHandler` class with static methods
- `handleFileList()` - Main entry point for F/FR commands
- `handleFileListDirInput()` - Handle directory input continuation
- `displayFileListForDirSpan()` - Display files for directory range
- `displayFileEntry()` - Display single file entry
- `getMaxDirs()` - Determine max directories in conference
- `canAccessHold()` - Security check for HOLD directory

**Features:**
- Reads DIR files (DIR1, DIR2, etc.) from conference directories
- Supports forward and reverse listing
- Non-stop mode support (NS parameter)
- Displays status markers with entries
- Multi-line description support
- Conference-scoped file areas

**Flow:**
1. Parse parameters (directory range, NS flag)
2. Prompt for directory if not specified
3. Loop through directories (forward or reverse)
4. Read DIR file for each directory
5. Display entries with status markers
6. Support pause/continue between pages

#### 5. F and FR Commands Integration
**Files Modified:**
- `backend/backend/src/handlers/display-file-commands.handler.ts`
- `backend/backend/src/handlers/command.handler.ts`
- `backend/backend/src/constants/bbs-states.ts`

**Implementation:**
- Modified `handleFileListCommand()` - F command handler
- Modified `handleFileListRawCommand()` - FR command handler
- Added `FILE_LIST_DIR_INPUT` state for directory selection
- Integrated FileListingHandler into command processing
- Security checking via ACS_FILE_LISTINGS permission

**Command Flow:**
```
User: F
System: Prompt for directory selection
User: A (all) / U (upload) / # (specific)
System: Display file listings
System: Return to menu
```

#### 6. FS Command - File Statistics ✅
**File:** `backend/backend/src/handlers/file-status.handler.ts` (187 lines)
**Port from:** express.e:24872-24875, 24141-24250
**Completed:** Session 2 (2025-10-23)

**Implementation:**
- Displays upload/download statistics per conference
- Shows file counts, byte totals, available quota
- Library ratio display (X:1 format)
- Conference highlighting
- Security checking (ACS_CONFERENCE_ACCOUNTING)

**Note:** FS shows file STATISTICS, not flagged files (common confusion)

#### 7. A Command - Alter Flags (Interactive) ✅
**File:** `backend/backend/src/handlers/alter-flags.handler.ts` (258 lines)
**Port from:** express.e:24601-24605, 12648-12664, 12594-12645
**Completed:** Session 2 (2025-10-23)

**Implementation:**
- Interactive flag management with state machine
- Commands: C (clear), F (flag from), <filename>, <Enter>
- Uses FileFlagManager for persistence
- Multi-state input handling
- Shows flagged files before each prompt

#### 8. D Command - Download Single File ✅
**File:** `backend/backend/src/handlers/download.handler.ts` (370 lines)
**Port from:** express.e:24853, 19791, 20075+
**Completed:** Session 3 (2025-10-23)

**Implementation:**
- handleDownloadCommand() - D command entry point (express.e:24853)
- beginDLF() - Begin download flow (express.e:19791)
- downloadAFile() - Main download logic (express.e:20075)
- Interactive filename prompting with state machine
- File validation (path separators, wildcards)
- Conference directory searching (DIR1-DIR20)
- Ratio checking (upload/download limits) - express.e:19825
- Download confirmation prompt
- HTTP download link generation for web context
- Download statistics tracking - express.e:9475

**Web Context Adaptation:**
- Uses HTTP downloads instead of Zmodem/Xmodem
- Generates /api/download/{conf}/{dir}/{filename} URLs
- Emits Socket.io 'download-file' event
- Preserves all express.e validation and security logic

#### 9. V Command - View File Content ✅
**File:** `backend/backend/src/handlers/view-file.handler.ts` (329 lines)
**Port from:** express.e:25675, 20388
**Completed:** Session 3 (2025-10-23)

**Implementation:**
- handleViewFileCommand() - V command entry point (express.e:25675)
- viewAFile() - Main viewing logic (express.e:20388)
- displayFile() - File content display with validation
- displayLineWithWrapping() - Line wrapping at 79 characters (express.e:20492-20516)
- Interactive filename prompting with state machine
- File validation (no special symbols: : / * @ \\)
- Binary file detection (first 3 bytes > 128) - express.e:20486-20491
- Restricted file blocking (security enhancement)
- Conference directory searching (DIR1-DIR20)
- NS (non-stop) parameter support

**Security Features:**
- Rejects files with path separators (: / \\)
- Blocks wildcard characters (* @)
- Detects binary files (rejects non-text)
- Blocks restricted paths (/etc/, passwd, .env, .conf)
- Logs security violations to callerslog

**Line Wrapping:**
- Wraps lines at 79 characters (express.e standard)
- Preserves short lines (<80 chars)
- Handles CR characters correctly

#### 10. Z Command - Zippy Text Search ✅
**File:** `backend/backend/src/handlers/zippy-search.handler.ts` (264 lines)
**Port from:** express.e:26123, 27529
**Completed:** Session 3 (2025-10-23)

**Implementation:**
- handleZippySearchCommand() - Z command entry point (express.e:26123)
- performSearch() - Search orchestration (express.e:26159-26209)
- zippy() - Core search function (express.e:27529-27625)
- Interactive search string prompting with state machine
- Directory range selection (A/U/H/number)
- Case-insensitive search across DIR files
- Complete file entry display for matches
- Uses isNewFileEntry() for boundary detection

**Search Algorithm:**
1. Read DIR file line by line
2. Detect new file entries with isNewFileEntry()
3. Collect all lines of current entry
4. Check each line for search string (case-insensitive)
5. If match found, display entire entry
6. Continue to next entry

**Features:**
- Interactive search string prompting
- Directory range support (A=all, U=upload, H=hold, #=specific)
- NS (non-stop) parameter support
- Case-insensitive matching (converts to uppercase)
- Displays complete file entries (filename + all description lines)
- Searches through all specified DIR files in conference

### 📋 Remaining Items (4/14)

**Note:** Items for downloadFile(), beginDLF(), protocol selection, and download statistics tracking are implemented as part of the D command (Item 8).

#### 11. Batch Download - Download All Flagged Files
**Port from:** express.e:26215+
**Features:** Download all flagged files in sequence

#### 12. File Area Navigation
**Features:** Switch between different file areas/conferences

#### 13. File Time Credit
**Features:** Give time credits for uploads

#### 14. File Area Scanning
**Features:** Show new files since last visit

## Technical Architecture

### Utility Modules Created

1. **dir-file-reader.util.ts** (226 lines)
   - Classic BBS DIR file parsing
   - Multi-line description handling
   - Status marker parsing
   - Date/size formatting

2. **dir-span.util.ts** (125 lines)
   - Directory range parsing
   - Security-aware prompts
   - Validation and display helpers

3. **file-flag.util.ts** (296 lines)
   - Complete flag management system
   - Persistent storage
   - Conference-scoped flags
   - Interactive prompts

### Handler Modules

1. **file-listing.handler.ts** (225 lines)
   - Core file listing logic
   - State machine for directory input
   - DIR file reading and display
   - Forward/reverse listing support

### Modified Files

1. **constants/bbs-states.ts**
   - Added `FILE_LIST_DIR_INPUT` state

2. **handlers/display-file-commands.handler.ts**
   - Integrated FileListingHandler
   - Updated F and FR command handlers

3. **handlers/command.handler.ts**
   - Added FILE_LIST_DIR_INPUT state handler
   - Fixed indentation issues
   - Cleaned up old FILE_LIST references

## Express.e Source Analysis

### Key Functions Analyzed

1. **displayFileList()** - Line 27626
   - Main file listing loop
   - Directory span handling
   - Forward/reverse support

2. **getDirSpan()** - Line 26857
   - Interactive directory selection
   - Range parsing
   - Security checking

3. **flagFiles()** - Line 12594
   - Interactive flag management
   - F (from), C (clear) options
   - Wildcard support

4. **addFlagItem()** - Line 2713
   - Add single file to flag list
   - Conference number tracking

5. **clearFlagItems()** - Line 2745
   - Clear all flagged files
   - Memory cleanup

6. **loadFlagged()** - Line 2765
   - Load flags from disk
   - Partdownload directory

7. **saveFlagged()** - Line 2795
   - Save flags to disk
   - Auto-save on disconnect

8. **showFlaggedFiles()** - Line 2830
   - Display flagged file list
   - Length limiting

## Database Integration

### Current Approach
- **DIR Files** - Primary source (1:1 with express.e)
- **Database** - Used for user tracking, not file listings
- **File Entries** - Read from conference DIR files

### Conference Structure
```
BBS/
  Conf01/
    DIR1        - Directory 1 files
    DIR2        - Directory 2 files
    ...
    HOLD/
      held      - Failed/held files
  Conf02/
    ...
```

## User Story: Upload → List → Flag → Download

### Current Progress

✅ **Upload** (Previously completed)
- Batch upload support
- FILE_ID.DIZ extraction
- Integrity testing
- DIR file writing
- Status markers (P/F/N/D)

✅ **List** (This session)
- F command - List files
- FR command - Reverse list
- DIR file reading
- Status marker display
- Multi-line descriptions

✅ **Flag** (This session - utilities ready)
- Flag files during listing
- Clear flags
- View flagged files (FS command - in progress)

⏳ **Download** (Next session)
- D command - Download single file
- Batch download flagged files
- Protocol selection
- Ratio checking
- Statistics tracking

## Testing Status

### ✅ Backend Compilation
- All TypeScript files compile successfully
- No syntax errors
- Server starts without errors

### ⏳ Manual Testing Needed
- F command with various directory inputs
- FR command (reverse listing)
- DIR file reading with actual uploaded files
- Flag management commands
- State transitions

## Next Steps

### Immediate (Next Session)

1. **Complete FS Command** (Item 6)
   - Read express.e:24872-24875, 24141+
   - Implement fileStatus display
   - Show all flagged files with details

2. **Implement D Command** (Item 7)
   - Read express.e:24853, 14957+
   - Parse filename parameter
   - Validate file exists
   - Initiate download

3. **Create Download Handler** (Item 8)
   - Core download logic
   - File path resolution
   - Protocol setup
   - Error handling

4. **Manual Testing**
   - Test F command in live BBS
   - Verify DIR file reading
   - Test flag operations
   - Check state transitions

### Medium Term

1. **Complete Download Flow** (Items 9-11)
   - beginDLF() function
   - Protocol selection menu
   - Statistics tracking
   - Ratio checking

2. **Additional Commands** (Items 12-13)
   - V command (view files)
   - Z command (search)

3. **Batch Operations** (Item 14)
   - Download all flagged files
   - Progress tracking

### Long Term

1. **Advanced Features** (Items 15-19)
   - File area navigation
   - Ratio enforcement
   - Time credits
   - New file scanning

## Code Quality

### Adherence to 1:1 Port Methodology

✅ **Always checked express.e first**
- Every function has express.e line reference
- Comments reference original implementation
- Logic flow matches original

✅ **No assumptions made**
- Read original code before implementing
- Followed exact behavior
- Preserved command names and parameters

✅ **Documentation**
- Each file has header with express.e references
- Functions documented with source line numbers
- Comments explain express.e equivalents

### TypeScript Best Practices

✅ **Modular Architecture**
- Utilities separated from handlers
- Single responsibility principle
- Reusable components

✅ **Type Safety**
- Interfaces for all data structures
- Proper async/await usage
- Error handling

✅ **Code Organization**
- Clear file naming
- Logical directory structure
- Import organization

## Files Created/Modified

### New Files (3)
```
backend/backend/src/utils/dir-file-reader.util.ts      (226 lines)
backend/backend/src/utils/dir-span.util.ts              (125 lines)
backend/backend/src/utils/file-flag.util.ts             (296 lines)
backend/backend/src/handlers/file-listing.handler.ts    (225 lines)
```

### Modified Files (3)
```
backend/backend/src/constants/bbs-states.ts             (1 line added)
backend/backend/src/handlers/display-file-commands.handler.ts  (8 lines modified)
backend/backend/src/handlers/command.handler.ts         (20 lines modified)
```

### Total Lines Added: ~872 lines
### Total Lines Modified: ~29 lines

## Commit Message

```
feat: Implement AmiExpress file listing and flagging system (Items 1-5)

1:1 port from express.e sources for file system operations.

NEW FEATURES:
- F command: List files from conference directories
- FR command: Reverse file listing
- DIR file reading: Parse classic BBS DIR files
- File flagging: Mark files for batch download
- Directory range parsing: U/A/H/# support

NEW FILES:
- dir-file-reader.util.ts: Parse DIR1, DIR2 files (express.e:27626+)
- dir-span.util.ts: getDirSpan() port (express.e:26857+)
- file-flag.util.ts: Flag system (express.e:2713-2858)
- file-listing.handler.ts: displayFileList() port (express.e:27626+)

MODIFIED:
- bbs-states.ts: Add FILE_LIST_DIR_INPUT state
- display-file-commands.handler.ts: Integrate FileListingHandler
- command.handler.ts: Add FILE_LIST_DIR_INPUT handler

STATUS MARKERS: P=Passed, F=Failed, N=Not tested, D=Duplicate

NEXT: FS command (Flag Scan), D command (Download)

Ref: express.e:24877-24889, 26857+, 27626+
Progress: 5/18 file system items completed
```

## Reference Materials

### Express.e Line Numbers
- File commands: 24853-26220
- displayFileList: 27626-27900
- getDirSpan: 26857-27000
- flagFiles: 12594-12750
- addFlagItem: 2713+
- clearFlagItems: 2745+
- loadFlagged: 2765+
- saveFlagged: 2795+
- showFlaggedFiles: 2830+

### Key Concepts
- DIR files: Pre-formatted file listings
- Status markers: P/F/N/D integrity indicators
- Flagging: Mark files for batch download
- Conference structure: BBS/Conf##/DIR#
- Directory spanning: U/A/H/# range selection

---

**Latest Update:** Session 3 (2025-10-23) - Implemented D command (download single file), V command (view file content), and Z command (Zippy text search). D command includes full ratio checking and HTTP download links. V command includes binary file detection, restricted path blocking, and 79-character line wrapping. Z command provides case-insensitive search across DIR files with complete entry display. 10/14 items completed (71% complete). Backend compiles and runs successfully. Ready for manual testing.
