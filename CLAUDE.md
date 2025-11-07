# AmiExpress-Web Project Guidelines

## CRITICAL RULES

### 1:1 Port - Check E Sources FIRST
- BEFORE any code: Use MCP `search_express_source` → `read_express_module` or `read_source_range`
- NO guessing, NO assumptions - implement EXACTLY as express.e shows
- Command Priority: SYSCMD → BBSCMD → InternalCommand

### MCP Tools (ALWAYS use these)
- `list_express_modules` - Shows 19 modules with line ranges
- `read_express_module` - Read by module (mci, internal-commands, doors, etc.) - BEST option
- `search_express_source` - Find functions/commands with context
- `read_source_range` - Read specific lines from express.e/hydra.e/acp.e
- `search_ndk_autodocs` - AmigaOS function specs

### NO STUBS OR TODOs
- NEVER leave stub implementations that break functionality
- Example of FORBIDDEN: `parsed.replace(/~SR_[^|]+\|\|/g, '')` silently breaks features
- Fix completely or don't implement at all

### TypeScript - Zero Errors Policy
- Run `cd web/backend && npx tsc --noEmit` before commits
- Pre-commit hook blocks commits with errors
- Emergency override: `SKIP_TS_CHECK=1 git commit`

### Command Checking
- Before creating commands: Use MCP `search_express_source` with query `"StrCmp(cmdcode,'COMMAND')"`
- If found: Implement EXACTLY as shown
- If not found: Use WEB_*, MODERN_*, CUSTOM_*, ADMIN_* prefixes

### MOIRA Emulator
- NEVER blame MOIRA - it's battle-tested and correct
- 99.9% of bugs are in YOUR implementation
- Check YOUR code first

### Server Management
- Start: `./dev/scripts/start-servers.sh`
- Kill: `./dev/scripts/kill-servers.sh`
- NEVER: `npm run dev &` or background bash or `run_in_background: true`
- Ports: Backend 3001, Frontend 5173

## BBS Output Rules
- NO emojis (use `*` `X` `!` `-` `+`)
- NO bold ANSI (`\x1b[1;XXm`) - use `\x1b[0;XXm`
- Amiga ASCII art only: `_` `/` `\` `|` `-` (NO PC box-drawing)
- 80x24 max, `\r\n` line endings

## File Organization
- Docs: `Documentation/` directory
- Scripts: `Scripts/` directory
- Main menu: `backend/BBS/Screens/MENU.TXT`
- Bulletins: `backend/data/bbs/BBS/Conf01/Bulletins/YYYYMMDD_CHANGELOG.TXT`

## Screen Display Flow (express.e:28555-28648)
BBSTITLE → LOGON → BULL → NODE_BULL → confScan → CONF_BULL → MENU

## References
- Architecture: `Documentation/3-Developers/ARCHITECTURE.md`
- Door Dev: `Documentation/4-Door-Developers/DOOR_DEVELOPMENT.md`
- Testing: `Documentation/3-Developers/TESTING.md`
