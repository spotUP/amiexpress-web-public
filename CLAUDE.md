# AmiExpress-Web Project Guidelines

## 🚨 MANDATORY: 1:1 PORT - ALWAYS CHECK E SOURCES FIRST 🚨

**THIS IS THE #1 RULE - FAILURE TO FOLLOW THIS WASTES EVERYONE'S TIME**

### BEFORE Writing or Modifying ANY Code:

**YOU MUST CHECK THE ORIGINAL AMIEXPRESS E SOURCES:**

1. **Find the original implementation:**
   ```bash
   # Search for the function/command in express.e
   grep -n "internalCommand<X>" ~/Code/AmiExpress-Web/AmiExpress-Sources/express.e
   grep -n "PROC <functionName>" ~/Code/AmiExpress-Web/AmiExpress-Sources/express.e
   ```

2. **Read the original E code:**
   ```bash
   sed -n '<startLine>,<endLine>p' ~/Code/AmiExpress-Web/AmiExpress-Sources/express.e
   ```

3. **Check the original menu files:**
   ```bash
   cat ~/Code/AmiExpress-Web/backend/data/bbs/BBS/Conf01/Screens/MENU.TXT
   ```

4. **ONLY THEN implement the exact behavior - NO GUESSING, NO ASSUMPTIONS**

### Why This Is CRITICAL:

- This is a **1:1 port** of the original AmiExpress BBS software
- Every command, every flow, every behavior must match express.e EXACTLY
- The user has the E sources for a reason - USE THEM
- Making up features or guessing wastes time and breaks authenticity
- User has repeatedly emphasized this - DON'T FORGET

### Example of What NOT to Do:

❌ **WRONG:** "I'll change DOORS to X for door games"
- Did you check express.e? NO
- Did you check what X does? NO
- Result: X is expert mode toggle, you broke it

✅ **CORRECT:**
1. Search express.e for door implementation
2. Read how internalCommandX works (it's expert mode)
3. Find how doors are actually accessed (BBS commands)
4. Implement exactly as the original

### Command Priority (from express.e:28228):
```
1. SysCommand (SYSCMD)
2. BbsCommand (BBSCMD)
3. InternalCommand (built-in)
```

**If you're implementing a feature and haven't looked at express.e, STOP and look at it first.**

---

## 🚨 CRITICAL: NEVER OVERWRITE ORIGINAL AMIEXPRESS COMMANDS 🚨

**THIS IS EQUALLY AS IMPORTANT AS THE 1:1 PORT RULE**

### SACRED RULE: Command Namespace Preservation

**ALL original AmiExpress commands are SACRED and must NEVER be overwritten, replaced, or modified to do something different.**

### Rules for Commands:

1. **Original AmiExpress Commands - UNTOUCHABLE:**
   - If a command exists in express.e, it is **SACRED**
   - You MUST implement it exactly as express.e specifies
   - You CANNOT change its behavior
   - You CANNOT replace it with something else
   - You CANNOT remove it

2. **New/Web-Specific Commands - Use Different Names:**
   - If you need a new feature for the web version, create a NEW command name
   - NEVER use a name that conflicts with express.e commands
   - Use descriptive names like: WEB_*, MODERN_*, CUSTOM_*, etc.
   - Document all custom commands in a separate file

3. **Before Creating ANY Command:**
   ```bash
   # Check if command name exists in express.e
   grep -i "ELSEIF.*StrCmp(cmdcode,'YOUR_COMMAND')" ~/Code/AmiExpress-Web/AmiExpress-Sources/express.e

   # If found: YOU MUST implement it exactly as express.e shows
   # If not found: You CAN create it as a custom command
   ```

### Example of WRONG vs CORRECT:

❌ **WRONG - Overwriting Original Command:**
```typescript
case 'X':  // X is expert mode toggle in express.e
  displayDoorMenu(socket, session);  // WRONG! Changing X's behavior
  return;
```

✅ **CORRECT - Preserving Original + Adding Custom:**
```typescript
case 'X':  // Expert Mode Toggle - express.e:26113
  // ... implement exactly as express.e shows
  return;

case 'WEB_DOORS':  // Custom web-specific command
  displayDoorMenu(socket, session);
  return;
```

### Custom Command Naming Convention:

**For web-specific features, use these prefixes:**
- `WEB_*` - Web interface features
- `MODERN_*` - Modern enhancements
- `CUSTOM_*` - Custom additions
- `ADMIN_*` - Administrative tools

**Examples:**
- `WEB_DOORS` - Web door menu (if needed)
- `WEB_SETTINGS` - Web-specific settings
- `MODERN_SEARCH` - Enhanced search features
- `CUSTOM_STATS` - Custom statistics

### Verification Checklist:

Before adding/modifying ANY command:
- [ ] Did I check if this command exists in express.e?
- [ ] If it exists in express.e, am I implementing it EXACTLY as shown?
- [ ] If it doesn't exist, am I using a non-conflicting name?
- [ ] Have I documented this as a custom command?

### Command Registry:

**Keep an updated list of:**
1. **Original AmiExpress Commands** - From express.e (NEVER modify)
2. **Custom Web Commands** - Our additions (clearly marked)

**Location:** See `COMMANDS.md` for the complete registry.

---

## ⚠️ CRITICAL: Server Restart Checklist (ALWAYS READ THIS FIRST)

**BEFORE restarting backend or frontend servers, YOU MUST follow this checklist:**

### Step 1: Check for Startup Scripts
```bash
ls -la start-*.sh stop-all.sh
```

### Step 2: If Scripts Exist - Use Them!
```bash
# ✓ CORRECT - Use atomic startup scripts
./start-all.sh      # Start both servers
./start-backend.sh  # Backend only
./start-frontend.sh # Frontend only
./stop-all.sh       # Stop all servers

# ✗ WRONG - NEVER do this:
npm run dev &
npm run dev 2>&1 &
cd backend/backend && npm run dev &
```

### Step 3: Never Use Manual Commands
**YOU MUST NOT use these commands in this project:**
- `npm run dev &`
- `npm run dev 2>&1 &`
- Any variant of manual npm commands for servers

### Step 4: Why This Matters
- User has reported this issue MULTIPLE times
- Manual commands create duplicate server instances
- Duplicate instances = stale code = wasted time
- Startup scripts guarantee exactly ONE server per port
- You keep forgetting - THIS TIME DON'T FORGET!

### Step 5: After Starting
Verify exactly ONE server per port:
```bash
lsof -ti:3001 | xargs ps -p | grep "node"  # Should show 1 line
lsof -ti:5173 | xargs ps -p | grep "node"  # Should show 1 line
```

**📋 Read this section EVERY TIME before restarting servers!**

---

## Text Styling Rules

### NEVER Use Bold Text Styles
**IMPORTANT**: This BBS must NEVER use bold text styles in any ANSI screen files or terminal output.

- ❌ **DO NOT** use `\x1b[1;XXm` or `[1;XXm` (bold text codes)
- ✅ **USE** `\x1b[0;XXm` or `[XXm` (normal text codes)
- ❌ **DO NOT** use any ANSI bold attributes (attribute 1)

### Rationale
Classic Amiga terminals and the authentic AmiExpress BBS experience did not use bold text styling. All text should use normal weight for historical accuracy and authentic appearance.

### Screen File Guidelines
When creating or editing screen files (`.TXT` files in `backend/data/bbs/BBS/Node0/Screens/`):
- Use traditional Amiga ASCII art (characters: `_`, `/`, `\`, `|`, `-`)
- NO PC DOS box-drawing characters (e.g., `█`, `╔`, `═`, `╗`)
- NO bold text styles
- Keep all screens within 80x24 terminal dimensions
- Use `\r\n` line endings for proper BBS display
- Remove built-in pause prompts (handled by `doPause()` function)

### Color Codes Reference (Without Bold)
```
[30m  - Black
[31m  - Red
[32m  - Green
[33m  - Yellow
[34m  - Blue
[35m  - Magenta
[36m  - Cyan
[37m  - White
[0m   - Reset
```

## Implementation Details

### 1:1 AmiExpress Port
This project is a 1:1 port of the original AmiExpress BBS software. Every implementation must match the original E sources exactly (found in `AmiExpress-Sources/express.e`).

### Screen Display Flow
The screen display system follows express.e lines 28555-28648:
1. BBSTITLE (on connect, no pause)
2. LOGON (after login, with pause)
3. BULL (system bulletins, with pause if shown)
4. NODE_BULL (node-specific bulletins, with pause if shown)
5. confScan (scanning for new messages)
6. CONF_BULL (conference bulletins, with pause if shown)
7. MENU (main menu, with pause if needed)

### State Machine
The BBS uses proper substates:
- `DISPLAY_BULL` - Shows BULL and NODE_BULL screens
- `DISPLAY_CONF_BULL` - Joins conference and shows CONF_BULL
- `DISPLAY_MENU` - Shows menu with respect to menuPause flag
- `READ_COMMAND` - Waits for line input
- `READ_SHORTCUTS` - Waits for hotkey input (expert mode)
- always post daily changelogs to the bbs bulletins if there are any

## Backend Architecture & Modularization

### MANDATORY: Modular Code Structure
**All future development MUST follow the modular architecture established in Phase 1.**

#### Required Structure
```
backend/backend/src/
├── constants/          - ANSI codes, enums, static values
├── utils/              - Reusable utility functions
├── middleware/         - Express/Socket.IO middleware
├── handlers/           - Request/socket handlers
├── services/           - Business logic layer
└── repositories/       - Database access layer (future)
```

#### Use Existing Utilities - DO NOT Duplicate Code
**ALWAYS use these utilities instead of hardcoding:**

```typescript
// ✅ CORRECT - Use AnsiUtil
import { AnsiUtil } from './utils/ansi.util';
socket.emit('ansi-output', AnsiUtil.errorLine('Invalid input'));
socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());

// ❌ WRONG - DO NOT hardcode ANSI
socket.emit('ansi-output', '\r\n\x1b[31mInvalid input\x1b[0m\r\n');
socket.emit('ansi-output', '\r\n\x1b[32mPress any key...\x1b[0m');
```

```typescript
// ✅ CORRECT - Use ErrorHandler
import { ErrorHandler } from './utils/error-handling.util';
ErrorHandler.permissionDenied(socket, 'delete files', {
  nextState: LoggedOnSubState.DISPLAY_CONF_BULL
});

// ❌ WRONG - DO NOT duplicate error handling
socket.emit('ansi-output', '\r\n\x1b[31mPermission denied\x1b[0m\r\n');
session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
```

```typescript
// ✅ CORRECT - Use PermissionsUtil
import { PermissionsUtil } from './utils/permissions.util';
if (!PermissionsUtil.canDeleteFiles(session.user)) {
  return ErrorHandler.permissionDenied(socket, 'delete files');
}

// ❌ WRONG - DO NOT duplicate permission checks
if (session.user.secLevel < 100) {
  socket.emit('ansi-output', 'Permission denied\r\n');
}
```

```typescript
// ✅ CORRECT - Use ParamsUtil
import { ParamsUtil } from './utils/params.util';
const params = ParamsUtil.parse(paramString);
const hasNonStop = ParamsUtil.hasFlag(params, 'NS');
const range = ParamsUtil.extractRange(params);

// ❌ WRONG - DO NOT manually parse params
const params = paramString.split(' ').map(p => p.toUpperCase());
```

#### Available Utilities (37 methods total)

**AnsiUtil** (13 methods in `utils/ansi.util.ts`):
- `colorize(text, color)` - Apply color to text
- `error(text)` - Red error text
- `success(text)` - Green success text
- `warning(text)` - Yellow warning text
- `header(text)` - Cyan header text
- `clearScreen()` - Clear terminal
- `line(text?)` - Add line with CRLF
- `pressKeyPrompt()` - Standard "Press any key..." prompt
- `errorLine(text)` - Error with line ending
- `successLine(text)` - Success with line ending
- `headerBox(text)` - Header with decorative border
- `menuOption(key, description)` - Formatted menu option
- `complexPrompt(parts)` - Multi-color prompt

**ErrorHandler** (6 methods in `utils/error-handling.util.ts`):
- `sendError(socket, message, options)` - Send error with optional state change
- `sendSuccess(socket, message, options)` - Send success message
- `sendWarning(socket, message, options)` - Send warning message
- `permissionDenied(socket, action, options)` - Permission denied error
- `invalidInput(socket, field, options)` - Invalid input error
- `notFound(socket, item, options)` - Not found error

**ParamsUtil** (5 methods in `utils/params.util.ts`):
- `parse(paramString)` - Parse space-separated params
- `hasFlag(params, flag)` - Check for specific flag
- `extractRange(params)` - Extract numeric range (e.g., "1-10")
- `extractNumber(params)` - Extract single number
- `extractDate(params)` - Extract date (MM/DD/YY)

**PermissionsUtil** (13 methods in `utils/permissions.util.ts`):
- `canDeleteFiles(user)` - Check file deletion permission
- `canMoveFiles(user)` - Check file move permission
- `canAccessFileMaintenance(user)` - Check maintenance access
- `canEditFileDescriptions(user)` - Check edit permission
- `canPostMessages(user)` - Check message posting permission
- `canDeleteMessage(user, messageAuthor)` - Check message deletion
- `isSysop(user)` - Check if full sysop (level 255)
- `isCoSysop(user)` - Check if co-sysop (level 100+)
- `hasSecurityLevel(user, level)` - Check specific security level
- `canUploadFiles(user)` - Check upload permission
- `canDownloadFiles(user)` - Check download permission
- `canAccessDoors(user)` - Check door access
- `canPageSysop(user)` - Check paging permission

#### Constants to Use

**ANSI Codes** (`constants/ansi-codes.ts`):
```typescript
import { ANSI, LINE_ENDING } from './constants/ansi-codes';
// Use ANSI.RED, ANSI.GREEN, ANSI.CYAN, etc.
// Use ANSI.CLEAR_SCREEN, ANSI.RESET, etc.
```

**BBS States** (`constants/bbs-states.ts`):
```typescript
import { BBSState, LoggedOnSubState } from './constants/bbs-states';
// Use LoggedOnSubState.DISPLAY_MENU, LoggedOnSubState.READ_COMMAND, etc.
```

### Code Optimization Rules

#### 1. NO Duplicate Code
- **Before adding new code**, check if similar functionality exists
- **Use existing utilities** from `utils/` directory
- **Centralize common patterns** - don't copy/paste

#### 2. Separation of Concerns
- **Handlers** - Handle socket/HTTP requests, orchestrate calls
- **Services** - Contain business logic (future)
- **Repositories** - Database access only (future)
- **Utils** - Pure functions, no side effects

#### 3. Single Responsibility Principle
- Each function should do ONE thing
- If a function exceeds 50 lines, consider breaking it up
- Extract complex logic into separate functions

#### 4. DRY (Don't Repeat Yourself)
- If code appears 3+ times, create a utility function
- Parameter parsing, error handling, ANSI formatting are all centralized
- **Check existing utilities before writing new code**

#### 5. File Size Limits
- Handler files: Keep under 500 lines
- Utility files: Keep under 200 lines
- If file grows too large, split into logical modules

### New Feature Development Process

When adding new features:

1. **Check Documentation**
   - Read `backend/backend/MODULARIZATION_GUIDE.md` for architecture overview
   - Review existing handlers for patterns

2. **Use Existing Utilities**
   - Import from `utils/` for common operations
   - Import from `constants/` for enums and codes
   - DO NOT duplicate functionality

3. **Create New Handlers**
   - Place in `handlers/` directory
   - Follow naming convention: `feature.handler.ts`
   - Export a class with methods

4. **Keep It Modular**
   - Separate presentation (socket output) from logic
   - Use dependency injection where possible
   - Make functions testable

5. **Document Complex Logic**
   - Add comments explaining "why", not "what"
   - Update MODULARIZATION_GUIDE.md if adding major features

### Examples

#### ✅ GOOD - Modular, reusable
```typescript
import { AnsiUtil } from './utils/ansi.util';
import { ErrorHandler } from './utils/error-handling.util';
import { PermissionsUtil } from './utils/permissions.util';
import { LoggedOnSubState } from './constants/bbs-states';

function handleFileDelete(socket: any, session: any) {
  // Check permissions
  if (!PermissionsUtil.canDeleteFiles(session.user)) {
    return ErrorHandler.permissionDenied(socket, 'delete files', {
      nextState: LoggedOnSubState.DISPLAY_CONF_BULL
    });
  }

  // Business logic here...
  socket.emit('ansi-output', AnsiUtil.headerBox('Delete Files'));
  socket.emit('ansi-output', AnsiUtil.successLine('Files deleted successfully'));
}
```

#### ❌ BAD - Hardcoded, duplicated
```typescript
function handleFileDelete(socket: any, session: any) {
  // Hardcoded permission check (duplicated 20+ times)
  if (session.user.secLevel < 100) {
    socket.emit('ansi-output', '\r\n\x1b[31mPermission denied\x1b[0m\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key...\x1b[0m');
    session.subState = 'display_conf_bull';
    return;
  }

  // Hardcoded ANSI (duplicated everywhere)
  socket.emit('ansi-output', '\x1b[36m-= Delete Files =-\x1b[0m\r\n');
  socket.emit('ansi-output', '\r\n\x1b[32mFiles deleted successfully\x1b[0m\r\n');
}
```

### Future Modularization Roadmap

See `backend/backend/MODULARIZATION_GUIDE.md` and `backend/backend/FILE_HANDLER_PLAN.md` for:
- Phase 2: File operations handler (~1,100 lines to extract)
- Phase 3: Message & conference handlers (~400 lines)
- Phase 4: Door, chat & account handlers (~650 lines)
- Phase 5: Database repository pattern (~1,900 lines)

**Goal:** Reduce monolithic files to focused, testable modules:
- index.ts: 3,618 → ~800 lines (78% reduction)
- database.ts: 2,264 → ~300 lines (87% reduction)

## Development Server Management

### MANDATORY: Use Startup Scripts ONLY
**CRITICAL: NEVER manually start servers with `npm run dev` or background commands.**

**Problem:** Manual server startup causes multiple instances to run, leading to stale code and development issues.

**Solution:** Always use the dedicated startup scripts that ensure exactly ONE instance runs.

### Available Scripts

**Start All Servers (Recommended):**
```bash
./start-all.sh
```
- Kills any existing servers on both ports
- Starts backend on port 3001
- Starts frontend on port 5173
- Verifies exactly ONE process per port
- Shows success/failure status

**Start Individual Servers:**
```bash
./start-backend.sh    # Backend only (port 3001)
./start-frontend.sh   # Frontend only (port 5173)
```

**Stop All Servers:**
```bash
./stop-all.sh
```
- Kills all servers on both ports
- Use before starting if you're unsure about current state

### When to Restart Servers

**After Backend Changes:**
- TypeScript files in `backend/backend/src/`
- Database schema changes
- Environment variables (.env)
- Dependencies (package.json)
- **Action:** Run `./start-backend.sh`

**After Frontend Changes:**
- Usually hot-reloads automatically
- If changes don't appear, run `./start-frontend.sh`

**When in Doubt:**
- Run `./stop-all.sh` then `./start-all.sh`
- Better safe than running stale code

### Verification Commands

**Check server status:**
```bash
# Count servers (should be 1 each)
lsof -ti:3001 | wc -l    # Backend (expect: 1)
lsof -ti:5173 | wc -l    # Frontend (expect: 1)

# Test endpoints
curl http://localhost:3001/    # Should return: {"message":"AmiExpress Backend API"}
curl http://localhost:5173/    # Should return HTML
```

### Default Ports
- Backend API: `http://localhost:3001`
- Frontend BBS: `http://localhost:5173` ← Users access this
- **NEVER** change these ports without user approval

### Critical Rules for Claude Code

1. **NEVER run `npm run dev` or `npm run dev &` manually**
2. **ALWAYS use `./start-backend.sh` or `./start-all.sh`**
3. **ALWAYS verify exactly 1 process per port after starting**
4. **If multiple processes detected, STOP and use `./stop-all.sh` first**
5. **Report to user if scripts fail** - don't fall back to manual commands