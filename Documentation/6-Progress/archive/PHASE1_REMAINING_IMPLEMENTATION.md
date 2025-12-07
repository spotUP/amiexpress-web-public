# Phase 1 - Remaining Implementation Guide

**Date**: 2025-01-06
**Status**: 6 features remaining (3-4 hours work)
**Current Progress**: 80% complete (16/20 done)

## Quick Reference

### Files to Modify
1. `~/Code/amiexpress-web/web/backend/src/amiga-emulation/xim/io.ts` - Add PG_UD, PG_US, PG_SM handlers
2. `~/Code/amiexpress-web/web/backend/src/amiga-emulation/xim/types.ts` - Add command enum values
3. `~/Code/amiexpress-web/web/backend/src/amiga-emulation/XIMProtocol.ts` - Wire up new handlers
4. `~/Code/amiexpress-web/web/backend/src/handlers/screen.handler.ts` - Add MCI codes

---

## 1. PG_UD - User Data (express.e:4444-4463)

### Location
Add to `xim/io.ts` after `handleSerialOutput` (line 408)

### Implementation
```typescript
  /**
   * Handle PG_UD (User Data)
   * From E sources (express.e:4444-4463)
   * Returns numeric user information based on msg.data field
   */
  handleUserData(msg: XIMMessage, bbsSession: any): void {
    let resultData = 0;

    console.log(`[XIMIOHandler] PG_UD: Request type ${msg.data}`);

    // express.e:4445-4463 - Map data field to user info
    switch (msg.data) {
      case 1: // Security level (divided by 10)
        resultData = Math.floor((bbsSession.user?.secLevel || 0) / 10);
        break;
      case 2: // Expert mode flag ('X' = expert)
        resultData = (bbsSession.user?.expert === 'X') ? 1 : 0;
        break;
      case 3: // Reserved
        resultData = 0;
        break;
      case 4: // Times called
      case 5: // Times called (duplicate in original)
        resultData = bbsSession.user?.timesCalled || 0;
        break;
      case 6: // Node number (always 1 for web version)
        resultData = 1;
        break;
      case 7: // Time limit in minutes
        resultData = Math.floor((bbsSession.timeLimit || 3600) / 60);
        break;
      case 8: // Screen width
        resultData = 80;
        break;
      case 9: // User line length
        resultData = bbsSession.user?.lineLen || 80;
        break;
      default:
        resultData = 0;
    }

    console.log(`[XIMIOHandler] PG_UD: Returning ${resultData}`);
    this.sendReply(msg, resultData);
  }
```

### Wire Up
In `XIMProtocol.ts` handleIOCommand(), add case for PG_UD (command value TBD - check types.ts).

---

## 2. PG_US - User String (express.e:4464-4494)

### Location
Add to `xim/io.ts` after `handleUserData`

### Implementation
```typescript
  /**
   * Handle PG_US (User String)
   * From E sources (express.e:4464-4494)
   * Returns string user information based on msg.data field
   */
  handleUserString(msg: XIMMessage, bbsSession: any): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
    let resultString = '';

    console.log(`[XIMIOHandler] PG_US: Request type ${msg.data}`);

    // express.e:4465-4494 - Map data field to user string
    switch (msg.data) {
      case 1: // Username (max 21 chars)
        resultString = (bbsSession.user?.name || '').substring(0, 21);
        break;
      case 2: // Empty string
        resultString = '';
        break;
      case 3: // Location (max 39 chars)
        resultString = (bbsSession.user?.location || '').substring(0, 39);
        break;
      case 4: // Location (max 29 chars)
        resultString = (bbsSession.user?.location || '').substring(0, 29);
        break;
      case 5: // State code (max 2 chars)
        resultString = (bbsSession.user?.location || '').substring(0, 2);
        break;
      case 6: // Zip code (max 7 chars)
        resultString = (bbsSession.user?.location || '').substring(0, 7);
        break;
      case 7: // Door path
        resultString = 'PGDOORS:';
        break;
      case 8: // BBS location path
        resultString = bbsSession.bbsPath || '~/Code/amiexpress-web/reference-boardBBS';
        break;
      case 9: // Long date format
        const date = new Date();
        resultString = date.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
        break;
      case 10: // Long time format
        const time = new Date();
        resultString = time.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        });
        break;
      default:
        resultString = '';
    }

    console.log(`[XIMIOHandler] PG_US: Returning "${resultString}"`);

    // Write string to memory
    if (stringAddr !== 0) {
      this.messageParser.writeString(stringAddr, resultString, 80);
    }

    this.sendReply(msg, 1);
  }
```

### Wire Up
In `XIMProtocol.ts` handleIOCommand(), add case for PG_US.

---

## 3. PG_SM - Serial/Screen Message (express.e:4396-4399)

### Location
Add to `xim/io.ts` after `handleUserString`

### Implementation
```typescript
  /**
   * Handle PG_SM (Serial/Screen Message)
   * From E sources (express.e:4396-4399)
   * Displays message to both serial and console (web: same as PG_SO)
   */
  handleScreenMessage(msg: XIMMessage): void {
    console.log('[XIMIOHandler] PG_SM: Redirecting to Serial Output handler');
    // In web version, screen and serial are the same (both go to socket)
    this.handleSerialOutput(msg);
  }
```

### Wire Up
In `XIMProtocol.ts` handleIOCommand(), add case for PG_SM.

---

## 4. ~SP. - Stop Pause (express.e:5455-5461)

### Location
Add to `screen.handler.ts` processMCICodes() function (around line 450)

### Implementation
```typescript
  // ~SP. - Stop Pause (express.e:5455-5461)
  // Displays pause prompt and waits for keypress
  parsed = parsed.replace(/~SP\./g, () => {
    // Set session state to wait for keypress
    session.waitingForPause = true;
    session.subState = LoggedOnSubState.WAITING_FOR_KEY;

    // Return pause prompt
    return '\r\n\x1b[0;36m[Press any key to continue]\x1b[0m';
  });
```

### Notes
- Need to add `waitingForPause: boolean` to BBSSession interface
- Need to handle keypress in command handler to resume from pause
- After keypress, continue screen display

---

## 5. ~CR. - Character Read (express.e:5462-5468)

### Location
Add to `screen.handler.ts` processMCICodes() function

### Implementation
```typescript
  // ~CR. - Character Read (express.e:5462-5468)
  // Waits for single keypress without prompt
  parsed = parsed.replace(/~CR\./g, () => {
    // Set session state to wait for character
    session.waitingForChar = true;
    session.subState = LoggedOnSubState.WAITING_FOR_KEY;
    session.charReadBuffer = ''; // Clear buffer

    // No visible output - just wait for key
    return '';
  });
```

### Notes
- Need to add `waitingForChar: boolean` and `charReadBuffer: string` to BBSSession interface
- Store keypress in session.charReadBuffer for later use
- Continue screen display after keypress

---

## 6. ~CC_cmd|| - Run Command (express.e:5555-5563)

### Location
Add to `screen.handler.ts` processMCICodes() function

### Implementation
```typescript
  // ~CC_cmd|| - Run Command (express.e:5555-5563)
  // Executes BBS command from screen, then returns to screen display
  const ccRegex = /~CC_([^|]+)\|\|/g;
  parsed = parsed.replace(ccRegex, (match, cmd) => {
    console.log(`[MCI] ~CC_: Executing command "${cmd}"`);

    // Store current screen context
    session.returnToScreen = true;
    session.pendingScreenDisplay = true;

    // Execute command (will be processed by command handler)
    session.subState = LoggedOnSubState.EXECUTE_COMMAND;
    session.pendingCommand = cmd.trim();

    // Command will execute, then return to continue screen display
    return '';
  });
```

### Notes
- Need to add `returnToScreen: boolean`, `pendingScreenDisplay: boolean`, `pendingCommand: string` to BBSSession interface
- Command handler must check `returnToScreen` flag and resume screen display after command completes
- This allows menus to execute commands inline

---

## Implementation Order

1. **PG_UD, PG_US** (1-1.5 hours) - Critical for WHO door
2. **~SP.** (30 min) - Critical for bulletins
3. **~CC_cmd||** (45-60 min) - Critical for interactive menus
4. **PG_SM** (15 min) - Simple alias
5. **~CR.** (20 min) - Less commonly used

---

## Testing Checklist

After each implementation:
- [ ] TypeScript compiles with zero errors: `cd web/backend && npx tsc --noEmit`
- [ ] Test WHO door (uses PG_UD, PG_US, PG_PM, PG_HK)
- [ ] Test bulletin screens (uses ~SP.)
- [ ] Test menu screens (uses ~CC_cmd||)
- [ ] Check browser console for errors
- [ ] Verify door output is correct

---

## Session Data Access

The BBSSession object passed to doors contains:
- `user.name` - Username
- `user.secLevel` - Security level (0-255)
- `user.expert` - Expert mode ('X' or ' ')
- `user.timesCalled` - Number of times user has called
- `user.location` - User's location/city
- `user.lineLen` - User's preferred line length
- `timeLimit` - Time remaining in seconds
- `bbsPath` - BBS base directory path

Access via: `bbsSession.user.field` or `bbsSession.field`

---

## Next Steps

1. Start with PG_UD and PG_US (most important for doors)
2. Test with WHO door
3. Implement MCI codes ~SP. and ~CC_cmd||
4. Test with bulletin and menu screens
5. Complete PG_SM and ~CR.
6. Final testing and TypeScript compilation check
7. Update PHASE1_COMPLETION_STATUS.md to 100%

**Estimated Total Time: 3-4 focused hours**
