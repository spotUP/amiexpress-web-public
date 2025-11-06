# Phase 1: Critical Foundation - Implementation Todos

**Priority**: BLOCKING - Must be completed before Phase 2
**Estimated Effort**: 40-60 hours
**Status**: NOT STARTED

---

## Category 1: Sysop Commands (Commands 0-5)

### [ ] Task 1.1: Command 0 - Remote Shell
- **express.e**: Lines 24424-24451
- **Priority**: CRITICAL
- **Subtasks**:
  - [ ] Create `src/handlers/sysop-commands.handler.ts`
  - [ ] Implement command parser for `0 <command>`
  - [ ] Add security check (sysop only)
  - [ ] Implement command execution via child_process
  - [ ] Capture stdout/stderr
  - [ ] Add timeout protection (30 seconds max)
  - [ ] Display output to user
  - [ ] Add to command router
  - [ ] Test with basic commands (ls, pwd, date)
  - [ ] Test security (non-sysop should be blocked)

### [ ] Task 1.2: Command 1 - Account Editing
- **express.e**: Lines 24453-24459
- **Priority**: CRITICAL
- **Subtasks**:
  - [ ] Create `src/handlers/user-editor.handler.ts`
  - [ ] Create `src/services/UserEditorService.ts`
  - [ ] Implement user search (by name or number)
  - [ ] Create user editor menu
  - [ ] Implement field editing:
    - [ ] Username
    - [ ] Real name
    - [ ] Security level
    - [ ] Access flags/keys
    - [ ] Time limits
    - [ ] Conference access
    - [ ] Password change
  - [ ] Add validation for all fields
  - [ ] Implement save changes
  - [ ] Implement cancel without saving
  - [ ] Add to command router
  - [ ] Test editing various fields
  - [ ] Test security (sysop only)

### [ ] Task 1.3: Command 2 - View Callers Log
- **express.e**: Lines 24461-24509
- **Priority**: CRITICAL
- **Subtasks**:
  - [ ] Create `src/handlers/callers-log.handler.ts`
  - [ ] Create `src/services/CallersLogService.ts`
  - [ ] Implement log storage (file or database)
  - [ ] Implement log entry structure
  - [ ] Create log viewer menu:
    - [ ] View today's calls
    - [ ] View date range
    - [ ] View by user
    - [ ] View by node
  - [ ] Implement log formatting
  - [ ] Implement log pagination
  - [ ] Add export to file option
  - [ ] Add to command router
  - [ ] Test log viewing
  - [ ] Test security (sysop only)

### [ ] Task 1.4: Command 3 - Edit Directory Files
- **express.e**: Lines 24511-24515
- **Priority**: HIGH
- **Subtasks**:
  - [ ] Create `src/handlers/directory-editor.handler.ts`
  - [ ] Implement directory type selection:
    - [ ] Message base directories
    - [ ] File area directories
    - [ ] Conference directories
  - [ ] Implement directory browser
  - [ ] Implement directory editor
  - [ ] Add create directory option
  - [ ] Add delete directory option (with confirmation)
  - [ ] Add validation
  - [ ] Add to command router
  - [ ] Test directory editing
  - [ ] Test security (sysop only)

### [ ] Task 1.5: Command 4 - Edit Any File
- **express.e**: Lines 24517-24521
- **Priority**: MEDIUM
- **Subtasks**:
  - [ ] Create `src/handlers/file-editor.handler.ts`
  - [ ] Implement file browser (with path restrictions)
  - [ ] Implement text file editor (line-by-line)
  - [ ] Implement hex viewer for binary files
  - [ ] Add save changes
  - [ ] Add cancel without saving
  - [ ] Add security checks (sysop only, path restrictions)
  - [ ] Add to command router
  - [ ] Test text file editing
  - [ ] Test binary file viewing
  - [ ] Test security

### [ ] Task 1.6: Command 5 - Directory Listing
- **express.e**: Lines 24523-24527
- **Priority**: MEDIUM
- **Subtasks**:
  - [ ] Create `src/handlers/directory-listing.handler.ts`
  - [ ] Implement directory listing display
  - [ ] Add navigation (cd to subdirectories)
  - [ ] Add pattern matching (wildcards)
  - [ ] Add file information (size, date, permissions)
  - [ ] Add pagination
  - [ ] Add security checks (sysop only)
  - [ ] Add to command router
  - [ ] Test directory browsing
  - [ ] Test security

---

## Category 2: Conference Navigation Commands

### [ ] Task 2.1: Command < - Previous Conference
- **express.e**: Lines 24529-24546
- **Priority**: CRITICAL
- **Subtasks**:
  - [ ] Create `src/handlers/conference-commands.handler.ts` (or enhance existing)
  - [ ] Implement previous conference logic
  - [ ] Add wrap-around to last conference
  - [ ] Check conference access permissions
  - [ ] Update user state (session.currentConf)
  - [ ] Display conference bulletin (if exists)
  - [ ] Display conference name
  - [ ] Add to command router
  - [ ] Test conference switching
  - [ ] Test wrap-around
  - [ ] Test access restrictions

### [ ] Task 2.2: Command > - Next Conference
- **express.e**: Lines 24548-24564
- **Priority**: CRITICAL
- **Subtasks**:
  - [ ] Implement next conference logic (same file as above)
  - [ ] Add wrap-around to first conference
  - [ ] Check conference access permissions
  - [ ] Update user state
  - [ ] Display conference bulletin
  - [ ] Display conference name
  - [ ] Add to command router
  - [ ] Test conference switching
  - [ ] Test wrap-around
  - [ ] Test access restrictions

### [ ] Task 2.3: Command << - Previous Message Base
- **express.e**: Lines 24566-24578
- **Priority**: CRITICAL
- **Subtasks**:
  - [ ] Implement previous message base logic
  - [ ] Add wrap-around to last msgbase
  - [ ] Update message pointers
  - [ ] Display message base name
  - [ ] Display message count
  - [ ] Add to command router
  - [ ] Test msgbase switching
  - [ ] Test wrap-around

### [ ] Task 2.4: Command >> - Next Message Base
- **express.e**: Lines 24580-24592
- **Priority**: CRITICAL
- **Subtasks**:
  - [ ] Implement next message base logic
  - [ ] Add wrap-around to first msgbase
  - [ ] Update message pointers
  - [ ] Display message base name
  - [ ] Display message count
  - [ ] Add to command router
  - [ ] Test msgbase switching
  - [ ] Test wrap-around

---

## Category 3: XIM Door Protocol Completion

### [ ] Task 3.1: XIM Infrastructure Setup
- **Priority**: CRITICAL (before implementing individual commands)
- **Subtasks**:
  - [ ] Create `src/handlers/xim-protocol.handler.ts`
  - [ ] Create `src/services/XIMProtocolService.ts`
  - [ ] Define XIM message types (enum or constants)
  - [ ] Create XIM message structure (interfaces)
  - [ ] Implement message port emulation (WebSocket-based)
  - [ ] Implement message queue system
  - [ ] Implement message reply mechanism
  - [ ] Test basic message send/receive

### [ ] Task 3.2: PG_PM - Prompt Message (HIGHEST PRIORITY)
- **express.e**: Lines 4401-4408
- **Priority**: CRITICAL - Most doors use this
- **Subtasks**:
  - [ ] Implement PG_PM message handler
  - [ ] Parse prompt text from message
  - [ ] Display prompt to user
  - [ ] Wait for line input (with timeout)
  - [ ] Send input back to door via reply message
  - [ ] Handle timeout case
  - [ ] Test with WHO door (uses PG_PM)

### [ ] Task 3.3: PG_HK - Hotkey (HIGHEST PRIORITY)
- **express.e**: Lines 4417-4427
- **Priority**: CRITICAL - Used for menu navigation
- **Subtasks**:
  - [ ] Implement PG_HK message handler
  - [ ] Parse valid keys from message
  - [ ] Wait for single keypress (no echo)
  - [ ] Validate keypress against valid keys
  - [ ] Send keypress back to door
  - [ ] Handle timeout case
  - [ ] Test with menu-based doors

### [ ] Task 3.4: PG_UD - User Data (CRITICAL)
- **express.e**: Lines 4444-4463
- **Priority**: CRITICAL - Doors need user info
- **Subtasks**:
  - [ ] Implement PG_UD message handler
  - [ ] Pack user data into response:
    - [ ] Username
    - [ ] Real name
    - [ ] Location
    - [ ] Security level
    - [ ] Access flags
    - [ ] Times called
    - [ ] Upload/download stats
  - [ ] Send packed data to door
  - [ ] Test with doors that request user data

### [ ] Task 3.5: PG_US - User String (CRITICAL)
- **express.e**: Lines 4464-4494
- **Priority**: CRITICAL - Doors need formatted strings
- **Subtasks**:
  - [ ] Implement PG_US message handler
  - [ ] Parse field request from message
  - [ ] Format user field as string:
    - [ ] Name fields
    - [ ] Location
    - [ ] Phone number
    - [ ] Stats
    - [ ] Dates/times
  - [ ] Send formatted string to door
  - [ ] Test various field types

### [ ] Task 3.6: PG_SO - Serial Output
- **express.e**: Lines 4384-4385
- **Priority**: HIGH
- **Subtasks**:
  - [ ] Implement PG_SO message handler
  - [ ] Parse text from message
  - [ ] Send text to user via WebSocket
  - [ ] Handle ANSI codes
  - [ ] Test with doors that use PG_SO

### [ ] Task 3.7: PG_SM - Serial/Screen Message
- **express.e**: Lines 4396-4399
- **Priority**: HIGH
- **Subtasks**:
  - [ ] Implement PG_SM message handler
  - [ ] Parse message text
  - [ ] Display message to user
  - [ ] Test with doors that use PG_SM

### [ ] Task 3.8: PG_SF - Show File
- **express.e**: Lines 4433-4437
- **Priority**: MEDIUM
- **Subtasks**:
  - [ ] Implement PG_SF message handler
  - [ ] Parse filename from message
  - [ ] Load file contents
  - [ ] Display file to user
  - [ ] Handle file not found
  - [ ] Test with doors

### [ ] Task 3.9: PG_SG - Show Graphics
- **express.e**: Lines 4428-4432
- **Priority**: MEDIUM
- **Subtasks**:
  - [ ] Implement PG_SG message handler
  - [ ] Parse filename from message
  - [ ] Check user security level
  - [ ] Load appropriate security-level screen
  - [ ] Display screen with MCI code processing
  - [ ] Test with doors

### [ ] Task 3.10: PG_TM - Time Modification
- **express.e**: Lines 4505-4509
- **Priority**: MEDIUM
- **Subtasks**:
  - [ ] Implement PG_TM message handler
  - [ ] Parse time delta from message
  - [ ] Modify user's time remaining
  - [ ] Update session time
  - [ ] Send confirmation to door
  - [ ] Test time addition and subtraction

### [ ] Task 3.11: PG_FF - File Exists
- **express.e**: Lines 4510-4515
- **Priority**: MEDIUM
- **Subtasks**:
  - [ ] Implement PG_FF message handler
  - [ ] Parse filename from message
  - [ ] Check file existence
  - [ ] Send boolean result to door
  - [ ] Test with various file paths

### [ ] Task 3.12: PG_SHUTDOWN - Door Shutdown
- **express.e**: Lines 4378-4382
- **Priority**: LOW (happens automatically)
- **Subtasks**:
  - [ ] Implement PG_SHUTDOWN message handler
  - [ ] Send shutdown signal to door process
  - [ ] Cleanup door resources
  - [ ] Remove door from active doors list
  - [ ] Test graceful shutdown

### [ ] Task 3.13: Additional XIM Commands (Lower Priority)
- **Priority**: LOW - Implement as needed
- **Commands to implement**:
  - [ ] PG_CC - Console Character (4386-4387)
  - [ ] PG_CH - Character to Both (4388-4390)
  - [ ] PG_CO - Console Output (4391-4394)
  - [ ] PG_SC - String Capture (4409-4416)
  - [ ] PG_EF - Edit File (4438-4443)
  - [ ] PG_RD - Random Number (4499-4502)
  - [ ] BB_TASKPRI - Get Task Priority (4516-4518)

### [ ] Task 3.14: Door Account Management
- **express.e**: Lines 4546-4597
- **Priority**: MEDIUM
- **Subtasks**:
  - [ ] Implement doorMsgLoadAccount (4546-4568)
  - [ ] Implement doorMsgSaveAccount (4570-4597)
  - [ ] Serialize user account for door
  - [ ] Deserialize account data from door
  - [ ] Validate account changes
  - [ ] Save account changes
  - [ ] Test account load/save cycle

---

## Category 4: Critical MCI Codes

### [ ] Task 4.1: ~SP. - Stop Pause
- **express.e**: Lines 5455-5461
- **Priority**: CRITICAL
- **Subtasks**:
  - [ ] Update `src/handlers/screen.handler.ts` processMCICodes()
  - [ ] Detect `~SP.` pattern
  - [ ] Display "[Press any key to continue]"
  - [ ] Wait for keypress
  - [ ] Continue processing after keypress
  - [ ] Test in bulletin screens
  - [ ] Test in help screens

### [ ] Task 4.2: ~CR. - Character Read
- **express.e**: Lines 5462-5468
- **Priority**: CRITICAL
- **Subtasks**:
  - [ ] Update processMCICodes()
  - [ ] Detect `~CR.` pattern
  - [ ] Wait for single keypress
  - [ ] Store keypress in variable/buffer
  - [ ] Continue processing
  - [ ] Test in interactive screens

### [ ] Task 4.3: ~CR_<prompt>|| - Prompted Character Read
- **express.e**: Lines 5564-5574
- **Priority**: CRITICAL
- **Subtasks**:
  - [ ] Update processMCICodes()
  - [ ] Detect `~CR_<prompt>||` pattern
  - [ ] Parse prompt text
  - [ ] Display prompt
  - [ ] Wait for keypress
  - [ ] Store keypress
  - [ ] Continue processing
  - [ ] Test in menu screens

### [ ] Task 4.4: ~CC_<cmd>|| - Run Command
- **express.e**: Lines 5555-5563
- **Priority**: HIGH
- **Subtasks**:
  - [ ] Update processMCICodes()
  - [ ] Detect `~CC_<cmd>||` pattern
  - [ ] Parse command text
  - [ ] Execute command via command router
  - [ ] Return to screen display after command
  - [ ] Test with various commands
  - [ ] Test error handling

---

## Testing Checklist for Phase 1

### [ ] Command Testing:
- [ ] All sysop commands (0-5) work correctly
- [ ] All conference navigation commands (< > << >>) work
- [ ] Commands block non-sysops appropriately
- [ ] Commands handle errors gracefully

### [ ] XIM Protocol Testing:
- [ ] PG_PM prompts work (test with WHO door)
- [ ] PG_HK hotkeys work (test with menu doors)
- [ ] PG_UD returns correct user data
- [ ] PG_US formats user strings correctly
- [ ] Door shutdown is clean
- [ ] Multiple doors can run simultaneously

### [ ] MCI Code Testing:
- [ ] ~SP. pauses work in bulletins
- [ ] ~CR. reads single characters
- [ ] ~CR_prompt|| displays prompt and reads key
- [ ] ~CC_cmd|| executes commands from screens
- [ ] All MCI codes work in ANSI and ASCII modes

### [ ] Integration Testing:
- [ ] Commands don't break existing functionality
- [ ] XIM protocol doesn't break existing doors
- [ ] MCI codes don't break screen display
- [ ] TypeScript compiles with zero errors
- [ ] No console errors in browser

---

## Progress Tracking

**Update this section as tasks are completed:**

### Completed Tasks: 0 / 50+

**Last Updated**: 2025-11-06
**Status**: Ready to begin implementation

---

## Notes

- Always read express.e lines BEFORE implementing each feature
- Test each feature thoroughly before moving to next
- Update this file with progress notes
- Archive detailed implementation notes to separate files
- Keep CURRENT_STATUS.md updated with overall progress
