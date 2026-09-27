# Project rules — amiexpress-web

Single source of truth for project rules. `CLAUDE.md` (Claude Code sessions), `.github/copilot-instructions.md` (if added in future), and any other agent files at the project root all point here. Tool-specific files cover only tool-specific bits.

**READ ENTIRE FILE BEFORE ANY ACTION.**

You are "Amiga Guru" — Commodore Amiga specialist (hardware, software, emulation, C/ASM, Exec, Intuition, DOS, devices). Concise, practical, source-backed (RKRM, HRM, official docs). Stay on-topic to Amiga / emulation unless modern tech is directly relevant.

**Global rules:** `~/.claude/CLAUDE.md` defines house defaults — precedence (project overrides global), root-cause fixes, no cheap alternatives, regression-test-per-bug, git safety, no emojis, single source of truth, `thoughts/` directory, dual handoff formats, MCP-preferred debugging, full English UI labels, `## Commands` section. Anything in *this* file overrides the global where there's a conflict (e.g. BBS output uses ASCII tokens, not SVG icons; `handoff.md` at project root is REQUIRED, capped 10 KB).

## Commands

### Where to test

Handing work back for a human test names ONE of these, with the exact page or
door, and says which it is (global rule: "Ask for the test, and say WHERE").

| Target | URL | Notes |
|--------|-----|-------|
| LIVE board | https://bbs.uprough.net | What the sysop tests on. Verify the deploy actually landed (container age / bundle hash), not just a green workflow |
| LIVE admin | https://bbs.uprough.net/admin | |
| LIVE telnet | `telnet bbs.uprough.net 64128` | The C64/PETSCII path; `P` at the graphics prompt for a 40-column session |
| Scripted login | `python3 dev/scripts/bbs-telnet.py --cmd "J 2" --log <scratch>/bbs.log --watch` | Logs in as sysop/sysop (LIVE by default, `--host localhost` for local), answers every prompt, runs each `--cmd`, logs off. `--watch` opens a Terminal tab so the sysop sees the session - always pass it |
| LOCAL board | http://localhost:3001 | `./dev/scripts/start-servers.sh --bbs-only`; the frontend is a BUILT bundle, so rebuild `packages/terminal` + `web/frontend` first |
| LOCAL admin | http://localhost:3001/admin/ | |
| LOCAL SDK | http://localhost:3001/sdk/ | |
| LOCAL telnet | `telnet localhost 64128` | Same port as live: `TELNET_PORT` defaults to 64128 (`web/backend/src/index.ts:1061`). The 2323 in `TelnetServer`'s constructor is a default nothing passes. SSH 2222 needs `SSH_HOST_KEY_PATH` |

Phone testing is LIVE only — the sysop cannot reach localhost from a phone.

| Action | Command |
|--------|---------|
| Start dev (BBS + admin + SDK) | `./dev/scripts/start-servers.sh` |
| Start dev with debug logging | `./dev/scripts/start-servers.sh --debug` |
| Start without watcher | `./dev/scripts/start-servers.sh --no-watch` |
| Stop everything | `./dev/scripts/kill-servers.sh` |
| Zombie verification (after stop) | `ps aux \| grep -E "(start-servers\|kill-servers\|watch-doors\|build-wasm\|tsx .*src/index.ts)" \| grep -v grep` (expect empty) |
| Build backend | `cd web/backend && npm run build` |
| Backend dev | `cd web/backend && npm run dev` |
| Type-check backend | `cd web/backend && npx tsc --noEmit` |
| Test backend | `cd web/backend && npm test` |
| Build frontend | `cd web/frontend && npm run build` |
| Frontend build-check | `cd web/frontend && npm run build:check` |
| Build SDK | `cd sdk && npm run build` |
| Build a TS door | `cd Doors/{name} && npm run build` |
| Test all commands | `npx ts-node -P dev/scripts/tsconfig.json dev/scripts/test-all-commands.ts` |
| Test all 68K doors | `./dev/scripts/test-all-doors.sh` |
| 68K debug (smart) | `npm run xim:debug -- DOORNAME` |
| Check context usage | `./dev/scripts/check-context-usage.sh` |
| Pull live board content to localhost | `./dev/scripts/pull-live-content.sh` (dry run), `--apply` to pull |

Type-check + tests + zero lint warnings required before commits. `tsc --noEmit` is the canonical type-check.

---

## Project-specific top-level principles

(Global rules in `~/.claude/CLAUDE.md` cover root-cause fixes, no cheap alternatives, no guessing, regression tests, git safety, no emojis, full English UI labels, `## Commands` section. The principles below are *additional* and project-specific.)

- **Work doggedly.** Continue toward the user's goal until you can no longer make progress. When stopping, be ready to justify why.
- **Terminal caution for long-running procs.** Web server / BBS / emulator processes — launch via the project's lifecycle scripts (`./dev/scripts/start-servers.sh`), never inline; always `kill-servers.sh` to clean lockfiles.
- **Update `handoff.md`.** Keep it current with a brief summary + user's last prompts. Max 10 KB / 100–120 lines (see per-project handoff format).
- **Read the backend log first** when debugging anything BBS-side: `logs/backend.log`.
- **No guessing on BBS behavior.** Match AmiExpress exactly; every change backed by `express.e` / disassembly / official docs. Stronger than the global "no guessing" — see Rule 1 below.

### Session cost — read output, do not inhale it

A long session is re-sent with every turn, so the expensive thing is not the
work: it is everything the session is still holding while it works. Measured
2026-09-16 on this project: 97% of a day's spend at >150k context, 89% from
sessions running 8+ hours, 54% with four or more sessions in one tree.

1. **Large output goes to a file, then gets grepped.** The scratchpad path is
   in the environment; use it. `npm test > "$SP/t.log" 2>&1` then
   `grep -nE '^(FAIL|Tests:)' "$SP/t.log"`. `docker logs` ALWAYS through a
   grep with a pattern. To read code, `sed -n 'A,Bp'` or `grep -A/-B` - never
   `cat` a 1000-line file to see one function, and never read a subagent's
   transcript file.
2. **`head` is for reading, never for evidence.** Counting proves absence;
   capping invents it (`grep -c`, not `grep | head`).
3. **Clear or compact at TASK boundaries.** Every landed commit here is one.
   `handoff.md` and `thoughts/BOARD.md` exist so a fresh session can pick the
   thread up - use them instead of carrying four tasks in one context.
4. **Two parallel sessions in this tree, not four.** They share one limit, and
   collisions cost tokens to find: one session's commit swept up another's 41
   staged files on 2026-09-16, and `docker-entrypoint.sh` was being edited by
   two at once the same night.
5. **Search subagents run on a cheap model** (Sonnet/Haiku for "where does X
   live"); Opus is for subagents that ANALYSE. One agent with a list beats
   three on the same files.
6. **Poll a deploy once with a long wait**, not every 30 seconds: every poll
   that finishes wakes the session with its whole context attached. Verify by
   `/health` revision (`pgrep` lies - it matches day-old waiter processes).

### Server Lifecycle

Use `./dev/scripts/start-servers.sh` and `./dev/scripts/kill-servers.sh`. Rules:
1. Always use `kill-servers.sh` (never Ctrl+C, never `pkill` individual procs — lockfiles must be cleaned up).
2. After any kill, run the zombie verification (see "Zombie Cleanup" below) and confirm output is empty.
3. **`run_in_background: true` is allowed** for `start-servers.sh` so you can keep working while the BBS runs — but you MUST call `kill-servers.sh` and run the zombie verification before ending the task. Never leave background servers behind. Never background anything else (one-shots stay foreground).
4. If you inherit zombies, clean up first and document in `handoff.md`.
5. Never skip `kill-servers.sh` before ending a task that started a server.

### Stuck-Door Sweep (start of every debug-MCP session)

Before using the debug MCP, call `GET /debug/api/sessions` and check `activeDoors[]`. Any entry with `ageMs` > ~60s that you didn't launch is almost certainly a stuck 68K door. Kill with `POST /debug/api/sessions/<nodeId>/kill-door`. 68K doors get stuck often (blocked on input, library calls, etc.) and stale DebugRegistry entries hide real state.

---

## Critical Rules

### 0. Amiga Is Big-Endian — All Binary Files Use BE

The Motorola 68000 is a **big-endian** CPU. Every multi-byte integer in every Amiga-native binary file is stored MSB-first. This is not optional — it is architecture.

**Rule: Any code that reads or writes an Amiga binary file MUST use BE buffer methods.**

```typescript
// CORRECT — Amiga binary
buf.readInt32BE(offset)   buf.writeInt32BE(value, offset)
buf.readInt16BE(offset)   buf.writeInt16BE(value, offset)
buf.readUInt32BE(offset)  buf.writeUInt32BE(value, offset)
buf.readUInt16BE(offset)  buf.writeUInt16BE(value, offset)

// WRONG — never for Amiga binary formats
buf.readInt32LE(...)   buf.writeInt32LE(...)   // corrupts all numeric fields
buf.readInt16LE(...)   buf.writeInt16LE(...)
```

**Amiga binary formats in this project (all must use BE):**
- `MailStats` — message base stats (highMsgNum, lowestNotDel, lowestKey)
- `HeaderFile` — per-message headers (msgNumb, msgDate, recv, extMsgNum)
- `Conf.DB` — conference config (confRead, confYM, newSinceDate, all LONGs/INTs)
- `User.data` / `User.keys` / `User.misc` — user account binary archives
- Per-conference `Conf{N}/Conf.DB` — per-user message pointers
- Any `DateStamp` struct (ds_Days, ds_Minute, ds_Tick — 3 × LONG)

**Formats that are correctly LE (PC standards — do NOT change):**
- QWK/REP packets — PC/DOS standard, always LE
- LZH archives — PC standard, LE
- SAUCE metadata — PC standard, LE

**Date/time:** Amiga `DateStamp` is 3 × BE LONG: days since 1978-01-01 UTC, minutes past midnight UTC, ticks (1/50s). Use `dateTimeToDateStamp()` from `date-time.util.ts` — never roll your own with local-time `getHours()`/`getMinutes()`.

**History:** Systematic LE/BE confusion caused: conf_base message pointers stored as 201326592 instead of 12; AquaScan showing 00:00:00; all file areas reporting "new" every login. Fixed 2026-04-27. If you see suspiciously large values (> 65536) in message pointer fields, suspect byte-swap.

---

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

Project-specific evidence chain (the global "no guessing" rule applies; this section spells out the *sources of evidence* for this codebase): `radare2` (disassemble), `strings` (extract text), `vamos` (reference run), `express.e` (implementation), MCP (NDK autodocs). Evidence = memory offset + structure definition + behavior confirmation + express.e reference. Workflow: logs → strings → radare2 → express.e → vamos → implement.

### 5. TypeScript Doors Must Be Built — dist/ Is What Runs

Doors in `Doors/` load `dist/index.js`, **not the TypeScript source**. Editing `.ts` files has **zero effect** until `npm run build` is run and the resulting `dist/` files are committed.

**Every change to a TypeScript door requires:**
1. `cd Doors/{name} && npm run build` — rebuild dist/
2. `git add Doors/{name}/dist/` — stage the compiled output
3. Commit both the `.ts` source and the `dist/` together

**Enforcement:**
- **Pre-commit hook** — auto-runs `npm run build` and stages `dist/` whenever `.ts` files in a door directory are staged. Build failure blocks the commit.
- **Dockerfile doors-builder stage** — always rebuilds `dist/` from source during CI/CD, so stale committed dist cannot reach production even if the hook was bypassed.

Never commit `.ts` changes to a door without the matching `dist/` rebuild. The server runs the compiled JS — source-only commits are invisible at runtime. Burned by this 2026-06-03 (entire session of fixes unreachable because dist/ was never rebuilt).

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

### 9b. Narrow Door Art

A door that keeps its logo INSIDE its own config file - an Empire
`artSections` entry in `door.settings.json`: Bulls' `[Title]`, joincnf's
conference banner - can have a 40-column drawing per alphabet:

    Screens/doors/<COMMAND>/<section>.c64.ans    a 40-column PETSCII caller
    Screens/doors/<COMMAND>/<section>.ttx.ans    a teletext caller

Drawn in the ANSI Studio (door settings -> the art card -> the Wide / C64 /
Teletext switch), stored as latin1 ANSI, capped at 40 columns on save. The
Empire narrow shadow (`api/file-shadow.ts`) splices the matching one into
the copy the door is served, so the DOOR prints it and the C64 frame adapter
never has to fold art - which it cannot: an 80-column logo has no seams, and
cropping one gives half a drawing.

No drawing for this caller's alphabet: he reads the door's own wide art,
cropped at 40, exactly as before. The drawings live under `Screens/` and not
beside the door because they are the BOARD'S - they survive a door
re-install.

Door art is on the ARTIST lane: `/api/door-art`, mounted at
`requireLevel(100)` beside `/api/screens`, because level 100 IS this board's
ANSI artists and they are the people who draw. Every call is scoped to the
sections a door's manifest DECLARES as art - no setting, bulletin row or
conference mask is reachable through it.

Art the door keeps inside its BINARY cannot be reached this way. Art a door
opens as a file of its own already has the `_C64` redirect
(`io-file-display.ts` for `JH_SF`, `DosLibrary.ts` for `dos Open`).

### 10. Disk-Based Configuration

AmiExpress is **disk-based**, not database-driven.

- Disk: conferences (`ConfConfig.info`), message bases (`MsgBase.DB`), file areas (`Conf{N}.info` DLPATH/ULPATH), `bbsConfig.info`, `Commands/*.info`, `doors/*.info`.
- DB only: users, messages, call logs, stats.
- **Batch files** (`batch0`..`batch6`): AmigaDOS command scripts for MultiTop / Bulls / QuickNew. They are standalone binaries run at maintenance events, not doors. **Never modify or clear them.** Args come from batch files, not `.info`.

### 10b. Commands Installed At Runtime Must Not Need A Restart

`express.e:4630-4647` resolves a BBS command from disk on **every**
invocation, so on a real node a `<CMD>.info` dropped into `Commands/BBSCmd`
is live on the next keypress. This server loads them once at startup, which
is faster but is a behaviour difference, not just an optimisation — anything
that installs a door while the BBS runs (DOORMAN, the DoorRepo C door, a
sysop with an FTP client) would otherwise be invisible until a restart.

Two mechanisms keep it honest; keep both working if you touch command
loading:

- `revalidateBbsCommandsIfChanged()` (`command-execution.handler.ts`) runs
  **before every BBSCMD lookup** and reloads only when the command
  directories' mtime has changed. It must run before the lookup, not only on
  a miss: an existing command is a cache HIT, so a miss-only check picks up a
  door being ADDED but never one being CHANGED — an edited `LOCATION`, `TYPE`
  or a tightened `ACCESS` would keep serving startup's values. Equally, do
  **not** "simplify" it into an unconditional rescan: that would parse every
  `.info` on nearly every command. The mtime guard is what makes running it
  every time cheap.
- `bbscmd-watcher.ts` watches those directories and clears the freshness
  stamp, so the listing paths (door menus, DOORMAN) see the change too. It is
  best-effort by design; `fs.watch` is unreliable on some filesystems and
  nothing may depend on it firing.

Covered by `tests/handlers/bbscmd-freshness.test.ts`.

### 11. AmigaOS Is Case-Insensitive -- Use amigafs

`AquaScan.EXE` == `aquascan.exe` == `AQUASCAN.exe`. Never use `fs` directly:

```typescript
import * as amigafs from '../utils/amigafs';
amigafs.existsSync('/Doors/file');
```

22 functions available. See `Documentation/3-Developers/AMIGAFS_MIGRATION.md`.

### 12. No Emojis — terminal / log / BBS output

Global rule: no emojis anywhere. BBS terminal output specifically uses ASCII tokens — `[OK]`, `[ERROR]`, `[INFO]`, `*`, `X`, `!`, `-`, `+` — because the terminal can't render SVG icons. See BBS Output Conventions below for the full output spec (no bold ANSI, Amiga ASCII only, 80×24, `\r\n` line endings).

### 13. Keep handoff.md Compact

Max 10KB / 100-120 lines. Current state + 1-2 recent sessions only. No analysis, code, disassembly, or traces — archive those to `Documentation/` or `thoughts/shared/handoffs/`. Check: `wc -c handoff.md` < 10000.

### 13a. Plans Index — one source, generated, self-checking

Plans in `thoughts/shared/plans/` kept drifting out of sync because status lived
in the plan but the work landed in a commit elsewhere. Rules:

- **Status lives in the plan's frontmatter — nowhere else.** Fields:
  `status: implemented | partial | not-started | superseded` (`partial` =
  started, work remains — parked, not a claim of active work), plus
  `landed: <sha/PR>` (REQUIRED once `implemented`) and optional
  `verify: <extended-regex>` (a pattern that must exist in the tracked tree
  once the plan is done — a cheap presence proof).
- **`thoughts/shared/plans/INDEX.md` is GENERATED — never hand-edit it.**
  Regenerate: `npx ts-node -P dev/scripts/tsconfig.json dev/scripts/plan-index.ts`.
- **Landing a plan flips its frontmatter in the SAME change** that lands the
  work: set `status: implemented` + `landed:`, then regenerate INDEX.md.
- **Drift is caught, not trusted:** `plan-index.ts --check` exits non-zero when
  a plan claims `implemented` without `landed`/with its `verify` pattern absent,
  when a not-implemented plan's `verify` pattern IS present, or when INDEX.md is
  stale. Run it before pushing plan/status changes.
- **A plan is only safe on `origin/main`.** Before ending a session or removing
  a worktree, run `plan-index.ts --stranded` - it exits non-zero if any worktree
  holds a plan that is not on origin. Two plans were nearly lost this way.
- **How-to, contract, and new-plan template: `thoughts/shared/plans/README.md`.**
  Plans live only in `thoughts/shared/plans/` — a plan found anywhere else gets
  `git mv`'d in. Status is updated in the SAME change that lands the work.

### 14. Fix Root Causes — in the right layer

Global rule applies: fix the root cause, never a workaround. Project-specific layering: if the issue is in the SDK or BBS core, fix it *there* — not in the door. Workarounds hide bugs, compound across 100s of doors, and break DRY. Workflow: identify issue → is it SDK / BBS? → yes: fix in `sdk/` or `web/backend/`; no: fix in the door.

Acceptable workarounds: external library limits we can't control, intentional `express.e` quirks to preserve, documented temporary bridges (TODO + issue link).

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

Use only the lifecycle scripts (`./dev/scripts/start-servers.sh` / `kill-servers.sh`) — see the `## Commands` table at the top of this file for the full list. Unified port 3001: BBS `/`, Admin `/admin/`, SDK `/sdk/`. Protocols: Telnet 2323, SSH 2222 (needs `SSH_HOST_KEY_PATH`). Door watcher auto-restarts the backend on door changes — details in `dev/scripts/DOOR_WATCHER.md`.

### New Doors

Always develop directly in `Doors/`. Never in `web/backend/src/doors/` or `sdk/doors/`. For TypeScript doors, add `PRELOADER=YES` to the `.info` file for the animated load spinner. See `Documentation/4-Door-Developers/TYPESCRIPT_DOOR_GUIDE.md`.

### Testing

Build commands and test commands are in the `## Commands` table at the top. Test scripts:

- All commands: `npx ts-node -P dev/scripts/tsconfig.json dev/scripts/test-all-commands.ts`
- Quick: `./dev/scripts/test-all-commands-quick.sh`
- Interactive: `dev/scripts/test-command-interactive.ts`
- Example doors: `./dev/scripts/test-example-doors.sh`
- All 68K doors: `./dev/scripts/test-all-doors.sh` — see `Documentation/3-Developers/DOOR_TESTING.md`

Full testing protocol: `Documentation/3-Developers/TESTING.md`.

#### When to run what — measured 2026-09-18

The admin suite is 207 files / ~1,265 tests and takes **4m45s**. A single
targeted suite takes **5-15s**. The pre-push gate takes **~40s**.

- **While iterating:** run the suites you touched, by path. Nothing else.
- **Before a deploy:** one full sweep. Not before every commit - that is where
  a day goes.
- **The gate stays.** Forty seconds to stop an unbuildable `main` is cheap, and
  it earns it: there is no CI on this repo.

`vitest --changed` does NOT help for a change in a shared component - touching
`ScreenEditor` selects nearly every suite anyway. Don't reach for it and
assume you saved time; check what it selected.

Two red herrings that waste minutes each time:

- **A big parallel run invents failures.** Six red in a sweep, six green alone.
  Re-run a suspect in isolation before believing it, and never run two vitest
  processes at once - they time each other out.
- **A green suite against a stale bundle proves nothing.** `web/config-app` is
  served to localhost as a BUILT bundle: rebuild it (`npm run build`) before
  judging any admin behaviour by hand, and check which asset the page actually
  links to. On 2026-09-18 the sysop tested an admin two days old and reported
  the editor as broken; the backend was current the whole time.

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
- [ ] Repaints only what changed, and the cost is MEASURED at 80 and 40 (see
      "Doors draw smart" below). The sysop has had to ask for this on door
      after door - it is a build step, not a review note.

Never: skip SDK docs, guess at input handling, assume game mode, skip `.info`,
ship a door whose repaint cost you have not measured.

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

## Creating New BBS Commands

(Different from the `## Commands` table at the top of this file, which is shell commands. This section is about authoring new BBS commands inside the codebase.)

Before creating a new command, search `express.e` via MCP. If found, implement exactly. If not, prefix `WEB_*` / `MODERN_*` / `CUSTOM_*` / `ADMIN_*`.

Priority: SYSCMD → BBSCMD → InternalCommand.

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

- SSH: `ssh root@bbs.uprough.net` (key-based, no password prompt)
- Web: https://bbs.uprough.net
- Telnet: `telnet bbs.uprough.net 64128`
- SSH (BBS, not host): `ssh -p 31337 <user>@bbs.uprough.net`
- Admin: https://bbs.uprough.net/admin

Deployment: auto via GitHub Actions on push to `main`. See `Documentation/2-Sysops/DEPLOYMENT.md`.

**Standing authorization for Claude on the live host:** Claude is preauthorized
to SSH into `bbs.uprough.net` and run inspection/diagnostic/repair operations
without pausing to ask each time. The user has explicitly delegated live-site
ops to Claude because typing `ssh` and `docker` chains by hand is friction.

Specifically preauthorized (no per-call confirmation needed):

- `ssh root@bbs.uprough.net <cmd>` for any read-only inspection
  (`docker logs`, `docker exec ... ls/cat/md5sum/sqlite3 SELECT`, `git status`).
- `docker compose restart bbs` to reload the BBS process after a
  config/file fix.
- `docker compose up -d --build --force-recreate` when picking up image
  changes that the auto-deploy workflow already covers.
- `docker exec amiexpress-bbs cp /app/default-data/<path> /app/data/bbs/<path>`
  to repair specific stale volume files Claude has identified as
  divergent from the image. Always re-chown to `bbsuser:bbsuser` after
  copying.

Still require explicit per-action approval:

- Anything destructive against persistent state: `rm -rf` on `/app/data`,
  dropping or truncating SQLite tables, deleting the named volume.
- Schema migrations or DB writes that aren't read-only `SELECT`.
- `docker compose down -v` (would wipe the named volume).
- Rotating SSH keys, changing firewall rules, editing systemd units.

Operational primer:

```bash
ssh root@bbs.uprough.net
cd /app/amiexpress
docker compose logs -f
docker compose logs --tail=200
docker compose restart bbs
docker compose up -d --build --force-recreate
docker compose ps
```

Data: Docker named volume `bbs-data` mounted at `/app/data/`.
Container name: `amiexpress-bbs`. Image default-data lives at
`/app/default-data/` (read-only template inside the image).

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

### Claim a plan's items before you work them, in a commit

Several sessions share this checkout, and `thoughts/BOARD.md` IS NOT A LOCK -
it is gitignored, so a worktree or a fresh clone cannot see it at all.

Every plan with an execution ledger carries a `## Claims` table. Before
writing any code:

0. **`git fetch origin main` and re-read the ledger AT THE MOMENT you start,
   and again before you land.** This step is the one that matters and it was
   added because the rest was not enough: on 2026-09-08 P2-12 and P2-20 were
   claimed here at 11:44Z and another session landed both anyway. A pushed row
   does not stop anyone; reading first does. If the item is already ticked,
   drop it and pick another - do not produce a duplicate.
1. Add a row naming the IDs you will do and yourself.
2. **Commit and push that row first.** An uncommitted claim is not a claim.
3. Tick the items and delete your row when the work lands.
4. A row older than a day with nothing landed is stale - take it and say so.

This is ADVISORY, not a lock. Nothing enforces it, and with five sessions on
one checkout the window between reading and pushing is real. Treat a claim as
"someone probably has this", not as a guarantee - and expect to throw work
away occasionally, which is cheaper than two people landing the same feature
two different ways.

One owner per ID; if two rows name the same ID, whoever pushed first holds it.

READ THE LEDGER'S TICKS, NOT JUST THE PLAN. On 2026-09-08 a lane was picked
for delegation to three agents that was already 24 of 42 complete - the plan
listed the work, the ledger recorded it done, and only the ledger was right.

### The shared checkout tracks origin/main. Always.

`~/Code/amiexpress-web` is what localhost runs and what several
sessions read. It is a MIRROR of `origin/main`, never a place work
accumulates.

On 2026-09-08 it was found 143 commits ahead and 157 behind: every session
had been committing to the local `main` and then landing the same work from
a worktree of `origin/main`, so the shared tree drifted for days. Localhost
ran days-old code while live ran current, tests failed for reasons that were
in nobody's diff, and about a hundred commits looked unlanded when they were
the same work under different hashes. A stale checkout is also one careless
`git checkout .` from real loss.

The rules that keep it a mirror:

1. **Never commit to `main` in the shared checkout.** Work is committed in
   your own worktree, cut from `origin/main`, and pushed from there.
2. **Fast-forward the shared checkout after every push**, yours or anyone's:
   `git -C ~/Code/amiexpress-web fetch origin && git -C ... merge --ff-only origin/main`.
   If it refuses, the tree has drifted - fix that before anything else.
3. **Before you start a task, check the drift** and say so on
   `thoughts/BOARD.md` if it is not zero:
   `git rev-list --count origin/main..HEAD` (behind) and `HEAD..origin/main`
   (ahead - must be 0).
4. **Never `git reset --hard` the shared checkout to fix drift without
   parking what is in it first**: commit the dirty tree to a `wip/…` branch
   (or a backup ref) and say where it is on the BOARD. Two other sessions may
   have uncommitted work in that tree.
5. **A deploy is not done until localhost matches.** After the deploy lands,
   fast-forward the shared checkout, rebuild what the change touches (sdk,
   packages/terminal, web/frontend, web/config-app) and restart the dev stack.
   `curl -s https://bbs.uprough.net/health` names the live revision;
   `git rev-parse HEAD` must be the same commit.

### Worktrees are landed and removed in the task that made them

A worktree exists to land one change. When its commits are on `origin/main`,
remove it in the same task - `git worktree list` should hold the shared
checkout and nothing older than the work in flight. A worktree left behind
holds a stale copy of the board's data directories and is another place a
door or a test can write to by accident.

### Never run a second board against the live volume

`docker run -v amiexpress-bbs-data:/app/data amiexpress-bbs …` starts a
board with the LIVE database and the live `Doors/` tree. Six of those were
found still running on 2026-09-08, three days after a smoke test: one of
them accepted a caller's operator page with three-day-old code, wrote the
chat rows, and left the real board's caller stuck at the paging dots. Test
against a copy of the volume or against localhost - never the live one - and
tear the container down in the task that started it (`docker ps --filter
volume=amiexpress-bbs-data` must show only `amiexpress-bbs`).

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

- **Three screens per door** - a new or changed TypeScript door is designed and proven for fixed Amiga ANSI 80x25, responsive Amiga ANSI, and C64 PETSCII 40x25: `.claude/skills/door-three-screens/SKILL.md`.


## Doors draw smart

A door repaints what changed, never the screen. This is a hard rule for
68K doors and a strong one for TypeScript doors.

Why: on a 68K door every 198 bytes is one XIM message costing ~45ms of
emulation. A full repaint of a seven-row list is ~1,900 bytes - ten
messages, half a second - and THEMEC did that on every keypress until
2026-09-07 ("its slow"). Repainting the two rows the cursor touched is
~150 bytes. The same rule keeps a 2400-baud caller usable.

How:
- First frame, and after anything that changes many rows (theme change,
  resize, a saved mark moving): full draw.
- On a keypress: repaint only the cells that changed. In the C SDK,
  `ui_list_draw_changed()` does this for a list; a door with its own
  widgets keeps `drawn_*` state the same way.
- Animation ticks touch ONE row (the masthead), never the frame.
- Never `ansi_clear()` / `screen.clearRegion()` between keypresses.
- Measure it, do not guess:
  `npx tsx --tsconfig web/backend/tsconfig.json dev/scripts/door-probe/repaint-cost.ts <binary> --cols 80`
  (also `--cols 40`; `make probe` in sdk/c runs both on the proof door).
  It drives the binary through the board's emulator and prints, per key,
  the bytes net of animation and the XIM message count. THEMEC on
  2026-09-07: ~210 bytes, 2 messages, first byte in 100-250 ms. More than
  a few hundred bytes for a cursor move means the door is not drawing smart.

## The board is not a fixture

A test may READ the board's own files. It may not PIN a value derived from
them.

Why: the board is live data. A sysop edits a menu, a door writes `Node42/`,
`bbsConfig.info` gets rewritten through the admin, a screen gains a row - and
a suite that pinned a byte count, a hash, a row count or a directory listing
goes red while nothing is broken. Eight of the twelve red backend suites on
2026-09-07 were this, and the sharpest was `screen-wipe-delta-pin`: its own
header said "a changed hash IS the regression" while its input was a file
anyone could edit.

The distinction, both from the same directory:

- `screen-wipe-fidelity.test.ts` reads the real screens and asserts
  INVARIANTS - nothing is lost, the cursor ends where the plain render ends,
  the last frame's delay is 0, the first frame clears. Editing the art cannot
  break it, and reading real art is what makes it worth running.
- `screen-wipe-delta-pin.test.ts` needs exact bytes, so its input is FROZEN:
  the three screens are copied into `tests/fixtures/board-screens/` and read
  from there. The differ is then the only thing that can move a hash.

So:
- Asserting a property of live board data: fine, and often better than a
  fixture.
- Asserting an exact value from live board data: copy the input into
  `web/backend/tests/fixtures/` and read it from there.
- Enumerating what is on disk (nodes, conferences, doors): ask git what the
  board SHIPS - `git ls-files` - not the filesystem, which also holds whatever
  a door or a test run left behind.

Name fixtures for their content, not their source path: `Screens/MENU.TXT` and
`Conf1/Menu.txt` are one filename on a case-folding disk, and copying both
into one directory silently leaves you with two of the three files identical.

## A test may not leave a timer running

A module-level `setInterval` keeps jest alive, and `jest.resetModules()`
collects one per test. Unref it: a heartbeat, a cleanup sweep or a timeout
checker reports on a running process, it is not a reason for one to run. The
server is what holds the process open in production, so nothing about its
behaviour changes.

Requiring a handler can boot the whole board: `message-scan.handler` ->
`command.handler` -> `index.ts` -> HTTP, telnet, SSH and FTP listeners. A
suite that wants the handlers and not the ports sets `SKIP_SERVER_START=1`
before its first require.

Both cost more than they look: the full backend suite could not finish, every
run needed `--forceExit`, and 86 failing tests accumulated unseen because the
run that would have shown them was killed at 25 minutes.

### The shared tree tracks origin/main (2026-09-08)

`main` in this working tree must equal `origin/main`. Land work by
cherry-picking your own commits onto a worktree of `origin/main` and pushing
from there — **never** by committing to this tree's `main`.

It drifted to 158 commits behind `origin/main` and 143 ahead, and 91 of the
100 commits `git cherry` called unique were already upstream under other
hashes. Localhost was therefore serving code older than live, and a test on
it proved nothing: a telnet logoff fix was tested against a board 90 commits
older than the fix.

**Before any local test, print three shas and compare them:**

```
git -C <tree> rev-parse --short HEAD          # the checkout
git rev-parse --short origin/main             # what live will be
curl -s localhost:<port>/health | jq -r .revision   # what is RUNNING
```

A dev stack keeps running the code it was **started** with: updating the tree
under it changes nothing until it restarts, and a restart drops every
connected caller — announce it on `thoughts/BOARD.md` first.

Realigning a drifted shared tree: `git branch backup-<date>-shared-main`,
commit every session's uncommitted work to `wip/shared-tree-<date>`, and only
then `git reset --hard origin/main`. Never reset over someone else's
uncommitted edits.

### Localhost is never behind live (2026-09-08)

The rule above says the shared tree tracks `origin/main`. This says what to do
about it, because the drift is not noticed by looking at code - it is noticed
by a sysop saying "the localhost admin ui seems very behind the live site",
after testing against it for a day.

**Three shas, and they must agree before any local test is worth anything:**

```
git rev-parse --short HEAD                            # this checkout
git rev-parse --short origin/main                     # what live builds from
curl -s https://bbs.uprough.net/health | jq -r .revision   # what live RUNS
```

Two more that catch the rest of it:

- **The admin at :3001 serves a BUILT bundle**, not the source. A pull changes
  nothing a browser sees until `npm --prefix web/config-app run build`. Check
  `ls -la web/config-app/dist/assets/index-*.js` against the time of your last
  edit: on 2026-09-08 it was seven hours stale while its author read the page.
- **A dev backend keeps running the code it was STARTED with.** Updating the
  tree under it changes nothing until it restarts.

Whoever finds the drift fixes it in the same task, and pushes before they
report - a fix that lives only in a worktree is a fix nobody has.

### A worktree is a second checkout, and it lies about its dependencies (2026-09-08)

Landing by cherry-pick puts work in `scratchpad/<name>` worktrees. Two costs,
both paid on 2026-09-08:

- **Disk**: seven of them, ~560 MB each, 4.2 GB. Remove yours in the task that
  created it - `git worktree remove` the moment your push lands - and run
  `git worktree prune` when a scratchpad directory has been cleaned up under
  git's feet.
- **Dependencies**: a worktree resolves `@amiexpress/terminal` and the SDK
  through whatever node_modules it was shimmed with. After a rebase that
  crosses a package change, its type-check fails on modules that exist -
  `Cannot find module '@amiexpress/terminal'` - and the failure is the
  worktree, not the code. Re-verify in the shared checkout after pulling
  before you believe either answer, and never report a worktree's red as the
  branch's red.
