# Code Architecture & Modularization

## MANDATORY: Modular Code Structure

All future development MUST follow the modular architecture established in Phase 1.

### Required Structure
```
backend/backend/src/
├── constants/          - ANSI codes, enums, static values
├── utils/              - Reusable utility functions
├── middleware/         - Express/Socket.IO middleware
├── handlers/           - Request/socket handlers
├── services/           - Business logic layer
└── repositories/       - Database access layer (future)
```

## Use Existing Utilities - DO NOT Duplicate Code

### AnsiUtil (13 methods)
```typescript
import { AnsiUtil } from './utils/ansi.util';

// Available methods:
AnsiUtil.colorize(text, color)    // Apply color
AnsiUtil.error(text)               // Red error text
AnsiUtil.success(text)             // Green success text
AnsiUtil.warning(text)             // Yellow warning text
AnsiUtil.header(text)              // Cyan header text
AnsiUtil.clearScreen()             // Clear terminal
AnsiUtil.line(text?)               // Add line with CRLF
AnsiUtil.pressKeyPrompt()          // "Press any key..."
AnsiUtil.errorLine(text)           // Error with CRLF
AnsiUtil.successLine(text)         // Success with CRLF
AnsiUtil.headerBox(text)           // Header with border
AnsiUtil.menuOption(key, desc)     // Formatted menu option
AnsiUtil.complexPrompt(parts)      // Multi-color prompt
```

### ErrorHandler (6 methods)
```typescript
import { ErrorHandler } from './utils/error-handling.util';

// Available methods:
ErrorHandler.sendError(socket, message, options)
ErrorHandler.sendSuccess(socket, message, options)
ErrorHandler.sendWarning(socket, message, options)
ErrorHandler.permissionDenied(socket, action, options)
ErrorHandler.invalidInput(socket, field, options)
ErrorHandler.notFound(socket, item, options)
```

### ParamsUtil (5 methods)
```typescript
import { ParamsUtil } from './utils/params.util';

// Available methods:
ParamsUtil.parse(paramString)       // Parse space-separated params
ParamsUtil.hasFlag(params, flag)    // Check for specific flag
ParamsUtil.extractRange(params)     // Extract numeric range (e.g., "1-10")
ParamsUtil.extractNumber(params)    // Extract single number
ParamsUtil.extractDate(params)      // Extract date (MM/DD/YY)
```

### PermissionsUtil (13 methods)
```typescript
import { PermissionsUtil } from './utils/permissions.util';

// Available methods:
PermissionsUtil.canDeleteFiles(user)
PermissionsUtil.canMoveFiles(user)
PermissionsUtil.canAccessFileMaintenance(user)
PermissionsUtil.canEditFileDescriptions(user)
PermissionsUtil.canPostMessages(user)
PermissionsUtil.canDeleteMessage(user, messageAuthor)
PermissionsUtil.isSysop(user)
PermissionsUtil.isCoSysop(user)
PermissionsUtil.hasSecurityLevel(user, level)
PermissionsUtil.canUploadFiles(user)
PermissionsUtil.canDownloadFiles(user)
PermissionsUtil.canAccessDoors(user)
PermissionsUtil.canPageSysop(user)
```

## Code Examples

### ✅ GOOD - Modular, reusable
```typescript
import { AnsiUtil } from './utils/ansi.util';
import { ErrorHandler } from './utils/error-handling.util';
import { PermissionsUtil } from './utils/permissions.util';
import { LoggedOnSubState } from './constants/bbs-states';

function handleFileDelete(socket: any, session: any) {
  if (!PermissionsUtil.canDeleteFiles(session.user)) {
    return ErrorHandler.permissionDenied(socket, 'delete files', {
      nextState: LoggedOnSubState.DISPLAY_CONF_BULL
    });
  }

  socket.emit('ansi-output', AnsiUtil.headerBox('Delete Files'));
  socket.emit('ansi-output', AnsiUtil.successLine('Files deleted'));
}
```

### ❌ BAD - Hardcoded, duplicated
```typescript
function handleFileDelete(socket: any, session: any) {
  if (session.user.secLevel < 100) {
    socket.emit('ansi-output', '\r\n\x1b[31mPermission denied\x1b[0m\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key...\x1b[0m');
    session.subState = 'display_conf_bull';
    return;
  }

  socket.emit('ansi-output', '\x1b[36m-= Delete Files =-\x1b[0m\r\n');
  socket.emit('ansi-output', '\r\n\x1b[32mFiles deleted\x1b[0m\r\n');
}
```

## Code Optimization Rules

### 1. NO Duplicate Code
- Before adding code, check if similar functionality exists
- Use existing utilities from `utils/` directory
- Centralize common patterns

### 2. Separation of Concerns
- **Handlers** - Handle socket/HTTP requests, orchestrate calls
- **Services** - Contain business logic (future)
- **Repositories** - Database access only (future)
- **Utils** - Pure functions, no side effects

### 3. Single Responsibility Principle
- Each function should do ONE thing
- If function exceeds 50 lines, break it up
- Extract complex logic into separate functions

### 4. DRY (Don't Repeat Yourself)
- If code appears 3+ times, create a utility function
- Check existing utilities before writing new code

### 5. File Size Limits
- Handler files: Keep under 500 lines
- Utility files: Keep under 200 lines
- Split large files into logical modules

## New Feature Development Process

1. **Check Documentation**
   - Read `backend/backend/MODULARIZATION_GUIDE.md`
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
   - Separate presentation from logic
   - Use dependency injection where possible
   - Make functions testable

5. **Document Complex Logic**
   - Add comments explaining "why", not "what"
   - Update guides if adding major features

## Future Modularization Roadmap

See `backend/backend/MODULARIZATION_GUIDE.md` for:
- Phase 2: File operations handler (~1,100 lines)
- Phase 3: Message & conference handlers (~400 lines)
- Phase 4: Door, chat & account handlers (~650 lines)
- Phase 5: Database repository pattern (~1,900 lines)

**Goal:** Reduce monolithic files to focused, testable modules:
- index.ts: 3,618 → ~800 lines (78% reduction)
- database.ts: 2,264 → ~300 lines (87% reduction)
