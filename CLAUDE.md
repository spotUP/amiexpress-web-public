# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AmiExpress-Web is a TypeScript port of the classic Amiga BBS software AmiExpress/!X. It emulates 68K Amiga binaries in the browser using MOIRA (68000 CPU emulator) and recreates the BBS environment with modern web technologies.

**Architecture**: Monorepo with 3 main areas:
- `web/backend` - Node.js/TypeScript BBS server
- `web/frontend` - React/Vite/xterm.js terminal interface
- `sdk` - Door Development Kit for creating BBS doors/games

## Project Structure
```
/
├── web/                    - Main BBS application
│   ├── backend/           - TypeScript BBS server
│   └── frontend/          - React terminal UI
├── sdk/                    - Door Development Kit
├── Documentation/          - All documentation
├── dev/scripts/           - Development/test scripts
├── doors/                  - Installed door programs
├── mcp-server/            - MCP server for source analysis
└── .mcp.json              - MCP server configuration
```

## Development Commands

### Server Management
- Start: `./dev/scripts/start-servers.sh`
- Debug mode: `./dev/scripts/start-servers.sh --debug` (shows all logs)
- Kill: `./dev/scripts/kill-servers.sh`
- **NEVER**: `npm run dev &` or background bash or `run_in_background: true`
- Ports: Backend 3001, Frontend 5173

### Backend (web/backend)
```bash
cd web/backend
npm install          # Install dependencies
npm run dev          # Start development server
npm test             # Run Jest tests
npm run test:watch   # Run tests in watch mode
npx tsc --noEmit     # TypeScript type check (REQUIRED before commits)
```

### Frontend (web/frontend)
```bash
cd web/frontend
npm install          # Install dependencies
npm run dev          # Start Vite dev server
npm run build        # Production build
npm run build:check  # Type check + build
npm run lint         # ESLint
```

### SDK (Door Development Kit)
```bash
cd sdk
npm install          # Install dependencies
npm run build        # Build SDK
npm test             # Run SDK tests
npm run test:watch   # Watch mode
npm run create-door  # Create new door
npm run pack         # Package door
npm run validate     # Validate door package
```
- SDK located at `/sdk/`
- Builds doors for AmiExpress BBS
- See `Documentation/4-Door-Developers/DOOR_DEVELOPMENT.md`

**CRITICAL - SDK Testing Before PRs:**
- **ALWAYS** test SDK builds before creating PRs: `cd sdk && npm run build`
- **ALWAYS** test at least 2 example doors build successfully:
  ```bash
  cd sdk/examples/neo-blessed-demo && npm run build
  cd sdk/examples/2048-game && npm run build
  ```
- **NEVER** create a PR with broken SDK or example doors
- Example doors are in `sdk/examples/` directory

### Testing
- **All Commands**: `node dev/scripts/test-all-commands.js`
- **Quick All Commands**: `./dev/scripts/test-all-commands-quick.sh`
- **Interactive Test**: `node dev/scripts/test-command-interactive.js`
- **Door Install Test**: `node dev/scripts/test-door-install.js`
- **Example Doors**: `./dev/scripts/test-example-doors.sh` (or `--clean` to remove node_modules first)
- **Deep Dive Test**: `node dev/scripts/test-deep-dive.js`
- **Simple Test**: `node dev/scripts/test-simple.js`
- **BBS Comprehensive**: `node dev/scripts/test-bbs-comprehensive.js`
- See `Documentation/3-Developers/TESTING.md` for complete protocol
- **CRITICAL**: Always use test scripts instead of manual testing

## Environment Variables
- Copy `.env.example` to `.env.local`
- Required for development:
  - `JWT_SECRET` - Generate with `openssl rand -base64 32`
  - `DATABASE_DIR` - SQLite database location (default: `./data`)
  - `BACKEND_PORT` - Backend port (default: 3001)
  - `FRONTEND_PORT` - Frontend port (default: 5173)
- For deployment:
  - `VERCEL_TOKEN` - For Vercel deployment
  - `RENDER_API_KEY` - For Render.com webhooks
- See `.env.example` for full list

## Fonts
- **Status**: Classic Amiga BBS fonts are referenced but TTF files are NOT included in repository
- **Location**: Place font files in `web/frontend/public/fonts/`
- **Required Fonts**:
  - `mOsOul_v1.0.ttf` - Default BBS font
  - `Topaz_a500_v1.0.ttf` / `Topaz_a1200_v1.0.ttf` - Classic Amiga fonts
  - `MicroKnight_v1.0.ttf` / `MicroKnightPlus_v1.0.ttf`
  - `P0T-NOoDLE_v1.0.ttf`
  - `TopazPlus_a500_v1.0.ttf` / `TopazPlus_a1200_v1.0.ttf`
- **Instructions**: See `web/frontend/public/fonts/README.md`
- **Fallback**: System will use "Courier New" if fonts are missing
- **Source**: Amiga bitmap fonts (.F16) available in `Docs/moebius/app/fonts/amiga/`

## Deployment
- Push and deploy: `./dev/scripts/push-and-deploy.sh`
- Requires environment variables in `.env.local`:
  - `VERCEL_TOKEN` - For Vercel deployment
  - `RENDER_API_KEY` - For Render.com webhooks
- See `.env.example` for deployment configuration

## Server Logs
- Backend: `logs/backend.log` (overwritten each start)
- Frontend: `logs/frontend.log` (overwritten each start)
- When user says "check the logs": Use Read tool on `logs/backend.log`
- Normal mode: Terminal shows filtered output, full logs saved to files
- Debug mode: Terminal shows all output, full logs saved to files

## MCP Server Tools (ALWAYS use these)

The project includes an MCP server at `.mcp.json` providing access to:

### Source Code Analysis
- `list_express_modules` - Shows 19 modules with line ranges
- `read_express_module` - Read by module (mci, internal-commands, doors, etc.) - **BEST option**
- `search_express_source` - Find functions/commands with context
- `read_source_range` - Read specific lines from express.e/hydra.e/acp.e

### AmigaOS Reference
- `search_ndk_autodocs` - AmigaOS function specs

### Before Implementing ANY Feature
1. Use MCP `search_express_source` → `read_express_module` or `read_source_range`
2. Implement EXACTLY as express.e shows
3. NO guessing, NO assumptions

## TypeScript - Zero Errors Policy
- Run `cd web/backend && npx tsc --noEmit` before commits
- Pre-commit hook blocks commits with errors (when configured)
- Emergency override: `SKIP_TS_CHECK=1 git commit`

## Code Architecture

### Backend Structure (`web/backend/src/`)
```
├── amiga-emulation/    - 68K emulation, door execution
├── constants/          - ANSI codes, enums, static values
├── database/           - Modular database code (10+ modules)
├── doors/              - Door management
├── handlers/           - Socket/HTTP request handlers
├── middleware/         - Express/Socket.IO middleware
├── nodes/              - Node/session management
├── server/             - Server setup modules
├── services/           - Business logic layer
├── types/              - TypeScript types
├── utils/              - Reusable utility functions
├── database.ts         - Main database (being modularized)
└── index.ts            - Main entry point
```

### Modularization Rules
- **File Size Limit**: 2,000 lines maximum
- When file reaches limit: STOP, plan modularization, split into 5-10 focused modules
- Use existing utilities from `utils/` - **DO NOT duplicate code**
- See `Documentation/3-Developers/ARCHITECTURE.md` for full details

### Key Utilities (Import These!)
```typescript
import { AnsiUtil } from './utils/ansi.util';           // 13 ANSI methods
import { ErrorHandler } from './utils/error-handling.util';  // 6 error methods
import { ParamsUtil } from './utils/params.util';       // 5 param parsing methods
import { PermissionsUtil } from './utils/permissions.util';  // 13 permission checks
```

## Command Implementation

### Before Creating Commands
1. Use MCP `search_express_source` with query `"StrCmp(cmdcode,'COMMAND')"`
2. If found: Implement EXACTLY as shown
3. If not found: Use `WEB_*`, `MODERN_*`, `CUSTOM_*`, `ADMIN_*` prefixes
4. Command Priority: SYSCMD → BBSCMD → InternalCommand

## BBS Output Rules
- NO emojis (use `*` `X` `!` `-` `+`)
- NO bold ANSI (`\x1b[1;XXm`) - use `\x1b[0;XXm`
- Amiga ASCII art only: `_` `/` `\` `|` `-` (NO PC box-drawing)
- 80x24 max, `\r\n` line endings

## File Organization
- Docs: `Documentation/` directory
- Scripts: `Scripts/` directory
- Dev scripts: `dev/scripts/` directory
- Main menu: `backend/BBS/Screens/MENU.TXT`
- Bulletins: `backend/data/bbs/BBS/Conf01/Bulletins/YYYYMMDD_CHANGELOG.TXT`

## Screen Display Flow (express.e:28555-28648)
BBSTITLE → LOGON → BULL → NODE_BULL → confScan → CONF_BULL → MENU

## MOIRA Emulator
- **NEVER blame MOIRA** - it's battle-tested and correct
- 99.9% of bugs are in YOUR implementation
- Check YOUR code first

## NO STUBS OR TODOs
- NEVER leave stub implementations that break functionality
- Example of FORBIDDEN: `parsed.replace(/~SR_[^|]+\|\|/g, '')` silently breaks features
- Fix completely or don't implement at all

## Documentation References
- Architecture: `Documentation/3-Developers/ARCHITECTURE.md`
- Testing: `Documentation/3-Developers/TESTING.md`
- Door Dev: `Documentation/4-Door-Developers/DOOR_DEVELOPMENT.md`
- Database: `Documentation/3-Developers/DATABASE.md`
- Current Status: `Documentation/6-Progress/CURRENT_STATUS.md`
- User Guide: `Documentation/1-Users/USER_GUIDE.md`
