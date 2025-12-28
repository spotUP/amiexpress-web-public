# CLAUDE.md

**🔴 READ ENTIRE FILE BEFORE ANY ACTION 🔴**

---

## ⛔ CRITICAL RULES ⛔

### 1. ALWAYS VALIDATE AGAINST EXPRESS.E SOURCES

**BEFORE changing ANY BBS behavior, validate against express.e sources via MCP tools.**

**NEVER "fix" UX issues without checking express.e.** What seems like a bug is often intentional AmiExpress design.

**Required workflow for behavior changes:**
1. Use MCP: `search_express_source "keyword"` → `read_express_module "module"`
2. Find exact express.e implementation (line numbers, logic flow)
3. Implement IDENTICALLY - same pauses, same screens, same flow
4. If express.e does it, YOU do it exactly the same way

**Examples of express.e patterns to honor:**
- `IF (displayScreen(SCREEN_BULL)) THEN doPause()` (express.e:28556-28557)
- `IF (quickFlag=FALSE) IF (displayScreen(SCREEN_LOGON)) THEN doPause()` (express.e:29854)
- Display flow: BBSTITLE → LOGON → BULL → NODE_BULL → confScan → CONF_BULL → MENU

**Why this is rule #1:** Breaking express.e compatibility destroys the authentic AmiExpress experience. Users expect EXACT original behavior. "Improvements" that deviate from express.e are bugs, not features.

**When express.e doesn't have it:** Use `WEB_*`, `MODERN_*`, `CUSTOM_*`, `ADMIN_*` prefix to mark new features.

### 2. 100% FEATURE COVERAGE - NO SHORTCUTS

**We require 1:1 feature parity with AmiExpress E sources. If express.e implements it, WE implement it.**

**NEVER skip features** because "no current doors use it" or "it's an edge case". We have 4000+ doors to support. You don't know what future doors will need.

**NEVER mark phases as "complete" at 93%** - that's NOT complete. 100% means 100%.

**If express.e has:**
- XIM protocol with jhMessage → Implement ALL XIM commands
- TIM protocol with doorMsg and PG_* commands → Implement ALL PG_* commands
- SIM doors with DoorControl port → Implement full DoorControl handling
- Any feature, function, or behavior → Implement it EXACTLY

**No stubs that silently fail.** No "TODO" comments left unimplemented. No lazy approximations.

**The goal:** Run ANY AmiExpress door from 1990-2000 with ZERO compatibility issues.

**Why this is rule #2:** Partial implementations create false confidence. Users try a door, it fails mysteriously, they blame the BBS. Every missing feature is a potential door that won't work. We are not done until express.e parity is 100%.

### 3. USE NATIVE LIBRARIES - NOT TYPESCRIPT

BBS uses REAL Amiga binaries via MOIRA 68K emulator, NOT TypeScript reimplementations.

**NEVER trap library functions** except: Node.js bridging (PutMsg/GetMsg), functions not in ROM, required for emulation.

**Use native binaries:** AEDoor.library (./Libs/), dos.library, exec.library (ROM), AmigaOS libraries (LibraryLoader)

**Why:** TypeScript creates different memory layouts. Native functions read specific offsets. Trapping breaks 4000+ doors.

**If door fails:** Check logs → Verify native binary executes → Fix emulator, NOT libraries.

### 4. NO GUESSING - VERIFY WITH EVIDENCE

**NEVER implement on assumptions.** Verify FIRST: radare2 (disassemble), strings (extract text), vamos (test reference), express.e (implementation), MCP (NDK autodocs).

**Workflow:** logs → strings → radare2 → express.e → vamos → implement

**Evidence needed:** Memory offset + structure definition + behavior confirmation + express.e reference

### 5. SDK DOORS MUST BE BUILT

SDK doors (`sdk/doors/`) load `dist/index.js` not source. **MUST BUILD before testing.**

`cd sdk/doors/{name} && npm run build` before testing. Watch: `npm run build:watch`. `start-servers.sh` auto-builds.

### 6. NEO-BLESSED COLORS

Neo-blessed now defaults to `tags: true` on all widgets. Colors work automatically.

**ONLY 16 colors supported:** black, red, green, yellow, blue, magenta, cyan, white, gray

**Use blessed tags in content:**
```typescript
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

const box = blessed.box({
  parent: screen,
  style: { fg: 'cyan', bg: 'black' },  // Style colors
  content: '{red-fg}Error{/}: message'   // Tag colors in content
});
```

**Colors BREAK if you:**
- Use raw ANSI codes like `\x1b[31m` or `\x1b[38;5;196m` (use blessed tags instead)
- Explicitly set `tags: false` (don't do this)

See: `Documentation/4-Door-Developers/NEO_BLESSED_COLOR_GUIDE.md`

### 7. MODERN DOOR UX

Default to desktop-like neo-blessed interfaces: windowed layouts, panels, menu bars, mouse support, focus management. Reserve footer 3+ rows. Avoid 90's text menus unless requested.

### 8. CHECK LOGS FIRST

**ALWAYS check logs BEFORE implementing** for 68K door issues.

**Files:** `logs/door-68k-{NAME}-{TIME}.-N{NODE}.log` (per-door), `logs/xim-debug.log` (XIM_DEBUG=1), `logs/backend.log`, `logs/frontend.log`

**Find:** `ls -t logs/door-68k-{NAME}* | head -3` (recent), `ls -lS logs/door-68k-{NAME}* | head -3` (largest), `grep -i "error\|fail" logs/door-68k-*`

**Check after EVERY change.** Document in `Documentation/6-Progress/{NAME}_DEBUG_SESSION.md`: hypothesis → action → result → next.

**DO NOT ask user to check** - check yourself and report.

### 9. NO BACKGROUND PROCESSES

**NEVER:** `run_in_background: true`, `&` for servers, start/restart servers, multiple server ops per session.

**Why:** Zombies create persistent refs (100-200 tokens each) → thousands wasted.

**Do:** Sync commands, ask user to run `./dev/scripts/start-servers.sh`, check servers (never restart), max 1 server op/session.

### 10. DISK-BASED CONFIGURATION

AmiExpress is **disk-based**, NOT database. Config from disk files ONLY.

**NEVER from DB:** Conferences (use ConfConfig.info), message bases (MsgBase.DB), file areas (Conf{N}.info DLPATH/ULPATH).

**Sources:** ConfConfig.info, Commands/*.info, doors/*.info, bbsConfig.info. **DB ONLY for:** users, messages, call logs, stats.

**BATCH FILES (batch0-batch6):** Contain AmigaDOS commands for utilities like MultiTop, Bulls, QuickNew. These are NOT doors - they're standalone Amiga executables run at maintenance events. **NEVER modify or clear batch files.** Args come from batch files, NOT .info files.

### 11. AMIGAOS CASE-INSENSITIVE - USE AMIGAFS

`AquaScan.EXE` = `aquascan.exe` = `AQUASCAN.exe`

**NEVER use `fs` directly.** ALWAYS:
```typescript
import * as amigafs from '../utils/amigafs';
amigafs.existsSync('/Doors/file');
```

22 functions: existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, statSync, etc. See `Documentation/3-Developers/AMIGAFS_MIGRATION.md`

### 12. NO EMOJIS

**NEVER** in code/scripts/output/comments/docs. Use ASCII: `[OK]`, `[ERROR]`, `[INFO]`, `*`, `X`, `!`, `-`, `+`.

**Why:** Terminal compat, encoding issues, accessibility.

### 13. KEEP HANDOFF.MD COMPACT

**Max 5KB (50-60 lines).** Current state + 1-2 sessions only. Never: analysis, code, disassembly, traces.

**Why:** 16KB → 40-50K tokens. 2KB → 5-10K tokens. Saves 30-40K (20-25% budget).

Check: `wc -c handoff.md` <5000. Archive details to `Documentation/`.

---

## Project Overview

AmiExpress-Web: TypeScript port of Amiga BBS. 68K emulation via MOIRA.

**Arch:** `web/backend` (Node/TS server), `web/frontend` (React/xterm.js), `sdk` (Door Dev Kit)

**Doors:** 68K (legacy via MOIRA in `doors/`), TypeScript (SDK in `sdk/doors/`)

**Features:** 68K emulation, AREXX (1905 lines, 40+ APIs), Import/Export, Telnet:2323, SSH:2222, WebSocket, QWK/REP, Multi-node chat

**Status:** 60-70% complete, NOT production, 2-3 months to ready. See `Documentation/6-Progress/CURRENT_STATUS.md`

---

## Development

### Server
- Start: `./dev/scripts/start-servers.sh` (auto-setup, auto-build)
- Debug: `./dev/scripts/start-servers.sh --debug`
- Kill: `./dev/scripts/kill-servers.sh`
- **Unified port 3001:** BBS `/`, Admin `/admin/`, SDK `/sdk/`
- **Protocols:** Telnet:2323, SSH:2222 (needs SSH_HOST_KEY_PATH)

### Zombie Cleanup (CRITICAL if high context)
```bash
ps aux | grep -E "(start-servers|kill-servers|build-wasm)" | grep -v grep
pkill -f "start-servers.sh" && pkill -f "kill-servers.sh" && pkill -f "build-wasm.sh"
```

### Backend (`web/backend`)
```bash
npm install; npm run dev; npm test
npx tsc --noEmit  # REQUIRED before commits
```

### Frontend (`web/frontend`)
```bash
npm install; npm run dev; npm run build
npm run build:check  # REQUIRED before PRs
```

### SDK (`sdk`)
```bash
npm install; npm run build  # REQUIRED before CLI
npm test; npm run create-door
```

**Before PRs:** Test SDK + 2 example doors build.

**New doors:** ALWAYS use `npm run create-door`, NEVER create in `web/backend/src/doors/`.

### Testing
- All commands: `npx ts-node -P dev/scripts/tsconfig.json dev/scripts/test-all-commands.ts`
- Quick: `./dev/scripts/test-all-commands-quick.sh`
- Interactive: `dev/scripts/test-command-interactive.ts`
- Doors: `./dev/scripts/test-example-doors.sh`

See `Documentation/3-Developers/TESTING.md`

---

## Git

Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`

Examples: `feat(sdk): Add Neo-Blessed`, `fix(backend): Door state bug`

---

## Environment

`.env.local`: `JWT_SECRET` (`openssl rand -base64 32`), `DATABASE_DIR` (./data), `BACKEND_PORT` (3001)

DB: `./data/amiexpress.db` (auto-created)

---

## Architecture

**Backend** (`web/backend/src/`): amiga-emulation/, database/, handlers/, services/, utils/ (39+ - REUSE, DON'T DUPLICATE)

**Key utils:** AnsiUtil, ErrorHandler, PermissionsUtil, FileDizUtil, AcsUtil, BbsPathsUtil, AmigaCommandParser - import from utils/

**File limit:** 2000 lines - modularize when reached

---

## MCP Tools

**ALWAYS use before implementing.**

- `list_express_modules` - 19 modules
- `read_express_module` - Read by module (BEST)
- `search_express_source` - Find with context
- `read_source_range` - Specific lines
- `search_ndk_autodocs` - AmigaOS specs

**Workflow:** `search_express_source "StrCmp(cmdcode,'CMD')"` → `read_express_module "internal-commands"` → implement EXACTLY.

**Not in express.e:** Use `WEB_*`, `MODERN_*`, `CUSTOM_*`, `ADMIN_*` prefix.

---

## Commands

**Before creating:** Search express.e via MCP. If found: implement exactly. If not: `WEB_*` prefix.

**Priority:** SYSCMD → BBSCMD → InternalCommand

**AREXX:** Full support (1905 lines, 40+ funcs). See `Documentation/4-Door-Developers/DOOR_DEVELOPMENT.md`

---

## BBS Output

NO emojis (`*` `X` `!` instead), NO bold ANSI (`\x1b[0;XXm` not `\x1b[1;XXm`), Amiga ASCII only (`_/\|-`, NO PC box), 80x24 max, `\r\n` line endings.

---

## Files

Docs: `Documentation/`, Scripts: `dev/scripts/`, Menu: `backend/Screens/MENU.TXT`, Bulletins: `backend/data/bbs/Conf01/Bulletins/`

**Screen flow:** BBSTITLE → LOGON → BULL → NODE_BULL → confScan → CONF_BULL → MENU

---

## MOIRA

**NEVER blame MOIRA.** 99.9% bugs in YOUR code. Check YOUR implementation first.

---

## 68K Debug

**radare2:**
```bash
brew install radare2
r2 -q -c "e asm.arch=m68k; e asm.bits=32; s 0x1156; pd 20" /path/binary
```

**vamos:**
```bash
pip3 install amitools
vamos doors/who/who  # Reference
vamos --log-file=/tmp/vamos.log doors/Bulls/Bulls
```

**CRITICAL:** Works in vamos/Amiga → bug in OUR emulator, NOT binary.

**Memory:** NEVER guess. Use `mcp__amiexpress-docs__search_ndk_autodocs` for NDK. See `dev/docs/amitools/amitools/vamos/libstructs/dos.py`.

Sizes: FileLockStruct:20, CLIStruct:64, ProcessStruct pr_CLI@0xAC pr_CurrentDir@0x98, ExecBase ThisTask@0x114

---

## Import/Export

Import users/messages/files/config from Amiga BBS. Parses binary (BCD, packed).

Tests: `dev/scripts/test-import-execution.ts`, `dev/scripts/test-user-parsing.ts`

See `Documentation/1-Users/IMPORT_USER_GUIDE.md`

---

## TypeScript

`cd web/backend && npx tsc --noEmit` before commits. Emergency: `SKIP_TS_CHECK=1 git commit`

---

## NO STUBS

NEVER stub implementations that silently break features. Fix completely or don't.

---

## Documentation

Architecture: `Documentation/3-Developers/ARCHITECTURE.md`
Testing: `Documentation/3-Developers/TESTING.md`
Door Dev: `Documentation/4-Door-Developers/DOOR_DEVELOPMENT.md`
Database: `Documentation/3-Developers/DATABASE.md`
Status: `Documentation/6-Progress/CURRENT_STATUS.md`
User Guide: `Documentation/1-Users/USER_GUIDE.md`

Start: `Documentation/README.md`

---

## Safety

**Historical preservation** - NOT malware/hacking. Educational BBS culture, retro Amiga 68K, defensive security ONLY, open source.

Terms: "Illegal instruction"=CPU, "Injection prevention"=defensive, "War/Nuke"=vintage games.

See `PROJECT_SAFETY.md`
