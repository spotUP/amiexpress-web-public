# 68K Door Status Tracker

Last updated: 2026-01-30

## Summary

| Status | Count |
|--------|-------|
| Working | 45 |
| Needs Testing | 1 |
| Partial | 10 |
| Broken | 3 |
| Complex/Deferred | 1 |
| Untested | 0 |
| **Total** | **60** |

---

## Working Doors

| Cmd | Location | Notes |
|-----|----------|-------|
| B | DOORS:EmP_Tools/Bulls | Bulletin viewer |
| DD | BBS:doors/TurboLister/TurboLister.XiM | File lister - needs Dir files populated |
| ED | Doors:5D-Edit/5D-Edit | Text editor - needs Dir files populated |
| conftop | DOORS:CONFTOP/CONFTOP020.X | Batch utility - shows version and exits |
| ga | Doors:GetAnswer/GetAnswer | Answer viewer - use Ctrl+C to exit (door loops by design) |
| J | Doors:emp_tools/joincnf | Conference joiner |
| S | doors:ustats/stats | ZooStats user statistics |
| Z | Doors:5D-ZippySearch/5D-ZippySearch | Zippy search |
| games | doors:5D-AdiMenu/5D-AdiMenu | Games menu |
| req | BBS:Doors/Request/Request | File request - fixed VFPrintf offset and config paths |
| SIZE | DOORS:SizeCheck/SizeCheck | Conference size checker - counts files/bytes per directory |
| RTW | DOORS:RTW/rtw | Real Time Who - shows who's online across nodes |
| TList | Doors:SRH/TList/TLP2 | T-List BBS listing - line-by-line intro (press n to skip, Enter/y to continue) |
| MRCSTAT1 | doors:mrc/mrcstat1 | MRC stats |
| nuke | Doors:Bossnuke/Bossnuke | Boss nuke - prompts for password |

### BBSLink Gateway (TELNET_CONNECT Working)

All BBSLink doors work via TELNET_CONNECT (XIM 706):
arcl, assn, bbsc, bcr, bord, dark, dkns, dmas, dmud, falc, fhon, fish, hack, junk, legn, lmon, lord2, mega, mmot, mzkl, netr, ooii, teos, vsys

### AquaScan (All Working)

All AquaScan variants work correctly. File flagging persists after door exit.

| Cmd | Binary | Function |
|-----|--------|----------|
| cs | AquaScan.020 | Conference scan |
| f | AquaScan.020 | File scan |
| fr | AquaScan.020 | File request scan |
| N | AquaScan.000 | New files |
| nsu | AquaScan.020 | New since upload |
| scan | AquaScan.020 | General scan |

---

## Partial Doors

| Cmd | Location | Issue |
|-----|----------|-------|
| I | DOORS:EPUtils/SysInfo/SysInfo | Shows UI but date string appears for all fields |
| fake | doors:bytekiller/byteComment | Shows prompt - needs files to fully test |
| ulist | Doors:5D-User/5D-User | Needs T:5D-USER_DATA.{node} file - who's online door |
| ctop | DOORS:CONFTOP/ctop | MSGBASE_LOC fixed, but door exits silently without output |

---

## Needs Testing

| Cmd | Location | Notes |
|-----|----------|-------|
| WHAT | DOORS:What/What | Transfer monitor - shows "no activity" (need multi-node transfer to verify) |

---

## Complex / Deferred

| Cmd | Location | Issue |
|-----|----------|-------|
| MRC | doors:mrc/mrc_door | Works but 30s input lag - door's network timeout design, not emulation bug |

---

## Broken Doors

| Cmd | Location | Issue |
|-----|----------|-------|
| wall | dOORS:dRE/dRE!WAll/dRE!WAll | Data corruption - see dRE_WALL_HANDOFF.md |
| AEDOOR | Doors/AEDOOR/aedoor | Binary not found - path issue |
| AEHELP | Doors/AEHELP/aehelp | Binary not found - path issue |

---

## Partial Doors

| Cmd | Location | Issue |
|-----|----------|-------|
| I | DOORS:EPUtils/SysInfo/SysInfo | Shows UI but date string appears for all fields |
| fake | doors:bytekiller/byteComment | Shows prompt - needs files to fully test |
| ulist | Doors:5D-User/5D-User | Needs T:5D-USER_DATA.{node} file - who's online door |
| ctop | DOORS:CONFTOP/ctop | MSGBASE_LOC fixed, but door exits silently without output |
| Kick | Doors:!!!War!!!/WarKick'Em/WarKick'Em | Prints goodbye text and exits immediately - no game interface |
| DEL | DOORS:-mgs!-MgzListMan/MGZLISTMAN | Exits silently without output |
| Olm | DOORS:!!!WAR!!!/WAROLM/WAROLM | UI works but node data scrambled - DT_NAME/DT_LOCATION/BB_NODEID return wrong values |
| mrcstat2 | doors:mrc/mrcstat2 | Scrambled data |
| DUPESTART1 | DOORS:CONFTOP/CONFTOP020.X | Reset date is out of range error |
| bk | BBS:doors/bytekiller/bytekiller | Can't find ACP.Icon - needs config |

---

## Untested Doors

### Standard Doors

*No untested doors remaining*

### BBSLink Gateway Doors

Moved to Working - see BBSLink Gateway (TELNET_CONNECT Working) section above.

---

## Status Legend

| Status | Meaning |
|--------|---------|
| Working | Fully functional |
| Partial | Works with issues |
| Broken | Does not work |
| Untested | Not yet tested |
| Needs Testing | Appears to work but needs verification |
| N/A | Missing binary or requires network |

---

## Session Notes

### 2026-01-30: ctop Testing + MSGBASE_LOC Fix

**MSGBASE_LOC Fix (cmd 604):**
- Was falling through to empty string handler in DoorMessageHandler
- Root cause: XIMProtocol.handleMessage routes to specialized handlers; DoorMessageHandler.processCommand is only a fallback
- Fixed by adding MSGBASE_LOC to isBBSInfoCommand list and handleBBSInfoCommand switch in XIMProtocol.ts
- Now correctly returns `BBS:Conf{N}/MsgBase/` path

**ctop (Conference Top Uploaders):**
- MSGBASE_LOC fix confirmed working - returns correct path
- Door queries BBS values successfully, but exits silently without output
- No WriteStr/JH_WRITE calls detected - door doesn't reach output code
- Missing BB_MAINLINE call suggests early exit or binary differs from source
- **Status:** Partial - emulation OK, door-specific issue

### 2026-01-30: MRC Investigation (Working with Caveat)

**MRC (Multi-Relay Chat):**
- Fixed GETKEY/JH_CK (cmd 500) - was consuming input, now just peeks
- Fixed duplicate switch case bug: JH_CK and GETKEY both = 500, JH_CK case matched first
- Input flow verified working: queueInput → inputQueue → GETKEY(peek) → JH_HK(consume)
- **Finding:** 30-second input lag is MRC's network timeout design, NOT emulation bug
- MRC waits for network data (30s timeout), then polls keyboard - this is how door works
- Removing debug logging made UI draw fast, but lag persists (confirms door behavior)
- **Status:** Working - emulation is correct, lag is door's network polling design

### 2026-01-29: Request Door VFPrintf + Config Fix

### 2026-01-29: Request Door VFPrintf + Config Fix

**Request (req):**
- Fixed VFPrintf offset: was -564, should be -354 (dos-vectors.ts)
- View was showing raw format strings `%s %-12.12s %s` instead of data
- Root cause: VFPrintf at wrong offset meant calls went to wrong function
- Fixed config paths in Request.info - had extra `BBS/` prefix
- Added WORK: assign handling in bbs-paths.util.ts
- Set `BULL.MID_STRING=[34m|[0m]` (ANSI colored pipe)
- Door now works: Add/Delete/View file requests, writes messages

### 2026-01-29: 5D-AdiMenu (games) + JH_SF Fix

**5D-AdiMenu (games):**
- Fixed JH_SF missing base path candidate - only tried `.txt`, `.TXT`, etc. but not exact path
- File `Text/games` (no extension) wasn't found because candidates list didn't include base path
- Fix: Added `resolved` as first candidate before extension variants
- File: `web/backend/src/amiga-emulation/xim/io.ts` line 1135

### 2026-01-29: ZippySearch + JH_WRITE Fix

**5D-ZippySearch (Z):**
- Fixed JH_WRITE newline bug - `msg.data` was incorrectly interpreted as newline flag
- express.e:3382-3385 shows JH_WRITE just calls `aePuts(msg.string)` with no newline logic
- Fix: Changed `addNewline = msg.data === 1` to `addNewline = false`
- File: `web/backend/src/amiga-emulation/xim/io.ts` line 461

**Screen Fix:**
- Fixed `~CC_gl` → `~CC_GLC` in `Screens/logon20.txt` (gl command didn't exist)

### 2026-01-29: GetAnswer + Ctrl+C Abort

**GetAnswer (ga):**
- Implemented ParsePatternNoCase() and MatchPatternNoCase() for wildcard matching
- Door now finds users correctly with patterns like `*spot*`
- Infinite loop is door's design flaw (no abort check) - use Ctrl+C to exit

**Ctrl+C Door Abort:**
- Frontend intercepts Ctrl+C when door is active
- Emits `door:terminate` event to backend
- Works in both normal and game mode

**DOS Library Additions:** ParsePattern (-840), MatchPattern (-846), ParsePatternNoCase (-966), MatchPatternNoCase (-972)

### 2026-01-21: AquaScan Complete

- All AquaScan variants working (FR, F, N, cs, nsu, scan)
- JH_FLAGFILE (Command 13) implemented
- Flagged files now persist after door exit
- Download handler searches both Upload/ and Files/ directories

### 2026-01-20: dRE!WAll Investigation

- Data corruption: DT_NAME overwrites msg.string after JH_HK collection
- Ghost characters appear from stale buffer data
- Complete handoff: Documentation/6-Progress/dRE_WALL_HANDOFF.md

### 2026-01-16: SysInfo + dannounce

**SysInfo (I):**
- Added T:SysInfo.TMP auto-generation
- Door shows UI but parses file incorrectly (all fields show date)

**dannounce:**
- Times out (no network in 68K emulator)
- Use TypeScript webhook.service.ts instead

### 2026-01-15: Initial Testing

**TurboLister (DD):** Working after JH_WRITE reply fix
**5D-Edit (ED):** Working - needs Dir files populated
**Conftop:** Working - batch utility
**Joincnf (J):** Now working (fixed later)
**ByteComment (fake):** Partial - needs files to test
