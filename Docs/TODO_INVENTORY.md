# TODO Inventory - Complete List

**Generated:** October 25, 2025
**Total TODOs:** 60
**Status:** Cataloged and prioritized

---

## HIGH PRIORITY (Core User Experience)

### File Listing & Pause Functionality

1. **flagPause implementation** (express.e:27583-27585)
   - Location: `handlers/file-listing.handler.ts:187, 208`
   - Location: `handlers/zippy-search.handler.ts:212, 223`
   - Location: `handlers/view-file.handler.ts:184`
   - Impact: Users cannot pause during long file listings
   - Reference: express.e flagPause() function

2. **maxDirs checking**
   - Location: `handlers/file-listing.handler.ts:249`
   - Location: `handlers/view-file.handler.ts:65`
   - Location: `handlers/zippy-search.handler.ts:49`
   - Impact: File area limits not enforced
   - Reference: express.e maxDirs variable

### Message System (STUBS)

3. **R Command - Read Messages** [STUB]
   - Location: `handlers/system-commands.handler.ts:8`
   - Reference: express.e:25518-25532 (internalCommandR)
   - Impact: Message reading not implemented
   - Status: STUB - needs full implementation

4. **E Command - Enter Message** [STUB]
   - Location: `handlers/system-commands.handler.ts:9`
   - Reference: express.e:24860-24868 (internalCommandE)
   - Impact: Message entry not implemented
   - Status: STUB - needs full implementation

### Door System

5. **Native door execution**
   - Location: `handlers/door.handler.ts:151`
   - Impact: Native doors don't work
   - Reference: express.e door execution code

6. **Script door execution**
   - Location: `handlers/door.handler.ts:154`
   - Impact: Script doors don't work
   - Reference: express.e AREXX script execution

### Download System

7. **Ratio checking**
   - Location: `handlers/download.handler.ts:115`
   - Impact: Download ratios not enforced
   - Reference: checkRatiosAndTime() in express.e

8. **Download logging**
   - Location: `handlers/download.handler.ts:216`
   - Reference: express.e:9475+ (logUDFile)
   - Impact: Download activity not logged

---

## MEDIUM PRIORITY (Feature Completeness)

### File Management

9. **flagFrom() functionality**
   - Location: `handlers/alter-flags.handler.ts:191`
   - Impact: Flag file from directory feature incomplete

10. **Batch download save**
    - Location: `handlers/batch-download.handler.ts:264, 342`
    - Impact: Batch downloads not persisted

### Conference System

11. **Conference access checking**
    - Location: `handlers/file-status.handler.ts:90`
    - Reference: checkConfAccess() in express.e
    - Impact: Conference permissions not fully enforced

12. **Conference flag management**
    - Location: `handlers/advanced-commands.handler.ts:273`
    - Reference: express.e:24685-24750
    - Impact: Full conference flags not implemented

13. **lastScanTime tracking**
    - Location: `handlers/conference.handler.ts:128`
    - Impact: Last scan time not tracked

### User Management

14. **User account deletion**
    - Location: `handlers/account.handler.ts:259`
    - Impact: Account deletion not implemented

15. **dumpUserStats function**
    - Location: `handlers/message-commands.handler.ts:431`
    - Impact: User statistics export not available

16. **Reset messages posted**
    - Location: `handlers/message-commands.handler.ts:445`
    - Impact: Cannot reset message counters

17. **Reset voting booth**
    - Location: `handlers/message-commands.handler.ts:451`
    - Impact: Voting booth reset not available

### Multi-Node / OLM System

18. **OLM system implementation**
    - Location: `handlers/preference-chat-commands.handler.ts:257`
    - Impact: Online messaging system incomplete

19. **Multinode coordination**
    - Location: `utils/security.util.ts:279`
    - Reference: express.e multi-node code

20. **sendQuietFlag to other nodes**
    - Location: `handlers/olm.handler.ts:378`
    - Impact: Quiet mode not synced across nodes

21. **Multinode enabled check**
    - Location: `handlers/olm.handler.ts:65`
    - Reference: sopt.toggles[TOGGLES_MULTICOM]

### File Upload System

22. **LCFILES directory checking**
    - Location: `utils/file-upload.util.ts:35`
    - Reference: express.e:18424-18428

23. **DLPATH.1, DLPATH.2 checking**
    - Location: `utils/file-upload.util.ts:36`
    - Reference: express.e:18431-18439

24. **ULPATH.1, ULPATH.2 checking**
    - Location: `utils/file-upload.util.ts:37`
    - Reference: express.e:18440-18448

25. **File area directory structure**
    - Location: `utils/file-hold.util.ts:184`

### AREXX / Script Execution

26. **UPLOAD event AREXX script**
    - Location: `utils/upload-notify.util.ts:104`
    - Impact: Upload scripts not executed

27. **STATUS_CHANGE execute-on scripts**
    - Location: `utils/security.util.ts:280`
    - Impact: Status change scripts not run

### File Testing

28. **FILECHECK system command**
    - Location: `utils/file-test.util.ts:38`
    - Impact: External file checkers not supported

---

## LOW PRIORITY (Configuration & Optimization)

### Configuration Toggles

29. **USEWILDCARDS toggle**
    - Location: `utils/security.util.ts:100`
    - Reference: sopt.toggles[TOGGLES_USEWILDCARDS]

30. **FORCE_MENUS check**
    - Location: `handlers/command.handler.ts:257`
    - Impact: Force menus option not implemented

31. **LVL_CAPITOLS_in_FILE**
    - Location: `handlers/command.handler.ts:881`
    - Impact: Capital letters in filenames toggle

32. **CREDITBYKB toggle**
    - Location: `handlers/file-status.handler.ts:69`
    - Reference: sopt.toggles[TOGGLES_CREDITBYKB]
    - Impact: KB vs Bytes display

33. **SENTBY_FILES toggle**
    - Location: `index.ts:1203`
    - Impact: "Sent by" in file uploads

34. **MAIL_ON_UPLOAD config**
    - Location: `index.ts:1299`
    - Impact: Email on upload not configurable

35. **maxDirs configuration**
    - Location: `index.ts:1202`
    - Impact: Hardcoded to 1

36. **Total conferences config**
    - Location: `handlers/file-status.handler.ts:58`
    - Impact: Hardcoded to 3

### Security / Access Control

37. **checkToolTypeExists(TOOLTYPE_DEFAULT_ACCESS)**
    - Location: `utils/security.util.ts:106`

38. **checkToolTypeExists(TOOLTYPE_USER_ACCESS)**
    - Location: `utils/security.util.ts:116, 295`

39. **checkSecurity(ACS_OVERRIDE_DEFAULTS)**
    - Location: `utils/security.util.ts:299`

40. **User security level permissions**
    - Location: `handlers/file-listing.handler.ts:271`

### Notifications & Logging

41. **Email sending (sendMail)**
    - Location: `utils/upload-notify.util.ts:116`
    - Impact: Email notifications not sent

42. **Sysop email from config**
    - Location: `index.ts:1298`
    - Impact: Hardcoded sysop email

43. **callersLog for account editing**
    - Location: `handlers/sysop-commands.handler.ts:100`
    - Impact: Account edits not logged

### Utilities

44. **Environment stat tracking**
    - Location: `index.ts:389`
    - Reference: setEnvStat - express.e:24360

45. **qwkZoom() function**
    - Location: `handlers/utility-commands.handler.ts:407`

46. **asciiZoom() function**
    - Location: `handlers/utility-commands.handler.ts:407`

47. **BCD formatting**
    - Location: `handlers/file-status.handler.ts:181`

### User Interface

48. **Numbered parameter selection**
    - Location: `handlers/command.handler.ts:1033`
    - Impact: Cannot select items 0-14 by number

49. **pendingJoinMsgBaseInput flag**
    - Location: `handlers/user-commands.handler.ts:235`

### Database

50. **Chat rooms schema fix**
    - Location: `database.ts:815`
    - Impact: Schema mismatch warning

### Archive / File Systems

51. **Amiga OFS/FFS filesystem parser**
    - Location: `utils/dms-extractor.ts:86, 70-73`
    - Impact: Can't extract files from DMS archives
    - Status: Complex - requires filesystem implementation

---

## IMPLEMENTATION PRIORITY MATRIX

### Immediate (This Session)
1. ✅ flagPause - File/search pause functionality
2. ✅ maxDirs - Proper directory limits
3. View file pause functionality

### Next Session
4. R/E commands (message read/enter)
5. Door execution (native + script)
6. Download ratio checking
7. Conference access checking

### Future Sessions
8. OLM system
9. Multi-node coordination
10. AREXX script execution
11. All configuration toggles
12. Amiga filesystem parser

---

## REFERENCE LOCATIONS

**Primary Source:** `~/Code/AmiExpress-Web/AmiExpress-Sources/express.e`

**Key Functions to Reference:**
- flagPause(): Line 27583-27585
- internalCommandR(): Line 25518-25532
- internalCommandE(): Line 24860-24868
- displayFileList(): Line 27626+
- checkRatiosAndTime(): Search in express.e
- checkConfAccess(): Search in express.e
- doorExecute(): Search in express.e

---

## NOTES

- All implementations MUST be 1:1 with express.e
- NO guessing - always check original E sources
- Preserve original behavior exactly
- Document express.e line numbers in comments
- Test each implementation before moving to next

**Status:** Ready for systematic implementation
