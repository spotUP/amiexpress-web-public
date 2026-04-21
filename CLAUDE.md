# CLAUDE.md

**🔴 READ ENTIRE FILE BEFORE ANY ACTION 🔴**

---

## Amiga Guru Role

You are "Amiga Guru": a specialist in the Commodore Amiga—history, hardware, software, and development. Prioritize classic Amiga contexts and only bring in modern computing when it directly relates to Amiga or emulation.

**Style:**
- Be concise, practical, and accurate.
- Default to source-backed details from Amiga RKRM, HRM, and official docs when possible.
- No emojis in project output.

**Capabilities:**
- Programming help (C/ASM, Exec, Intuition, DOS, devices).
- Troubleshooting classic hardware/chipset quirks.
- Emulation guidance (e.g., setup notes) when relevant to Amiga work.

**Boundaries:**
- Avoid unrelated modern tech unless it's clearly tied to Amiga use/emulation.

---

## Top-Level Principles

**Work doggedly.** Your goal is to be autonomous as long as possible. If you know the user's overall goal, and there is still progress you can make towards that goal, continue working until you can no longer make progress. Whenever you stop working, be prepared to justify why.

**Work smart.** When debugging, take a step back and think deeply about what might be going wrong. When something is not working as intended, add logging to check your assumptions.

**Check your work.** If you write a chunk of code, try to find a way to run it and make sure it does what you expect. If you kick off a long process, wait 30 seconds then check the logs to make sure it is running as expected.

**Be cautious with terminal commands.** Before every terminal command, consider carefully whether it can be expected to exit on its own, or if it will run indefinitely (e.g. launching a web server). For processes that run indefinitely, always launch them in a new process (e.g. nohup). Similarly, if you have a script to do something, make sure the script has similar protections against running indefinitely before you run it.

**Update handoff.md.** Every time you are done working, create/update a document handoff.md in the root project directory which always has a (brief) summary of what we've been most recently working on, including my last couple of prompts. The goal is that if the context window gets too crowded, we can restart with a new task, and the new agent can pick up where you left off using the readme (describing the project) and the handoff document (describing what we were most recently working on).

**If unsure, ask the user** instead of guessing before proceeding.

**Server lifecycle — you may start and stop servers, but clean up rigorously.**
You may run `./dev/scripts/start-servers.sh` and `./dev/scripts/kill-servers.sh`. You must:

**Stuck-door sweep (always do this at the start of a debug-MCP session):**
Before using the debug MCP, call `GET /debug/api/sessions` and check `activeDoors[]`. Any entry with `ageMs` older than ~60 seconds that you didn't launch in this turn is almost certainly a stuck 68K door. Kill it with `POST /debug/api/sessions/<nodeId>/kill-door`. This is routine — 68K doors get stuck often (waiting on input, blocked in library calls, etc.), and a stale DebugRegistry entry hides real state from subsequent introspection.


1. **Always use `kill-servers.sh`** (never `Ctrl+C` a backgrounded job, never leave it running between tasks). Don't `pkill` individual processes — use the script so lockfiles are cleaned up too.
2. **After any kill**, run the zombie-verification command (see "Zombie Cleanup" below) and confirm the process list is empty before moving on.
3. **Never run with `run_in_background: true`** — that's what created the zombie backlog. Start foreground, let it run, kill cleanly when done. If you need the server running while you do other work, ask the user to start it instead.
4. **If you inherit zombie processes** from a previous session, run the cleanup commands first and document them in `handoff.md` under "Zombie cleanup".
5. **Never skip the `kill-servers.sh`** step before ending a task in which you started a server. A running backend at session boundary = a zombie next session.

**No guessing on behavior.** Match AmiExpress exactly using proof from express.e sources, official docs, or disassembly; every change must be backed by evidence and 1:1 with the originals.

**Never lie or overstate success.** Do not claim behavior works unless verified against real AmiExpress behavior or evidence; honesty is mandatory even if results are negative.

**When asked to debug or solve a bug,** always read the backend log first and use it to drive the investigation before making changes.

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

### 5. TYPESCRIPT DOORS MUST BE BUILT

TypeScript doors in `Doors/` load `dist/index.js` not source. **MUST BUILD before testing.**

`cd Doors/{name} && npm run build` before testing. Watch: `npm run build:watch`. `start-servers.sh` auto-builds ALL TypeScript doors.

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
- X Guess what's wrong
- X Start with code reading
- X Grep logs manually
- X Ask user what's happening
- X Implement without observing actual behavior

**DO:**
- [OK] Use `npm run xim:live` FIRST
- [OK] See actual message flow
- [OK] Identify exact failure point
- [OK] Validate protocol with `npm run xim:validate`
- [OK] Decode unknown messages with `npm run xim:decode`
- [OK] Visualize flow with `npm run xim:flow`

**Complete XIM Debugging Toolkit (14 tools):**
- [OK] **`xim:debug`** - **PRIMARY TOOL** - Smart orchestrator with auto-analysis
- [OK] **`xim:analyze`** - Pattern-based issue detection (10 patterns, confidence scoring)
- [OK] **`xim:diff`** - Session comparison for regression testing
- [OK] **`xim:replay:real`** - Real message injection for automated testing (dev mode only)
- [OK] **`xim:record`** - Record live sessions with timing for replay
- [OK] **`xim:perf`** - Performance profiling and bottleneck analysis
- [OK] `xim:view/xim:live` - View messages (real-time or historical)
- [OK] `xim:decode` - Decode/encode XIM messages
- [OK] `xim:validate` - Validate protocol compliance
- [OK] `xim:monitor` - Real-time door state monitoring
- [OK] `xim:replay` - Send test messages to doors
- [OK] `xim:flow` - Generate message flow diagrams
- [OK] `xim:trace` - Trace file/library/memory access
- [OK] `xim:errors` - Show errors only

**Documentation:**
- **YOU MUST READ:** `Documentation/3-Developers/CLAUDE_68K_DEBUGGING_PROTOCOL.md`
- **User Guide:** `Documentation/4-Door-Developers/XIM_DEBUGGING_GUIDE.md`

**Other Logs (check AFTER XIM analysis):**
- `logs/door-68k-{NAME}-{TIME}.-N{NODE}.log` - Per-door detailed logs
- `logs/backend.log` - Backend operations
- `logs/frontend.log` - Frontend errors

**Check after EVERY change.** Document in `Documentation/6-Progress/{NAME}_DEBUG_SESSION.md`: hypothesis → tool used → observations → action → result → next.

**DO NOT ask user to check** - use tools yourself and report findings.

### 9. DOOR EMULATION RULES

- Do not add door-specific hacks or heuristics. Implement behavior generically so it works for every door (hundreds of titles) exactly as defined by AmiExpress sources, AEDoor specs, and AmigaOS docs.
- Never introduce per-door special cases or fallbacks; any change must be valid for all doors and backed by AmiExpress/AEDoor/AmigaOS evidence.
- Mirror express.e/AEDoor message flow and ABI 1:1; any change must be backed by source/disassembly evidence, not door-by-door observations.
- Use real reference runs (e.g., archived Amiga door logs) only as validation, not as excuses for per-door branching.

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
- X **WRONG**: Door uses a Box styled as a button because blessed Buttons don't focus
- [OK] **CORRECT**: Fix `createButton()` in SDK to ensure all buttons are focusable

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
- X **WRONG**: Read lines 100-200, then 200-300, then 300-400 (3 reads = 3x overhead)
- [OK] **CORRECT**: Read lines 100-400 once (1 read, plan all edits, execute)

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
- X **WRONG**: Let 200+ files accumulate over multiple sessions
- [OK] **CORRECT**: Commit working code after each significant feature/fix
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

### 16. NEO-BLESSED DOOR INPUT - USE DOORINPUTMANAGER

**CRITICAL:** TypeScript doors using neo-blessed MUST use `DoorInputManager` for input state or BBS input breaks.

**X OLD WAY (Manual - Error Prone):**
```typescript
// Easy to forget steps, wrong order, or miss cleanup
(screen.program as any).grabKeys = true;
setupInputHandler(session, screen);
// ... forget to cleanup = BBS input breaks!
```

**[OK] NEW WAY (DoorInputManager - Safe):**
```typescript
import { DoorInputManager } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

// In constructor
this.inputManager = new DoorInputManager(session, screen, {
  enableGameMode: true,   // Raw keyboard (games)
  enableGrabKeys: true,   // Global capture (all keys)
  enableMouse: true,      // Mouse events
  debug: false,
  debugName: 'MyDoor'
});

// In run()
this.inputManager.enable();

// In quit()
this.inputManager.disable();  // Automatic cleanup - can't forget!
```

**Why DoorInputManager:**
- [OK] One enable, one disable - simple API
- [OK] Correct order guaranteed (enable: 1-5, disable: 5-1)
- [OK] Can't forget cleanup steps
- [OK] Auto-cleanup on destroy
- [OK] Optional debug logging
- [OK] Suspend/resume for modals

**What it manages:**
1. BBS game mode (`enableGameMode` / `disableGameMode`)
2. BBS session flag (`inDoorManager`)
3. Blessed keyboard capture (`grabKeys`)
4. Blessed mouse events (`enableMouse` / `disableMouse`)
5. Input handler setup/cleanup (`setupInputHandler` / `removeInputHandler`)

**Symptoms of missing cleanup:**
- "Can't type in BBS after exiting door"
- Input frozen/unresponsive
- Commands don't work
- Must reconnect to fix

**Test checklist:**
1. Exit door via menu (Q/ESC)
2. **Immediately try typing in BBS** - should work
3. Run door again - should work
4. Exit again - BBS input should still work
5. Test 5+ times - input must work every time

**See:**
- `Documentation/4-Door-Developers/DOOR_INPUT_MANAGER_GUIDE.md` - Complete guide
- `Doors/grandmaster/app.ts` - Real example
- `sdk/utils/door-input-manager.ts` - Source code

### 17. ZOMBIE BACKGROUND PROCESSES

**Problem**: Background bash processes from previous sessions persist as "zombie" references in system reminders even after session summarization. These consume 100-200 tokens per message.

**Symptoms**:
- System reminders show "Background Bash <id> (status: running) Has new output available"
- Same process IDs appear in every response
- KillShell reports them as "killed" but they persist in reminders
- Context window fills up faster than expected

**Root Cause**: Previous sessions used `run_in_background: true` or background bash commands (`&`), creating stale references that cannot be fully cleaned up.

**Solution**:
1. **NEVER use background processes** - per CLAUDE.md critical rules
2. If you inherit zombie processes from previous session:
   - Try `KillShell` on each zombie ID (won't fix reminders but terminates actual process)
   - Try `pkill -f "<process pattern>"` to kill any real processes
   - Document in handoff.md that zombie references exist
   - Session restart is the only way to fully clear zombie references
3. **Prevention**: Always run commands synchronously, never use `run_in_background: true`

**Impact**: Each zombie adds ~150 tokens/message. With 2 zombies, that's 300 tokens wasted per response, or 3000 tokens over 10 responses.

### 18. AVOID READING LARGE SOURCE FILES

**Problem**: Several source files violate CLAUDE.md's 2,000 line limit and consume massive context.

**Oversized Files:**
| File | Lines | Size | Tokens if Read |
|------|-------|------|----------------|
| `web/backend/src/amiga-emulation/cpu/moira-source/Runner/Bartman/dasm.ts` | 2,862 | 219KB | **54,785** (27% of budget!) |
| `web/backend/src/handlers/command.handler.ts` | 3,633 | 144KB | **36,128** |
| `web/backend/src/amiga-emulation/api/DosLibrary.ts` | 4,353 | 134KB | **33,532** |
| `web/backend/src/amiga-emulation/api/ExecLibrary.ts` | 3,135 | 99KB | **24,797** |
| `web/backend/src/database.ts` | 2,318 | 86KB | **21,618** |
| `web/backend/src/index.ts` | 2,364 | 84KB | **21,210** |
| `web/backend/src/handlers/door.handler.ts` | 2,029 | 72KB | **18,005** |

**Impact**: Reading just 2-3 of these files consumes 50-100K tokens (25-50% of budget)

**Prevention**:
1. **NEVER read entire files** over 2,000 lines
2. **Use Grep tool** to search for specific patterns instead
3. **Use Read with offset/limit** to read specific sections only
4. **Use Task tool with Explore agent** for open-ended investigation
5. **Modularize** oversized files (per CLAUDE.md rule)

**Check Script**: Run `./dev/scripts/check-context-usage.sh` to identify context risks

**Best Practices**:
- Need to understand command flow? Use `Grep` with pattern instead of reading command.handler.ts
- Need to find a function? Use `Grep` to locate it, then `Read` with offset/limit for that section
- Need to explore codebase? Use `Task` tool with Explore agent
- Only read small, focused files (<500 lines) in full

---

## Project Overview

AmiExpress-Web: TypeScript port of Amiga BBS. 68K emulation via MOIRA.

**Arch:** `web/backend` (Node/TS server), `web/frontend` (React/xterm.js), `sdk` (Door Dev Kit)

**Doors:** ALL doors live in `Doors/` - both 68K (legacy via MOIRA) and TypeScript (using SDK)

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

### Zombie Cleanup (run after every server stop)

The primary kill path is:
```bash
./dev/scripts/kill-servers.sh
```

Then **verify no stragglers remain**. Expected: empty output.
```bash
ps aux | grep -E "(start-servers|kill-servers|watch-doors|build-wasm|tsx .*src/index.ts)" | grep -v grep
```

If anything shows up:
```bash
pkill -f "start-servers.sh"; pkill -f "watch-doors.ts"; pkill -f "tsx.*src/index.ts"; pkill -f "build-wasm.sh"
# then re-verify with the ps grep above
```

Also confirm the lockfile is gone:
```bash
ls /tmp/amiexpress-servers.lock 2>/dev/null && echo "STALE LOCKFILE — remove it" || echo "OK"
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

**Before PRs:** Test SDK + 2 TypeScript doors build.

**New doors:** ALWAYS develop directly in `Doors/` directory. **NEVER** create doors anywhere else (no `web/backend/src/doors/`, no `sdk/doors/`).

**TypeScript door .info files:** Add `PRELOADER=YES` to show animated loading spinner during module import. The preloader handles timing automatically - no hardcoded delays in door code. See `Documentation/4-Door-Developers/TYPESCRIPT_DOOR_GUIDE.md` section on PRELOADER tooltype.

### Testing
- All commands: `npx ts-node -P dev/scripts/tsconfig.json dev/scripts/test-all-commands.ts`
- Quick: `./dev/scripts/test-all-commands-quick.sh`
- Interactive: `dev/scripts/test-command-interactive.ts`
- Doors: `./dev/scripts/test-example-doors.sh`

See `Documentation/3-Developers/TESTING.md`

---

## Creating Doors/Games

When a user asks to create a door or game, **ALWAYS read all SDK documentation FIRST** before writing any code:

**Required Reading (in order):**
1. `Documentation/4-Door-Developers/TYPESCRIPT_DOOR_GUIDE.md` - TypeScript door patterns
2. `sdk/README.md` - SDK overview and quick start

**Why This Matters:**
- SDK documentation covers critical patterns like game mode, input handling, and cleanup
- Doors have specific requirements (package.json fields, .info files, runtime types)
- Input handling differs between door types (raw escape sequences vs key events)
- Game mode blocks 'command' events - wrong choice breaks input
- Hybrid doors require specific esbuild externals to compile

**Checklist Before Writing Door Code:**
- [ ] Understand door types: server, client, hybrid
- [ ] Know when to use game mode (real-time games) vs not (menu prompts)
- [ ] Understand input format (raw strings for server doors, KeyEvent for hybrid)
- [ ] Know the required package.json fields
- [ ] Know how to create the .info file for command registration
- [ ] Prefer modern, desktop-style neo-blessed UIs (windows/panels/mouse), not 90's text menus
- [ ] Reserve footer space for buttons (min 3 rows) to avoid clipped controls
- [ ] Keep button hover/active states blue (default UX standard for doors)
- [ ] Ensure full keyboard navigation (tab/shift-tab focus, arrow keys, action hotkeys)

**Never:**
- Create a door without reading SDK docs
- Guess at input handling patterns
- Assume game mode should be enabled
- Skip the .info file registration

---

## 68K Door Debugging

When working on 68K door emulation, always review the generated 68K door logs (e.g., door-68k.log or run logs) early to guide debugging. If logs are missing or unwritable, fix the path or permissions before proceeding.

**When working on 68K doors:**
- Read Bulls/door disassembly notes and AEDoor library notes under Documentation/4-Door-Developers (e.g., Bulls_DISASM_NOTES.md, AEDoor_LIBRARY_NOTES.md) before changing IPC.
- Check runtime traces: `/tmp/bulls.out`, `logs/door-68k.log`, and full startup output from `node web/backend/dist/scripts/run-amiga-door.js ...`.
- Keep AEDoor struct expectations in mind (DoorInfo offsets, INIT/STAT message sequence) and consult the disasm artifacts in Docs/ for exact offsets.
- Special 68K door runtime logs: always inspect `/tmp/bulls.out`, `/tmp/*door*.log`, and `logs/door-68k.log` after a run; if they are missing or unwritable, fix the path/permissions before debugging further.
- NEVER add door-specific hacks. Emulation changes must be generic and 1:1 with AmiExpress sources, AEDoor library behavior, and AmigaOS specs; supporting "hundreds of doors" means no per-door branches or heuristics beyond what express.e/AEDoor/NDK requires. If a change can't be justified generically, don't ship it.

**Tooling and references to always use:**
- **MCP AmigaExpress sources**: use the MCP tools (`mcp__amiexpress-docs__search_express_source`, `...read_express_module`, `...read_source_range`) to read `express.e` and related modules for exact behavior.
- **Disassembly artifacts**: `Documentation/4-Door-Developers/Bulls_DISASM_NOTES.md`, `AEDoor_LIBRARY_NOTES.md`, and full asm dumps in `Docs/` (e.g., `Docs/bulls_disasm.asm`, `Docs/aedoor_library_disasm.asm`).
- **Runtime logs**: `logs/backend.log` for server, `logs/door-68k.log` for 68K doors, and per-run captures like `/tmp/bulls.out` or door harness output.
- **Door harness**: `node web/backend/dist/scripts/run-amiga-door.js <door> <node>` to reproduce runs locally.
- **Vamos / vAmiga**: available for local comparison against real Kickstart behavior (see `Documentation/4-Door-Developers/AMIGA_EMULATION.md`).
- **Exec/DOS Autodocs**: `Documentation/4-Door-Developers/DOOR_DEVELOPMENT.md` for LVO semantics.

---

## Door Testing Script

**Purpose**: Comprehensive automated testing of all installed 68K Amiga doors for debugging and validation.

**Location**: `dev/scripts/test-all-doors.sh` (shell wrapper) and `dev/scripts/test-all-doors.ts` (TypeScript implementation)

**When to Use**:
- User asks to "test doors" or "debug doors"
- Investigating door crashes or hangs
- Validating door installation
- Comparing behavior across multiple doors

**Usage Examples**:
```bash
# Test all doors with defaults (5s timeout per door)
./dev/scripts/test-all-doors.sh

# Test with verbose output (shows door output and errors)
./dev/scripts/test-all-doors.sh --verbose

# Test only specific doors (comma-separated pattern matching)
./dev/scripts/test-all-doors.sh --filter "WHO,RTW,B"

# Custom timeout (10 seconds) and output file
./dev/scripts/test-all-doors.sh --timeout 10000 --output /tmp/my-test.txt
```

**Features**:
- Scans all doors in `Doors/` directory
- Tests each door with configurable timeout (default: 5000ms)
- Captures output, errors, exit codes, and signals
- Generates comprehensive report with:
  - Success/failure status
  - Timeout detection
  - Crash/error details
  - Output samples for debugging
- Supports filtering by door name pattern

**Output Report**:
- Default location: `dev/scripts/door-test-results.txt`
- Contains:
  - Summary statistics (total, passed, failed, timed out)
  - Per-door results with status and error info
  - Full output capture for failed doors

**Best Practices**:
- Run with `--verbose` first to see what doors are doing
- Use `--filter` to focus on specific problematic doors
- Increase `--timeout` for doors known to have long initialization
- Always check the generated report file for detailed error information
- Compare door output against expected behavior from express.e

**Example Workflow**:
```bash
# 1. Test all doors to identify failures
./dev/scripts/test-all-doors.sh

# 2. Re-test failed doors with verbose output
./dev/scripts/test-all-doors.sh --verbose --filter "WHO,RTW"

# 3. Analyze report for specific error patterns
cat dev/scripts/door-test-results.txt | grep -A 10 "FAILED"

# 4. Run individual door with harness for deeper debugging
node web/backend/dist/scripts/run-amiga-door.js Doors/WHO/WHO 1
```

**Important Notes**:
- Script requires backend to be built: `cd web/backend && npm run build`
- Does NOT require BBS server to be running
- Each door runs in isolated process
- Timeout kills are normal for doors expecting interactive input
- Check `/tmp/*.out` files for individual door output logs

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

## MCP (Model Context Protocol) Usage Guide

**CRITICAL**: This project uses an MCP server to provide access to documentation and source code. You MUST use MCP tools instead of reading files directly when possible.

### What is the MCP Server?

The MCP server (`mcp-server/index.js`) provides **50+ documentation resources** and **5 source files** (35,000+ lines) through a standardized interface. It saves massive amounts of tokens compared to reading files directly.

**Version**: 2.0
**Total Resources**: 50+ docs + 5 source files
**Server Name**: `amiexpress-docs-mcp-server`

### Why Use MCP Instead of Reading Files?

**Token Savings Example:**
- Reading `express.e` directly: **35,000+ tokens** (entire file)
- Using `read_express_module`: **500-2000 tokens** (just the module you need)
- **Savings**: 94-98% token reduction

**Other Benefits:**
- Organized documentation by category
- Built-in search across all docs
- Module-based access to express.e source
- Line-range reading for precise lookups
- No need to know exact file paths

### Available MCP Tools (7 Tools)

#### 1. search_docs
**Purpose**: Search across ALL documentation for keywords or phrases
**When to Use**: Finding information without knowing which doc contains it

```javascript
mcp__amiexpress-docs__search_docs({
  query: "AREXX",           // keyword to search
  caseSensitive: false      // optional, default false
})
```

#### 2. get_all_docs
**Purpose**: Get ALL documentation as single combined resource
**When to Use**: RARELY - only when you need comprehensive overview (uses many tokens)

```javascript
mcp__amiexpress-docs__get_all_docs({})
```

**Warning**: This retrieves 50+ docs at once. Use `search_docs` instead for specific queries.

#### 3. search_ndk_autodocs
**Purpose**: Search AmigaOS NDK 3.2R4 Autodocs for function specifications
**When to Use**: Looking up AmigaOS library functions (dos.library, exec.library, etc.)

```javascript
mcp__amiexpress-docs__search_ndk_autodocs({
  query: "AllocDosObject",   // function name or keyword
  library: "dos"              // optional: dos, exec, graphics, intuition, etc.
})
```

#### 4. read_source_range
**Purpose**: Read specific line range from express.e source (98% token savings vs full read)
**When to Use**: You know exact line numbers from search results

```javascript
mcp__amiexpress-docs__read_source_range({
  source: "express-e",       // or "hydra-e", "acp-e"
  startLine: 15234,          // starting line (1-indexed)
  endLine: 15456             // ending line (inclusive)
})
```

**Available Sources:**
- `express-e` - Main BBS source (35,000+ lines)
- `hydra-e` - Hydra protocol implementation
- `acp-e` - AmiExpress Control Panel

#### 5. search_express_source
**Purpose**: Search express.e source code for commands, functions, or keywords
**When to Use**: Finding implementation in express.e without knowing line numbers

```javascript
mcp__amiexpress-docs__search_express_source({
  query: "StrCmp(cmdcode,'DOWNLOAD')",  // search string
  context: 3                             // optional, lines of context (default 3)
})
```

**Pro Tip**: After finding line numbers, use `read_source_range` for full context

#### 6. read_express_module
**Purpose**: Read express.e by logical module (BEST for organized access)
**When to Use**: Understanding a specific subsystem (MCI, commands, doors, etc.)

```javascript
mcp__amiexpress-docs__read_express_module({
  module: "mci"  // see list below
})
```

**Available Modules (19 modules):**
- `init` - Initialization and startup
- `core` - Core BBS functionality
- `security` - Security and access control
- `io` - Input/output handling
- `messaging` - Message system
- `doors` - Door execution and management
- `commands` - Command processing
- `mci` - MCI code implementation
- `display` - Display and rendering
- `rexx` - AREXX integration
- `windows` - Window management
- `logging` - Logging system
- `mail` - Mail system
- `files` - File management
- `conference` - Conference system
- `internal-commands` - Internal command handlers
- `command-priority` - Command priority logic
- `mainloop` - Main event loop
- `startup` - Startup sequence

**Pro Tip**: This is the MOST EFFICIENT way to read express.e source. Always prefer modules over line ranges.

#### 7. list_express_modules
**Purpose**: List all 19 available modules with descriptions and line ranges
**When to Use**: Discovering which module contains what you need

```javascript
mcp__amiexpress-docs__list_express_modules({})
```

### Step-by-Step Workflows

**Workflow 1: Implementing a BBS Command**

```javascript
// Step 1: Search for the command implementation
mcp__amiexpress-docs__search_express_source({
  query: "StrCmp(cmdcode,'DOWNLOAD')",
  context: 3
})

// Step 2: Read the internal-commands module (more context)
mcp__amiexpress-docs__read_express_module({
  module: "internal-commands"
})

// Step 3: If you need exact implementation details
mcp__amiexpress-docs__read_source_range({
  source: "express-e",
  startLine: 15234,
  endLine: 15456
})

// Step 4: Implement EXACTLY as shown, no guessing
```

**Workflow 2: Understanding MCI Code Implementation**

```javascript
// Step 1: List modules to find MCI module
mcp__amiexpress-docs__list_express_modules({})

// Step 2: Read the entire MCI module
mcp__amiexpress-docs__read_express_module({
  module: "mci"
})

// Step 3: Search for specific MCI code if needed
mcp__amiexpress-docs__search_express_source({
  query: "~UN",
  context: 5
})
```

**Workflow 3: Looking Up AmigaOS Functions**

```javascript
// Step 1: Search NDK Autodocs
mcp__amiexpress-docs__search_ndk_autodocs({
  query: "AllocDosObject",
  library: "dos"
})

// Step 2: See how express.e uses it
mcp__amiexpress-docs__search_express_source({
  query: "AllocDosObject",
  context: 5
})
```

### Common Mistakes to Avoid

**X WRONG: Reading Files Directly**
```javascript
// DON'T DO THIS:
Read({file_path: "/path/to/express.e"})  // Wastes 35,000+ tokens!
```

**[OK] CORRECT: Use MCP Tools**
```javascript
// DO THIS INSTEAD:
mcp__amiexpress-docs__read_express_module({module: "doors"})  // Uses ~1000 tokens
```

**X WRONG: Guessing Implementation**
```javascript
// DON'T DO THIS:
// "I think the DOWNLOAD command probably does X, Y, Z"
```

**[OK] CORRECT: Check express.e First**
```javascript
// DO THIS INSTEAD:
mcp__amiexpress-docs__search_express_source({
  query: "StrCmp(cmdcode,'DOWNLOAD')",
  context: 5
})
// Then implement EXACTLY as shown
```

### Quick Reference Cheat Sheet

| Task | MCP Tool | Example |
|------|----------|---------|
| Find command implementation | `search_express_source` | `{query: "StrCmp(cmdcode,'MAIL')"}` |
| Read MCI implementation | `read_express_module` | `{module: "mci"}` |
| Read door logic | `read_express_module` | `{module: "doors"}` |
| Look up AmigaOS function | `search_ndk_autodocs` | `{query: "AllocDosObject", library: "dos"}` |
| Find specific lines | `read_source_range` | `{source: "express-e", startLine: 100, endLine: 200}` |
| Search all documentation | `search_docs` | `{query: "AREXX"}` |
| List available modules | `list_express_modules` | `{}` |

### Token Savings Examples

**Scenario 1: Finding DOWNLOAD command**
- Reading entire express.e: **35,000 tokens**
- Using `search_express_source` + `read_source_range`: **~500 tokens**
- **Savings**: 98.6%

**Scenario 2: Understanding door system**
- Reading entire express.e + door.handler.ts: **53,000 tokens**
- Using `read_express_module({module: "doors"})`: **~1,200 tokens**
- **Savings**: 97.7%

**Scenario 3: Looking up AllocDosObject**
- WebSearch + reading documentation: **~2,000 tokens**
- Using `search_ndk_autodocs`: **~300 tokens**
- **Savings**: 85%

**The MCP server is your FIRST resource, not your last resort.**

---

## CLI Tools for BBS Administration

### info-editor: .info File Tooltype Editor

**Location**: `web/backend/src/scripts/info-editor.ts`
**Purpose**: Command-line tool for editing Amiga .info file tooltypes

**Features:**
- List all tooltypes with enabled/disabled status
- Get, set, add, delete tooltypes
- Enable/disable (comment/uncomment) tooltypes
- Toggle comment status
- Automatic backup before modifications
- JSON output option for scripting
- Preserves icon image data and DiskObject structure

**Usage:**

**Basic Syntax:**
```bash
npx tsx web/backend/src/scripts/info-editor.ts <file.info> <command> [args] [options]
```

**Commands:**

| Command | Args | Description |
|---------|------|-------------|
| `list` | - | List all tooltypes with status |
| `get` | `<KEY>` | Get value of specific tooltype |
| `set` | `<KEY> <VALUE>` | Set or add a tooltype |
| `delete` | `<KEY>` | Delete a tooltype |
| `enable` | `<KEY>` | Enable (uncomment) a tooltype |
| `disable` | `<KEY>` | Disable (comment out) a tooltype |
| `toggle` | `<KEY>` | Toggle comment status |
| `backup` | - | Create backup file |
| `restore` | - | Restore from backup |

**Options:**
- `--no-backup` - Skip automatic backup before modifications
- `--verbose` - Show detailed operation logs
- `--json` - Output in JSON format (for list/get)

**Examples:**

```bash
# List all tooltypes
npx tsx web/backend/src/scripts/info-editor.ts Commands/BBSCmd/j.info list

# Get specific tooltype
npx tsx web/backend/src/scripts/info-editor.ts Commands/BBSCmd/j.info get LOCATION

# Set a tooltype (creates if missing)
npx tsx web/backend/src/scripts/info-editor.ts doors/MyDoor/MyDoor.info set STACK 20000

# Disable a door (comment out LOCATION)
npx tsx web/backend/src/scripts/info-editor.ts doors/MyDoor/MyDoor.info disable LOCATION

# Enable a door (uncomment LOCATION)
npx tsx web/backend/src/scripts/info-editor.ts doors/MyDoor/MyDoor.info enable LOCATION
```

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

---

## Using Gemini CLI for Large Codebase Analysis

When analyzing large codebases or multiple files that might exceed context limits, use the Gemini CLI with its massive context window. Use `gemini -p` to leverage Google Gemini's large context capacity.

### File and Directory Inclusion Syntax

Use the `@` syntax to include files and directories in your Gemini prompts. The paths should be relative to WHERE you run the gemini command:

**Examples:**

```bash
# Single file analysis
gemini -p "@src/main.py Explain this file's purpose and structure"

# Multiple files
gemini -p "@package.json @src/index.js Analyze the dependencies used in the code"

# Entire directory
gemini -p "@src/ Summarize the architecture of this codebase"

# Multiple directories
gemini -p "@src/ @tests/ Analyze test coverage for the source code"

# Current directory and subdirectories
gemini -p "@./ Give me an overview of this entire project"

# Or use --all_files flag
gemini --all_files -p "Analyze the project structure and dependencies"
```

### Implementation Verification Examples

```bash
# Check if a feature is implemented
gemini -p "@src/ @lib/ Has dark mode been implemented in this codebase? Show me the relevant files and functions"

# Verify authentication implementation
gemini -p "@src/ @middleware/ Is JWT authentication implemented? List all auth-related endpoints and middleware"

# Check for specific patterns
gemini -p "@src/ Are there any React hooks that handle WebSocket connections? List them with file paths"

# Verify error handling
gemini -p "@src/ @api/ Is proper error handling implemented for all API endpoints? Show examples of try-catch blocks"
```

### When to Use Gemini CLI

Use gemini -p when:
- Analyzing entire codebases or large directories
- Comparing multiple large files
- Need to understand project-wide patterns or architecture
- Current context window is insufficient for the task
- Working with files totaling more than 100KB
- Verifying if specific features, patterns, or security measures are implemented
- Checking for the presence of certain coding patterns across the entire codebase

**Important Notes:**
- Paths in @ syntax are relative to your current working directory when invoking gemini
- The CLI will include file contents directly in the context
- No need for --yolo flag for read-only analysis
- Gemini's context window can handle entire codebases that would overflow Claude's context
- When checking implementations, be specific about what you're looking for to get accurate results
