# AmiExpress-Web Implementation Roadmap

**Project Status**: ~50-55% Complete (1:1 Port from AmigaOS AmiExpress)

This document tracks ALL missing features from the original express.e sources (32,248 lines) and organizes them into phased implementation plans.

---

## Table of Contents

1. [Current Status Summary](#current-status-summary)
2. [Phase 1: Critical Foundation (BLOCKING)](#phase-1-critical-foundation-blocking)
3. [Phase 2: Core BBS Features (HIGH PRIORITY)](#phase-2-core-bbs-features-high-priority)
4. [Phase 3: Enhanced User Experience (MEDIUM PRIORITY)](#phase-3-enhanced-user-experience-medium-priority)
5. [Phase 4: Classic BBS Authenticity (NICE TO HAVE)](#phase-4-classic-bbs-authenticity-nice-to-have)
6. [Phase 5: Advanced Features (OPTIONAL)](#phase-5-advanced-features-optional)
7. [Reference: Complete Feature Matrix](#reference-complete-feature-matrix)

---

## Current Status Summary

### By Category Completion:
- **Internal Commands**: 65-75% (35/52 implemented)
- **MCI Codes**: 70-75% (45/60 implemented)
- **Door System**: 40-50% (basic doors work, XIM protocol incomplete)
- **File Transfers**: 0% (HTTP replaces legacy protocols - not needed)
- **Conference System**: 60% (basic features work, navigation missing)
- **Message System**: 40-50% (basic read/write, editor incomplete)
- **File Areas**: 50-60% (listings work, batch operations incomplete)
- **User Management**: 30-40% (login works, editor missing)
- **Sysop Commands**: 30-40% (critical commands 0-5 missing)
- **Multi-Node**: 40-50% (basic messaging, chat incomplete)
- **Advanced Features**: 30-40% (voting booth, zoo mail need verification)

### Overall Project: 50-55% Complete

---

## Phase 1: Critical Foundation (BLOCKING)

**Status**: NOT STARTED
**Priority**: CRITICAL - These block basic BBS operation
**Estimated Effort**: 40-60 hours

### 1.1 Sysop Commands (Commands 0-5)

**Why Critical**: Without these, sysops cannot manage the BBS remotely.

#### Command 0: Remote Shell
- **express.e**: Lines 24424-24451
- **Implementation**: Create secure shell command handler
- **Features**:
  - Execute AmigaDOS commands remotely
  - Security level check (must be sysop)
  - Command output capture
  - Timeout protection
- **Handler File**: `src/handlers/sysop-commands.handler.ts`

#### Command 1: Account Editing
- **express.e**: Lines 24453-24459
- **Implementation**: Full user account editor
- **Features**:
  - Edit user security level
  - Edit user flags/keys
  - Edit user limits (time, download, upload)
  - Edit conference access
  - Edit user info (name, location, phone)
  - User search by name/number
  - User deletion
- **Handler File**: `src/handlers/user-editor.handler.ts`
- **UI File**: `src/handlers/user-editor-ui.handler.ts`

#### Command 2: View Callers Log
- **express.e**: Lines 24461-24509
- **Implementation**: Callers log viewer
- **Features**:
  - View today's calls
  - View date range
  - View by user
  - View by node
  - Export to file
- **Handler File**: `src/handlers/callers-log.handler.ts`

#### Command 3: Edit Directory Files
- **express.e**: Lines 24511-24515
- **Implementation**: BBS directory file editor
- **Features**:
  - Edit message base directories
  - Edit file area directories
  - Edit conference directories
  - Create new directories
- **Handler File**: `src/handlers/directory-editor.handler.ts`

#### Command 4: Edit Any File
- **express.e**: Lines 24517-24521
- **Implementation**: General file editor
- **Features**:
  - Edit text files
  - View binary files (hex dump)
  - File browser
  - Security checks
- **Handler File**: `src/handlers/file-editor.handler.ts`

#### Command 5: Directory Listing
- **express.e**: Lines 24523-24527
- **Implementation**: File system browser
- **Features**:
  - List directory contents
  - Change directories
  - File information
  - Pattern matching
- **Handler File**: `src/handlers/directory-listing.handler.ts`

### 1.2 Conference Navigation Commands

**Why Critical**: Essential for user navigation, these are muscle memory for AmiExpress users.

#### Command <: Previous Conference
- **express.e**: Lines 24529-24546
- **Implementation**: Switch to previous conference in list
- **Features**:
  - Wrap around to last conference
  - Check conference access
  - Display conference bulletin
  - Update user state
- **Handler File**: `src/handlers/conference-commands.handler.ts`

#### Command >: Next Conference
- **express.e**: Lines 24548-24564
- **Implementation**: Switch to next conference in list
- **Features**:
  - Wrap around to first conference
  - Check conference access
  - Display conference bulletin
  - Update user state
- **Handler File**: `src/handlers/conference-commands.handler.ts`

#### Command <<: Previous Message Base
- **express.e**: Lines 24566-24578
- **Implementation**: Switch to previous message base in current conference
- **Features**:
  - Wrap around to last msgbase
  - Update message pointers
  - Display msgbase info
- **Handler File**: `src/handlers/conference-commands.handler.ts`

#### Command >>: Next Message Base
- **express.e**: Lines 24580-24592
- **Implementation**: Switch to next message base in current conference
- **Features**:
  - Wrap around to first msgbase
  - Update message pointers
  - Display msgbase info
- **Handler File**: `src/handlers/conference-commands.handler.ts`

### 1.3 XIM Door Protocol Completion

**Why Critical**: Most Amiga doors rely heavily on XIM messages. Without these, doors are broken.

**express.e Reference**: Lines 4353-4544

#### Core XIM Message Commands:

##### PG_SHUTDOWN - Door Shutdown Signal
- **express.e**: Lines 4378-4382
- **Purpose**: Gracefully terminate door process
- **Implementation**: Send shutdown signal to door, cleanup resources

##### PG_PM - Prompt Message (CRITICAL)
- **express.e**: Lines 4401-4408
- **Purpose**: Display prompt and capture input
- **Implementation**: Display prompt, wait for line input, return to door
- **This is the PRIMARY input method for doors**

##### PG_HK - Hotkey (CRITICAL)
- **express.e**: Lines 4417-4427
- **Purpose**: Wait for single keypress
- **Implementation**: Read single character, return to door
- **This is used for menu navigation in doors**

##### PG_UD - User Data (CRITICAL)
- **express.e**: Lines 4444-4463
- **Purpose**: Return user account information to door
- **Fields**: Name, location, security, access, times called, etc.
- **Implementation**: Pack user data into response message

##### PG_US - User String (CRITICAL)
- **express.e**: Lines 4464-4494
- **Purpose**: Return specific user field as string
- **Implementation**: String formatting for each field type

##### PG_SO - Serial Output
- **express.e**: Lines 4384-4385
- **Purpose**: Send text to user terminal
- **Implementation**: Send text via WebSocket

##### PG_CC - Console Character
- **express.e**: Lines 4386-4387
- **Purpose**: Send single character to console
- **Implementation**: Console logging/debugging

##### PG_CH - Character to Both
- **express.e**: Lines 4388-4390
- **Purpose**: Send character to both serial and console
- **Implementation**: Dual output

##### PG_CO - Console Output
- **express.e**: Lines 4391-4394
- **Purpose**: Send text to console only
- **Implementation**: Console logging

##### PG_SM - Serial/Screen Message
- **express.e**: Lines 4396-4399
- **Purpose**: Display message to user
- **Implementation**: Send message via WebSocket

##### PG_SC - String Capture
- **express.e**: Lines 4409-4416
- **Purpose**: Capture input with length limit
- **Implementation**: Read input with validation

##### PG_SG - Show Graphics
- **express.e**: Lines 4428-4432
- **Purpose**: Display screen file with security check
- **Implementation**: Load and display screen file

##### PG_SF - Show File
- **express.e**: Lines 4433-4437
- **Purpose**: Display text file
- **Implementation**: Load and display file contents

##### PG_EF - Edit File
- **express.e**: Lines 4438-4443
- **Purpose**: Launch message editor
- **Implementation**: Start editor, return edited text

##### PG_RD - Random Number
- **express.e**: Lines 4499-4502
- **Purpose**: Generate random number
- **Implementation**: Return random value

##### PG_TM - Time Modification
- **express.e**: Lines 4505-4509
- **Purpose**: Add/subtract time from user's time limit
- **Implementation**: Modify session time remaining

##### PG_FF - File Exists
- **express.e**: Lines 4510-4515
- **Purpose**: Check if file exists
- **Implementation**: File system check, return boolean

##### BB_TASKPRI - Get Task Priority
- **express.e**: Lines 4516-4518
- **Purpose**: Get Amiga task priority (legacy)
- **Implementation**: Return fixed value (not applicable in web)

#### XIM Infrastructure:

##### doorMsgLoadAccount
- **express.e**: Lines 4546-4568
- **Purpose**: Load user account data into door's memory
- **Implementation**: Serialize user account, send to door

##### doorMsgSaveAccount
- **express.e**: Lines 4570-4597
- **Purpose**: Save user account data from door back to BBS
- **Implementation**: Deserialize account data, validate, save

**Handler File**: `src/handlers/xim-protocol.handler.ts`
**Service File**: `src/services/XIMProtocolService.ts`

### 1.4 Critical MCI Codes

**Why Critical**: Many classic screen files use these codes. Without them, screens are broken.

#### ~SP. - Stop Pause (CRITICAL)
- **express.e**: Lines 5455-5461
- **Purpose**: Pause display, wait for keypress to continue
- **Implementation**: Display "[Press any key]", wait for input
- **Used in**: Bulletins, help screens, file listings

#### ~CR. - Character Read (CRITICAL)
- **express.e**: Lines 5462-5468
- **Purpose**: Read single character from user
- **Implementation**: Wait for keypress, continue processing
- **Used in**: Interactive menus, games

#### ~CR_<prompt>|| - Prompted Character Read (CRITICAL)
- **express.e**: Lines 5564-5574
- **Purpose**: Display prompt, read single character
- **Implementation**: Display prompt, wait for keypress
- **Used in**: Menu systems, door launchers

#### ~CC_<cmd>|| - Run Command (HIGH PRIORITY)
- **express.e**: Lines 5555-5563
- **Purpose**: Execute BBS command from screen file
- **Implementation**: Parse command, execute via command handler
- **Used in**: Automated workflows, menu shortcuts

#### ~SM_<name>|| - Set Menu Name (MEDIUM PRIORITY)
- **express.e**: Lines 5575-5581
- **Purpose**: Track current menu for navigation
- **Implementation**: Set session.currentMenuName
- **Used in**: Menu tracking, navigation breadcrumbs
- **Status**: Already implemented in screen.handler.ts:434-442

#### ~SX_<file>|| - Sequential File Display (MEDIUM PRIORITY)
- **express.e**: Lines 5505-5532
- **Purpose**: Display numbered files in sequence (e.g., tip.1, tip.2, tip.3)
- **Implementation**: Counter tracking, auto-increment, wrap to 1
- **Used in**: Tips of the day, rotating bulletins
- **Status**: Already implemented via SequentialFileManager

#### ~SR_<file>|| - Random File Display (MEDIUM PRIORITY)
- **express.e**: Lines 5533-5554
- **Purpose**: Display random file from numbered set
- **Implementation**: Count files, pick random, display
- **Used in**: Random logoff screens, random quotes

**Handler File**: `src/handlers/screen.handler.ts` (update existing processMCICodes)

---

## Phase 2: Core BBS Features (HIGH PRIORITY)

**Status**: NOT STARTED
**Priority**: HIGH - Significantly impacts user experience
**Estimated Effort**: 80-120 hours

### 2.1 Enhanced Message Editor

**Why High Priority**: Current editor is very basic. Users need full editing capabilities.

**express.e Reference**: Message editor functions throughout express.e

#### Message Editor Features:
- **Line editing**: Insert, delete, modify lines
- **Navigation**: Move to line number, search
- **Formatting**: Word wrap, line breaks
- **Quoting**: Quote previous message
- **File inclusion**: Include text files
- **Spell check hooks**: Optional spell checking
- **Save/abort**: Save message or discard
- **Auto-save**: Periodic save to temp file
- **Upload text**: Upload message from file

#### EMACS-Style Commands:
- **express.e**: EMACS command functions
- `/A` - Abort message
- `/C` - Continue editing
- `/D` - Delete line
- `/E` - Edit line
- `/H` - Help
- `/I` - Insert line
- `/L` - List message
- `/Q` - Quote previous message
- `/R` - Replace text
- `/S` - Save message
- `/U` - Upload text file

**Handler File**: `src/handlers/message-editor.handler.ts`
**Service File**: `src/services/MessageEditorService.ts`

### 2.2 Conference System Enhancement

**Why High Priority**: Conferences are core to BBS organization.

#### Conference Features:

##### Conference Scanning
- **express.e**: Conference scan routines
- Scan all conferences for new messages
- Display conference list with new message counts
- Jump to conference with new messages
- Mark conferences as read

##### Conference Bulletins
- **express.e**: CONF_BULL screen display
- Display conference-specific bulletins
- Auto-display on conference join
- Mark bulletins as read
- Bulletin expiration

##### Conference Statistics
- **express.e**: Conference stat functions
- Message count per conference
- User count per conference
- Last message date
- Conference activity tracking

##### Conference Relative Numbering
- **express.e**: TOGGLES_CONFRELATIVE flag
- Show conference number as 1-N (relative)
- Show conference number as absolute
- User preference toggle

**Handler File**: `src/handlers/conference-system.handler.ts`
**Service File**: `src/services/ConferenceService.ts`

### 2.3 User Account Editor (Full Implementation)

**Why High Priority**: Sysops need complete user management.

**express.e Reference**: Command 1 (lines 24453-24459) + user account functions

#### User Editor Features:

##### Account Information:
- Username (edit restrictions)
- Real name
- Alias/handle
- Location
- Phone number
- Computer type
- Birth date
- Password (change with confirmation)

##### Security Settings:
- Security level (0-255)
- Access flags/keys
- Conference access string
- Door access restrictions
- File area access restrictions

##### Limits & Quotas:
- Daily time limit
- Daily byte limit (download)
- Upload/download ratio
- Call restrictions (time of day, day of week)

##### Statistics (View Only):
- Times called
- Today's calls
- Last call date/time
- Messages posted
- Files uploaded/downloaded
- Upload/download bytes

##### Account Management:
- Lock/unlock account
- Delete account (with confirmation)
- Reset statistics
- Reset password
- Grant/revoke sysop access

**Handler File**: `src/handlers/user-editor.handler.ts`
**Service File**: `src/services/UserEditorService.ts`

### 2.4 File Area Improvements

**Why High Priority**: File areas are a core BBS feature.

#### File Area Features:

##### File Descriptions:
- Edit file descriptions
- Multi-line descriptions
- Uploader name
- Upload date
- Download count
- File rating

##### Batch Operations:
- Tag multiple files
- Batch download queue (already have FlaggedFilesManager)
- Batch flag/unflag
- Batch delete (sysop)
- Batch move (sysop)

##### File Search:
- **Command Z**: Zippy Text Search (express.e:26123-26213)
- Search filename
- Search description
- Search uploader
- Search date range
- Search by size

##### File Area Management (Sysop):
- Create file areas
- Delete file areas
- Move files between areas
- Edit file info
- Validate uploads
- Delete offline files

##### File Area Statistics:
- Files in area
- Total size
- Most downloaded
- Newest files
- File count by uploader

**Handler File**: `src/handlers/file-commands.handler.ts` (enhance existing)
**Service File**: `src/services/FileAreaService.ts` (enhance existing)

### 2.5 Message System Enhancement

**Why High Priority**: Messaging is core to BBS communication.

#### Message Reading Features:

##### Read Options:
- Read new messages only
- Read since last login
- Read by number range
- Read reverse order
- Read by sender
- Read by subject

##### Message Navigation:
- Next message
- Previous message
- First message
- Last message
- Reply to message
- Forward message

##### Message Threading:
- Show thread view
- Navigate thread
- Collapse threads
- Thread statistics

##### Message Management:
- Mark as read
- Mark as unread
- Delete message (own messages or sysop)
- Move message (sysop)
- Edit message (own messages or sysop)

#### Message Writing Features:

##### Message Types:
- Public message
- Private message
- Message to sysop
- Message to all
- Carbon copy (CC)

##### Message Options:
- Attachments (reference files)
- Priority flag
- Read receipt
- Delete after reading
- Save in sent folder

**Handler File**: `src/handlers/message-commands.handler.ts`
**Service File**: `src/services/MessageService.ts`

---

## Phase 3: Enhanced User Experience (MEDIUM PRIORITY)

**Status**: NOT STARTED
**Priority**: MEDIUM - Nice to have, improves usability
**Estimated Effort**: 40-60 hours

### 3.1 Missing Commands

#### Command ^: Upload Hat
- **express.e**: Lines 25089-25111
- **Purpose**: Upload with interactive prompts
- **Features**:
  - Prompt for file description
  - Prompt for file area
  - Prompt for keywords
  - Auto-validate file
- **Handler File**: `src/handlers/file-commands.handler.ts`

### 3.2 Voting Booth System

**express.e Reference**: Command VO (lines 25700-25710)

#### Voting Features:
- Create polls/votes
- Vote options (multiple choice)
- Vote duration (start/end dates)
- Anonymous voting option
- Vote results display
- Vote statistics
- User vote tracking (prevent double voting)
- Sysop vote management

**Handler File**: `src/handlers/voting-booth.handler.ts`
**Service File**: `src/services/VotingService.ts`
**Status**: Command exists, needs verification

### 3.3 Zoo Mail System

**express.e Reference**: Command ZOOM (lines 26215-26240)

#### Zoo Mail Features:
- Compressed mail archives
- Export messages to Zoo archive
- Import messages from Zoo archive
- Download Zoo archive
- Upload Zoo archive
- Auto-extract on upload
- Mail packet handling

**Handler File**: `src/handlers/zoo-mail.handler.ts`
**Service File**: `src/services/ZooMailService.ts`
**Status**: Command exists, needs verification

### 3.4 Advanced Message Editor Features

**Status**: NOT STARTED
**Priority**: MEDIUM - Improves message editing workflow
**Estimated Effort**: 20-40 hours

**Note**: Basic EMACS commands (/S, /A, /C, /D, /E, /L, /H) are COMPLETE as of Phase 2. The following are advanced features requiring significant infrastructure.

#### /F - File Attachment (express.e:10475-10510)
- **express.e Lines**: 10475-10510
- **Purpose**: Attach files to messages
- **Infrastructure Required**:
  - WebSocket-based file upload (replaces Amiga serial transfer)
  - Server-side file storage (filesystem, S3, or database BLOBs)
  - Attachment metadata table in database
  - Security: file type validation, virus scanning, size limits
  - HTML5 file input UI in frontend
- **Database Changes**:
  - `message_attachments` table (messageId, filename, size, mimeType, storagePath, deleteOnMsgDelete)
  - Index on messageId
- **Features**:
  - Prompt for file path/filename
  - Support multiple attachments per message
  - Option to delete file when message is deleted
  - File validation (restricted paths, file types)
  - Display attachment list in message reader
- **Handler File**: `src/handlers/message-entry.handler.ts` (add /F command)
- **Service File**: `src/services/FileAttachmentService.ts` (new)
- **Estimated Effort**: 12-16 hours

#### /X - Transfer Files (express.e:10520-10528)
- **express.e Lines**: 10520-10528
- **Purpose**: Batch file transfer with message
- **Infrastructure Required**:
  - Same as /F plus batch transfer protocol
  - Transfer queue management
  - Progress tracking UI
  - Bandwidth throttling
- **Features**:
  - Trigger batch file transfer after message save
  - rzmsg flag sets transfer mode
  - Create Fxxx directory for message attachments
  - Initiate upload protocol (ZModem → HTTP multipart)
  - Handle transfer completion/cancellation
- **Handler File**: `src/handlers/message-entry.handler.ts` (add /X command)
- **Service File**: `src/services/BatchTransferService.ts` (new)
- **Estimated Effort**: 8-12 hours

#### /Q - Quote Previous Message (express.e:10865-10946)
- **express.e Lines**: 10865-10946
- **Purpose**: Quote previous message in reply
- **Infrastructure Required**:
  - Message threading support (parentId, threadId)
  - Quote formatting ("> " prefix per line)
  - Line range selection (start, end, or ALL)
- **Features**:
  - Load previous message from database
  - Display message with line numbers (like /L)
  - Prompt for line range (e.g., "1,10" or "*" for all)
  - Format quoted lines with "> " prefix
  - Add attribution header ("-----[ Name ]--[ Date ]------")
  - Insert at current cursor position
- **Handler File**: `src/handlers/message-entry.handler.ts` (add /Q command)
- **Database Changes**: Add parentMessageId to messages table
- **Estimated Effort**: 6-8 hours

#### /R - Replace Text (express.e:not explicitly in edit())
- **Purpose**: Search and replace within message
- **Features**:
  - Prompt for search string
  - Prompt for replacement string
  - Option for case-sensitive/insensitive
  - Option for first match or all matches
  - Display count of replacements made
- **Handler File**: `src/handlers/message-entry.handler.ts` (add /R command)
- **Estimated Effort**: 4-6 hours

#### /I - Insert Line (express.e:not explicitly in edit())
- **Purpose**: Insert new line at specific position
- **Features**:
  - Prompt for line number (1..N)
  - Prompt for text to insert
  - Shift subsequent lines down
  - Update line numbering display
- **Handler File**: `src/handlers/message-entry.handler.ts` (add /I command)
- **Estimated Effort**: 3-4 hours

#### /U - Upload Text File (express.e:not explicitly in edit())
- **Purpose**: Insert text file contents into message
- **Infrastructure Required**:
  - File upload mechanism (same as /F)
  - Text file validation (UTF-8, plain text only)
  - Size limit enforcement
- **Features**:
  - Prompt for file or use file picker
  - Validate file is text (not binary)
  - Limit file size (e.g., 100KB max)
  - Insert contents at current line
  - Respect 200-line message limit
- **Handler File**: `src/handlers/message-entry.handler.ts` (add /U command)
- **Service File**: `src/services/FileAttachmentService.ts` (reuse)
- **Estimated Effort**: 4-6 hours

**Total Estimated Effort**: 37-52 hours for all advanced editor features

### 3.5 Additional MCI Codes

#### ~SR_<file>|| - Random File Display
- **express.e**: Lines 5533-5554
- **Purpose**: Display random numbered file
- **Implementation**:
  - Count available files (file.1, file.2, etc.)
  - Pick random number
  - Display selected file
  - Fallback to file.1 if random file missing
- **Used in**: Random logoff screens, random tips

#### Slowmo Display Codes:
- **~SMO<speed>||** - Slow Motion On (express.e:5726-5736)
  - Enable "theater mode" display
  - Character-by-character display at specified speed
  - Used for dramatic effect in screens
- **~SMC||** - Slow Motion Clear (express.e:5737-5739)
  - Disable theater mode
  - Return to normal display speed
- **~NS||** - Non-Stop Display (express.e:5740-5742)
  - Disable automatic pauses
  - Display entire file without prompts

#### Delimiter Codes:
- **~D<terminator>** - Set Delimiter (express.e:5743-5748)
  - Change MCI code terminator from `|` to custom character
  - Used for complex MCI code nesting
- **~~** - Literal Tilde (express.e:5749-5751)
  - Display actual `~` character (not MCI code)

**Handler File**: `src/handlers/screen.handler.ts` (update processMCICodes)

---

## Phase 4: Classic BBS Authenticity (NICE TO HAVE)

**Status**: NOT STARTED
**Priority**: NICE TO HAVE - For true 1:1 port experience
**Estimated Effort**: 60-100 hours

### 4.1 QWK/REP Mail Support

**express.e Reference**: QWK routines throughout express.e

#### QWK Packet Features:
- QWK packet creation (MESSAGES.DAT, CONTROL.DAT, etc.)
- Message export to QWK
- New messages only
- Selected conferences
- Date range selection
- Packet compression (ZIP)
- Download via HTTP

#### REP Packet Features:
- REP packet import
- Message extraction
- Message validation
- Auto-posting imported messages
- Error reporting
- Upload via HTTP

#### Door Integration:
- QWK door support
- Offline reader doors
- Bluewave doors

**Handler File**: `src/handlers/qwk-mail.handler.ts`
**Service File**: `src/services/QWKService.ts`

### 4.2 REXX Integration

**express.e Reference**: AIM/AEM door types (lines 4272-4277, 4298-4303)

**NOTE**: This is complex - may want to skip for modern web BBS.

#### REXX Door Support:
- **AIM** - Amiga Internal Module (REXX scripts)
- **AEM** - REXX Exec Module
- REXX script execution
- REXX door parameters
- REXX BBS function library
- REXX error handling

#### REXX Functions (if implementing):
- `ae.getuser()` - Get user info
- `ae.puttext()` - Display text
- `ae.getinput()` - Read input
- `ae.showfile()` - Display file
- `ae.runcommand()` - Execute BBS command

**Implementation Strategy**:
- Use JavaScript instead of REXX
- Provide JavaScript door API
- Maintain compatible function names
- Convert classic REXX doors to JavaScript

**Handler File**: `src/handlers/script-door.handler.ts`
**Service File**: `src/services/ScriptDoorService.ts`

### 4.3 Multi-Node Enhancements

#### Internode Chat:
- Real-time chat between nodes
- Chat requests/invitations
- Chat accept/decline
- Chat rooms (added as custom ROOM command)
- Split-screen chat
- Chat logging
- Chat history

#### Node Synchronization:
- Message base locks (prevent concurrent editing)
- User account locks (prevent simultaneous editing)
- File area locks
- Conference locks
- Semaphore system

**Handler File**: `src/handlers/multinode-chat.handler.ts`
**Service File**: `src/services/MultiNodeService.ts` (enhance existing)

---

## Phase 5: Advanced Features (OPTIONAL)

**Status**: NOT STARTED
**Priority**: LOW - Not essential for modern web BBS
**Estimated Effort**: 100+ hours

### 5.1 File Transfer Protocols (OPTIONAL)

**NOTE**: HTTP file transfer is superior. These are only for authentic retro experience.

**express.e Reference**: Transfer commands + hydra.e + zmodem.e

#### Protocols:
- **Hydra** - Bidirectional protocol (hydra.e - ~10,000 lines)
- **ZModem** - Streaming protocol (zmodem.e - ~3,000 lines)
- **Xmodem** - Basic protocol
- **Ymodem** - Batch protocol
- **Kermit** - Error-correcting protocol
- **ASCII** - Text-only transfer

#### Features:
- Upload with protocol
- Download with protocol
- Batch transfers
- Resume capability
- CRC checking
- Error recovery
- Progress display

**Implementation Strategy**:
- Use WebSocket for protocol emulation
- Implement protocol state machines
- Use browser FileReader API
- Provide fallback to HTTP

**Service File**: `src/services/FileTransferProtocolService.ts`

### 5.2 AmigaOS-Specific Features (OPTIONAL)

**NOTE**: These are Amiga-specific and may not apply to web BBS.

#### Message Port System:
- **express.e**: Port creation/deletion (lines 4317-4370)
- Amiga message ports
- Signal handling
- Port messages
- Reply mechanism

#### Process Management:
- Amiga task/process creation
- Task priority
- Stack size allocation
- Trap handling

#### BCD Math:
- Binary-Coded Decimal for file sizes
- Format upload/download byte counts
- **express.e**: formatBCD functions

**Implementation Strategy**:
- Skip message ports (use WebSocket/IPC instead)
- Skip process management (use Node.js child_process)
- Skip BCD math (use JavaScript numbers)

---

## Reference: Complete Feature Matrix

### Internal Commands: 52 Total

#### IMPLEMENTED (35):
- `?` - Help/Command List (28392-28393)
- `H` - Help (25075-25087)
- `M` - Toggle ANSI (25239-25248)
- `T` - Time/Date (25622-25644)
- `X` - Expert Mode (26113-26122)
- `GR` - Greetings (24411-24423)
- `RL` - Relogon (25534-25539)
- `G` - Goodbye (25047-25075)
- `J` - Join Conference (25113-25183)
- `JM` - Join Message Base (25185-25238)
- `C` - Comment to Sysop (24658-24670)
- `CF` - Conference Flags (24672-24841)
- `E` - Enter Message (24860-24872)
- `R` - Read Messages (25518-25531)
- `MS` - Mail Scan (25250-25279)
- `OLM` - Online Message (25406-25503)
- `Q` - Quiet Mode (25504-25516)
- `F` - File Listings (24877-24881)
- `FR` - File Listings Raw (24883-24887)
- `FM` - File Maintenance (24889-25045)
- `FS` - File Status (24872-24875)
- `A` - Alter Flags (24601-24605)
- `N` - New Files (25275-25279)
- `D` - Download File(s) (24853-24857)
- `DS` - Download with Status (28302)
- `U` - Upload File(s) (25646-25658)
- `UP` - Upload Status (25667)
- `US` - Sysop Upload (25660-25665)
- `RZ` - Zmodem Upload (25608-25621)
- `B` - Read Bulletin (24607-24656)
- `S` - User Statistics (25540-25568)
- `V` - View Text File (25675-25687)
- `VS` - View Statistics (28376)
- `W` - Write User Parameters (25712-25785)
- `Z` - Zippy Text Search (26123-26213)
- `VER` - Version Info (25688-25699)
- `VO` - Voting Booth (25700-25710)
- `ZOOM` - Zoo Mail (26215-26240)
- `WHO` - Node Information (26094-26103)
- `WHD` - Who's Online Detailed (26104-26112)
- `NM` - Node Management (25281-25370)
- `CM` - Conference Maintenance (24843-24852)

#### MISSING (17):
- `0` - Remote Shell (24424-24451) - **PHASE 1**
- `1` - Account Editing (24453-24459) - **PHASE 1**
- `2` - View Callers Log (24461-24509) - **PHASE 1**
- `3` - Edit Directory Files (24511-24515) - **PHASE 1**
- `4` - Edit Any File (24517-24521) - **PHASE 1**
- `5` - Directory Listing (24523-24527) - **PHASE 1**
- `<` - Previous Conference (24529-24546) - **PHASE 1**
- `>` - Next Conference (24548-24564) - **PHASE 1**
- `<<` - Previous Message Base (24566-24578) - **PHASE 1**
- `>>` - Next Message Base (24580-24592) - **PHASE 1**
- `^` - Upload Hat (25089-25111) - **PHASE 3**

### MCI Codes: 60+ Total

#### IMPLEMENTED (45):
User Info: `~N|`, `~P|`, `~UL|`, `~#|`, `~TC|`, `~TT|`, `~LC|`, `~M|`, `~A|`, `~S|`, `~CA|`, `~BR|`, `~HW|`, `~TL|`, `~TR|`, `~UB|`, `~DB|`, `~SU|`, `~SD|`, `~FU|`, `~FD|`, `~BD|`, `~ON|`, `~LG|`, `~IN|`, `~RN|`, `~AK|`

Conference: `~CF|`, `~CN|`, `~MB|`, `~MN|`, `~CL.`, `~CD.`, `~ML.`, `~MD.`

System: `~VE|`, `~VD|`, `~ND|`, `~DT|`, `~OT|`, `~OD|`, `~SC|`

Files: `~FC|`, `~FL|`, `~FF|`

Colors: `~c0|`-`~c7|`, `~b0|`-`~b7|`, `~z0|`-`~z7|`

Formatting: `~n1|`-`~n9|`

Control: `~f|`, `~w|`, `~x<n>|`, `~y<n>|`, `~q|`, `~h|`, `~SP|`, `~CR|`, `~NS|`

Advanced: `~SS_<file>||`, `~XC_<cmd>||`, `~XI<door>`, `~SM_<name>||`, `~SX_<file>||`

#### MISSING (15):
- `~SP.` - Stop Pause (5455-5461) - **PHASE 1**
- `~CR.` - Character Read (5462-5468) - **PHASE 1**
- `~CR_<prompt>||` - Prompted Char Read (5564-5574) - **PHASE 1**
- `~CC_<cmd>||` - Run Command (5555-5563) - **PHASE 1**
- `~SR_<file>||` - Random File Display (5533-5554) - **PHASE 3**
- `~SMO<speed>||` - Slow Motion On (5726-5736) - **PHASE 3**
- `~SMC||` - Slow Motion Clear (5737-5739) - **PHASE 3**
- `~NS||` - Non-Stop Display (5740-5742) - **PHASE 3**
- `~D<terminator>` - Set Delimiter (5743-5748) - **PHASE 3**
- `~~` - Literal Tilde (5749-5751) - **PHASE 3**

### XIM Door Protocol: 20+ Commands

#### IMPLEMENTED (Basic):
Basic door launching works, but message protocol is incomplete.

#### MISSING (18):
- `PG_SHUTDOWN` (4378-4382) - **PHASE 1**
- `PG_SO` (4384-4385) - **PHASE 1**
- `PG_CC` (4386-4387) - **PHASE 1**
- `PG_CH` (4388-4390) - **PHASE 1**
- `PG_CO` (4391-4394) - **PHASE 1**
- `PG_SM` (4396-4399) - **PHASE 1**
- `PG_PM` (4401-4408) - **PHASE 1 CRITICAL**
- `PG_SC` (4409-4416) - **PHASE 1**
- `PG_HK` (4417-4427) - **PHASE 1 CRITICAL**
- `PG_SG` (4428-4432) - **PHASE 1**
- `PG_SF` (4433-4437) - **PHASE 1**
- `PG_EF` (4438-4443) - **PHASE 1**
- `PG_UD` (4444-4463) - **PHASE 1 CRITICAL**
- `PG_US` (4464-4494) - **PHASE 1 CRITICAL**
- `PG_RD` (4499-4502) - **PHASE 1**
- `PG_TM` (4505-4509) - **PHASE 1**
- `PG_FF` (4510-4515) - **PHASE 1**
- `BB_TASKPRI` (4516-4518) - **PHASE 1**

---

## Implementation Strategy

### Phase Prioritization:
1. **Phase 1** (CRITICAL) - Must be done first, blocks basic functionality
2. **Phase 2** (HIGH) - Essential for good user experience
3. **Phase 3** (MEDIUM) - Nice to have, improves usability
4. **Phase 4** (NICE TO HAVE) - For authenticity, not required
5. **Phase 5** (OPTIONAL) - Skip unless specific need

### Development Approach:
1. **Reference express.e FIRST** - Always read original code before implementing
2. **Modular implementation** - Keep handlers separate, use service pattern
3. **Test thoroughly** - Test each feature with actual BBS usage
4. **TypeScript strict mode** - Zero compilation errors required
5. **Document as you go** - Update this roadmap with progress

### Progress Tracking:
- Update CURRENT_STATUS.md after each completed feature
- Archive session notes to Documentation/6-Progress/archive/
- Keep implementation notes compact and focused

---

**Last Updated**: 2025-11-06
**Next Update**: After Phase 1 completion
