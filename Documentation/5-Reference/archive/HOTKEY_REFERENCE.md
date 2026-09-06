# AmiExpress Hotkey Reference

Comprehensive guide to all function key hotkeys in AmiExpress-Web.

## Overview

AmiExpress uses function keys (F1-F10) and Shift+Function keys for quick sysop actions. These hotkeys work in two contexts:

1. **Await Mode** - When no user is logged on (system/sysop hotkeys)
2. **User Online Mode** - When a user is logged in (session management hotkeys)

## Hotkey Implementation Status

| Hotkey | Context | Function | Status | Implementation |
|--------|---------|----------|--------|----------------|
| **F1** | Await | Sysop Login | ⚠️ Stub | Shows message, needs implementation |
| **F1** | Online | Toggle Chat with User | ✅ Complete | Exits chat session |
| **F2** | Await | Local Login | ⚠️ Stub | Shows message, needs implementation |
| **F2** | Online | Increase Time Limit (+10 min) | ✅ Complete | Adds 600 seconds to timeLimit |
| **F3** | Await | Instant Remote Logon | ⚠️ Stub | Shows message, needs implementation |
| **F3** | Online | Decrease Time Limit (-10 min) | ✅ Complete | Subtracts 600 seconds from timeLimit |
| **F4** | Await | Reserve for User | ⚠️ Stub | Shows prompt, needs implementation |
| **F4** | Online | Start Capture | ⚠️ Stub | Shows message, needs implementation |
| **Shift+F4** | Online | Display File to User | ⚠️ Stub | Shows prompt, needs implementation |
| **F5** | Await | Conference Maintenance | ✅ Complete | Calls command '5' |
| **Shift+F5** | Await | Open Shell | ⚠️ Stub | Shows message, needs implementation |
| **F6** | Await | Account Editing | ✅ Complete | Calls command '1' |
| **F6** | Online | Edit User Account | ✅ Complete | Calls command '1' |
| **Shift+F6** | Await | View Callerslog | ✅ Complete | Calls command '2' |
| **Shift+F6** | Online | Grant/Remove Temp Access | ⚠️ Stub | Shows message, needs implementation |
| **F7** | Both | Toggle Chat Availability | ✅ Complete | Toggles chatState.sysopAvailable |
| **F8** | Await | Reprogram Modem | ⚠️ Stub | Shows message, needs implementation |
| **F8** | Online | Toggle Serial Output | ⚠️ Stub | Shows message, needs implementation |
| **F9** | Await | Exit BBS | ⚠️ Stub | Shows message, needs implementation |
| **F9** | Online | Toggle Serial Input | ⚠️ Stub | Shows message, needs implementation |
| **F10** | Await | Exit BBS (Off Hook) | ⚠️ Stub | Shows message, needs implementation |
| **F10** | Online | Kick User (Disconnect) | ✅ Complete | Disconnects user socket |
| **Shift+F10** | Both | Clear Tooltype Cache | ⚠️ Stub | Shows message, needs implementation |
| **Ctrl+?** | Both | Toggle Status Display | ❌ Not Impl | Not implemented |

## Legend

- ✅ **Complete** - Fully functional
- ⚠️ **Stub** - Skeleton implementation, shows feedback but needs full functionality
- ❌ **Not Implemented** - Not yet added

## Implementation Details

### Await Mode Hotkeys (No User Logged On)

#### F1 - Sysop Login
**Status:** ⚠️ Stub
**Current:** Shows "Sysop local login" message
**Needed:** Implement local sysop login workflow

#### F2 - Local Login
**Status:** ⚠️ Stub
**Current:** Shows "Local user login" message
**Needed:** Implement local user login workflow

#### F3 - Instant Remote Logon
**Status:** ⚠️ Stub
**Current:** Shows "Instant remote logon enabled" message
**Needed:** Enable instant logon mode (skip password prompt)

#### F4 - Reserve for User
**Status:** ⚠️ Stub
**Current:** Shows prompt for username
**Needed:** Implement node reservation system

#### F5 - Conference Maintenance
**Status:** ✅ Complete
**Implementation:** Calls `processBBSCommand(socket, session, '5')`

#### Shift+F5 - Open Shell
**Status:** ⚠️ Stub
**Current:** Shows "Opening remote shell" message
**Needed:** Implement remote shell interface

#### F6 - Account Editing
**Status:** ✅ Complete
**Implementation:** Calls `processBBSCommand(socket, session, '1')`

#### Shift+F6 - View Callerslog
**Status:** ✅ Complete
**Implementation:** Calls `processBBSCommand(socket, session, '2')`

#### F7 - Chat Toggle
**Status:** ✅ Complete
**Implementation:** Toggles `chatState.sysopAvailable` flag

#### F8 - Reprogram Modem
**Status:** ⚠️ Stub
**Current:** Shows "Modem reprogrammed" message
**Needed:** Implement modem initialization (web context: no-op)

#### F9 - Exit BBS
**Status:** ⚠️ Stub
**Current:** Shows "Shutting down BBS..." message
**Needed:** Implement graceful BBS shutdown

#### F10 - Exit BBS (Off Hook)
**Status:** ⚠️ Stub
**Current:** Shows "Shutting down BBS (off hook)..." message
**Needed:** Implement BBS shutdown with modem off-hook

### User Online Mode Hotkeys

#### F1 - Toggle Chat with User
**Status:** ✅ Complete
**Implementation:** Calls `exitChat(socket, session)` if in chat

#### F2 - Increase Time Limit
**Status:** ✅ Complete
**Implementation:**
```typescript
session.timeLimit += 600; // +10 minutes
socket.emit('ansi-output', '\r\n\x1b[32m+10 minutes added to time limit\x1b[0m\r\n');
```

#### F3 - Decrease Time Limit
**Status:** ✅ Complete
**Implementation:**
```typescript
session.timeLimit = Math.max(60, session.timeLimit - 600); // -10 minutes, min 1 min
socket.emit('ansi-output', '\r\n\x1b[33m-10 minutes removed from time limit\x1b[0m\r\n');
```

#### F4 - Start Capture
**Status:** ⚠️ Stub
**Current:** Shows "Session capture started" message
**Needed:** Implement session capture to file

#### Shift+F4 - Display File to User
**Status:** ⚠️ Stub
**Current:** Shows prompt for filename
**Needed:** Implement file display to remote user

#### F6 - Edit User Account
**Status:** ✅ Complete
**Implementation:** Calls `processBBSCommand(socket, session, '1')`

#### Shift+F6 - Grant/Remove Temporary Access
**Status:** ⚠️ Stub
**Current:** Shows "Temporary access grant/removal" message
**Needed:** Implement temporary privilege escalation

#### F7 - Toggle Chat Availability
**Status:** ✅ Complete
**Implementation:** Toggles `chatState.sysopAvailable` flag

#### F8 - Toggle Serial Output
**Status:** ⚠️ Stub
**Current:** Shows "Serial output toggled" message
**Needed:** Toggle output to remote user (web context: no-op)

#### F9 - Toggle Serial Input
**Status:** ⚠️ Stub
**Current:** Shows "Serial input toggled" message
**Needed:** Toggle input from remote user (web context: no-op)

#### F10 - Kick User
**Status:** ✅ Complete
**Implementation:**
```typescript
socket.emit('ansi-output', '\r\n\x1b[31mDisconnecting user...\x1b[0m\r\n');
socket.disconnect(true);
```

### Universal Hotkeys (Both Contexts)

#### Shift+F10 - Clear Tooltype Cache
**Status:** ⚠️ Stub
**Current:** Shows "Tooltype cache cleared" message
**Needed:** Implement cache clearing (web context: configuration cache)

## Escape Sequences

Function keys are detected via terminal escape sequences:

| Key | Escape Sequence | Alternative |
|-----|-----------------|-------------|
| F1 | `\x1b[OP` | `\x1bOP` |
| F2 | `\x1b[OQ` | `\x1bOQ` |
| F3 | `\x1b[OR` | `\x1bOR` |
| F4 | `\x1b[OS` | `\x1bOS` |
| F5 | `\x1b[15~` | - |
| F6 | `\x1b[17~` | - |
| F7 | `\x1b[18~` | - |
| F8 | `\x1b[19~` | - |
| F9 | `\x1b[20~` | - |
| F10 | `\x1b[21~` | - |
| Shift+F1 | `\x1b[1;2P` | - |
| Shift+F2 | `\x1b[1;2Q` | - |
| Shift+F3 | `\x1b[1;2R` | - |
| Shift+F4 | `\x1b[1;2S` | - |
| Shift+F5 | `\x1b[15;2~` | - |
| Shift+F6 | `\x1b[17;2~` | - |
| Shift+F7 | `\x1b[18;2~` | - |
| Shift+F8 | `\x1b[19;2~` | - |
| Shift+F9 | `\x1b[20;2~` | - |
| Shift+F10 | `\x1b[21;2~` | - |

## Implementation Architecture

### Location
All hotkey handling is in `/backend/src/index.ts` in the `handleHotkey()` function.

### Flow
```
User presses function key
   ↓
Terminal emits escape sequence
   ↓
handleCommand() receives data
   ↓
handleHotkey() checks for hotkey pattern
   ↓
If match found:
   - Check user state (logged on vs await)
   - Check permissions (sysop level)
   - Execute appropriate handler
   - Return true (handled)
   ↓
If no match:
   - Return false (not a hotkey)
   - Continue normal command processing
```

### Permission Checks

- **Sysop Only**: Most hotkeys require `session.user?.secLevel >= 200`
- **All Users**: F1 (chat toggle), F7 (chat availability)
- **Context Specific**: Different behavior based on `session.state === BBSState.LOGGEDON`

## Next Steps

To complete hotkey implementation:

1. **High Priority:**
   - F1/F2: Implement local login workflows
   - F4: Session capture to file
   - Shift+F6: Temporary access system

2. **Medium Priority:**
   - F3: Instant logon mode
   - F4 (await): Node reservation
   - Shift+F4: File display

3. **Low Priority:**
   - Shift+F5: Remote shell
   - F8/F9: Serial toggles (no-op in web)
   - F9/F10 (await): BBS shutdown
   - Shift+F10: Cache clearing

## References

- **Source Code:** `/backend/src/index.ts` lines 3066-3290
- **Original AmiExpress:** `/AmiExpress-Sources/express.e` lines 7604-7967
- **Feature Matrix:** `/Docs/AmiExpressDocs/FEATURE_MATRIX.md`
