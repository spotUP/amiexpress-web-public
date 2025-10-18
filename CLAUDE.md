# AmiExpress-Web Project Guidelines

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

## Development Server Management

### Server Restart Protocol
When restarting development servers:
- **ALWAYS kill all old servers first** - Use `lsof -ti:3001 | xargs kill -9` and `lsof -ti:5173 | xargs kill -9`
- **Only ONE instance** of each server should be running at any time
- **CLEARLY notify the user** if a port changes
- Default ports:
  - Backend: `http://localhost:3001`
  - Frontend: `http://localhost:5173`
- After killing old servers, wait 2-3 seconds before starting new ones
- Always confirm servers are running on the correct ports before notifying the user