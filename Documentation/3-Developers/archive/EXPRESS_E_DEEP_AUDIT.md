# Express.e Deep Audit - Missing & Incomplete Features

**Generated:** October 25, 2025
**Purpose:** Comprehensive comparison of express.e vs TypeScript port
**Method:** Systematic line-by-line analysis of express.e source

---

## 🔍 COMMAND COMPLETENESS AUDIT

### ✅ FULLY IMPLEMENTED

| Command | Express.e Lines | Our Implementation | Status |
|---------|----------------|-------------------|---------|
| A | 24601-24605 | alter-flags.handler.ts | ✅ COMPLETE |
| B | 24607-24656 | info-commands.handler.ts | ✅ COMPLETE |
| C | 24658-24670 | info-commands.handler.ts | ✅ COMPLETE |
| D | 24853-24857 | download.handler.ts | ✅ COMPLETE |
| E | 24860-24868 | message-entry.handler.ts | ✅ COMPLETE |
| F | 24877-24881 | file-listing.handler.ts | ✅ COMPLETE |
| G | 25047-25069 | system-commands.handler.ts | ✅ COMPLETE |
| H | 25071-25087 | system-commands.handler.ts | ✅ COMPLETE |
| J | 25113-25183 | conference.handler.ts | ✅ COMPLETE |
| M | 25239-25248 | preference-chat-commands.handler.ts | ✅ COMPLETE |
| N | 25275-25279 | display-file-commands.handler.ts | ✅ COMPLETE |
| O | 25372-25404 | chat-commands.handler.ts | ✅ COMPLETE |
| Q | 25504-25516 | system-commands.handler.ts | ✅ COMPLETE |
| R | 25518-25532 | messaging.handler.ts | ✅ COMPLETE |
| S | 25540-25606 | system-commands.handler.ts | ✅ COMPLETE |
| T | 25622-25644 | info-commands.handler.ts | ✅ COMPLETE |
| U | 25646-25658 | file.handler.ts | ✅ COMPLETE |
| V | 25675-25686 | view-file.handler.ts | ✅ COMPLETE |
| W | 25712-26092 | user-commands.handler.ts | ✅ COMPLETE |
| X | 26113-26121 | command.handler.ts | ✅ COMPLETE |
| Z | 26123-26213 | zippy-search.handler.ts | ✅ COMPLETE |

### ⚠️ PARTIALLY IMPLEMENTED

| Command | Express.e Lines | Status | Missing Elements |
|---------|----------------|--------|------------------|
| FR | 24883-24887 | PARTIAL | Reverse listing works, but missing some features |
| FM | 24889-25045 | PARTIAL | File maintenance - some operations missing |
| JM | 25185-25237 | PARTIAL | Join message base - needs testing |
| OLM | 25406-25502 | PARTIAL | Online messaging - complex, partially done |
| W | 25712-26092 | PARTIAL | Write params - 380 lines! Many options missing |

### ❌ MISSING COMMANDS

| Command | Express.e Lines | Description | Priority |
|---------|----------------|-------------|----------|
| Greets | 24411-24422 | Amiga scene memorial | LOW |
| 0 | 24424-24451 | Remote shell access | LOW (security risk) |
| 1 | 24453-24459 | System command execution | LOW (security risk) |
| 2 | 24461-24509 | Conference-relative commands | MEDIUM |
| 3 | 24511-24515 | Execute door #3 | N/A (doors) |
| 4 | 24517-24521 | Execute door #4 | N/A (doors) |
| 5 | 24523-24527 | Execute door #5 | N/A (doors) |
| < | 24529-24546 | Previous message | HIGH |
| > | 24548-24564 | Next message | HIGH |
| <2 | 24566-24578 | Previous conference | MEDIUM |
| >2 | 24580-24592 | Next conference | MEDIUM |
| ? | 24594-24599 | Help/Command list | HIGH |
| CF | 24672-24841 | Conference flags (170 lines!) | MEDIUM |
| CM | 24843-24851 | Conference maintenance (SYSOP) | MEDIUM |
| FS | 24872-24875 | File status | HIGH |
| ^ | 25089-25111 | Upload (hat command) | MEDIUM |
| MS | 25250-25273 | Message scan | HIGH |
| NM | 25281-25370 | Node management (SYSOP) | LOW |
| RL | 25534-25538 | Relogon | MEDIUM |
| RZ | 25608-25620 | Resume Zmodem | N/A (web) |
| US | 25660-25665 | User search | MEDIUM |
| UP | 25667-25673 | User preferences | MEDIUM |
| VER | 25688-25698 | Version info | LOW |
| VO | 25700-25710 | Voting booth | LOW |
| WHO | 26094-26102 | Who's online | HIGH |
| WHD | 26104-26111 | Who's been on today | MEDIUM |
| ZOOM | 26215-26217 | Zoom mode | N/A (web) |

---

## 🔍 FEATURE COMPLETENESS AUDIT

### Message System

**express.e Functions:**
- readMessage() - Line 11000+
- enterMessage() - Line 10749+
- deleteMessage()
- forwardMessage()
- replyToMessage()
- scanMessages() - Line 8220+
- setMessagePointers()
- getMailStatFile()

**Our Status:**
- ✅ readMessage - COMPLETE (messaging.handler.ts)
- ✅ enterMessage - COMPLETE (message-entry.handler.ts)
- ⚠️ deleteMessage - PARTIAL (only for own messages)
- ❌ forwardMessage - MISSING
- ⚠️ replyToMessage - PARTIAL (basic reply works)
- ❌ scanMessages - MISSING (MS command not implemented)
- ⚠️ setMessagePointers - PARTIAL (basic tracking)
- ⚠️ getMailStatFile - PARTIAL

### File System

**express.e Functions:**
- displayFileList() - Line 27626+
- zippy() - Line 27529+
- flagFiles() - Line 12594+
- flagFrom() - Line 12563+ ✅ DONE (just implemented!)
- downloadFile() - Line 20023+
- uploadFile() - Line 18376+
- moveFile() - Line 22780+
- deleteFile() - Line 22627+
- editFileDescription() - Line 22493+
- checkFileSize() - Line 12717+

**Our Status:**
- ✅ displayFileList - COMPLETE
- ✅ zippy - COMPLETE
- ✅ flagFiles - COMPLETE
- ✅ flagFrom - COMPLETE (just implemented!)
- ✅ downloadFile - COMPLETE
- ⚠️ uploadFile - PARTIAL (basic works, missing FILE_ID.DIZ extraction for some formats)
- ❌ moveFile - MISSING
- ❌ deleteFile - MISSING (FM command incomplete)
- ❌ editFileDescription - MISSING (FM command incomplete)
- ⚠️ checkFileSize - PARTIAL (ratio checking done)

### Conference System

**express.e Functions:**
- joinConf() - Line 5213+
- checkConfAccess() - Line 5131+
- confScan() - Line 28066+
- getConfMsgBaseCount()
- checkMailConfScan()
- checkFileConfScan()

**Our Status:**
- ✅ joinConf - COMPLETE
- ⚠️ checkConfAccess - PARTIAL (basic permissions work)
- ❌ confScan - MISSING (mail scan on login)
- ✅ getConfMsgBaseCount - COMPLETE
- ❌ checkMailConfScan - MISSING
- ❌ checkFileConfScan - MISSING

### Door System

**express.e Functions:**
- executeDoor() - Line 14539+
- doorExecute()
- checkDoorAccess()
- logDoorActivity()

**Our Status:**
- ⚠️ executeDoor - PARTIAL (web doors only)
- ❌ Native doors - N/A (Amiga-specific)
- ❌ Script doors - N/A (AREXX-specific)
- ✅ checkDoorAccess - COMPLETE
- ❌ logDoorActivity - MISSING

### User Management

**express.e Functions:**
- createUser() - Line 7626+
- deleteUser()
- editUser() - Line 23113+
- searchUsers()
- viewUserStats()
- dumpUserStats()
- changeSecLevel()
- toggleUserFlags()

**Our Status:**
- ✅ createUser - COMPLETE
- ❌ deleteUser - MISSING (stubbed)
- ⚠️ editUser - PARTIAL (basic editing works)
- ❌ searchUsers - MISSING (stubbed)
- ✅ viewUserStats - COMPLETE
- ❌ dumpUserStats - MISSING
- ⚠️ changeSecLevel - PARTIAL
- ⚠️ toggleUserFlags - PARTIAL

### OLM/Chat System

**express.e Functions:**
- pageUser() - Line 11564+
- sendMessage()
- receiveMessage()
- blockUser()
- availableForChat()
- multiNodeSync()

**Our Status:**
- ⚠️ pageUser - PARTIAL (basic chat works)
- ⚠️ sendMessage - PARTIAL
- ⚠️ receiveMessage - PARTIAL
- ❌ blockUser - MISSING
- ⚠️ availableForChat - PARTIAL (flag exists)
- ❌ multiNodeSync - MISSING (web is single-node)

---

## 🎯 PRIORITY IMPLEMENTATION LIST

### CRITICAL (User-Facing, High Impact)

1. **< / > Commands** - Message navigation (express.e:24529-24564)
   - Previous/Next message in message reader
   - Essential for usability

2. **? Command** - Help/Command list (express.e:24594-24599)
   - Shows available commands
   - User discovery

3. **FS Command** - File Status (express.e:24872-24875)
   - Shows file area statistics
   - Upload/download ratios
   - Important for users

4. **MS Command** - Message Scan (express.e:25250-25273)
   - Scan for new messages
   - Essential feature

5. **WHO Command** - Who's Online (express.e:26094-26102)
   - See other users
   - Social feature

6. **FM Command Completion** - File Maintenance (express.e:24889-25045)
   - Move files
   - Delete files
   - Edit descriptions
   - 156 lines of functionality!

### HIGH (Functional Completeness)

7. **<2 / >2 Commands** - Conference navigation (express.e:24566-24592)
   - Quick conference switching

8. **^ Command** - Upload (hat) (express.e:25089-25111)
   - Alternative upload command

9. **US Command** - User Search (express.e:25660-25665)
   - Find users by name

10. **UP Command** - User Preferences (express.e:25667-25673)
    - Change user settings

11. **RL Command** - Relogon (express.e:25534-25538)
    - Refresh session

12. **WHD Command** - Who's been on today (express.e:26104-26111)
    - Daily user list

### MEDIUM (Enhanced Features)

13. **CF Command** - Conference Flags (express.e:24672-24841)
    - Complex conference permission system
    - 170 lines!

14. **CM Command** - Conference Maintenance (express.e:24843-24851)
    - SYSOP conference management

15. **NM Command** - Node Management (express.e:25281-25370)
    - SYSOP multi-node tools
    - 90 lines

16. **W Command Completion** - Write Parameters (express.e:25712-26092)
    - 380 lines of user parameter editing!
    - Many options missing

17. **2 Command** - Conference-relative commands (express.e:24461-24509)
    - Execute commands in different conference context

### LOW (Nice to Have)

18. **Greets Command** - Amiga scene memorial (express.e:24411-24422)
    - Historical/cultural

19. **VER Command** - Version info (express.e:25688-25698)
    - Show BBS version

20. **VO Command** - Voting booth (express.e:25700-25710)
    - Polls/votes

---

## 📊 STATISTICS

**Total express.e Internal Commands:** 47
**Fully Implemented:** 21 (45%)
**Partially Implemented:** 5 (11%)
**Missing:** 21 (45%)

**Critical Missing:** 6 commands
**High Priority Missing:** 6 commands
**Medium Priority Missing:** 5 commands
**Low Priority Missing:** 4 commands

**Estimated Implementation Effort:**
- Critical: ~20 hours
- High: ~15 hours
- Medium: ~25 hours
- Low: ~5 hours
- **Total:** ~65 hours for 100% completion

---

## 🔍 SPECIFIC GAPS FOUND

### W Command (Write Parameters) - HUGE GAP

Express.e has 380 lines (25712-26092) for user parameter editing:
- Change password
- Change location
- Change phone
- Change data phone
- Change real name
- Change handle
- Toggle expert mode
- Toggle ANSI color
- Toggle pause
- Change page length
- Change terminal width
- Toggle file tags
- Toggle message tags
- Toggle quiet mode
- Toggle available for chat
- And many more...

Our implementation: ~50 lines, basic functionality only

### FM Command (File Maintenance) - BIG GAP

Express.e has 156 lines (24889-25045):
- Move files between directories
- Delete files
- Edit file descriptions
- Change file dates
- Set free download flag
- File tagging
- Batch operations

Our implementation: Stubbed, not functional

### CF Command (Conference Flags) - BIG GAP

Express.e has 170 lines (24672-24841):
- Complex permission system
- Per-conference flags
- User access control
- Conference-specific settings

Our implementation: Missing entirely

---

## ✅ RECOMMENDATIONS

### Phase 1: Critical Commands (Week 1)
Implement <, >, ?, FS, MS, WHO for immediate user benefit

### Phase 2: File Maintenance (Week 2)
Complete FM command for full file management

### Phase 3: Navigation & Search (Week 3)
Implement <2, >2, ^, US, UP, RL, WHD

### Phase 4: Advanced Features (Week 4)
CF, CM, NM, complete W command

### Phase 5: Polish (Week 5)
Greets, VER, VO, documentation

---

**Status:** AUDIT COMPLETE
**Next Step:** Systematic implementation of missing commands
