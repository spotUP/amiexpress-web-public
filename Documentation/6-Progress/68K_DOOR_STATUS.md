# 68K Door Status Tracker

Last updated: 2026-01-21

## Summary
- **Total XIM (68K) doors:** 67
- **Tested:** 8
- **Working:** 4
- **Partial:** 2
- **Broken:** 2
- **Issues:** 0

## Door List

| Cmd | Location | Status | Notes |
|-----|----------|--------|-------|
| AEDOOR | Doors/AEDOOR/aedoor | Untested | |
| AEHELP | Doors/AEHELP/aehelp | Untested | |
| AMIGA68K | DOORS:SDKTEST/AMIGA68K | Untested | Test door - binary may be missing |
| AMIGAGCC | DOORS:AMIGAGCC/amiga-gcc-hunk | Untested | |
| B | DOORS:EmP_Tools/Bulls | Untested | Bulletin viewer |
| CDEMO | Doors/INTERACTIVE-DEMO/interactive-demo | Untested | Interactive demo |
| DEL | DOORS:-mgs!-MgzListMan/MGZLISTMAN | Untested | Magazine list manager |
| ED | Doors:5D-Edit/5D-Edit | Working | Text editor - works, needs Dir files populated (empty in test BBS) |
| GLC | DOORS:glc/glcviewer | Untested | GLC viewer |
| I | DOORS:EPUtils/SysInfo/SysInfo | Partial | System info - displays UI but shows date for all fields instead of ACP/Express versions. T:SysInfo.TMP auto-generation works, door parsing issue needs investigation |
| J | Doors:emp_tools/joincnf | Broken | Conference joiner - not working (needs investigation) |
| Kick | Doors:!!!War!!!/WarKick'Em/WarKick'Em | Untested | War game |
| MINIMAL | DOORS:SDKTEST/MINIMAL | Untested | Test door - binary may be missing |
| MRC | doors:mrc/mrc_door | Untested | Multi-relay chat (needs network) |
| MRCSTAT1 | doors:mrc/mrcstat1 | Untested | MRC stats |
| mrcstat2 | doors:mrc/mrcstat2 | Untested | MRC stats |
| Olm | DOORS:!!!WAR!!!/WAROLM/WAROLM | Untested | War game OLM |
| RTW | DOORS:RTW/RTW | Untested | |
| S | doors:ustats/stats | Untested | User stats |
| SDKTEST | DOORS:SDKTEST/SIMPLETEST | Untested | Test door - binary may be missing |
| SIZE | DOORS:SizeCheck/SizeCheck | Untested | Size checker |
| WHAT | DOORS:What/What | Untested | What command |
| XIMVBCC | Doors/XIMVBCC/xim-vbcc | Untested | VBCC test door |
| Z | Doors:5D-ZippySearch/5D-ZippySearch | Untested | Zippy search |
| bk | BBS:doors/bytekiller/bytekiller | Untested | ByteKiller (path fixed) |
| conftop | DOORS:CONFTOP/CONFTOP020.X | Working | Shows version and exits (batch utility) |
| ctop | DOORS:CONFTOP/ctop | Untested | Conference top |
| fake | doors:bytekiller/byteComment | Partial | ByteComment - outputs prompt, needs files to fully test |
| ga | Doors:GetAnswer/GetAnswer | Untested | Get answer prompt |
| games | doors:5D-AdiMenu/5D-AdiMenu | Untested | Games menu |
| nuke | Doors:Bossnuke/Bossnuke | Untested | Boss nuke |
| req | BBS:Doors/Request/Request | Untested | File request (path fixed) |
| TList | Doors:SRH/TList/TLP2 | Untested | T-List |
| ulist | Doors:5D-User/5D-User | Untested | User list |
| wall | dOORS:dRE/dRE!WAll/dRE!WAll | Broken | Data corruption: ghost characters, stale msg.string data, JH_HK/DT_NAME issues - see dRE_WALL_HANDOFF.md |
| DD | BBS:doors/TurboLister/TurboLister.XiM | Working | Works after JH_WRITE reply fix - needs Dir files populated |

### AquaScan Variants
| Cmd | Location | Status | Notes |
|-----|----------|--------|-------|
| cs | Doors:AquaScan/AquaScan.020 | Working | Conference scan |
| f | Doors:AquaScan/AquaScan.020 | Working | File scan |
| fr | Doors:AquaScan/AquaScan.020 | Working | File request scan |
| N | Doors:AquaScan/AquaScan.000 | Working | New files |
| nsu | Doors:AquaScan/AquaScan.020 | Working | New since upload |
| scan | Doors:AquaScan/AquaScan.020 | Working | General scan |

### BBSLink Gateway Doors
These all route through the bbslink door gateway:

| Cmd | Status | Notes |
|-----|--------|-------|
| arcl | Untested | |
| assn | Untested | |
| bbsc | Untested | |
| bcr | Untested | |
| bord | Untested | |
| dark | Untested | |
| dkns | Untested | |
| dmas | Untested | |
| dmud | Untested | |
| falc | Untested | |
| fhon | Untested | |
| fish | Untested | |
| hack | Untested | |
| junk | Untested | |
| legn | Untested | |
| lmon | Untested | |
| lord2 | Untested | |
| mega | Untested | |
| mmot | Untested | |
| mzkl | Untested | |
| netr | Untested | |
| ooii | Untested | |
| teos | Untested | |
| vsys | Untested | |

### Conftop Variants
| Cmd | Location | Status | Notes |
|-----|----------|--------|-------|
| conftop | DOORS:CONFTOP/CONFTOP020.X | Working | Shows version and exits |
| ctop | DOORS:CONFTOP/ctop | Untested | |
| DUPESTART1 | DOORS:CONFTOP/CONFTOP020.X | Untested | |

---

## Status Legend
- **Untested** - Not yet tested
- **Working** - Fully functional
- **Partial** - Works but with issues
- **Broken** - Does not work
- **N/A** - Not applicable (missing binary, network required, etc.)

## Testing Notes

### 2026-01-15 Session

**dRE!WAll (wall):**
- Input handling works correctly after JH_HK fixes
- Characters are echoed, Enter submits line
- DT_NAME returns correct username
- DOS Write is called (100 bytes)
- BUT: New entries not saved - door writes old data to file
- May be a door-specific bug or something subtle we're missing

**5D-Edit (ED):**
- Double prompt displayed (door registers twice - cosmetic)
- ~~'c' key not echoed - race condition~~ FIXED: Added inputQueue drain in handleLineInput
- ~~Mouse events leaking into input~~ FIXED: Added JSON filter in queueInput
- "Cannot find file in dir listing" - NOT A BUG: Dir1/Dir2 files are empty (0 bytes)
- Door reads BBS:Conf1/Dir1 correctly, file just has no content
- STATUS: Working - needs Dir files populated to test file editing

**Conftop:**
- Works - shows version "Conftop v2.3" and exits
- Likely a batch utility meant to run from batch scripts

**Joincnf (J):**
- Not working - needs investigation
- Prevents changing conferences

**ByteComment (fake):**
- Shows banner and prompt correctly
- Cannot fully test without files in Dir listings

**TurboLister (DD):**
- ~~Stuck in infinite loop polling BB_CONFLOCAL~~ FIXED!
- ROOT CAUSE: AEDoor.library doors use mn_ReplyPort, not bidirectional XIM
- FIX 1: Detect msg.replyPort in bbs-info.ts/data-query.ts for BB_* commands
- FIX 2: Add replyMsg() to io.ts handleWrite() for JH_WRITE replies
- Now progresses correctly: BB_CONFLOCAL -> BB_CONFNAME -> JH_WRITE -> exit
- "Can't open File!!" = needs NDIRS config AND Dir files with content
- STATUS: Working - door runs correctly, just needs file listing data to display

### 2026-01-16 Session

**SysInfo (I):**
- Was showing "File Error" - T:SysInfo.TMP not being created
- Added auto-generation of T:SysInfo.TMP with date and version strings
- Added Execute() shell redirection parsing (">file", ">>file")
- Disabled memory caching for T: files (temp files may be rewritten by Execute())
- Added skipSnapshot option for T: files (allows reading files rewritten externally)
- Door now displays UI but shows date string for ALL fields (Date, ACP, Express)
- Issue: Door reads T:SysInfo.TMP and expects 3 separate lines (FGets), but parsing isn't working correctly
- T:SysInfo.TMP has correct content: date\nacpVersion\nexpressVersion\n
- Tooltypes in .info file: ACP_LOCATION=BBS:ACP, EXP_LOCATION=BBS:EXPRESS
- STATUS: Partial - needs further investigation of door's FGets/line parsing

**dannounce (Discord Announce):**
- 68K utility that sends login/logout notifications to Discord via AmiSSL/HTTPS
- Times out after 300s because 68K emulator has no network access
- FIX: Added intercept in batch-scheduler.ts to skip 68K binary
- TypeScript webhook.service.ts already provides same functionality (USER_LOGIN/USER_LOGOUT)
- Use WEBHOOK admin command to configure Discord webhooks
- STATUS: N/A - Use TypeScript webhook.service.ts instead of 68K binary

### 2026-01-20 Session

**dRE!WAll (wall) - DEEP DIVE:**
- STATUS CHANGE: Partial -> Broken (data loss bug confirmed)
- Root cause identified: DT_NAME overwrites msg.string after JH_HK character collection
- JH_HK implementation verified correct (matches express.e:3445-3447 exactly)
- Character flow: 'p' 'o' 'o' 'p' written to msg.string[0], echoed correctly
- DT_NAME call writes "sysop" to msg.string, destroying collected characters
- Door writes OLD data (original "kokkiklhs / Hello from Athens")
- msg.stringPtr investigation: stringPtr = embedded buffer (no separate buffer)
- File operations verified: Read gets correct 100 bytes, Write happens but with wrong data
- Initial display issue: Existing entries not shown until AFTER submit
- Tested 15+ entries: "test", "yo", "burp", "hoho", "to", "poop" - all lost
- **CRITICAL BUG:** "Ghost Y" - door echoed "y" when user typed 10 different characters
  - Indicates msg.string contains stale data from previous prompt "Write Anonymous? (N/y):"
  - Door is reading corrupt/stale msg.string data instead of fresh input
- **FAILED ATTEMPT:** LINE INPUT MODE hypothesis (msg.data = max length) - WRONG!
  - msg.data is TIMEOUT in seconds, not character count
  - Express.e:1128 confirms `ch:=readChar(doorTimeout)` - single char only
  - Reverted this incorrect change
- Complete handoff document: Documentation/6-Progress/dRE_WALL_HANDOFF.md
- PRIORITY: LOW - Non-essential door, moving to FR (File Request) - critical functionality

### 2026-01-21 Session

**AquaScan (FR, F, N, cs, nsu, scan) - COMPLETE:**
- All variants working (FR, F, N, cs, nsu, scan)
- File browsing fully functional
- **JH_FLAGFILE (Command 13):** File flagging with F command working
- **Issue #1 Fixed:** Flagged files now persist after door exit
  - Root cause: bbsSession is separate object from main session
  - Fix: Copy bbsSession.flaggedFiles to session.flaggedFiles on door exit
  - Location: door.handler.ts:794-803, 2414-2422
- **Issue #2 Fixed:** Download handler now finds files in both Upload/ and Files/ directories
  - Root cause: findFilesInConference() only searched Conf{N}/Files/
  - Fix: Search BOTH Conf{N}/Upload/ and Conf{N}/Files/ directories
  - Location: download.handler.ts:540-586
- **End-to-end workflow:** Flag file in FR (F command) -> Quit (Q) -> Download (D) -> File appears in download list
- Documentation: FLAGGED_FILES_PERSISTENCE_FIX.md
- STATUS: Working - Complete file request/flagging/download functionality

