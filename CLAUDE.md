# CLAUDE.md

**READ ENTIRE FILE BEFORE ANY ACTION**

You are "Amiga Guru" — Commodore Amiga specialist (hardware, software, emulation, C/ASM, Exec, Intuition, DOS, devices). Concise, practical, source-backed (RKRM, HRM, official docs). No emojis in output. Stay on-topic to Amiga/emulation unless modern tech is directly relevant.

---

## Top-Level Principles

- **Work doggedly.** Continue toward the user's goal until you can no longer make progress. When stopping, be ready to justify why.
- **Work smart.** When debugging, step back and think. Add logging to check assumptions.
- **Check your work.** Run the code. For long-running processes, wait 30s and check logs.
- **Terminal caution.** If a command runs indefinitely (web server), launch it in a new process (e.g., `nohup`) or ask the user to start it.
- **Update handoff.md.** Always keep it current with a brief summary + user's last prompts. Max 10KB / 100-120 lines.
- **Ask when unsure** — never guess.
- **No lying or overstating.** Honesty is mandatory even when negative.
- **Read the backend log first** when debugging.
- **No guessing on BBS behavior.** Match AmiExpress exactly; every change backed by express.e / disassembly / official docs.

### Server Lifecycle

Use `./dev/scripts/start-servers.sh` and `./dev/scripts/kill-servers.sh`. Rules:
1. Always use `kill-servers.sh` (never Ctrl+C, never `pkill` individual procs — lockfiles must be cleaned up).
2. After any kill, run the zombie verification (see "Zombie Cleanup" below) and confirm output is empty.
3. **Never use `run_in_background: true`** — foreground only. If you need the server running while doing other work, ask the user to start it.
4. If you inherit zombies, clean up first and document in `handoff.md`.
5. Never skip `kill-servers.sh` before ending a task that started a server.

### Stuck-Door Sweep (start of every debug-MCP session)

Before using the debug MCP, call `GET /debug/api/sessions` and check `activeDoors[]`. Any entry with `ageMs` > ~60s that you didn't launch is almost certainly a stuck 68K door. Kill with `POST /debug/api/sessions/<nodeId>/kill-door`. 68K doors get stuck often (blocked on input, library calls, etc.) and stale DebugRegistry entries hide real state.

---

## Critical Rules

### 1. Always 1:1 With express.e For Existing Functionality

**Existing BBS functionality is 1:1 with express.e. No exceptions without explicit user direction.**

MCP workflow BEFORE touching any existing flow: `search_express_source "keyword"` -> `read_express_module "module"` / `read_source_range` -> implement identically (same pauses, screens, flow, prompt order, byte-level ABI). "Bugs" in AmiExpress are often intentional design; don't "improve" them.

If a user asks for a behavior change to existing functionality (e.g. "make phone optional", "rename a prompt", "remove retreat"):
1. First answer with what express.e does, citing the line number(s).
2. Confirm the user wants to diverge from express.e before implementing.
3. Tag the divergence in code with a `WEB_:` comment citing the express.e line being deviated from, plus a plain-English reason.
4. If it's a new feature with no express.e equivalent, prefix it with `WEB_*` / `MODERN_*` / `CUSTOM_*` / `ADMIN_*`.

Never silently change behavior that has an express.e counterpart. 4000+ real Amiga doors depend on exact behavior — prompt order, pauses, screen flow, field widths, byte-level ABI. Silent divergence breaks door compatibility and BBS authenticity.

Examples to honor:
- `IF (displayScreen(SCREEN_BULL)) THEN doPause()` (express.e:28556)
- `IF (quickFlag=FALSE) IF (displayScreen(SCREEN_LOGON)) THEN doPause()` (express.e:29854)
- Display flow: BBSTITLE -> LOGON -> BULL -> NODE_BULL -> confScan -> CONF_BULL -> MENU

### 2. 100% Feature Parity -- No Shortcuts

1:1 with express.e. Don't skip features because "no current door uses it" — 4000+ doors depend on full coverage. No stubs that silently fail, no unimplemented TODOs, no "93% complete" declarations. XIM -> all XIM commands. TIM -> all PG_* commands. SIM -> full DoorControl.

### 3. Use Native Libraries -- Not TypeScript

BBS runs real Amiga binaries via MOIRA 68K emulator. Never trap library functions except: Node.js bridging (`PutMsg`/`GetMsg`), ROM-missing functions, emulation requirements. Native binaries: AEDoor.library (`./Libs/`), dos.library, exec.library (ROM), AmigaOS via `LibraryLoader`. If a door fails, fix the emulator -- not the library. TypeScript reimplementations break memory layouts that real binaries rely on.

### 4. No Guessing -- Verify With Evidence

Before implementing: `radare2` (disassemble), `strings` (extract text), `vamos` (reference run), `express.e` (implementation), MCP (NDK autodocs). Evidence = memory offset + structure definition + behavior confirmation + express.e reference. Workflow: logs -> strings -> radare2 -> express.e -> vamos -> implement.

### 5. TypeScript Doors Must Be Built

Doors in `Doors/` load `dist/index.js`, not source. Run `cd Doors/{name} && npm run build` before testing, or `npm run build:watch`. `start-servers.sh` auto-builds all TypeScript doors.

### 6. Neo-Blessed Colors

Neo-blessed defaults to `tags: true`. Use blessed tags in content:

```typescript
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

const box = blessed.box({
  parent: screen,
  style: { fg: 'cyan', bg: 'black' },
  content: '{red-fg}Error{/}: message',
});
```

Full 16-color ANSI palette (standard + bright). Breaks if you use raw ANSI (`\x1b[31m`) or set `tags: false`. See `Documentation/4-Door-Developers/NEO_BLESSED_COLOR_GUIDE.md`.

### 6b. Panel / DockablePanel / box()

- `box()` / `createBox()` = `Panel` = non-interactive, non-dockable (default, correct for 95% of doors).
- `new DockablePanel()` / `createDockablePanel()` = interactive, draggable, resizable (ONLY for chat / floating tool panels).
- `new Box()` = raw blessed, no Panel defaults.

Make `createBox()` interactive: pass `{ focusable: true, keys: true, mouse: true }`. Borderless: pass `border: undefined` (Panel checks `'border' in options`, so explicit undefined removes the default border).

### 7. Modern Door UX

Default to desktop-style neo-blessed: windows, panels, menu bars, mouse, focus management. Reserve >=3 footer rows. Blue hover/active states. Full keyboard nav (tab, arrows, hotkeys). Avoid 90s text menus unless the user asks.

### 8. XIM Debugging Protocol (Mandatory for 68K Doors)

**Never debug 68K doors without XIM tools.** Primary workflow:

1. `./dev/scripts/start-servers.sh` (XIM logging auto-enabled)
2. `npm run xim:debug -- DOORNAME` (smart orchestrator with auto-analysis)
3. Run the door when prompted
4. Review the auto-generated report (issues + confidence scores + fixes + code examples)

Complete toolkit: `xim:debug` (primary), `xim:analyze`, `xim:diff`, `xim:record`, `xim:replay` / `xim:replay:real`, `xim:perf`, `xim:live` / `xim:view`, `xim:decode`, `xim:validate`, `xim:monitor`, `xim:flow`, `xim:trace`, `xim:errors`.

Do NOT: guess, start with code reading, grep logs manually, ask the user what's happening.
Do: use XIM tools first, observe actual message flow, identify the exact failure point.

Logs (check AFTER XIM analysis): `logs/door-68k-{NAME}-{TIME}.-N{NODE}.log`, `logs/backend.log`, `logs/frontend.log`. Document sessions in `Documentation/6-Progress/{NAME}_DEBUG_SESSION.md` (hypothesis -> tool -> observations -> action -> result -> next).

Full protocol: `Documentation/3-Developers/CLAUDE_68K_DEBUGGING_PROTOCOL.md`. User guide: `Documentation/4-Door-Developers/XIM_DEBUGGING_GUIDE.md`.

### 9. Door Emulation Rules

No per-door hacks or heuristics. Every change must be generic (works for every door) and backed by AmiExpress / AEDoor / AmigaOS evidence. Mirror express.e + AEDoor message flow and ABI 1:1. Reference runs (archived Amiga door logs) are validation only, not excuses for per-door branching.

### 10. Disk-Based Configuration

AmiExpress is **disk-based**, not database-driven.

- Disk: conferences (`ConfConfig.info`), message bases (`MsgBase.DB`), file areas (`Conf{N}.info` DLPATH/ULPATH), `bbsConfig.info`, `Commands/*.info`, `doors/*.info`.
- DB only: users, messages, call logs, stats.
- **Batch files** (`batch0`..`batch6`): AmigaDOS command scripts for MultiTop / Bulls / QuickNew. They are standalone binaries run at maintenance events, not doors. **Never modify or clear them.** Args come from batch files, not `.info`.

### 11. AmigaOS Is Case-Insensitive -- Use amigafs

`AquaScan.EXE` == `aquascan.exe` == `AQUASCAN.exe`. Never use `fs` directly:

```typescript
import * as amigafs from '../utils/amigafs';
amigafs.existsSync('/Doors/file');
```

22 functions available. See `Documentation/3-Developers/AMIGAFS_MIGRATION.md`.

### 12. No Emojis

Never in code, scripts, output, comments, docs. Use `[OK]`, `[ERROR]`, `[INFO]`, `*`, `X`, `!`, `-`, `+`. Reasons: terminal compat, encoding, accessibility.

### 13. Keep handoff.md Compact

Max 10KB / 100-120 lines. Current state + 1-2 recent sessions only. No analysis, code, disassembly, or traces — archive those to `Documentation/` or `thoughts/shared/handoffs/`. Check: `wc -c handoff.md` < 10000.

### 14. Fix Root Causes -- No Workarounds

If the issue is in the SDK or BBS core, fix it there — not in the door. Workarounds hide bugs, compound across 100s of doors, and break DRY.

Workflow: identify issue -> is it SDK/BBS? -> yes: fix in `sdk/` or `web/backend/`; no: fix in the door.

Acceptable workarounds: external library limits we can't control, intentional express.e quirks to preserve, documented temporary bridges (TODO + issue link).

### 15. Context Efficiency

- Plan edits before reading. Read large chunks once, not multiple small reads.
- Keep git status < 20 lines (>50 = cleanup warning, >100 = critical). Commit incremental progress.
- Keep `.gitignore` current for build artifacts (`**/src/**/*.{js,d.ts,d.ts.map,js.map}`), runtime files (`*.user`, `user.data`, `Bulletins/bull*.txt`, `batch[0-9]`), backups (`*.backup*`, `bbsConfig.info.pre-*`), node temp dirs (`Node[0-9]*/`).
- Audit untracked by extension:
  ```bash
  git status --short | grep "^??" | awk '{print $2}' | grep -o '\.[^.]*$' | sort | uniq -c | sort -rn
  ```
- 1,500 untracked files = ~60K tokens wasted per session (30% of budget).

### 16. Neo-Blessed Door Input -- DoorInputManager

TypeScript doors using neo-blessed **must** use `DoorInputManager` — manual setup causes BBS input to break after the door exits.

```typescript
import { DoorInputManager } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

this.inputManager = new DoorInputManager(session, screen, {
  enableGameMode: true,
  enableGrabKeys: true,
  enableMouse: true,
});

this.inputManager.enable();   // in run()
this.inputManager.disable();  // in quit()
```

Manages game mode, `inDoorManager` flag, `grabKeys`, mouse events, input handler setup / teardown — in the correct order, guaranteed cleanup. Test: exit the door, immediately type in the BBS, must work every time. See `Documentation/4-Door-Developers/DOOR_INPUT_MANAGER_GUIDE.md`. Example: `Doors/grandmaster/app.ts`.

### 17. Zombie Background Processes

Previous sessions that used `run_in_background: true` leave stale process references that survive summarization (~150 tokens/message each). Prevention: always run synchronously. If you inherit zombies: try `KillShell`, then `pkill -f "<pattern>"`, document in `handoff.md`. Full cleanup requires a session restart.

### 18. Avoid Reading Oversized Source Files

These files violate the 2,000-line limit and eat massive context when Read whole:

| File | Lines |
|------|-------|
| `web/backend/src/amiga-emulation/cpu/moira-source/Runner/Bartman/dasm.ts` | 2,862 |
| `web/backend/src/handlers/command.handler.ts` | 3,633 |
| `web/backend/src/amiga-emulation/api/DosLibrary.ts` | 4,353 |
| `web/backend/src/amiga-emulation/api/ExecLibrary.ts` | 3,135 |
| `web/backend/src/database.ts` | 2,318 |
| `web/backend/src/index.ts` | 2,364 |
| `web/backend/src/handlers/door.handler.ts` | 2,029 |

Use `Grep`, `Read` with `offset`/`limit`, or the Explore agent. Only read small files (<500 lines) in full. Check: `./dev/scripts/check-context-usage.sh`.

---

## Project Overview

AmiExpress-Web: TypeScript port of the Amiga AmiExpress BBS. 68K emulation via MOIRA.

- `web/backend` — Node/TS server
- `web/frontend` — React / xterm.js
- `sdk` — Door Dev Kit
- `Doors/` — all doors (68K via MOIRA + TypeScript via SDK)

Features: 68K emulation, AREXX (1905 lines, 40+ APIs), Import/Export, Telnet:2323, SSH:2222, WebSocket, QWK/REP, multi-node chat.

Status: 60–70% complete, not production, 2–3 months to ready. See `Documentation/6-Progress/CURRENT_STATUS.md`.

---

## Development

### Servers

```bash
./dev/scripts/start-servers.sh              # auto-setup, auto-build, door watcher
./dev/scripts/start-servers.sh --debug
./dev/scripts/start-servers.sh --no-watch   # disable auto-restart
./dev/scripts/kill-servers.sh
```

Unified port 3001: BBS `/`, Admin `/admin/`, SDK `/sdk/`. Protocols: Telnet 2323, SSH 2222 (needs `SSH_HOST_KEY_PATH`).

Door watcher auto-restarts the backend on door changes (Node can't hot-reload ESM). Details: `dev/scripts/DOOR_WATCHER.md`.

### Zombie Cleanup (always after a server stop)

```bash
./dev/scripts/kill-servers.sh
ps aux | grep -E "(start-servers|kill-servers|watch-doors|build-wasm|tsx .*src/index.ts)" | grep -v grep   # expect empty
ls /tmp/amiexpress-servers.lock 2>/dev/null && echo "STALE LOCKFILE" || echo "OK"
```

If stragglers remain:
```bash
pkill -f "start-servers.sh"; pkill -f "watch-doors.ts"; pkill -f "tsx.*src/index.ts"; pkill -f "build-wasm.sh"
```
Then re-verify.

### Build

```bash
# backend
cd web/backend && npm install && npm run dev && npm test && npx tsc --noEmit

# frontend
cd web/frontend && npm install && npm run dev && npm run build && npm run build:check

# sdk
cd sdk && npm install && npm run build && npm test && npm run create-door
```

`npx tsc --noEmit` required before commits. `npm run build:check` required before PRs. Test SDK + 2 TypeScript doors build before PRs.

### New Doors

Always develop directly in `Doors/`. Never in `web/backend/src/doors/` or `sdk/doors/`. For TypeScript doors, add `PRELOADER=YES` to the `.info` file for the animated load spinner. See `Documentation/4-Door-Developers/TYPESCRIPT_DOOR_GUIDE.md`.

### Testing

- All commands: `npx ts-node -P dev/scripts/tsconfig.json dev/scripts/test-all-commands.ts`
- Quick: `./dev/scripts/test-all-commands-quick.sh`
- Interactive: `dev/scripts/test-command-interactive.ts`
- Example doors: `./dev/scripts/test-example-doors.sh`
- All 68K doors: `./dev/scripts/test-all-doors.sh` — see `Documentation/3-Developers/DOOR_TESTING.md`

See `Documentation/3-Developers/TESTING.md`.

---

## Creating Doors/Games

Before writing any code, read:
1. `Documentation/4-Door-Developers/TYPESCRIPT_DOOR_GUIDE.md`
2. `sdk/README.md`

They cover door types (server / client / hybrid), game mode, input handling (raw strings vs `KeyEvent`), package.json fields, `.info` registration, hybrid externals.

Checklist:
- [ ] Door type chosen (server / client / hybrid)
- [ ] Game mode decision (games: yes; menus: no — game mode blocks `command` events)
- [ ] Input format matches door type
- [ ] `.info` file registered
- [ ] Modern neo-blessed UI (windows/panels/mouse), >=3 footer rows, blue hover/active
- [ ] Full keyboard navigation (tab, arrows, hotkeys)

Never: skip SDK docs, guess at input handling, assume game mode, skip `.info`.

---

## 68K Door Debugging

Always read the logs first:
- `logs/door-68k-{NAME}-{TIME}.-N{NODE}.log`
- `logs/backend.log`, `logs/frontend.log`
- `/tmp/bulls.out`, `/tmp/*door*.log` (door-specific)
- Full startup output from `node web/backend/dist/scripts/run-amiga-door.js ...`

If logs are missing or unwritable, fix path/permissions before debugging further.

References:
- Disassembly notes: `Documentation/4-Door-Developers/Bulls_DISASM_NOTES.md`, `AEDoor_LIBRARY_NOTES.md`; full dumps in `Docs/`.
- Door harness: `node web/backend/dist/scripts/run-amiga-door.js <door> <node>`.
- Vamos / vAmiga: `Documentation/4-Door-Developers/AMIGA_EMULATION.md`.
- NDK autodocs: `mcp__amiexpress-docs__search_ndk_autodocs`.
- Exec/DOS LVO semantics: `Documentation/4-Door-Developers/DOOR_DEVELOPMENT.md`.

**No per-door hacks.** All emulation changes generic and 1:1 with AmiExpress / AEDoor / AmigaOS.

### radare2 / vamos

```bash
# radare2 (brew install radare2)
r2 -q -c "e asm.arch=m68k; e asm.bits=32; s 0x1156; pd 20" /path/binary

# vamos (pip3 install amitools)
vamos doors/who/who
vamos --log-file=/tmp/vamos.log doors/Bulls/Bulls
```

Works in vamos or on real Amiga but fails here -> bug in our emulator, **not** the binary. Never blame MOIRA — 99.9% of bugs are in our code.

Memory sizes: FileLockStruct 20, CLIStruct 64, ProcessStruct pr_CLI @ 0xAC pr_CurrentDir @ 0x98, ExecBase ThisTask @ 0x114. See `dev/docs/amitools/amitools/vamos/libstructs/dos.py`.

---

## MCP (Source & Docs)

Use MCP tools before implementing; 94–98% token savings vs direct reads.

- `list_express_modules` — 19 logical modules
- `read_express_module` — read a whole subsystem (preferred)
- `search_express_source` — keyword with context
- `read_source_range` — specific lines (`express-e`, `hydra-e`, `acp-e`)
- `search_ndk_autodocs` — AmigaOS library specs

Typical workflow: `search_express_source "StrCmp(cmdcode,'CMD')"` -> `read_express_module "internal-commands"` -> implement exactly. For features not in express.e, prefix `WEB_*` / `MODERN_*` / `CUSTOM_*` / `ADMIN_*`.

Full guide: `Documentation/3-Developers/MCP_USAGE.md`.

---

## CLI Tools

- **info-editor** (`web/backend/src/scripts/info-editor.ts`) — edit Amiga `.info` tooltypes (list/get/set/delete/enable/disable/toggle/backup/restore). See `Documentation/2-Sysops/INFO_EDITOR.md`.
- **check-context-usage** (`./dev/scripts/check-context-usage.sh`) — flags oversized source files.
- **test-all-doors** (`./dev/scripts/test-all-doors.sh`) — automated 68K door test harness. See `Documentation/3-Developers/DOOR_TESTING.md`.

---

## Commands

Before creating a new command, search express.e via MCP. If found, implement exactly. If not, prefix `WEB_*` / `MODERN_*` / `CUSTOM_*` / `ADMIN_*`.

Priority: SYSCMD -> BBSCMD -> InternalCommand.

AREXX: full support (1905 lines, 40+ funcs). See `Documentation/4-Door-Developers/DOOR_DEVELOPMENT.md`.

---

## BBS Output Conventions

- No emojis. Use `*`, `X`, `!`, `-`, `+`, `[OK]`, `[ERROR]`.
- No bold ANSI: `\x1b[0;XXm` (not `\x1b[1;XXm`).
- Amiga ASCII only: `_/\|-`. No PC box-drawing characters.
- 80x24 max. `\r\n` line endings.

Screen flow: BBSTITLE -> LOGON -> BULL -> NODE_BULL -> confScan -> CONF_BULL -> MENU.

---

## Architecture

Backend (`web/backend/src/`): `amiga-emulation/`, `database/`, `handlers/`, `services/`, `utils/` (39+ utils — REUSE, don't duplicate).

Key utils: `AnsiUtil`, `ErrorHandler`, `PermissionsUtil`, `FileDizUtil`, `AcsUtil`, `BbsPathsUtil`, `AmigaCommandParser`.

File size limit: 2000 lines — modularize when reached.

Files:
- Docs: `Documentation/`
- Scripts: `dev/scripts/`
- Menu: `backend/Screens/MENU.TXT`
- Bulletins: `backend/data/bbs/Conf01/Bulletins/`

---

## Environment

`.env.local`:
- `JWT_SECRET` — generate with `openssl rand -base64 32`
- `DATABASE_DIR` — default `./data`
- `BACKEND_PORT` — default `3001`

DB: `./data/amiexpress.db` (auto-created).

---

## Live Site (Hetzner VPS)

- SSH: `ssh root@203.0.113.10`
- Web: http://203.0.113.10:3001
- Telnet: `telnet 203.0.113.10 2323`
- Admin: http://203.0.113.10:3001/admin

Deployment: auto via GitHub Actions on push to `main`. See `Documentation/2-Sysops/DEPLOYMENT.md`.

```bash
ssh root@203.0.113.10
cd /app/amiexpress
docker compose logs -f
docker compose logs --tail=200
docker compose restart
docker compose up -d --build
docker compose ps
```
Data: Docker volume `amiexpress-bbs-data` at `/app/data/`.

---

## Import/Export

Imports users, messages, files, and config from a real Amiga BBS. Parses binary formats (BCD, packed). Tests: `dev/scripts/test-import-execution.ts`, `dev/scripts/test-user-parsing.ts`. See `Documentation/1-Users/IMPORT_USER_GUIDE.md`.

---

## TypeScript

`cd web/backend && npx tsc --noEmit` before commits. Emergency override: `SKIP_TS_CHECK=1 git commit`.

**Fix all TS errors when encountered** — even pre-existing ones from other sessions. Zero tolerance; errors cascade and block CI.

---

## No Stubs

Never stub implementations that silently break features. Fix completely or don't.

---

## Git

Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`. Examples: `feat(sdk): add neo-blessed`, `fix(backend): door state bug`.

---

## Safety

Historical preservation of BBS culture and retro Amiga 68K. Educational, defensive security only, open source. Not malware or hacking. Term mapping: "illegal instruction" = CPU; "injection prevention" = defensive; "war/nuke" = vintage games. See `PROJECT_SAFETY.md`.

---

## Documentation Index

- `Documentation/README.md` — start here
- `Documentation/1-Users/USER_GUIDE.md`, `Documentation/1-Users/IMPORT_USER_GUIDE.md`
- `Documentation/2-Sysops/DEPLOYMENT.md`, `Documentation/2-Sysops/INFO_EDITOR.md`
- `Documentation/3-Developers/ARCHITECTURE.md`, `TESTING.md`, `DATABASE.md`
- `Documentation/3-Developers/MCP_USAGE.md`, `DOOR_TESTING.md`, `CLAUDE_68K_DEBUGGING_PROTOCOL.md`, `AMIGAFS_MIGRATION.md`
- `Documentation/4-Door-Developers/DOOR_DEVELOPMENT.md`, `TYPESCRIPT_DOOR_GUIDE.md`, `XIM_DEBUGGING_GUIDE.md`, `NEO_BLESSED_COLOR_GUIDE.md`, `DOOR_INPUT_MANAGER_GUIDE.md`, `AMIGA_EMULATION.md`
- `Documentation/6-Progress/CURRENT_STATUS.md`

Log timestamps are in UTC / server time. Verify "today" or "recent" by file mtime (`ls -la`), not calendar date.
