# 68K Door Status Tracker

Last updated: 2026-01-29

## Summary

| Status | Count |
|--------|-------|
| Working | 6 |
| Needs Testing | 1 |
| Partial | 3 |
| Broken | 2 |
| Untested | 55 |
| **Total** | **67** |

---

## Working Doors

| Cmd | Location | Notes |
|-----|----------|-------|
| B | DOORS:EmP_Tools/Bulls | Bulletin viewer |
| DD | BBS:doors/TurboLister/TurboLister.XiM | File lister - needs Dir files populated |
| ED | Doors:5D-Edit/5D-Edit | Text editor - needs Dir files populated |
| conftop | DOORS:CONFTOP/CONFTOP020.X | Batch utility - shows version and exits |
| ga | Doors:GetAnswer/GetAnswer | Answer viewer - use Ctrl+C to exit (door loops by design) |

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
| S | doors:ustats/stats | ZooStats works but user/level/conf values x256 (BBSInfo byte order) |
| fake | doors:bytekiller/byteComment | Shows prompt - needs files to fully test |

---

## Needs Testing

| Cmd | Location | Notes |
|-----|----------|-------|
| WHAT | DOORS:What/What | Transfer monitor - shows "no activity" (need multi-node transfer to verify) |

---

## Broken Doors

| Cmd | Location | Issue |
|-----|----------|-------|
| J | Doors:emp_tools/joincnf | Conference joiner - not working |
| wall | dOORS:dRE/dRE!WAll/dRE!WAll | Data corruption - see dRE_WALL_HANDOFF.md |

---

## Untested Doors

### Standard Doors

| Cmd | Location | Description |
|-----|----------|-------------|
| AEDOOR | Doors/AEDOOR/aedoor | |
| AEHELP | Doors/AEHELP/aehelp | |
| AMIGA68K | DOORS:SDKTEST/AMIGA68K | Test door |
| AMIGAGCC | DOORS:AMIGAGCC/amiga-gcc-hunk | |
| CDEMO | Doors/INTERACTIVE-DEMO/interactive-demo | Interactive demo |
| DEL | DOORS:-mgs!-MgzListMan/MGZLISTMAN | Magazine list manager |
| GLC | DOORS:glc/glcviewer | GLC viewer |
| Kick | Doors:!!!War!!!/WarKick'Em/WarKick'Em | War game |
| MINIMAL | DOORS:SDKTEST/MINIMAL | Test door |
| MRC | doors:mrc/mrc_door | Multi-relay chat |
| MRCSTAT1 | doors:mrc/mrcstat1 | MRC stats |
| mrcstat2 | doors:mrc/mrcstat2 | MRC stats |
| Olm | DOORS:!!!WAR!!!/WAROLM/WAROLM | War game OLM |
| RTW | DOORS:RTW/RTW | |
| SDKTEST | DOORS:SDKTEST/SIMPLETEST | Test door |
| SIZE | DOORS:SizeCheck/SizeCheck | Size checker |
| XIMVBCC | Doors/XIMVBCC/xim-vbcc | VBCC test door |
| Z | Doors:5D-ZippySearch/5D-ZippySearch | Zippy search |
| bk | BBS:doors/bytekiller/bytekiller | ByteKiller |
| ctop | DOORS:CONFTOP/ctop | Conference top |
| games | doors:5D-AdiMenu/5D-AdiMenu | Games menu |
| nuke | Doors:Bossnuke/Bossnuke | Boss nuke |
| req | BBS:Doors/Request/Request | File request |
| TList | Doors:SRH/TList/TLP2 | T-List |
| ulist | Doors:5D-User/5D-User | User list |
| DUPESTART1 | DOORS:CONFTOP/CONFTOP020.X | Conftop variant |

### BBSLink Gateway Doors

All route through bbslink door gateway (require network):

arcl, assn, bbsc, bcr, bord, dark, dkns, dmas, dmud, falc, fhon, fish, hack, junk, legn, lmon, lord2, mega, mmot, mzkl, netr, ooii, teos, vsys

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
**Joincnf (J):** Broken - prevents conference changes
**ByteComment (fake):** Partial - needs files to test
