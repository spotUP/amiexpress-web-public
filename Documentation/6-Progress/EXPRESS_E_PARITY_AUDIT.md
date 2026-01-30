# AmiExpress express.e vs TypeScript Implementation - Comprehensive Parity Audit

**Audit Date:** 2026-01-29
**Analyzed By:** Claude Code Analysis Agents (10 parallel agents)
**express.e Version:** 32,248 lines

---

## Executive Summary

This audit compares our TypeScript AmiExpress-Web implementation against the original express.e source code to verify 1:1 behavioral parity. The analysis was conducted using 10 parallel agents examining different subsystems.

### Overall Status

| Category | Full Match | Partial | Missing/Stub | Acceptable Deviations |
|----------|------------|---------|--------------|----------------------|
| Commands A-G | 10 | 3 | 0 | 0 |
| Commands H-Q | 7 | 3 | 2 | 0 |
| Commands R-Z | 12 | 4 | 0 | 0 |
| Sysop Commands 0-5 | 1 | 1 | 4 (stub - intentional) | 0 |
| MCI Codes | 45+ | 5 | 0 | 0 |
| Screen Flow | 3 | 2 | 2 | 0 |
| Door Execution | 24 | 3 | 13 | 0 |
| File Operations | 5 | 3 | 2 | 0 |
| Message/Mail System | 10 | 5 | 9 | 1 |
| User Account System | 10 | 9 | 36 | 3 |

---

## 1. Internal Commands Analysis

### Commands A-G (77% Full Parity)

| Command | Name | Status | Notes |
|---------|------|--------|-------|
| A | Accounts/Who Online | **MATCH** | - |
| B | Bulletins | **MATCH** | - |
| C | Comment to Sysop | **PARTIAL** | Missing CUSTOM tooltype check |
| CF | Conference Flags | **PARTIAL** | Missing customMsgbaseCmd support |
| CM | Change Message Base | **MATCH** | - |
| D | Download | **MATCH** | - |
| E | Enter Message | **PARTIAL** | Missing CUSTOM tooltype check |
| F | File Listing | **MATCH** | - |
| FR | File Listing Reverse | **MATCH** | - |
| FM | File Maintenance | **MATCH** | - |
| FS | File Status | **MATCH** | - |
| G | Goodbye | **MATCH** | - |
| GR | Goto Remote | **MATCH** | - |

### Commands H-Q

| Command | Name | Status | Notes |
|---------|------|--------|-------|
| H | Help | **MATCH** | - |
| J | Join Conference | **MATCH** | - |
| JM | Join Message Base | **MATCH** | - |
| L | List Messages | **MATCH** | - |
| MS | Mail Scan | **PARTIAL** | Doesn't call joinConf() with FORCE_MAILSCAN_ALL |
| N | New Files | **MATCH** | Via AquaScan |
| O | Operator Page | **MATCH** | - |
| P | Post Public Message | **MATCH** | - |
| Q | Quick Message | **MATCH** | - |

### Commands R-Z

| Command | Name | Status | Notes |
|---------|------|--------|-------|
| R | Read Messages | **MATCH** | - |
| RL | Read Logoff | **MATCH** | - |
| S | User Stats | **FIXED** | All fields including fileStatus() per express.e:25604 |
| T | Time/Date | **MATCH** | Uses FORMAT_USA (MM-DD-YY) per express.e:25629 |
| U | Upload | **MATCH** | - |
| V | Version | **MATCH** | WEB additions acceptable |
| VER | Verbose Version | **MATCH** | WEB additions acceptable |
| W | User Config | **MATCH** | - |
| WHO | Who's Online | **MATCH** | - |
| WHD | Who Detail | **MATCH** | - |
| X | Expert Toggle | **MATCH** | - |
| Y | Yell/Page Sysop | **MATCH** | - |
| Z | Zip Search | **PARTIAL** | Implementation differs slightly |
| ZOOM | Zoom Search | **PARTIAL** | Implementation differs slightly |
| ^ | Conference List | **MATCH** | - |

### Sysop Commands 0-5

| Command | Name | Status | Notes |
|---------|------|--------|-------|
| 0 | Remote Shell | **STUB** | Intentional - AmigaDOS specific |
| 1 | Account Editing | **MATCH** | - |
| 2 | Callers Log | **PARTIAL** | Missing multi-node log selection |
| 3 | Edit Dir Files | **STUB** | Intentional - MicroEmacs specific |
| 4 | Edit Any File | **STUB** | Intentional - Security concern |
| 5 | Navigate Filesystem | **STUB** | Intentional - Security concern |

---

## 2. MCI Codes Analysis

### Color Code Mapping Issue (CRITICAL)

**Problem:** Color codes c1/c3/c4/c6 and corresponding b1/b3/b4/b6 are swapped.

| MCI Code | express.e Color | Our Implementation | Status |
|----------|-----------------|-------------------|--------|
| c1, b1 | Red [31m] | Blue [34m] | **WRONG** |
| c3, b3 | Yellow [33m] | Cyan [36m] | **WRONG** |
| c4, b4 | Blue [34m] | Red [31m] | **WRONG** |
| c6, b6 | Cyan [36m] | Yellow [33m] | **WRONG** |

**Fix Location:** `web/backend/src/handlers/screen.handler.ts`

### Other MCI Codes

| Code | Purpose | Status |
|------|---------|--------|
| ~UN | Username | **MATCH** |
| ~AL | Alias | **MATCH** |
| ~LO | Location | **MATCH** |
| ~CN | Conference Name | **MATCH** |
| ~AK | Access Keys | **MATCH** - Shows F1-F10 sysop keys per express.e:29863-29871 |
| ~FC | Flagged Files Count | **MATCH** - Returns flagFilesList.count() |
| ~FF | Flagged Files List | **MATCH** |
| ~FL | Flagged Files Lines | **MATCH** - One file per line per express.e:5446-5454 |
| All other codes | Various | **MATCH** |

---

## 3. Screen Flow Analysis

### Login Sequence (express.e:28556-28648)

| Step | Screen/Action | express.e Lines | Status | Notes |
|------|--------------|-----------------|--------|-------|
| 1 | BBSTITLE | 28556-28557 | **MATCH** | - |
| 2 | LOGON | 29854-29855 | **MATCH** | - |
| 3 | BULL | 28556-28557 | **MATCH** | - |
| 4 | NODE_BULL | 28559-28560 | **MATCH** | - |
| 5 | confScan | 28566-28648 | **MATCH** | Enabled and working per express.e:28066-28150 |
| 6 | CONF_BULL | 28574-28576 | **MATCH** | - |
| 7 | MENU | 28578-28580 | **PARTIAL** | Missing doorExpertMode check |

### Critical Missing Features

~~1. **quickFlag NOT implemented** (express.e:29812-29829)~~ **FIXED**
   - Implemented in pre-login.ts:129-132 and command.handler.ts:589-590
   - 'Q' at ANSI prompt sets quickFlag=TRUE per express.e:29545

~~2. **confScan DISABLED** (express.e:28566-28648)~~ **FIXED**
   - confScan is enabled and working per express.e:28066-28150
   - Scans all conferences for new mail and files

3. **doorExpertMode check missing** (express.e:28578-28580)
   - Should check FORCE_MENUS tooltype before displaying menu
   - Non-expert mode should always display menu

---

## 4. Door Execution System Analysis

### runDoor() Implementation (express.e:4231-4544)

| Feature | Status | Notes |
|---------|--------|-------|
| Door type handling (XIM/SIM/TIM/IIM/SUP/AIM) | **MATCH** | - |
| AIM->XIM conversion | **MATCH** | - |
| Port naming (AEDoorPort vs DoorControl) | **MATCH** | - |
| File existence check | **PARTIAL** | Error handling differs |
| Async execution | **MATCH** | - |
| XIM message loop | **MATCH** | - |
| TIM/SIM PG_* commands | **MATCH** | 14/16 commands |
| RETURNCOMMAND execution | **MATCH** | Implemented in door.handler.ts:773-839 |

### XIM Command Implementation

| Command | Code | Status | Notes |
|---------|------|--------|-------|
| LOAD_ACCOUNT | 532/633 | **MATCH** | Via XIMProtocol → XIMSystemCommandsHandler |
| SAVE_ACCOUNT | 533 | **MATCH** | Via XIMProtocol → XIMSystemCommandsHandler |
| SEARCH_ACCOUNT | 537 | **MATCH** | Via XIMProtocol → XIMSystemCommandsHandler |
| APPEND_ACCOUNT | 538 | **MATCH** | Via XIMProtocol → XIMSystemCommandsHandler |
| LAST_ACCOUNTNUM | 539 | **MATCH** | Via XIMProtocol → XIMSystemCommandsHandler |
| CHOOSE_NAME | 619/635 | **MISSING** | No name picker |
| ZMODEMSEND | 137 | **STUB** | Returns -1 |
| ZMODEMRECEIVE | 138 | **STUB** | Returns -1 |
| AXNET_SEND | 611 | **STUB** | Returns -1 |
| AXNET_RECEIVE | 610 | **STUB** | Returns -1 |

### TIM/SIM PG_* Commands

| Command | Status | Notes |
|---------|--------|-------|
| PG_SHUTDOWN | **MATCH** | - |
| PG_SO/CC/CH | **MATCH** | - |
| PG_CO/SM | **MATCH** | - |
| PG_PM/SC | **MATCH** | - |
| PG_HK | **MATCH** | - |
| PG_SG/SF | **MATCH** | - |
| PG_EF | **PARTIAL** | No edit() implementation |
| PG_UD/US | **MATCH** | - |
| PG_RD | **MATCH** | - |
| PG_TM | **PARTIAL** | May not persist |
| PG_FF | **MATCH** | - |

---

## 5. File Operations Analysis

### Upload System (express.e:18944-19535)

| Feature | Status | Notes |
|---------|--------|-------|
| Security check | **MATCH** | - |
| NOUPLOADS screen | **MISSING** | Should display if uploads disabled |
| UPLOAD screen | **MISSING** | Upload info screen |
| Resume upload support | **MISSING** | No zresume handling |
| Background file check | **MISSING** | No virus scanning |

### Download System (express.e:19941-20317)

| Feature | Status | Notes |
|---------|--------|-------|
| Security check | **MATCH** | - |
| Ratio checking | **MATCH** | - |
| Wildcard support | **MATCH** | - |
| Batch downloads | **MATCH** | - |
| Free download detection | **MATCH** | - |
| Conference accounting | **MATCH** | - |

### File Listing (express.e:27626-27717)

| Feature | Status | Notes |
|---------|--------|-------|
| FILEHELP screen | **MISSING** | Should display help |
| NS flag support | **MATCH** | - |
| Reverse order (FR) | **MATCH** | - |
| HOLD directory | **MATCH** | - |

---

## 6. Message/Mail System Analysis

### Message Display (express.e:8880-8965)

| Feature | Status | Notes |
|---------|--------|-------|
| Header format | **MATCH** | - |
| EALL handling | **FIXED** | EALL expands to "{confName} (ALL)" per express.e:8902-8910 |
| Recv'd field | **FIXED** | Shows received date from .recv companion file per express.e:8915-8926 |
| Attached files | **MISSING** | Not shown after body |

### Message Reader Navigation

| Command | Status | Notes |
|---------|--------|-------|
| A - Again | **MATCH** | - |
| N - Next | **MATCH** | - |
| D - Delete | **MATCH** | - |
| F - Forward | **MATCH** | - |
| R - Reply | **MATCH** | - |
| L - List | **MATCH** | - |
| Q - Quit | **MATCH** | - |
| M - Move | **MATCH** | Sysop feature (ACS_SYSOP_READ) per express.e:11105-11109 |
| K - Keep | **MATCH** | Keep current as unread and quit per express.e:12094-12101 |
| NS - Non-stop | **MATCH** | Displays messages continuously per express.e:11055, 8954-8958 |
| EH - Edit Header | **MATCH** | Sysop feature (ACS_MESSAGE_EDIT) per express.e:11602-11649 |
| E/EM - Edit Body | **PARTIAL** | Stub - full Emacs editor not implemented |

### Message Entry (express.e:10749-10950)

| Feature | Status | Notes |
|---------|--------|-------|
| To: prompt | **MATCH** | - |
| EALL permission | **MATCH** | ACS_EALL_MESSAGES check per express.e:10800-10816 |
| SYSOP mapping | **MATCH** | Maps to SYSOP per express.e:10818-10820 |
| Quote system | **MATCH** | - |
| Editor commands | **MATCH** | /S, /A, /H, etc. |

---

## 7. User Account System Analysis

### Overall Status: ~20% Complete

The user account editor is significantly incomplete compared to express.e.

### Main Functions

| Function | Status | Notes |
|----------|--------|-------|
| editAccounts() menu | **PARTIAL** | Missing SYSCMD hook |
| displayAccount() | **PARTIAL** | Wrong fields on page 0 |
| editInfo() | **PARTIAL** | Missing +/- navigation, presets |
| listNewAccounts() | **PARTIAL** | No inline editing |
| listCreditAccounts() | **DEVIATION** | Wrong filter: ratio<0 vs creditDays>0 |
| bulkAccountEditor() | **PARTIAL** | Only sets security level |
| creditMaintenance() | **MISSING** | Entire system missing |
| conferenceAccounting() | **FIXED** | @ command in account editor (express.e:22045-22250) |
| userNotes() | **FIXED** | * command in account editor (express.e:21679-21739) |

### Critical Field Mapping Issues - **FIXED**

| Field | express.e | Our Implementation | Status |
|-------|-----------|-------------------|--------|
| F - Area Name | Conference Access | ~~Email~~ areaName | **FIXED** |
| G - Ratio | secLibrary | ~~Password~~ ratio | **FIXED** |
| H - Sec_Level | secStatus | secLevel | **FIXED** |
| I - Ratio Type | 0/1/2 (Byte/B+F/File) | ratioType | **FIXED** |
| J - Conference ReJoin | conf.msgbase | autoRejoin | **FIXED** |
| K - Uploads | uploads | uploads | **FIXED** |
| L - Messages Posted | messagesPosted | messagesPosted | **FIXED** |
| M - Downloads | downloads | downloads | **FIXED** |
| N - New_User | newUser | newUser | **FIXED** |

---

## 8. Priority Fix List

### HIGH Priority

1. **MCI Color Code Fix** - Swap c1/c3/c4/c6 mapping
   - File: `web/backend/src/handlers/screen.handler.ts`
   - Impact: Visual display across entire BBS

2. **quickFlag Implementation** - Allow 'Q' to skip bulletins
   - File: `web/backend/src/handlers/login.handler.ts`
   - Impact: User experience during login

3. **Re-enable confScan** - Fix N door polling issue
   - File: `web/backend/src/handlers/screen.handler.ts`
   - Impact: New mail/file notification on login

4. **LOAD_ACCOUNT/SAVE_ACCOUNT XIM commands** ~~VERIFIED WORKING~~
   - File: `web/backend/src/amiga-emulation/xim/system-commands.ts` (full implementation)
   - DoorMessageHandler.ts stubs are fallbacks; XIMProtocol delegates to XIMSystemCommandsHandler
   - Impact: Doors that manage user accounts - **WORKING**

5. **Credit Account Filter Fix**
   - File: `web/backend/src/handlers/user/user-editor.handler.ts`
   - Change: Use `creditDays > 0` instead of `ratio < 0`

### MEDIUM Priority

1. ~~MS command - Call joinConf() with FORCE_MAILSCAN_ALL~~ **FIXED** (loops through all confs/msgbases per express.e:25259-25269)
2. ~~S command - Add credit account and sysop pages fields~~ **FIXED**
3. ~~T command - Fix date format to MM-DD-YY~~ **FIXED**
4. ~~M/E/EH/EM message commands - Sysop message management~~ **FIXED** (M=move per express.e:11105-11109, EH=edit header per express.e:11602-11649, E/EM=stub for full-body editing)
5. ~~RETURNCOMMAND execution after door exit~~ **VERIFIED WORKING**
6. ~~EALL handling in message entry~~ **FIXED** (ACS_EALL_MESSAGES permission check per express.e:10800-10816)
7. ~~User editor field mapping corrections~~ **FIXED** (Page 0 A-N fields match express.e:22990-23047)

### LOW Priority

1. ~~AK MCI code - Show access keys~~ **FIXED**
2. ~~FC/FF/FL MCI codes - Flagged files~~ **FIXED** (FC=count, FF=space-sep, FL=list)
3. ~~NS non-stop mode in message reader~~ **FIXED** (per express.e:11055, 8954-8958)
4. ~~K keep and quit in message reader~~ **FIXED** (per express.e:12094-12101)
5. ~~User notes system~~ **FIXED** (express.e:21679-21739, * command in account editor)
6. ~~Conference accounting system~~ **FIXED** (express.e:22045-22250, @ command in account editor)
7. ~~Translation commands (T, TS, T!, T*)~~ **FIXED** (express.e:11065-11103, 6395-6537)
8. ~~Bulk editor full implementation~~ **FIXED** (express.e:23400-23686)

---

## 9. WEB_* Acceptable Deviations

These features are intentionally different for the web version:

| Feature | Reason |
|---------|--------|
| Remote Shell (0) | AmigaDOS-specific, security concern |
| Edit Directory Files (3) | MicroEmacs-specific |
| Edit Any File (4) | Security concern |
| Navigate Filesystem (5) | Security concern |
| VER command additions | Web version info |
| WebSocket uploads | Modern file transfer |
| Database for users | SQLite vs flat files |

---

## 10. Verification Commands

To verify specific implementations:

```bash
# Search express.e for specific behavior
npm run mcp:search "StrCmp(cmdcode,'COMMAND')"

# Read specific module
npm run mcp:read-module "internal-commands"

# Check specific line range
npm run mcp:read-range 24411 24600
```

---

## Appendix A: express.e Line References

| Feature | Lines |
|---------|-------|
| Internal Commands | 24411-28227 |
| MCI Processing | 5258-5850 |
| Main Loop | 28500-30500 |
| Door Execution | 4231-4613 |
| File Operations | 12000-14000, 18944-20317, 27626-27717 |
| Message System | 8672-11250 |
| User Account Editor | 21200-23700 |
| Screen Flow | 28556-28648 |

---

*Report generated by Claude Code express.e parity analysis*
