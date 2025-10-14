# AmiExpress Command Reference

Complete reference for implementing AmiExpress commands in the web port. Each command includes documentation reference, implementation status, and key details.

## 📋 **Command Implementation Status**

| Command | Name | Status | Priority | Documentation Reference |
|---------|------|--------|----------|------------------------|
| R | Read Messages | ✅ Complete | High | [Main Menu](main_menu.md#r---read-mail) |
| A | Post Message | ✅ Complete | High | [Main Menu](main_menu.md#a---enter-message) |
| E | Private Message | ✅ Complete | High | Enhanced feature |
| J | Join Conference | ✅ Complete | High | [Main Menu](main_menu.md#j---join-conference) |
| F | File Areas | ✅ Complete | High | [Main Menu](main_menu.md#f---file-listings) |
| G | Goodbye | ✅ Complete | High | [Main Menu](main_menu.md#g---goodbye-logoff) |
| ? | Help | ✅ Complete | High | [Main Menu](main_menu.md#h---help) |
| O | Online Users | ✅ Complete | Medium | Enhanced feature |
| T | System Time | ✅ Complete | Medium | Enhanced feature |
| FS | File Status | ✅ Complete | Medium | [Main Menu](main_menu.md#fs---full-status-view) |
| N | New Files | ✅ Complete | Medium | [Main Menu](main_menu.md#n---new-files-since-date) |
| FR | File Areas Reverse | ✅ Complete | Medium | [Main Menu](main_menu.md#fr---reverse-file-listings) |
| JM | Join Message Base | ❌ Pending | Medium | [Main Menu](main_menu.md#jm---join-a-message-base-area-within-this-conference) |
| FM | File Maintenance | ❌ Pending | Low | [Main Menu](main_menu.md#fm---file-maintenance) |
| C | Comment to Sysop | ❌ Pending | Low | [Main Menu](main_menu.md#c---operator-page) |
| Q | Quick Logoff | ❌ Pending | Low | [Main Menu](main_menu.md#q---quiet-node) |
| 0-5 | Sysop Commands | ❌ Pending | Low | [Main Menu](main_menu.md#sysop-only-commands) |

## 🎯 **High Priority Commands (Essential)**

### **R - Read Messages**
**Status:** ✅ Complete
**Documentation:** [Main Menu Commands - R](main_menu.md#r---read-mail)

**Implementation Notes:**
- Displays messages in current conference/message base
- Shows private message indicators `[PRIVATE]`
- Shows reply indicators `[REPLY]`
- Filters private messages (only sender/recipient can see)
- Uses rich formatting with timestamps

**Key Code:**
```typescript
const currentMessages = messages.filter(msg =>
  msg.conferenceId === session.currentConf &&
  msg.messageBaseId === session.currentMsgBase &&
  (!msg.isPrivate || msg.toUser === session.user?.username || msg.author === session.user?.username)
);
```

### **A - Post Message**
**Status:** ✅ Complete
**Documentation:** [Main Menu Commands - A](main_menu.md#a---enter-message)

**Implementation Notes:**
- Two-step process: subject → body
- Line-based input handling
- Empty subject aborts posting
- Double Enter (empty line) finishes body
- Stores in current conference/message base

### **E - Private Message**
**Status:** ✅ Complete
**Documentation:** Enhanced feature (not in original docs)

**Implementation Notes:**
- Three-step process: recipient → subject → body
- Recipient validation required
- Private flag set in message object
- Only visible to sender and recipient

### **J - Join Conference**
**Status:** ✅ Complete
**Documentation:** [Main Menu Commands - J](main_menu.md#j---join-conference)

**Implementation Notes:**
- Lists available conferences with numbers
- Supports direct parameter (`j 2`) or interactive selection
- Updates session conference and message base
- Calls `joinConference()` function

### **F - File Areas**
**Status:** ✅ Complete
**Documentation:** [Main Menu Commands - F](main_menu.md#f---file-listings)

**Implementation Notes:**
- Conference-specific file areas (DIR1, DIR2, etc.)
- Supports parameters: `A` (all), `U` (upload), `H` (hold), numeric
- Interactive directory selection
- Displays files with FILE_ID.DIZ descriptions

## 🔧 **Medium Priority Commands (Enhanced)**

### **O - Online Users**
**Status:** ✅ Complete
**Documentation:** Enhanced feature

**Implementation Notes:**
- Real-time user listing
- Shows username, conference, node, idle time
- Filters for logged-on users only
- Updates session lastActivity

### **T - System Time**
**Status:** ✅ Complete
**Documentation:** Enhanced feature

**Implementation Notes:**
- Shows current system time
- Displays server uptime
- Shows user session time remaining
- Uses `process.uptime()` and session tracking

### **FS - File Status**
**Status:** ✅ Complete
**Documentation:** [Main Menu Commands - FS](main_menu.md#fs---full-status-view)

**Implementation Notes:**
- Per-conference upload/download statistics
- Shows bytes transferred and ratios
- Supports `ALL` parameter for all conferences
- Formats exactly like AmiExpress DIR display

### **N - New Files**
**Status:** ✅ Complete
**Documentation:** [Main Menu Commands - N](main_menu.md#n---new-files-since-date)

**Implementation Notes:**
- Date-based file filtering
- Supports MM-DD-YY format
- Defaults to last login date
- Directory selection with same parameters as F
- Non-stop display option (`NS`)

### **FR - File Areas Reverse**
**Status:** ✅ Complete
**Documentation:** [Main Menu Commands - FR](main_menu.md#fr---reverse-file-listings)

**Implementation Notes:**
- Same as F but displays directories in reverse order
- Uses `reverse: true` parameter in `displayFileList()`
- All other functionality identical to F

## 📋 **Command Implementation Template**

Use this template for implementing new commands:

```typescript
case 'X': // Command Name (internalCommandX)
  // Clear screen (authentic BBS behavior)
  socket.emit('ansi-output', '\x1b[2J\x1b[H');

  // Show command header
  socket.emit('ansi-output', '\x1b[36m-= Command Title =-\x1b[0m\r\n');

  // Implement command logic based on docs
  // ... command-specific logic ...

  // Show results or prompt for input
  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');

  // Set appropriate state
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
  return; // Don't call displayMainMenu
```

## 🔍 **Parameter Parsing Patterns**

### **Date Parameters (N command):**
```typescript
if (parsedParams.length > 0 && parsedParams[0] !== 'NS') {
  const dateStr = parsedParams[0];
  if (dateStr.length === 8) {
    const month = parseInt(dateStr.substring(0, 2)) - 1;
    const day = parseInt(dateStr.substring(3, 5));
    const year = 2000 + parseInt(dateStr.substring(6, 8));
    searchDate = new Date(year, month, day);
  }
}
```

### **Directory Selection (F, FR, N commands):**
```typescript
const dirSpan = getDirSpan(param, maxDirs);
// Returns: { startDir: number, dirScan: number }
// -1 = invalid, 0 = special cases (A, U, H)
```

### **Numeric Parameters (J, JM commands):**
```typescript
const confId = parseInt(params.trim());
if (isNaN(confId) || confId === 0) {
  // Handle invalid input
}
```

## 🎮 **Interactive Command Patterns**

### **Selection Commands:**
1. Display options with numbers
2. Set appropriate subState (e.g., `CONFERENCE_SELECT`)
3. Handle input in separate handler
4. Validate selection and process

### **Multi-step Input:**
1. Prompt for first input (e.g., recipient)
2. Set subState for input handling
3. Process input, prompt for next step
4. Repeat until complete
5. Store final result

## 🚨 **Error Handling Patterns**

### **Invalid Parameters:**
```typescript
socket.emit('ansi-output', '\r\n\x1b[31mInvalid parameter. See ? for help.\x1b[0m\r\n');
socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
session.menuPause = false;
session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
```

### **Permission Errors:**
```typescript
socket.emit('ansi-output', '\r\n\x1b[31mAccess denied. Insufficient security level.\x1b[0m\r\n');
```

### **Not Found Errors:**
```typescript
socket.emit('ansi-output', '\r\n\x1b[31mConference not found.\x1b[0m\r\n');
```

## 📊 **State Management Reference**

### **SubStates Used:**
- `DISPLAY_CONF_BULL` - After command completion
- `CONFERENCE_SELECT` - Waiting for conference number
- `FILE_AREA_SELECT` - Waiting for file area number
- `FILE_DIR_SELECT` - Waiting for directory selection
- `POST_MESSAGE_SUBJECT` - Message subject input
- `POST_MESSAGE_BODY` - Message body input

### **Menu Pause Logic:**
- `menuPause = true` - Display menu after command
- `menuPause = false` - Don't display menu (e.g., after listings)
- Return early to prevent `displayMainMenu()` call

## 🔧 **Testing Checklist**

For each command implementation:
- [ ] **Basic functionality** works
- [ ] **Parameter parsing** correct
- [ ] **Error conditions** handled
- [ ] **State transitions** proper
- [ ] **Menu display** appropriate
- [ ] **Real-time updates** work
- [ ] **Edge cases** covered

## 📖 **Next Steps**

### **Immediate Tasks:**
1. **JM** - Join Message Base (medium priority)
2. **C** - Comment to Sysop (low priority)
3. **Q** - Quick Logoff (low priority)

### **Future Tasks:**
1. **0-5** - Sysop administration commands
2. **FM** - File maintenance operations
3. **Advanced file operations** (upload/download)

---

*This reference ensures consistent and accurate command implementation across the AmiExpress Web port.*