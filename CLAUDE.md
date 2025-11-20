# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**🔴 MANDATORY: READ THIS ENTIRE FILE BEFORE ANY ACTION 🔴**

You MUST read ALL of CLAUDE.md from top to bottom before doing ANY work.
You MUST follow EVERY rule in this file without exception.
Apologizing after violating rules is NOT acceptable - PREVENT violations.

---

## ⛔ CRITICAL RULES - READ FIRST ⛔

**NEVER USE BACKGROUND PROCESSES - THIS IS NON-NEGOTIABLE**

1. **NEVER use `run_in_background: true`** in Bash tool calls
2. **NEVER run `./dev/scripts/start-servers.sh` in background**
3. **NEVER use `&` in bash commands for servers**
4. **NEVER create multiple server restarts in one session**
5. **ALWAYS ask user to start server script** - Never start/restart servers yourself
   - User will run `./dev/scripts/start-servers.sh` manually
   - You may check if servers are running but never restart them
   - If restart needed: inform user and wait for them to do it

**Why:** Background bash processes create zombie references that:
- Persist across session summarization
- Generate 100-200 tokens per message in system reminders
- Cannot be cleaned up with KillShell
- Accumulate to thousands of wasted tokens
- Cost money and consume context window

**What TO do:**
- Run commands synchronously (they complete in 5-10 seconds)
- If servers need restart: user will handle it manually
- Only use background for true long-running monitoring (rare)
- Maximum ONE server operation per session

**Violation = Session must end immediately**

---

**NO EMOJIS ANYWHERE - THIS IS NON-NEGOTIABLE**

1. **NEVER use emojis** in ANY code, scripts, output, comments, or documentation
2. **Scripts**: Use ASCII tags only: `[OK]`, `[ERROR]`, `[WARNING]`, `[INFO]`, `[BUILD]`, etc.
3. **BBS Output**: Use ASCII characters: `*`, `X`, `!`, `-`, `+`, `|`, `=`
4. **Code Comments**: Plain text only, no decorative characters
5. **Documentation**: ASCII-safe formatting only

**Why:** Emojis cause:
- Terminal compatibility issues (telnet, SSH, various shells)
- Display problems in different environments
- Encoding issues in logs and error messages
- Inconsistent rendering across platforms
- Git diff noise and merge conflicts
- Screen reader accessibility problems

**What TO use:**
- ASCII tags: `[OK]`, `[ERROR]`, `[WARNING]`, `[INFO]`, `[DEBUG]`, `[BUILD]`, `[START]`, `[STOP]`
- ASCII symbols: `*`, `X`, `!`, `-`, `+`, `|`, `=`, `>`, `<`, `/`, `\`
- Plain text descriptions

**Violation = Fix immediately and document in commit message**

---

## ⚠️ Development Status

**This project is in ACTIVE DEVELOPMENT - NOT production ready**

- Actual completion: 60-70% (many features untested)
- Time to production: 2-3 months minimum
- Multi-user stability unknown
- Performance not tested under load
- See `Documentation/6-Progress/CURRENT_STATUS.md` for detailed status

---

## Project Overview

AmiExpress-Web is a TypeScript port of the classic Amiga BBS software AmiExpress/!X. It emulates 68K Amiga binaries in the browser using MOIRA (68000 CPU emulator) and recreates the BBS environment with modern web technologies.

**Architecture**: Monorepo with 3 main areas:
- `web/backend` - Node.js/TypeScript BBS server
- `web/frontend` - React/Vite/xterm.js terminal interface
- `sdk` - Door Development Kit for creating BBS doors/games

**Door Types**:
- **68K Doors**: Legacy Amiga binaries executed via MOIRA emulator (in `doors/`)
- **TypeScript Doors**: Modern doors using SDK, native execution (in `web/backend/src/doors/`)
- Both types register commands the same way via `.info` files

### Key Features
- **68K Emulation**: MOIRA-based execution of Amiga binary doors
- **AREXX Interpreter**: Full AREXX support (1905 lines, 40+ BBS API functions)
- **Import/Export**: Amiga BBS data migration (users, messages, files, config)
- **Multi-Protocol Access**: Telnet (port 2323), SSH (port 2222), WebSocket
- **QWK/REP Mail**: Offline mail packet generation
- **Multi-Node Chat**: Real-time Socket.IO-based chat system

## Project Structure
```
/
├── web/                    - Main BBS application
│   ├── backend/           - TypeScript BBS server
│   ├── frontend/          - React terminal UI
│   └── config-app/        - Admin configuration UI (React)
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
  - **Auto-setup**: Automatically checks and installs dependencies, builds SDK, creates .env.local
  - **First run**: May take 2-3 minutes as it installs all dependencies and builds SDK
  - **Subsequent runs**: Fast startup, only checks if setup is current
- Debug mode: `./dev/scripts/start-servers.sh --debug` (shows all logs)
- Kill: `./dev/scripts/kill-servers.sh`
- **NEVER**: `npm run dev &` or background bash or `run_in_background: true`
- **Unified Deployment**: All frontends served from backend on port 3001
  - BBS Terminal: `http://localhost:3001/`
  - Admin Config: `http://localhost:3001/admin/`
  - SDK Preview: `http://localhost:3001/sdk/`
  - SDK Backend API: port 8080 (WebSocket for door preview)
- **Just works**: No need to manually run npm install or builds

### Multi-Protocol Access
- **WebSocket**: Main browser interface at `http://localhost:3001/`
- **Telnet**: Classic BBS access (port 2323)
- **SSH**: Secure terminal access (port 2222)
  - Generate host key: `ssh-keygen -t rsa -b 4096 -f ssh_host_rsa_key -N ""`
  - Set path via `SSH_HOST_KEY_PATH` in `.env.local`
  - See `Documentation/3-Developers/TELNET_SSH_SERVERS.md`

### CRITICAL: Zombie Process Cleanup
**VERY IMPORTANT** - Zombie processes consume context and must be killed immediately!

When context usage seems high or you see many stale background bash references:
```bash
# Check for zombie processes
ps aux | grep -E "(start-servers|kill-servers|build-wasm)" | grep -v grep

# Kill all zombie processes (REQUIRED - do this immediately!)
pkill -f "start-servers.sh" && pkill -f "kill-servers.sh" && pkill -f "build-wasm.sh"

# Verify cleanup
ps aux | grep -E "(start-servers|kill-servers|build-wasm)" | grep -v grep | wc -l
# Should return: 0
```

**Why this matters:**
- Zombie processes from previous sessions leave stale background bash references
- Each reference consumes 100-200 tokens with "has new output" reminders
- Over many sessions, these accumulate and consume thousands of tokens
- **ALWAYS kill zombie processes at start of session if context seems tight**

**Signs of zombie process problem:**
- Context window filling up quickly
- Many duplicate "Background Bash has new output" system reminders
- Dozens of start-servers.sh or build-wasm.sh processes in ps output

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
npm run build:check  # Type check + build (REQUIRED before PRs)
npm run lint         # ESLint check
npm run preview      # Preview production build (port 8080)
```

### Config App (Admin UI)
```bash
cd web/config-app
npm install          # Install dependencies
npm run dev          # Start config UI dev server
npm run build        # Production build
npm run build:check  # Type check + build (REQUIRED before PRs)
```
- Standalone React app for BBS administration
- Full CRUD for conferences, file areas, users, config
- Runs on separate port from main frontend
- See `Documentation/3-Developers/API_REFERENCE.md`

### SDK (Door Development Kit)
```bash
cd sdk
npm install          # Install dependencies
npm run build        # Build SDK (REQUIRED before using CLI commands)
npm test             # Run SDK tests
npm run test:watch   # Watch mode
npm run test:unit        # Unit tests only
npm run test:integration # Integration tests only

# CLI commands (require SDK to be built first)
npm run create-door  # Create new door (interactive wizard)
npm run pack         # Package door for distribution
npm run validate     # Validate door package structure
```
- SDK located at `/sdk/`
- **IMPORTANT**: Always run `npm run build` before using CLI commands
- Builds doors for AmiExpress BBS
- See `Documentation/4-Door-Developers/DOOR_DEVELOPMENT.md`

**CRITICAL - SDK Testing Before PRs:**
- **ALWAYS** test SDK builds before creating PRs: `cd sdk && npm run build`
- **ALWAYS** test at least 2 example doors build successfully:
  ```bash
  cd sdk/doors/neo-blessed-demo && npm run build
  cd sdk/doors/2048-game && npm run build
  ```
- **NEVER** create a PR with broken SDK or example doors
- Example doors are in `sdk/doors/` directory

**CRITICAL - Creating New Doors:**
- **ALWAYS** use the SDK when creating new doors
- **NEVER** create integrated doors in `web/backend/src/doors/` directly
- Use `npm run create-door` in the SDK to scaffold new doors
- SDK doors are standalone packages with proper metadata
- SDK doors can be shared and distributed independently
- Only use integrated doors for core BBS functionality that requires deep backend integration

### SDK Preview (Door Development Tool)
```bash
cd sdk
npm run preview        # Start SDK preview at http://localhost:8080
npm run preview:quick  # Skip dependency checks, start immediately
```
- Live door development environment
- Hot reload on code changes
- Integrated BBS terminal for testing
- View door metadata, code, and test in real-time
- No need to restart BBS server when developing doors

### Testing

**Backend Tests:**
```bash
cd web/backend
npm test             # Run all Jest tests
npm run test:watch   # Watch mode
npm run test:coverage # Coverage report
npx tsc --noEmit     # Type check (REQUIRED before commits)
```

**Frontend Tests:**
```bash
cd web/frontend
npm run build:check  # Type check + build (REQUIRED before PRs)
npm run lint         # ESLint validation
```

**BBS Integration Tests:**
- **All Commands**: `node dev/scripts/test-all-commands.js`
- **Quick All Commands**: `./dev/scripts/test-all-commands-quick.sh`
- **Interactive Test**: `node dev/scripts/test-command-interactive.js`
- **Door Install Test**: `node dev/scripts/test-door-install.js`
- **Example Doors**: `./dev/scripts/test-example-doors.sh` (or `--clean` to remove node_modules first)
- **Deep Dive Test**: `node dev/scripts/test-deep-dive.js`
- **Simple Test**: `node dev/scripts/test-simple.js`
- **BBS Comprehensive**: `node dev/scripts/test-bbs-comprehensive.js`
- **Config API Test**: `node dev/scripts/test-config-api.js`
- **Config Verification**: `node dev/scripts/verify-config-tables.js`
- **Import Testing**: `node dev/scripts/test-import-execution.js`
- **User Parsing**: `node dev/scripts/test-user-parsing.js`
- See `Documentation/3-Developers/TESTING.md` for complete protocol
- **CRITICAL**: Always use test scripts instead of manual testing

## Git Workflow

**Branch Strategy:**
- Main branch: `main`
- Create feature branches: `claude/feature-name-sessionid` or `feature/descriptive-name`
- **NEVER** push directly to `main` - always create PRs
- Delete branches after merging

**PR Requirements:**
- Run all relevant tests before creating PR
- Backend: `cd web/backend && npx tsc --noEmit` must pass
- Frontend: `cd web/frontend && npm run build:check` must pass
- SDK: `cd sdk && npm run build` and test 2+ example doors must pass
- Use descriptive PR titles with context
- Reference issue numbers if applicable

**Commit Messages:**
- Use conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, etc.
- Be descriptive: explain WHY, not just WHAT
- Examples:
  - `feat(sdk): Add Neo-Blessed UI engine support`
  - `fix(backend): Resolve door state transition bug`
  - `chore(deps): Update Socket.IO to 4.8.1`

## Environment Variables
- Copy `.env.example` to `.env.local`
- Required for development:
  - `JWT_SECRET` - Generate with `openssl rand -base64 32`
  - `DATABASE_DIR` - SQLite database location (default: `./data`)
  - `BACKEND_PORT` - Backend port (default: 3001, serves all frontends)
- For deployment:
  - `VERCEL_TOKEN` - For Vercel deployment
  - `RENDER_API_KEY` - For Render.com webhooks
- See `.env.example` for full list

**Database Location**:
- Development: `./data/amiexpress.db` (project root)
- Production: Set via `DATABASE_DIR` environment variable
- SQLite file created automatically on first run

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

The project includes an MCP server at `.mcp.json` providing access to the original AmiExpress/!X source code.

### Available Tools

**Source Code Analysis:**
- `list_express_modules` - Shows 19 modules with line ranges
- `read_express_module` - Read by module (mci, internal-commands, doors, etc.) - **BEST option**
- `search_express_source` - Find functions/commands with context (returns line numbers)
- `read_source_range` - Read specific lines from express.e/hydra.e/acp.e

**AmigaOS Reference:**
- `search_ndk_autodocs` - AmigaOS function specs from NDK 3.2R4

### Workflow Example

**Implementing a BBS Command:**
```
1. Search for the command:
   mcp__amiexpress-docs__search_express_source "StrCmp(cmdcode,'DOWNLOAD')"

2. Results show: Found in express.e at lines 15234-15456

3. Read the module containing it:
   mcp__amiexpress-docs__read_express_module "internal-commands"

   OR read specific lines:
   mcp__amiexpress-docs__read_source_range
     source: "express-e"
     startLine: 15234
     endLine: 15456

4. Implement EXACTLY as shown in express.e
   - Same logic flow
   - Same state transitions
   - Same error handling
```

**Finding MCI Codes:**
```
1. Search for MCI implementation:
   mcp__amiexpress-docs__search_express_source "ParseMCI"

2. Read the MCI module:
   mcp__amiexpress-docs__read_express_module "mci"

3. Implement the MCI handler matching express.e behavior
```

### Critical Rules
1. **ALWAYS** use MCP tools before implementing ANY feature
2. Use `search_express_source` → `read_express_module` or `read_source_range`
3. Implement EXACTLY as express.e shows
4. NO guessing, NO assumptions
5. If express.e doesn't have it, use `WEB_*`, `MODERN_*`, `CUSTOM_*`, `ADMIN_*` prefixes

## TypeScript - Zero Errors Policy
- Run `cd web/backend && npx tsc --noEmit` before commits
- Pre-commit hook blocks commits with errors (when configured)
- Emergency override: `SKIP_TS_CHECK=1 git commit`

## Code Architecture

### Backend Structure (`web/backend/src/`)
**Note**: All backend code is in `web/backend/src/`, NOT `backend/backend/src/`

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

**Frontend Structure** (`web/frontend/src/`):
```
├── components/         - React components
├── hooks/              - Custom React hooks
├── services/           - API/Socket.IO clients
├── types/              - TypeScript types
├── utils/              - Utility functions
└── App.tsx             - Main application component
```

### Modularization Rules
- **File Size Limit**: 2,000 lines maximum
- When file reaches limit: STOP, plan modularization, split into 5-10 focused modules
- Use existing utilities from `utils/` - **DO NOT duplicate code**
- See `Documentation/3-Developers/ARCHITECTURE.md` for full details

### Key Utilities (Import These!)
Backend has 39+ utility modules in `web/backend/src/utils/`:

**Essential Utilities:**
```typescript
import { AnsiUtil } from './utils/ansi.util';           // ANSI codes (4.9KB)
import { AnsiOutputUtil } from './utils/ansi-output.util';  // ANSI output (4.2KB)
import { ErrorHandler } from './utils/error-handling.util';  // Error handling (6 methods)
import { ParamsUtil } from './utils/params.util';       // Parameter parsing (5 methods)
import { PermissionsUtil } from './utils/permissions.util';  // Permission checks (13+ methods)
```

**File Operations:**
```typescript
import { FileDizUtil } from './utils/file-diz.util';    // FILE_ID.DIZ extraction (12KB)
import { FileFlagUtil } from './utils/file-flag.util';  // File flagging system (8.6KB)
import { FileUploadUtil } from './utils/file-upload.util';  // Upload handling
import { ArchiveExtractor } from './utils/archive-extractor';  // ZIP, LZX, LHA, TAR, DMS
```

**BBS-Specific:**
```typescript
import { AcsUtil } from './utils/acs.util';             // Access Control System (11KB)
import { BbsPathsUtil } from './utils/bbs-paths.util';  // Path resolution (10KB)
import { MenuUtil } from './utils/menu.util';           // Menu system
import { MessagePointersUtil } from './utils/message-pointers.util';  // Message threading
import { PetsciiUtil } from './utils/petscii.util';     // C64/PETSCII conversion (13KB)
import { AmigaCommandParser } from './utils/amiga-command-parser.util';  // .info parsing (13KB)
```

**Always check `utils/` before implementing - DO NOT duplicate code**

## Command Implementation

### Before Creating Commands
1. Use MCP `search_express_source` with query `"StrCmp(cmdcode,'COMMAND')"`
2. If found: Implement EXACTLY as shown
3. If not found: Use `WEB_*`, `MODERN_*`, `CUSTOM_*`, `ADMIN_*` prefixes
4. Command Priority: SYSCMD → BBSCMD → InternalCommand

### AREXX Door Support
- Full AREXX interpreter (1905 lines, `web/backend/src/services/arexx.ts`)
- 40+ BBS API functions (BBSWRITE, BBSGETUSER, BBSPOSTMSG, etc.)
- Drop file creation (DOOR.SYS, DORINFO1.DEF)
- Amiga AREXX doors run as-is
- See `Documentation/4-Door-Developers/DOOR_DEVELOPMENT.md`

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

## 68K Disassembly
- **Use radare2** for disassembling Amiga 68K binaries
- Install: `brew install radare2`
- Disassemble at specific address:
  ```bash
  r2 -q -c "e asm.arch=m68k; e asm.bits=32; s 0x1156; pd 20" /path/to/binary
  ```
- Disassemble range:
  ```bash
  r2 -q -c "e asm.arch=m68k; e asm.bits=32; s 0x1000; pd 100" doors/RTW/rtw
  ```
- Essential for debugging door execution, understanding polling loops, and identifying missing library calls
- Much more effective than trying to infer behavior from register/memory logging

## Amiga Binary Testing (Optional)
- **vamos**: CLI tool for testing Amiga binaries outside BBS
- Install: `pip3 install amitools`
- Usage: `vamos doors/who/who` (test door execution)
- Also available: `vda68k` for disassembly
- Helpful for debugging 68K door issues before BBS integration

## Amiga BBS Import/Export
- Import users, messages, files, and configuration from classic Amiga BBS
- Parses Amiga binary formats (BCD math, packed structures)
- Conflict resolution strategies for duplicate data
- Supports AmiExpress/!X binary user files and configuration
- See `Documentation/1-Users/IMPORT_USER_GUIDE.md`
- Test: `node dev/scripts/test-import-execution.js`
- User parsing: `node dev/scripts/test-user-parsing.js`

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
