# 68K Door Status Tracker

Last updated: 2026-04-20

## Summary

| Status | Count |
|--------|-------|
| Working | 48 |
| Needs Testing | 4 |
| Partial | 5 |
| Broken | 0 |
| Complex/Deferred | 1 |
| Untested | 0 |
| **Total** | **58** |

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
| AEHELP | DOORS:AEHELP/aehelp | AEDoor help |
| bk | BBS:doors/bytekiller/bytekiller | Fake-file nuker (end-to-end verified 2026-04-19). Needs `NUKER.n=<username>` entry in `bytekiller.info` for access. |
| wall | dOORS:dRE/dRE!WAll/dRE!WAll | Wall writer — end-to-end verified 2026-04-20 (username + tag save correctly, absolute positioning + clear screen all render). Fixed by three layered XIM bugs: d3dabc62c. |

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

*None currently.* (`wall` moved to Working — see session notes 2026-04-20.)

---

## Partial Doors

| Cmd | Location | Issue |
|-----|----------|-------|
| ulist | Doors:5D-User/5D-User | Non-standard XIM - no reply port, expects pre-populated data on AEDoorPort (multi-node design) |
| ctop | DOORS:CONFTOP/ctop | MSGBASE_LOC fixed, but door exits silently without output |
| Kick | Doors:!!!War!!!/WarKick'Em/WarKick'Em | Prints goodbye text and exits immediately - no game interface |
| DEL | DOORS:-mgs!-MgzListMan/MGZLISTMAN | Exits silently without output |
| DUPESTART1 | DOORS:CONFTOP/CONFTOP020.X | Reset date is out of range error |

---

## Needs Retest (post d3dabc62c + 2026-04-20 fixes)

The DT_NAME stale-reply race (commit `d3dabc62c`, 2026-04-20) fixed a
systemic bug where DT_*/BB_*/JH_* replies could ship stale msg.string
contents in the AEDoor.library sync-trap path. Several "partial" doors
reported symptoms consistent with that race — moved here pending
re-test with the fix in place.

| Cmd | Prior issue | Why likely fixed |
|-----|-------------|------------------|
| I SysInfo | "Location: sysop" — DT_LOCATION returning username | Stale buffer from prior DT_NAME call; now each DT_* reply marks state.replyHandled and Path 4 skips its fallback replyMsg |
| Olm | "DT_NAME/DT_LOCATION/BB_NODEID return wrong values" | Same class of stale-reply race; was the canonical symptom that drove the investigation |
| mrcstat2 | "Scrambled data" | Per 2026-04-19 triage already "may be correct" (OFFLINE expected in web port) — verify with MRC-connected session |
| fake ByteComment | `Can't find \n.Icon` — GetDiskObject called with empty name | Fixed by IconLibrary empty-name fallback to door binary's own .info (commit pending) |

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

### 2026-04-19: Automated triage of 9 partial doors via debug MCP

Ran `run_door_sandbox` against every remaining partial via the new `/debug/api/sandbox/run-door` endpoint (no live BBS session needed). 3 root-cause buckets identified:

**Bucket A — invalid PC at function prologue (4 doors)**: `fake` (ByteComment), `ulist` (5D-User), `Kick` (WarKick'Em), `Olm` (WAROLM). All four trap at the first `movem.l D1-D6/A0-A6, -(A7)` at PC 0x2008; new PC lands at 0x7fece (out of code region). Same instruction pattern — `opcode=0x48e7 operand=0x7efe2448`. Likely MOIRA address-error mishandling on push-to-allocated-stack, or incorrect next-PC for movem pre-decrement. Fix one, probably fix all four.

**Bucket B — single-hunk (code-only) binaries (2 doors)**: `ctop`, `DEL` (MGZLISTMAN). Both log `No DATA segment found - allocating synthetic BSS`. `ctop` then stuck-loops with `No reply for command 100/128/149/...` — XIM replies never reach the door. Synthetic BSS appears to break the reply-port memory layout.

**Bucket C — interactive timeouts (3 doors)**: `I` SysInfo, `mrcstat2`, `DUPESTART1`. Either waiting on input (need scripted input via sandbox) or exceeding the 8s default. SysInfo is known to reach `JH_SHUTDOWN` given enough time.

**Follow-up live-session investigation (same day, via the new debug MCP):**

- Launched `Olm` live via `POST /debug/api/sessions/5/input` with `"Olm\r"`.
- `get_emulator_state` returned `PC: 0x77e2 (_PutMsg+0x12)` — symbol-annotated in real time using the HunkLoader `_PutMsg` entry. The door is *actually running* and executing in exec.library's PutMsg trampoline.
- `read_memory addr=0x7fec0 len=64` showed `00 00 4a fc 00 00 00 00 ... 4a fc ...` — the "0x7fece" from the sandbox log is a **guard region filled with `4A FC` (ILLEGAL 68K opcode)**, not a real destination. The "FIRST INVALID PC DETECTED" log is a DoorLifecycleManager out-of-bounds *diagnostic*, not a fatal trap — the doors recover and continue.
- `get_xim_tail` showed Olm drawing its WHO-selection screen (USER/LOCATION/ACTION table, cursor arrows, `RAWARROW` input). The rendered screen via `get_output_tail` shows the full UI with "Awating Connect" placeholders for empty nodes.

**Revised understanding:**

Bucket A (`fake`, `ulist`, `Kick`, `Olm`) was a **false positive** — the sandbox cuts them off before they finish init. Live, `Olm` runs fine. The other three likely do too (need live-session verification). The remaining uncertainty is whether per-node data (`DT_NAME`, `DT_LOCATION`, multicom) is populated correctly — Olm currently shows placeholders, which *might* be correct for empty nodes or might be the original "scrambled data" symptom in a new guise.

**Sandbox caveat:** `run_door_sandbox` is unreliable for doors needing multi-node BBS state — `MulticomManager` reports "Writing 0 tracked nodes" in sandbox mode, so WHO/OLM-style doors exit or loop without their dependencies. Use live-session MCP tools (`send_input` + `wait_for_output` + `kill_door`) for this class of door.

**Incidental fix:** `kill_door` endpoint now cascades through `socket.emit('door:terminate')` so the parent `AmigaDoorSession.terminate()` runs (previously only `DoorLifecycleManager.terminate()` fired, leaving a stale debug-registry entry).

### 2026-04-19: MCP-driven live triage — node-5 sweep of 7 partials

Ran each partial command through node 5 (sysop at `display_menu`) via `POST /debug/api/sessions/5/input` and collected the rendered screen. All 7 doors launched and produced output — status-doc entries need revision:

| Cmd | Actual current behaviour |
|-----|-------------------------|
| `I` SysInfo | Renders its UI correctly with Port/Baud/Status fields. `Handle: sysop` is correct but `Location: sysop` is wrong (should be the user's location — DT_LOCATION is returning the username). Aborts with "A File Error has Occured!" before completing. Status-doc claim "date string for all fields" is outdated — current symptom is Location/DT_LOCATION. |
| `mrcstat2` | Renders `MRC[OFFLINE] BBS[   ] Rms[   ] Usr[   ] Act[NUL]` — **this may actually be correct** (MRC isn't network-connected in the web port, so OFFLINE with empty fields is expected). Needs verification against a connected MRC session. Not scrambled. |
| `fake` ByteComment | Prints banner then `Can`t find \n.Icon` — `GetDiskObject` called with empty name. Same class of bug bytekiller had; probably wants its own `.info` but passes an empty string. Fixable. |
| `ulist` 5D-User | `[68K] ULIST exited with FAIL`. Matches known design (requires pre-populated multi-node data via AEDoorPort). |
| `Kick` WarKick'Em | Prints goodbye banner and exits. Per status-doc, "no game interface" — this may be the door's intended behaviour for a non-authorised user. |
| `DEL` MGZLISTMAN | Silent exit, no output. Still partial. |
| `ctop` CONFTOP/ctop | Silent exit, no output. Still partial (same as before). |

Key outcomes:
- `mrcstat2` may already be working — move to "Working" pending MRC-connected validation.
- SysInfo's bug is DT_LOCATION, not all-fields-date as documented.
- ByteComment has a concrete bug that's a variant of the bytekiller GetDiskObject issue.
- `DEL` and `ctop` are the most mysterious; deserve the next deep-dive.

Autonomous triage via MCP is **working**. The `send_input`/`get_output_tail` loop on a clean menu-state session delivers the rendered screen per door in under 3 seconds, no manual intervention.

### 2026-04-19: icon.library GetDiskObject Path Resolution + Synthetic ACP

**Issue**: `GetDiskObject("ACP")` from bytekiller (and likely other legacy doors) returned NULL because icon.library only tried the door's own directory for bare filenames. On real AmigaOS, bare filenames resolve against the process's CurrentDir, which for BBS doors is the BBS root.

**Fix** (`web/backend/src/amiga-emulation/api/IconLibrary.ts`):
1. Build a candidate list: BBS root first, door directory as fallback. Matches AmigaOS semantics; doors using DOORS:/PROGDIR:/BBS: prefixes unaffected.
2. When a door asks for "ACP" and no ACP.info exists, synthesize tooltypes from the running BBS state (BBS_LOCATION, NDIRS, USER_DATA, NODE<n>_LOCATION per Node directory, ULPATH.<n>/DLPATH.<n> pulled from each Conf<n>/ConfConfig.info). AmiExpress-Web renamed ACP.info to bbsConfig.info, so legacy doors calling GetDiskObject("ACP") previously had no way to read classic ACP tooltypes.

**Verification**: bytekiller no longer prints "Can`t find ACP.Icon"; reads 43 synthesized tooltypes. Working doors (AquaScan, conftop) unaffected — same resolution paths, same behavior.

### 2026-01-30: 5D-User (ulist) Investigation

**5D-User (Who's Online Door):**
- Door uses non-standard XIM implementation - no AEDoor.library
- Does NOT create a reply port (unlike RTW which has AEDoorRP.xxx)
- Only references `AEDoorPort%s` - no reply port string
- Door flow: FindPort → GetMsg (expects data already there) → exits if empty
- Never sends XIM queries (DT_NAME, etc.) because GetMsg check fails first
- Uses `T:5D-USER_DATA.%d` as temp file to store gathered data
- References `BBS:User.Data` for user database
- References `Doors:5D-Page/5D-Page.User%ld` (5D-Page door not present)
- **Finding:** Door designed for multi-node environment where nodes push data to each other
- **Status:** Partial - requires pre-populated port data or multi-node setup

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
