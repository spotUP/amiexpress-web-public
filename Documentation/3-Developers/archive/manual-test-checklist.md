# Manual Test Checklist for AmiExpress BBS

## Test Each Command Systematically

### Basic Navigation (Priority 1)
- [ ] M - Main menu displays
- [ ] T - Time shows current time
- [ ] S - System stats display
- [ ] VER - Version info shows
- [ ] H - Help displays
- [ ] ? - Help menu shows

### Mode Toggles (Priority 1)
- [ ] X - Expert mode toggle (test ON and OFF)
- [ ] A - ANSI mode toggle (test ON and OFF)
- [ ] Q - Quiet mode toggle (test ON and OFF)

### Conference Navigation (Priority 1)
- [ ] J 1 - Join conference 1 (General)
- [ ] J 2 - Join conference 2 (Tech Support)
- [ ] J 3 - Join conference 3 (Announcements)
- [ ] J 4 - Invalid conference (should show list again, no crash)
- [ ] < - Previous conference
- [ ] > - Next conference

### Message Base Navigation (Priority 1)
- [ ] JM 1 - Join message base 1
- [ ] << - Previous message base
- [ ] >> - Next message base

### Message Commands (Priority 1)
- [ ] R - Read messages
  - [ ] A - Again (redisplay)
  - [ ] D - Delete message (if sysop)
  - [ ] R - Reply
  - [ ] L - List messages
  - [ ] Q - Quit reader
  - [ ] ? - Short help
  - [ ] ?? - Full help
  - [ ] Enter - Next message
- [ ] E - Enter message
  - [ ] Enter recipient
  - [ ] Enter subject
  - [ ] Enter body
  - [ ] Save message
- [ ] MS - Mail scan

### File Commands (Priority 2)
- [ ] F - File list
- [ ] FR - File list raw
- [ ] FS - File status
- [ ] N - New files
- [ ] U - Upload (shows upload interface)
- [ ] D - Download (shows download interface)
- [ ] FM - File maintenance (sysop)

### Communication Commands (Priority 2)
- [ ] C - Comment to sysop
- [ ] O - Page sysop
- [ ] W - Who's online
- [ ] WHO - Who's online (detailed)
- [ ] WHD - Who's online (very detailed)
- [ ] OLM - Online message

### User Commands (Priority 2)
- [ ] US - User stats
- [ ] UP - User params editor
- [ ] WUP - Write user params

### Conference Commands (Priority 2)
- [ ] CF - Conference flags
- [ ] CM - Conference maintenance (sysop)
- [ ] NM - Node management (sysop)

### Utility Commands (Priority 3)
- [ ] B - Read bulletins
- [ ] V - View file
- [ ] Z - Zippy search
- [ ] ZOOM - Zoom file search
- [ ] RL - Relogon
- [ ] VO - Voting booth
- [ ] RZ - Zmodem download
- [ ] ^ - Upload with hat command

### Special Cases to Test
- [ ] Empty command (just Enter) - should do nothing gracefully
- [ ] Invalid command - should show "Unknown command"
- [ ] Command with parameters (J 2, E ALL, etc.)
- [ ] Command in expert mode (single key)
- [ ] Command in non-expert mode (full text + Enter)
- [ ] Long command line
- [ ] Special characters in command

### Error Conditions to Test
- [ ] Permission denied scenarios
- [ ] No messages in message base
- [ ] No files in file area
- [ ] Invalid message number
- [ ] Invalid file name
- [ ] Network timeout
- [ ] Database error handling

## Test Workflow

1. Start with fresh login
2. Test each command in order
3. Mark ✓ when verified working
4. Note any issues found
5. Fix issues and retest

## Issues Found

(Add issues here as you find them)

---

**Testing Started:** [DATE]
**Testing Completed:** [DATE]
**Total Commands Tested:** 0/36+
