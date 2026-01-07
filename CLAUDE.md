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

**Full 16-color ANSI palette supported:**
- Standard (0-7): black, red, green, yellow, blue, magenta, cyan, white, gray
- Bright (8-15): lightblack, lightred, lightgreen, lightyellow, lightblue, lightmagenta, lightcyan, lightwhite

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

### 8. MANDATORY XIM DEBUGGING PROTOCOL

**🔴 CRITICAL: NEVER debug 68K doors without XIM tools 🔴**

**PRIMARY WORKFLOW (Use this for 90% of debugging):**

1. **Start servers (XIM logging auto-enabled):**
   ```bash
   ./dev/scripts/start-servers.sh
   ```

2. **Run smart debugger (in another terminal):**
   ```bash
   npm run xim:debug -- DOORNAME
   ```

3. **Run the door when prompted** - Debugger monitors automatically

4. **Review auto-generated report** - Issues + confidence scores + fixes + code examples

**Benefits:** Zero manual steps, 10 automated pattern matchers, comprehensive reporting

---

**ALTERNATIVE: Manual workflow (when you need control):**

1. **Start servers:**
   ```bash
   ./dev/scripts/start-servers.sh  # XIM logging auto-enabled
   ```

2. **Start live viewer:**
   ```bash
   npm run xim:live
   ```

3. **Reproduce issue** - Watch messages in real-time

4. **Analyze with pattern matcher:**
   ```bash
   npm run xim:analyze -- --door DOORNAME --verbose
   ```

5. **Use specific tools as needed:**
   - `npm run xim:validate` - Check protocol compliance
   - `npm run xim:monitor` - Watch door state
   - `npm run xim:flow` - Visualize message sequence
   - `npm run xim:trace` - Track file/library/memory access

**DO NOT:**
- ❌ Guess what's wrong
- ❌ Start with code reading
- ❌ Grep logs manually
- ❌ Ask user what's happening
- ❌ Implement without observing actual behavior

**DO:**
- ✅ Use `npm run xim:live` FIRST
- ✅ See actual message flow
- ✅ Identify exact failure point
- ✅ Validate protocol with `npm run xim:validate`
- ✅ Decode unknown messages with `npm run xim:decode`
- ✅ Visualize flow with `npm run xim:flow`

**Complete XIM Debugging Toolkit (14 tools):**
- ✅ **`xim:debug`** - **PRIMARY TOOL** - Smart orchestrator with auto-analysis
- ✅ **`xim:analyze`** - Pattern-based issue detection (10 patterns, confidence scoring)
- ✅ **`xim:diff`** - Session comparison for regression testing
- ✅ **`xim:replay:real`** - Real message injection for automated testing (dev mode only)
- ✅ **`xim:record`** - Record live sessions with timing for replay
- ✅ **`xim:perf`** - Performance profiling and bottleneck analysis
- ✅ `xim:view/xim:live` - View messages (real-time or historical)
- ✅ `xim:decode` - Decode/encode XIM messages
- ✅ `xim:validate` - Validate protocol compliance
- ✅ `xim:monitor` - Real-time door state monitoring
- ✅ `xim:replay` - Send test messages to doors
- ✅ `xim:flow` - Generate message flow diagrams
- ✅ `xim:trace` - Trace file/library/memory access
- ✅ `xim:errors` - Show errors only

**Documentation:**
- **YOU MUST READ:** `Documentation/3-Developers/CLAUDE_68K_DEBUGGING_PROTOCOL.md`
- **User Guide:** `Documentation/4-Door-Developers/XIM_DEBUGGING_GUIDE.md`

**Other Logs (check AFTER XIM analysis):**
- `logs/door-68k-{NAME}-{TIME}.-N{NODE}.log` - Per-door detailed logs
- `logs/backend.log` - Backend operations
- `logs/frontend.log` - Frontend errors

**Check after EVERY change.** Document in `Documentation/6-Progress/{NAME}_DEBUG_SESSION.md`: hypothesis → tool used → observations → action → result → next.

**DO NOT ask user to check** - use tools yourself and report findings.



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

### 14. FIX ROOT CAUSES - NO WORKAROUNDS

**Workarounds are the ABSOLUTE LAST RESORT.** Fixing the SDK/BBS is the RIGHT approach and should ALWAYS be your first choice.

**NEVER implement workarounds in doors when the issue is in the SDK or BBS core.**

**Examples:**
- ❌ **WRONG**: Door uses a Box styled as a button because blessed Buttons don't focus
- ✅ **CORRECT**: Fix `createButton()` in SDK to ensure all buttons are focusable

**Why this is critical:**
- Workarounds hide bugs - problems persist for ALL doors/users
- SDK bugs compound - every door reimplements the same workaround
- Technical debt accumulates - maintenance nightmare
- Breaks DRY principle - fix once in SDK, not in 100 doors

**Workflow:**
1. Identify issue (e.g., buttons not focusable)
2. **First check: Is this an SDK/BBS bug?**
3. If YES → Fix in `sdk/` or `web/backend/` core
4. If NO → Fix in the door
5. Workarounds ONLY if core fix is truly impossible

**When workarounds are acceptable:**
- External library limitations we can't control
- Intentional express.e quirks we must preserve
- Temporary bridge until proper solution exists (document with TODO + issue link)

**Remember:** Good engineering = fix root causes. Workarounds = technical debt.

### 15. CONTEXT EFFICIENCY - MINIMIZE TOKEN USAGE

**Every Read/Edit operation costs tokens.** Be surgical and efficient.

**File Operations Best Practices:**
1. **Plan edits first** - Know exactly what sections you need before reading
2. **Read larger chunks once** - Single Read operation for entire relevant section (not multiple small reads)
3. **Batch edits** - Make multiple related edits in fewer Edit operations
4. **Avoid re-reading** - Keep track of what you've already seen

**Examples:**
- ❌ **WRONG**: Read lines 100-200, then 200-300, then 300-400 (3 reads = 3x overhead)
- ✅ **CORRECT**: Read lines 100-400 once (1 read, plan all edits, execute)

**Why this matters:**
- Each tool call has formatting/reminder overhead (~200-500 tokens)
- Reading 300 lines in 3 chunks costs more than reading 300 lines once
- Context budget is 200K tokens - we need to make it last
- Efficient sessions allow more work per conversation

**Git Status Hygiene (CRITICAL for context efficiency):**

Git status is included in EVERY context window. Bloated git status wastes massive tokens.

**Monitor git status line count:**
```bash
git status --short | wc -l
```
- **Target:** <20 lines
- **Warning:** >50 lines (check .gitignore and commit working code)
- **Critical:** >100 lines (immediate cleanup required)

**Prevent bloat - commit early and often:**
- ❌ **WRONG**: Let 200+ files accumulate over multiple sessions
- ✅ **CORRECT**: Commit working code after each significant feature/fix
- Don't wait for "perfect" - commit incremental progress
- Runtime files are auto-ignored, code changes should be committed

**Keep .gitignore current:**
- **Build artifacts:** `**src/**/*.{js,d.ts,d.ts.map,js.map}`
- **Runtime files:** `*.user, user.data, Bulletins/bull*.txt, batch[0-9]`
- **Backups:** `*.backup, *.backup-*, bbsConfig.info.pre-*`
- **Reference docs:** Large directories in Documentation/7-Reference Sources/
- **Node temp dirs:** `Node[0-9]*/` (for per-node runtime data)

**File type audit - if you see many untracked files:**
```bash
git status --short | grep "^??" | awk '{print $2}' | grep -o '\.[^.]*$' | sort | uniq -c | sort -rn
```
- If you see hundreds of .map, .js, .d.ts files → missing .gitignore pattern
- If you see hundreds of reference docs → add to .gitignore
- If you see legitimate code files → commit them

**Context impact examples:**
- 1,500 untracked files = ~60K tokens wasted per session (30% of budget)
- 200 modified files = ~35K tokens wasted per session (17% of budget)
- 20 files = ~3K tokens (negligible overhead)

**Session cleanup checklist:**
1. Check git status line count before ending session
2. If >50 lines: commit working code or update .gitignore
3. Never leave 100+ files uncommitted across sessions
4. Add new runtime file patterns to .gitignore immediately

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
- Start: `./dev/scripts/start-servers.sh` (auto-setup, auto-build, **door watcher enabled by default**)
- Debug: `./dev/scripts/start-servers.sh --debug`
- No watcher: `./dev/scripts/start-servers.sh --no-watch` (disable auto-restart)
- Kill: `./dev/scripts/kill-servers.sh`
- **Unified port 3001:** BBS `/`, Admin `/admin/`, SDK `/sdk/`
- **Protocols:** Telnet:2323, SSH:2222 (needs SSH_HOST_KEY_PATH)

**Door Watcher:** Node.js cannot hot reload ESM modules. `start-servers.sh` uses file watcher by default to auto-restart backend when door files change. See `dev/scripts/DOOR_WATCHER.md`

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

**TypeScript door .info files:** Add `PRELOADER=YES` to show animated loading spinner during module import. The preloader handles timing automatically - no hardcoded delays in door code. See `Documentation/4-Door-Developers/TYPESCRIPT_DOOR_GUIDE.md` section on PRELOADER tooltype.

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

**FIX ALL TypeScript errors when encountered.** Pre-existing errors are NOT acceptable. If you encounter TypeScript compilation errors (even from previous sessions or other developers), fix them immediately before continuing with your current task. The codebase must always compile cleanly.

**Why:** TypeScript errors cascade and accumulate. One ignored error today becomes ten tomorrow. A non-compiling codebase blocks all developers and breaks CI/CD. Zero tolerance for TypeScript errors.

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

## Collaboration Notes

**Timezone differences:** The user and AI may have different time contexts. Log timestamps in logs are in UTC/server time. When discussing "today's logs" or "recent changes", always verify by checking actual file modification times with `ls -la` rather than assuming based on date references.

---

## Safety

**Historical preservation** - NOT malware/hacking. Educational BBS culture, retro Amiga 68K, defensive security ONLY, open source.

Terms: "Illegal instruction"=CPU, "Injection prevention"=defensive, "War/Nuke"=vintage games.

See `PROJECT_SAFETY.md`

# Using Gemini CLI for Large Codebase Analysis

  When analyzing large codebases or multiple files that might exceed context limits, use the Gemini CLI with its massive
  context window. Use `gemini -p` to leverage Google Gemini's large context capacity.

  ## File and Directory Inclusion Syntax

  Use the `@` syntax to include files and directories in your Gemini prompts. The paths should be relative to WHERE you run the
   gemini command:

  ### Examples:

  **Single file analysis:**
  ```bash
  gemini -p "@src/main.py Explain this file's purpose and structure"

  Multiple files:
  gemini -p "@package.json @src/index.js Analyze the dependencies used in the code"

  Entire directory:
  gemini -p "@src/ Summarize the architecture of this codebase"

  Multiple directories:
  gemini -p "@src/ @tests/ Analyze test coverage for the source code"

  Current directory and subdirectories:
  gemini -p "@./ Give me an overview of this entire project"
  
#
 Or use --all_files flag:
  gemini --all_files -p "Analyze the project structure and dependencies"

  Implementation Verification Examples

  Check if a feature is implemented:
  gemini -p "@src/ @lib/ Has dark mode been implemented in this codebase? Show me the relevant files and functions"

  Verify authentication implementation:
  gemini -p "@src/ @middleware/ Is JWT authentication implemented? List all auth-related endpoints and middleware"

  Check for specific patterns:
  gemini -p "@src/ Are there any React hooks that handle WebSocket connections? List them with file paths"

  Verify error handling:
  gemini -p "@src/ @api/ Is proper error handling implemented for all API endpoints? Show examples of try-catch blocks"

  Check for rate limiting:
  gemini -p "@backend/ @middleware/ Is rate limiting implemented for the API? Show the implementation details"

  Verify caching strategy:
  gemini -p "@src/ @lib/ @services/ Is Redis caching implemented? List all cache-related functions and their usage"

  Check for specific security measures:
  gemini -p "@src/ @api/ Are SQL injection protections implemented? Show how user inputs are sanitized"

  Verify test coverage for features:
  gemini -p "@src/payment/ @tests/ Is the payment processing module fully tested? List all test cases"

  When to Use Gemini CLI

  Use gemini -p when:
  - Analyzing entire codebases or large directories
  - Comparing multiple large files
  - Need to understand project-wide patterns or architecture
  - Current context window is insufficient for the task
  - Working with files totaling more than 100KB
  - Verifying if specific features, patterns, or security measures are implemented
  - Checking for the presence of certain coding patterns across the entire codebase

  Important Notes

  - Paths in @ syntax are relative to your current working directory when invoking gemini
  - The CLI will include file contents directly in the context
  - No need for --yolo flag for read-only analysis
  - Gemini's context window can handle entire codebases that would overflow Claude's context
  - When checking implementations, be specific about what you're looking for to get accurate results # Using Gemini CLI for Large Codebase Analysis


  When analyzing large codebases or multiple files that might exceed context limits, use the Gemini CLI with its massive
  context window. Use `gemini -p` to leverage Google Gemini's large context capacity.


  ## File and Directory Inclusion Syntax


  Use the `@` syntax to include files and directories in your Gemini prompts. The paths should be relative to WHERE you run the
   gemini command:


  ### Examples:


  **Single file analysis:**
  ```bash
  gemini -p "@src/main.py Explain this file's purpose and structure"


  Multiple files:
  gemini -p "@package.json @src/index.js Analyze the dependencies used in the code"


  Entire directory:
  gemini -p "@src/ Summarize the architecture of this codebase"


  Multiple directories:
  gemini -p "@src/ @tests/ Analyze test coverage for the source code"


  Current directory and subdirectories:
  gemini -p "@./ Give me an overview of this entire project"
  # Or use --all_files flag:
  gemini --all_files -p "Analyze the project structure and dependencies"


  Implementation Verification Examples


  Check if a feature is implemented:
  gemini -p "@src/ @lib/ Has dark mode been implemented in this codebase? Show me the relevant files and functions"


  Verify authentication implementation:
  gemini -p "@src/ @middleware/ Is JWT authentication implemented? List all auth-related endpoints and middleware"


  Check for specific patterns:
  gemini -p "@src/ Are there any React hooks that handle WebSocket connections? List them with file paths"


  Verify error handling:
  gemini -p "@src/ @api/ Is proper error handling implemented for all API endpoints? Show examples of try-catch blocks"


  Check for rate limiting:
  gemini -p "@backend/ @middleware/ Is rate limiting implemented for the API? Show the implementation details"


  Verify caching strategy:
  gemini -p "@src/ @lib/ @services/ Is Redis caching implemented? List all cache-related functions and their usage"


  Check for specific security measures:
  gemini -p "@src/ @api/ Are SQL injection protections implemented? Show how user inputs are sanitized"


  Verify test coverage for features:
  gemini -p "@src/payment/ @tests/ Is the payment processing module fully tested? List all test cases"


  When to Use Gemini CLI


  Use gemini -p when:
  - Analyzing entire codebases or large directories
  - Comparing multiple large files
  - Need to understand project-wide patterns or architecture
  - Current context window is insufficient for the task
  - Working with files totaling more than 100KB
  - Verifying if specific features, patterns, or security measures are implemented
  - Checking for the presence of certain coding patterns across the entire codebase


  Important Notes


  - Paths in @ syntax are relative to your current working directory when invoking gemini
  - The CLI will include file contents directly in the context
  - No need for --yolo flag for read-only analysis
  - Gemini's context window can handle entire codebases that would overflow Claude's context
  - When checking implementations, be specific about what you're looking for to get accurate results