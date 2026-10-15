# Command Handler Modularization

## Overview

The `command.handler.ts` file (originally 2968 lines) has been partially modularized to improve maintainability and organization. Key functionality has been extracted into focused modules under `handlers/command-handler/`.

## Status: Phase 1 Complete

**Lines extracted:** 1112 lines across 7 modules
**Lines remaining:** ~1856 lines (primarily substate input handlers)
**Reduction:** 37% of code extracted to modules

## Module Structure

### Created Modules

#### 1. `types.ts` (63 lines)
**Purpose:** Type definitions and interfaces

**Exports:**
- `CommandContext` interface - Context object for command handlers
- `CommandResult` enum - SUCCESS, FAILURE, NOT_ALLOWED
- `CommandHandler` type - Function signature for command handlers
- `InputHandler` type - Function signature for input handlers
- `SubstateHandler` interface - Substate configuration

**Benefits:**
- Centralized type definitions
- Better TypeScript autocomplete
- Reusable across handlers

#### 2. `dependency-injection.ts` (79 lines)
**Purpose:** Centralized dependency management

**Exports:**
- Setter functions: `setDatabase()`, `setConfig()`, `setConferences()`, etc.
- Getter functions: `getDatabase()`, `getConfig()`, etc.

**Replaces:** Lines 194-256 of original file

**Benefits:**
- Single source of truth for dependencies
- Easier testing (mock injection)
- Clear dependency boundaries

#### 3. `menu.ts` (134 lines)
**Purpose:** Main menu display logic

**Exports:**
- `displayMainMenu()` - Main menu with expert mode support
- `displayMenuPrompt()` - Command prompt with conference info

**Replaces:** Lines 260-363 of original file

**Benefits:**
- Isolated menu display logic
- Easy to customize menu behavior
- Follows express.e:28555-28648

#### 4. `pre-login.ts` (111 lines)
**Purpose:** Pre-login connection flow

**Exports:**
- `handlePreLoginInput()` - Routes AWAIT state input
- `handleAnsiPromptInput()` - ANSI/RIP/None selection

**Replaces:** Lines 412-494 of original file

**Benefits:**
- Clean separation of pre-login logic
- Easy to customize welcome sequence
- Follows express.e:29528-29551

#### 5. `command-processing.ts` (81 lines)
**Purpose:** Command priority and routing

**Exports:**
- `runSysCommand()` - Execute SYSCMD commands
- `runBbsCommand()` - Execute BBSCMD commands
- `processCommand()` - Priority system (SysCommand → BbsCommand → InternalCommand)

**Replaces:** Lines 2466-2519 of original file

**Benefits:**
- Clear command routing logic
- Follows AmiExpress priority system (express.e:28228-28257)
- Easy to add new command types

#### 6. `internal-commands.ts` (562 lines)
**Purpose:** Internal BBS commands (A-Z, 0-9, special)

**Exports:**
- `processBBSCommand()` - Main switch statement with 64+ command cases

**Replaces:** Lines 2520-2968 of original file

**Commands included:**
- File operations: D, DS, DB, U, US, UP, F, FR, FM, FS, N, A
- Messaging: R, E, B, MS, OLM
- Navigation: <, >, <<, >>, J, JM
- System: G, H, M, T, S, VER, X, ?
- Sysop: 0-5, NM, CM, WEBHOOK
- Communication: LIVECHAT, ROOM, O, C, Q
- Special: DOOR, DOORMAN, GA, MULTITOP, WH
- Plus door fallback logic

**Benefits:**
- Isolated command routing
- Easy to add new commands
- Clear command-to-handler mapping

#### 7. `input-helpers.ts` (82 lines)
**Purpose:** Reusable input handling utilities

**Exports:**
- `handleBufferedInput()` - Line-buffered input (express.e:2304-2342)
- `handleSingleKeyInput()` - Single keypress input

**Benefits:**
- DRY principle - no duplicate input logic
- Consistent backspace/echo behavior
- Reusable across all handlers

## What Remains in Main File

The main `command.handler.ts` file still contains (~1856 lines):

### Substate Input Handlers (50+)

**Chat/Communication:**
- CHAT mode (real-time keystroke transmission)
- CHAT_ROOM mode
- LIVECHAT_SELECT_USER
- LIVECHAT_INVITATION_RESPONSE
- OLM_NODE_INPUT
- OLM_COMPOSE

**New User Registration:**
- NEW_USER_NAME
- NEW_USER_LOCATION
- NEW_USER_PHONE
- NEW_USER_EMAIL
- NEW_USER_PASSWORD
- NEW_USER_PASSWORD_CONFIRM
- NEW_USER_LINES
- NEW_USER_COMPUTER
- NEW_USER_SCREEN_CLEAR
- NEW_USER_CONFIRM

**Display States:**
- DISPLAY_BULL
- CONF_SCAN
- DISPLAY_CONF_BULL
- DISPLAY_MENU

**File Operations:**
- FILES_SELECT_AREA
- UPLOAD_FILENAME_INPUT
- UPLOAD_DESC_INPUT
- FILES_UPLOAD
- FILE_DIR_SELECT
- FILE_LIST_DIR_INPUT
- DOWNLOAD_FILENAME_INPUT
- DOWNLOAD_CONFIRM_INPUT
- BATCH_DOWNLOAD_CONFIRM
- FILE_LIST_CONTINUE

**Message Operations:**
- POST_MESSAGE_TO
- POST_MESSAGE_SUBJECT
- POST_MESSAGE_PRIVATE
- POST_MESSAGE_BODY
- POST_MESSAGE_DELETE_LINE
- POST_MESSAGE_DELETE_CONFIRM
- POST_MESSAGE_EDIT_LINE
- POST_MESSAGE_EDIT_LINE_CONTENT
- POST_MESSAGE_ATTACH_FILE
- POST_MESSAGE_ATTACH_DELETE_CONFIRM
- POST_MESSAGE_REPLACE_SEARCH
- POST_MESSAGE_REPLACE_WITH
- POST_MESSAGE_INSERT_LINE
- POST_MESSAGE_INSERT_TEXT
- MSG_READER_NAV

**User Parameter Editing (W command):**
- W_OPTION_SELECT
- W_EDIT_NAME
- W_EDIT_EMAIL
- W_EDIT_REALNAME
- W_EDIT_INTERNETNAME
- W_EDIT_LOCATION
- W_EDIT_PHONE
- W_EDIT_PASSWORD
- W_EDIT_PASSWORD_CONFIRM
- W_EDIT_LINES
- W_EDIT_COMPUTER
- W_EDIT_SCREENTYPE
- W_EDIT_PROTOCOL
- W_EDIT_TRANSLATOR

**Command Processing:**
- READ_COMMAND (line input mode)
- READ_SHORTCUTS (hotkey mode)
- PROCESS_COMMAND (execution)

**Other:**
- CONFERENCE_SELECT
- JOIN_CONF_INPUT
- JM_INPUT
- RL_CONFIRM
- CM_DISPLAY_MENU
- FLAG_INPUT
- VIEW_FILE_INPUT
- ZIPPY_SEARCH_INPUT
- Plus voting booth states

## Benefits Achieved

### Maintainability
- **Focused modules**: Each module has a single responsibility
- **Easier debugging**: Issues can be isolated to specific modules
- **Clearer code**: Module names describe their purpose

### Reusability
- **Input helpers**: Buffered input logic reused across handlers
- **Type definitions**: Shared types prevent duplication
- **DI pattern**: Easy to inject mocks for testing

### Scalability
- **Easy to extend**: Adding new commands requires minimal changes
- **Clear boundaries**: Module interfaces define contracts
- **Reduced coupling**: Dependencies are explicit

### Developer Experience
- **Smaller files**: Easier to navigate and understand
- **Better TypeScript support**: Types improve autocomplete
- **Logical organization**: Related code grouped together

## Future Modularization (Phase 2)

### Next Steps

1. **Create input routing modules by category:**
   - `chat-input.ts` - CHAT, CHAT_ROOM, LIVECHAT states
   - `file-input.ts` - File operation states
   - `message-input.ts` - Message composition states
   - `user-edit-input.ts` - W command editing states
   - `registration-input.ts` - New user registration states

2. **Move to handler map pattern:**
```typescript
const substateHandlers = new Map<LoggedOnSubState, InputHandler>([
  [LoggedOnSubState.CHAT, handleChatInput],
  [LoggedOnSubState.UPLOAD_FILENAME_INPUT, handleUploadFilenameInput],
  // ... etc
]);
```

3. **Extract command input states:**
   - `command-input.ts` - READ_COMMAND, READ_SHORTCUTS, PROCESS_COMMAND

4. **Create display state module:**
   - `display-states.ts` - DISPLAY_BULL, DISPLAY_CONF_BULL, DISPLAY_MENU

### Target

- Main file: < 500 lines (orchestration only)
- All handlers: Modular, testable, focused
- Input routing: Map-based, extensible
- Total modules: 15-20 focused modules

## TypeScript Compilation

**Status:** ✅ All new modules compile without errors

**Command:**
```bash
cd web/backend
npx tsc --noEmit src/handlers/command-handler/*.ts
```

**Result:** 0 errors in command-handler modules

## Performance Impact

**None.** These are code organization changes only:
- No runtime overhead
- Same execution flow
- Identical behavior

## Backward Compatibility

**Fully compatible.** The main `command.handler.ts` exports:
- All original functions (via delegation)
- All dependency setters (via re-export)
- Same function signatures

No changes required to calling code.

## File Locations

```
web/backend/src/handlers/
├── command.handler.ts              (1856 lines remaining)
└── command-handler/
    ├── types.ts                    (63 lines)
    ├── dependency-injection.ts     (79 lines)
    ├── menu.ts                     (134 lines)
    ├── pre-login.ts                (111 lines)
    ├── command-processing.ts       (81 lines)
    ├── internal-commands.ts        (562 lines)
    └── input-helpers.ts            (82 lines)
```

## Migration Notes

### To use modularized functions:

**Menu display:**
```typescript
import { displayMainMenu } from './command-handler/menu';
await displayMainMenu(socket, session);
```

**Pre-login:**
```typescript
import { handlePreLoginInput } from './command-handler/pre-login';
const handled = await handlePreLoginInput(socket, session, data);
```

**Command processing:**
```typescript
import { processCommand } from './command-handler/command-processing';
const result = await processCommand(socket, session, 'HELP', '');
```

**Input helpers:**
```typescript
import { handleBufferedInput } from './command-handler/input-helpers';
handleBufferedInput(socket, session, data, (input) => {
  // Process complete line
});
```

### For testing:

**Dependency injection:**
```typescript
import * as DI from './command-handler/dependency-injection';
DI.setDatabase(mockDb);
DI.setConfig(mockConfig);
```

## Conclusion

Phase 1 modularization successfully extracted 37% of command.handler.ts into focused, reusable modules. The largest sections (internal commands, menu display, pre-login, command routing) are now isolated and easier to maintain.

Phase 2 will focus on the remaining substate input handlers, further reducing the main file to orchestration logic only.
