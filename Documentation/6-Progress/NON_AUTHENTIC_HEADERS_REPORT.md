# Non-Authentic Headers Report

## Summary

Found **70+ instances** of non-authentic `-= text =-` style headers across the codebase. These do NOT exist in AmiExpress express.e sources.

**express.e pattern:** Commands output `\b\n` (newline) followed directly by data lines with ANSI color codes like `[32mField[33m:[0m value\b\n`. NO decorative headers.

## Evidence from express.e

### S (Stats) Command - express.e:25540-25600
```e
PROC internalCommandS()
  aePuts('\b\n')
  StringF(tmp,'[32mUser Number[33m:[0m \d\b\n',loggedOnUser.slotNumber)
  aePuts(tmp)
  StringF(tmp,'[32mArea Name  [33m:[0m \s\b\n',loggedOnUser.conferenceAccess)
  ...
```
**NO header like `-= USER STATISTICS =-`**

### DS/D (Download) Command - express.e:19981 (displayULStats)
```e
PROC displayULStats(u: PTR TO user, um:PTR TO userMisc)
  StringF(string,'Number of Downloads      : \d (\sk total)\b\n',u.downloads AND $FFFF,ktot)
  aePuts(string)
  StringF(string,'Number of Uploads        : \d (\sk total)\b\n',u.uploads AND $FFFF,ktot)
  aePuts(string)
  StrCopy(string,'Todays Bytes Available   : Infinite\b\n')
  ...
```
**NO header like `-= Download Files (with status) =-`**

### G (Goodbye) Command - express.e:25047
```e
PROC internalCommandG(params)
  IF auto=FALSE
    IF partUploadOK(0)=RESULT_ABORT THEN RETURN RESULT_SUCCESS
    mystat:=checkFlagged()
    ...
```
**NO header like `-= Goodbye! =-`**

### J (Join) Command - express.e:25113
```e
PROC internalCommandJ(params)
  IF checkSecurity(ACS_JOIN_CONFERENCE)=FALSE THEN RETURN RESULT_NOT_ALLOWED
  saveMsgPointers(currentConf,currentMsgBase)
  setEnvStat(ENV_JOIN)
  parseParams(params)
  ...
```
**NO header like `-= AVAILABLE CONFERENCES =-`**

## Files Requiring Fixes

### 1. AnsiUtil.headerBox() - ROOT CAUSE
**File:** `web/backend/src/utils/ansi.util.ts:120-121`
```typescript
static headerBox(text: string): string {
  return this.line(this.header(`-= ${text} =-`));
}
```
**Action:** This function should be deprecated or removed. All usages need individual review.

### 2. System Commands
| File | Line | Current | express.e |
|------|------|---------|-----------|
| system-commands.handler.ts | 123 | `-= Goodbye! =-` | No header |
| system-commands.handler.ts | 300 | `-= Enter Message =-` | No header |

### 3. User Commands
| File | Line | Current | express.e |
|------|------|---------|-----------|
| user-commands.handler.ts | 207 | `-= AVAILABLE CONFERENCES =-` | Screen file or no header |
| user-commands.handler.ts | 234 | `-= USER STATISTICS =-` | Direct field output |
| user-commands.handler.ts | 515 | `-= Select Font =-` | WEB feature (ok) |

### 4. File Commands
| File | Line | Current | express.e |
|------|------|---------|-----------|
| file.handler.ts | 137-139 | `-= File Areas =-` | No header |
| file.handler.ts | 267 | `-= File Maintenance =-` | No header |
| file.handler.ts | 635 | `-= FILE STATUS =-` | No header |
| file.handler.ts | 918, 927 | `-= Upload Files =-` | No header |
| file.handler.ts | 1134 | `-= Download Files =-` | No header |
| file-listing.handler.ts | 166 | `-= FILE LISTING =-` | No header |
| display-file-commands.handler.ts | 324 | `-= Flagged Files =-` | No header |
| display-file-commands.handler.ts | 511 | `-= File Statistics =-` | No header |

### 5. Transfer Commands
| File | Line | Current | express.e |
|------|------|---------|-----------|
| transfer-misc-commands.handler.ts | 97 | `-= Zmodem Upload =-` | No header |
| transfer-misc-commands.handler.ts | 186 | `-= Sysop Upload =-` | No header |
| transfer-misc-commands.handler.ts | 212 | `-= Node Uptime =-` | Direct output |
| transfer-misc-commands.handler.ts | 716 | `-= Download Files (with status) =-` | No header |

### 6. Utility Commands
| File | Line | Current | express.e |
|------|------|---------|-----------|
| utility-commands.handler.ts | 74 | `-= Relogon =-` | No header |
| utility-commands.handler.ts | 135 | `-= View Text File =-` | No header |
| utility-commands.handler.ts | 229 | `-= Zippy Text Search =-` | No header |
| utility-commands.handler.ts | 364 | `-= Zoo Mail (QWK Download) =-` | No header |
| utility-commands.handler.ts | 456 | `-= Help File Viewer =-` | No header |

### 7. Sysop Commands
| File | Line | Current | express.e |
|------|------|---------|-----------|
| sysop-commands.handler.ts | 61 | `-= Remote Shell =-` | WEB feature (ok) |
| sysop-commands.handler.ts | 136 | `-= Callers Log =-` | No header |
| sysop-commands.handler.ts | 211 | `-= Edit Directory Files =-` | No header |
| sysop-commands.handler.ts | 265 | `-= Edit Any File =-` | No header |
| sysop-commands.handler.ts | 319 | `-= Navigate Filesystem =-` | No header |

### 8. Message Commands
| File | Line | Current | express.e |
|------|------|---------|-----------|
| messaging.handler.ts | 402 | `-= Reply to Message =-` | No header |
| messaging.handler.ts | 512 | `-= Message List =-` | No header |
| messaging.handler.ts | 583 | `-= Post Private Message =-` | No header |

### 9. Info Commands
| File | Line | Current | express.e |
|------|------|---------|-----------|
| info-commands.handler.ts | 49 | `-= AmiExpress Web Version =-` | WEB feature (ok) |
| info-commands.handler.ts | 122 | `-= Online Users (WHO) =-` | No header |
| info-commands.handler.ts | 199 | `-= Online Users (Detailed) =-` | No header |
| info-commands.handler.ts | 299 | `-= USER CONFIGURATION =-` | No header |

### 10. Account Editor
| File | Line | Current | express.e |
|------|------|---------|-----------|
| account.handler.ts | 20 | `-= Account Editing Menu =-` | No header |
| account.handler.ts | 50 | `-= Edit User Account =-` | No header |
| account.handler.ts | 57 | `-= User Statistics =-` | No header |
| account.handler.ts | 64 | `-= Change Security Level =-` | No header |
| account.handler.ts | 71 | `-= Toggle User Flags =-` | No header |
| account.handler.ts | 78 | `-= Delete User Account =-` | No header |
| account.handler.ts | 90 | `-= Search Users =-` | No header |
| account.handler.ts | 162 | `-= Account Editor: Page 1 =-` | No header |
| account.handler.ts | 234 | `-= Account Editor: Page 2 =-` | No header |
| account.handler.ts | 303 | `-= Statistics for X =-` | No header |
| account.handler.ts | 563 | `-= Searching for X =-` | No header |

### 11. User Editor
| File | Line | Current | express.e |
|------|------|---------|-----------|
| user-editor.handler.ts | 196 | `-= New User Accounts =-` | No header |
| user-editor.handler.ts | 225 | `-= Credit Accounts =-` | No header |
| user-editor.handler.ts | 256 | `-= Bulk Account Editor =-` | No header |
| user-editor.handler.ts | 340 | `-= Editing: X =-` | No header |

### 12. Chat Commands
| File | Line | Current | express.e |
|------|------|---------|-----------|
| room-commands.handler.ts | 139 | `-= Chat Room Commands =-` | WEB feature (ok) |
| room-commands.handler.ts | 306 | `-= Users in Room =-` | WEB feature (ok) |
| preference-chat-commands.handler.ts | 157 | `-= Comment to Sysop =-` | No header |
| group-chat.handler.ts | 333 | `-= Chat Room: X =-` | WEB feature (ok) |
| group-chat.handler.ts | 537 | `-= Available Chat Rooms =-` | WEB feature (ok) |

### 13. Door Handler
| File | Line | Current | express.e |
|------|------|---------|-----------|
| door.handler.ts | 992 | `-= Door Games & Utilities =-` | No header |
| door.handler.ts | 2611 | `-= Super AmiLog v3.00 =-` | Door name only |
| door.handler.ts | 2639 | `-= CheckUP v0.4 =-` | Door name only |

### 14. Login/Welcome
| File | Line | Current | express.e |
|------|------|---------|-----------|
| command.handler.ts | 1024 | `-= Welcome to AmiExpress-Web =-` | Screen file |
| core.ts | 401 | `-= Welcome to AmiExpress-Web =-` | Screen file |
| pre-login.ts | 75 | `-= Welcome to AmiExpress-Web =-` | Screen file |

### 15. Database Helpers
| File | Line | Current | express.e |
|------|------|---------|-----------|
| database-helpers.ts | 743 | `-= AmiExpress Web BBS System Bulletins =-` | Screen file |

### 16. Advanced Commands
| File | Line | Current | express.e |
|------|------|---------|-----------|
| advanced-commands.handler.ts | 209 | `-= Mailscan =-` | No header |

### 17. Webhook Commands (WEB features - OK)
| File | Line | Current | Status |
|------|------|---------|--------|
| webhook-commands.handler.ts | 146 | `-= WEBHOOKS =-` | WEB_ feature OK |
| webhook-commands.handler.ts | 240 | `-= WEBHOOK: X =-` | WEB_ feature OK |
| webhook-commands.handler.ts | 340 | `-= AVAILABLE WEBHOOK TRIGGERS =-` | WEB_ feature OK |
| webhook-commands.handler.ts | 383 | `-= ADD WEBHOOK =-` | WEB_ feature OK |

### 18. AmigaGuide Viewer (WEB feature - OK)
| File | Line | Current | Status |
|------|------|---------|--------|
| AmigaGuideViewer.ts | 53 | `-= ${doc.database} =-` | WEB_ feature OK |
| AmigaGuideViewer.ts | 298 | `-= AmigaGuide Viewer Help =-` | WEB_ feature OK |

### 19. Menu Util
| File | Line | Current | express.e |
|------|------|---------|-----------|
| menu.util.ts | 41 | `-= ${state.title} =-` | Varies by context |

## Acceptable WEB_ Features

The following use non-authentic headers but are NEW web features not in original AmiExpress, so they are acceptable:

1. Webhook commands (WEBHOOKS, ADD WEBHOOK, etc.)
2. AmigaGuide viewer
3. Chat rooms (modern feature)
4. Font selection (modern feature)
5. Remote Shell (modern sysop feature)
6. Version info (modern feature)

## Recommended Fixes

### Priority 1: Core Commands (Must Match express.e)
1. **S command** - Remove header, output fields directly
2. **DS command** - Remove header, use displayULStats format
3. **G command** - Remove header
4. **J command** - Use screen file or no header
5. **F/FR/FM/FS commands** - Remove headers
6. **U/RZ commands** - Remove headers
7. **WHO command** - Remove header, match express.e format

### Priority 2: Sysop Commands
1. Remove headers from callers log, edit commands, navigation

### Priority 3: Message Commands
1. Remove headers from reply, list, post private

### Priority 4: Account/User Editor
1. These are sysop tools - could keep simplified headers or remove

## Implementation Notes

1. Replace `AnsiUtil.headerBox()` calls with either:
   - Nothing (just `\r\n`)
   - Screen file display (`displayScreen(SCREEN_X)`)
   - Direct field output matching express.e format

2. Keep WEB_ prefixed features as-is since they're not in original AmiExpress

3. Document any intentional deviations from express.e in code comments

---
Generated: 2026-01-29
