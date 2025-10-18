# AmiExpress 1:1 Port Analysis - Discrepancies Report

**Date:** 2025-10-18
**Comparison:** `backend/backend/src/index.ts` vs `AmiExpress-Sources/express.e`

---

## 🚨 SACRED RULE: NEVER OVERWRITE ORIGINAL COMMANDS

**CRITICAL:** All original AmiExpress commands are **SACRED** and must NEVER be modified, replaced, or overwritten.

### The Rule:
1. **Original AmiExpress commands** - Implement exactly as express.e shows, NO changes
2. **New/custom features** - Use different command names (WEB_*, MODERN_*, CUSTOM_*)
3. **Before ANY command** - Check `COMMANDS.md` registry and express.e sources

### Why This Matters:
- Preserves backward compatibility
- Respects original design
- Prevents accidental breaking changes
- Allows custom features to coexist with original commands

### Registry:
See `COMMANDS.md` for complete list of original vs custom commands.

---

## CRITICAL ISSUES FOUND

### 1. **WRONG COMMAND IMPLEMENTATION - "X" Command**

**STATUS:** ✅ **FIXED IN PHASE 1**

- **What I did:** Changed X to execute door menu
- **What it should be:** Expert mode toggle (express.e:26113-26122)
- **Express.e implementation:**
  ```e
  PROC internalCommandX()
    IF loggedOnUser.expert="X"
      aePuts('\b\nExpert mode disabled\b\n')
      loggedOnUser.expert:="N"
    ELSE
      aePuts('\b\nExpert mode enabled\b\n')
      loggedOnUser.expert:="X"
    ENDIF
  ENDPROC RESULT_SUCCESS
  ```
- **FIX REQUIRED:** Revert X command to expert mode toggle, remove fake "DOORS" menu item

---

### 2. **MISSING COMMANDS FROM EXPRESS.E**

These commands exist in express.e but are NOT implemented:

| Command | Express.e Function | Purpose | Line # |
|---------|-------------------|---------|--------|
| `0` | internalCommand0() | Remote shell | 24424 |
| `^` | internalCommandUpHat() | Upload hat (?) | 25089 |
| `<` | internalCommandLT() | Previous conference | 24529 |
| `<<` | internalCommandLT2() | Previous message base | 24566 |
| `>` | internalCommandGT() | Next conference | 24548 |
| `>>` | internalCommandGT2() | Next message base | 24580 |
| `B` | internalCommandB() | Bulletins | 24607 |
| `CM` | internalCommandCM() | Clear message scan pointers | 24843 |
| `DS` | internalCommandD(cmdcode) | Download with status | 24853 |
| `GR` | internalCommandGR() | Greets/graphics | - |
| `H` | internalCommandH() | Help | 25071 |
| `M` | internalCommandM() | Message menu | 25239 |
| `NM` | internalCommandNM() | New messages | 25281 |
| `T` | internalCommandT() | Time left | 25622 |
| `US` | internalCommandUS() | User stats | 25660 |
| `VS` | internalCommandVS() | View stats | - |

**NOTE:** Some commands like `0`, `1-5` are partially implemented but may not match express.e behavior exactly.

---

### 3. **COMMANDS IN IMPLEMENTATION NOT IN EXPRESS.E**

These commands exist in index.ts but are NOT internal commands in express.e:

| Command | Source | Purpose | Note |
|---------|--------|---------|------|
| `checkup` | Unknown | System checkup? | NOT in express.e |
| `native` | Unknown | ? | NOT in express.e |
| `sal` | Unknown | ? | NOT in express.e |
| `script` | Unknown | ? | NOT in express.e |
| `web` | Unknown | ? | NOT in express.e |
| `O_USERS` | Unknown | List users? | Should be `WHO` command? |

**These are likely custom additions or test commands - VERIFY if they should exist.**

---

### 4. **STATE MACHINE DISCREPANCIES**

#### SUBSTATE_PROCESS_COMMAND Missing

**Express.e has (line 28639):**
```e
ELSEIF subState.subState=SUBSTATE_PROCESS_COMMAND
  processCommand(commandText)
  menuPause:=TRUE
  subState.subState:=SUBSTATE_DISPLAY_MENU
```

**Current implementation:**
- Does NOT have SUBSTATE_PROCESS_COMMAND as a separate state
- Processes commands directly in READ_COMMAND handler
- This breaks the authentic flow

**FIX:** Add SUBSTATE_PROCESS_COMMAND state

---

#### menuPause Logic Incorrect

**Express.e (line 28583-28586):**
```e
IF ((loggedOnUser.expert="N") AND (doorExpertMode=FALSE)) OR (checkToolTypeExists(TOOLTYPE_CONF,currentConf,'FORCE_MENUS'))
  IF (menuPause) THEN doPause()
  checkScreenClear()
  displayScreen(SCREEN_MENU)
```

**Current implementation (index.ts:1497-1503):**
```typescript
if (session.menuPause) {
  socket.emit('ansi-output', '\x1b[2J\x1b[H'); // Clear screen and move cursor to top
  if (session.user?.expert !== "N") {  // ❌ WRONG CONDITION
    socket.emit('ansi-output', '\x1b[36m-= Main Menu =-\x1b[0m\r\n');
    // ... menu items
  }
}
```

**ISSUES:**
1. ❌ Condition is backwards: should be `expert === "N"` not `!== "N"`
2. ❌ Missing doorExpertMode check
3. ❌ Missing FORCE_MENUS conference check
4. ❌ Always clears screen even when menuPause is false

**FIX:** Match express.e logic exactly

---

### 5. **SCREEN DISPLAY FLOW**

**Express.e flow (lines 28555-28600):**

```
1. SUBSTATE_DISPLAY_BULL
   - displayScreen(SCREEN_BULL) with doPause()
   - displayScreen(SCREEN_NODE_BULL) with doPause()
   - confScan()
   → SUBSTATE_DISPLAY_CONF_BULL

2. SUBSTATE_DISPLAY_CONF_BULL
   - joinConf(confRJoin, msgBaseRJoin)
   - loadFlagged()
   - loadHistory()
   - menuPause := TRUE
   → SUBSTATE_DISPLAY_MENU

3. SUBSTATE_DISPLAY_MENU
   - If expert="N" OR FORCE_MENUS:
     - If menuPause: doPause()
     - checkScreenClear()
     - displayScreen(SCREEN_MENU)
   - doorExpertMode := FALSE
   - displayMenuPrompt()
   - If cmdShortcuts=FALSE:
     → SUBSTATE_READ_COMMAND
   - Else:
     → SUBSTATE_READ_SHORTCUTS

4. SUBSTATE_READ_SHORTCUTS
   - readChar() for hotkey
   - translateShortcut()
   - menuPause := FALSE
   → SUBSTATE_DISPLAY_MENU

5. SUBSTATE_READ_COMMAND
   - lineInput() for full line
   → SUBSTATE_PROCESS_COMMAND

6. SUBSTATE_PROCESS_COMMAND
   - processCommand()
   - menuPause := TRUE
   → SUBSTATE_DISPLAY_MENU
```

**Current implementation issues:**
- ❌ Missing SUBSTATE_PROCESS_COMMAND
- ❌ Screen clearing logic wrong
- ❌ menuPause set at wrong times
- ✅ Basic flow structure is correct (BULL → CONF_BULL → MENU → READ_x)

---

### 6. **COMMAND PROCESSING ORDER**

**Express.e (line 28244-28256):**

```e
-> try running it as a bbscommand first
IF (subtype<SUBTYPE_INTCMD)
  IF allowsyscmd
    IF (res:=runSysCommand(cmdcode,cmdparams,TRUE,subtype))=RESULT_SUCCESS THEN RETURN RESULT_SUCCESS
    IF res=RESULT_NOT_ALLOWED THEN RETURN res
  ENDIF
  IF (res:=runBbsCommand(cmdcode,cmdparams,TRUE,subtype))=RESULT_SUCCESS THEN RETURN RESULT_SUCCESS
  IF res=RESULT_NOT_ALLOWED THEN RETURN res
ENDIF
ENDPROC processInternalCommand(cmdcode,cmdparams)
```

**Priority order:**
1. SysCommand (SYSCMD) - System-level commands
2. BbsCommand (BBSCMD) - Conference/Node/BBS custom commands
3. InternalCommand - Built-in commands

**Current implementation:**
- ❌ Does NOT check for SysCommand first
- ❌ Does NOT check for BbsCommand second
- ❌ Goes straight to internal commands
- ❌ Missing .cmd file system for custom BBS commands

**FIX:** Implement proper command priority system

---

### 7. **DOOR SYSTEM**

**Express.e:**
- Doors are BBS commands (not internal commands)
- `X` command is for expert mode toggle
- Menu shows "[X] eXec Door" but this runs BBS commands
- Example: Typing "TETRIS" would run BBS:Conf/TETRIS.cmd

**Current implementation:**
- ❌ Added fake "DOORS" menu item that doesn't exist in original
- ❌ Changed X to display door menu (WRONG)
- ❌ No BBS command system for door execution

**FIX:**
1. Revert X to expert mode toggle
2. Remove "DOORS" menu item
3. Implement BBS command system for doors
4. Users type door name directly (e.g., "TETRIS")

---

### 8. **COMMAND SHORTCUTS (Expert Mode)**

**Express.e (line 28603-28618):**

```e
ELSEIF subState.subState=SUBSTATE_READ_SHORTCUTS
  temp:=readChar(INPUT_TIMEOUT)
  translateShortcut(temp,string)
  processMci(string)
  menuPause:=FALSE
  subState.subState:=SUBSTATE_DISPLAY_MENU
```

**Key behavior:**
- Reads single character
- `translateShortcut()` converts it to command
- `menuPause := FALSE` so menu doesn't redisplay
- Returns to DISPLAY_MENU which immediately goes to READ_SHORTCUTS again

**Current implementation:**
- ❌ READ_SHORTCUTS state exists but flow may be wrong
- ❌ menuPause handling may be incorrect
- ❌ Need to verify shortcut translation logic

---

## SUMMARY OF FIXES REQUIRED

### CRITICAL (Break core functionality):
1. ✅ Revert X command to expert mode toggle
2. ✅ Remove fake "DOORS" menu item
3. ✅ Fix menuPause expert mode condition (backwards)
4. ✅ Add SUBSTATE_PROCESS_COMMAND
5. ✅ Implement command priority (Sys → BBS → Internal)

### HIGH (Missing major features):
6. ✅ Implement BBS command system for .cmd files
7. ✅ Add missing commands (B, H, M, T, <, >, etc.)
8. ✅ Fix screen clearing logic
9. ✅ Implement doorExpertMode flag

### MEDIUM (Authenticity issues):
10. ✅ Verify all existing commands match express.e behavior
11. ✅ Remove non-express.e commands (checkup, native, sal, etc.)
12. ✅ Implement loadFlagged() and loadHistory()
13. ✅ Implement processOlmMessageQueue()

### LOW (Polish):
14. ✅ Update menu to match original MENU.TXT exactly
15. ✅ Verify all screen displays match SCREEN_* files
16. ✅ Check all ANSI color codes match original

---

## NEXT STEPS

1. **Immediate:** Revert X command changes, remove DOORS menu
2. **Phase 1:** Fix state machine (add PROCESS_COMMAND, fix menuPause)
3. **Phase 2:** Implement command priority system
4. **Phase 3:** Add missing commands
5. **Phase 4:** Implement BBS command/.cmd system
6. **Phase 5:** Verify each command against express.e line-by-line

---

## FILES THAT NEED CHANGES

- `backend/backend/src/index.ts` - Main implementation (most fixes)
- `backend/backend/src/constants/bbs-states.ts` - Add missing states
- `frontend/src/App.tsx` - Verify login event (already fixed)
- `backend/backend/src/database.ts` - Already fixed getUserById

---

**END OF ANALYSIS**
