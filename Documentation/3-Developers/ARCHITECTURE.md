# Architecture Overview (Summary)
**Comprehensive architecture notes, audits, and modularization plans now reside in `archive/` (see `DIRECTORY_STRUCTURE_ANALYSIS.md`, `SECURITY_FIXES.md`, `MODULARIZATION_REPORT.md`).**

## 1. Technology Stack
- **Frontend**: React 18 + TypeScript, two renderers. **xterm.js** renders ANSI screens (fonts `Topaz`/`mOsOul`) and also the legacy PETSCII-as-Unicode path (PUA glyphs from `PetMe64`, `packages/terminal/src/components/BBSTerminal.tsx`) for `petscii-output` text delivered to a session that is still on the ANSI surface. **PetsciiCanvas** (`packages/terminal/src/petscii/PetsciiCanvas.tsx`) is THE surface for a PETSCII session (web `P` answer): `BBSTerminal.tsx` hides xterm and routes every `ansi-output`/`petscii-output` string through one `AnsiToPetsciiTransducer` (SDK, `@amiexpress/bbs-door-sdk/petscii`) into a baud-paced queue feeding a `PetsciiMachine` (KERNAL-accurate 40x25 screen-code + color-RAM emulator, also in the SDK); `petscii-bytes` (raw `.seq`) are fed directly and `observe()`d by the transducer so its cursor/charset oracle stays in step, and a door that owns the terminal bypasses the pacing queue. Login echo goes through the same seam (`packages/terminal/src/utils/login-key-machine.ts`), canvas keys reach the server through the SDK's `petsciiInputToAscii`, and the surface is per session state (`packages/terminal/src/petscii/surface-state.ts`) - a later session answering `A` is plain xterm again.
- **Backend**: Node/Express + TypeScript handles command parsing, door management, and MCP-driven express.e references. PETSCII conversion: the SDK owns the core (`sdk/petscii/`: machine, palette, screen codes, transducer, keyboard input map, 40-column wrap); `web/backend/src/utils/petscii.util.ts` keeps the PUA renderer and thin wrappers, `web/backend/src/utils/petscii-unicode-map.ts` the screen-code -> Unicode fallback, and `web/backend/src/utils/c64-palette.ts` re-exports the SDK's VIC-II palettes (Colodore default, Pepto). Real C64 telnet callers get one transducer per session in `server/connection-emitter.ts` - prompts, menus and blessed door frames arrive as PETSCII with cursor, colors and reverse video intact; IAC doubling stays in the telnet transport. Prose is word-wrapped to the session width at the `emitText` choke (`web/backend/src/utils/wrap-for-session.util.ts`), gated on `session.petsciiMode` so 80-column output for every non-C64 platform stays byte-identical. Doors call `BBSApi.writePetscii(Buffer)` to emit `petscii-bytes` directly.
- **Database**: SQLite stores 110+ AmiExpress fields; migrations manage schema changes (see `DATABASE.md`).

**Known PETSCII limitations** (by design, not bugs): the C64 has no per-cell background, so ANSI background SGRs are dropped per cell - the screen background and border are global and follow the CCGMS terminal convention (`$02 <colour>` sets both, `$0E` blacks both, the terminal default is black rather than BASIC blue; see `thoughts/shared/research/2026-09-01_true-petscii-reference.md` section 3). Card suits, bullets, rounded corners and diagonals are bank-0-only glyphs and are substituted in the text bank; 80-column positioned UIs are clamped to 40x25 (the 40-col plan's MIN_COLUMNS gate and table layouts decide which doors should reach a C64 at all); Ctrl/Cmd/Alt chords are deliberately not sent from the canvas (they stay browser shortcuts); `BBSApi.writePetsciiLine(Buffer)` still converts to the PUA/xterm path, not raw bytes; PETSCII screens bypass MCI codes and `~SP` screen-pause sequences (raw binary content, not text).

## 2. Core Services
- **Input Flow**: Inputs flow from Socket.io through `command.handler.ts` into the `BBSState` machine; commands map to express.e states and LVO functions referenced in `archive/EXPRESS_E_DEEP_AUDIT.md`.
- **Door Manager**: Supports XIM, SIM, TIM protocols; uses harness scripts and the type-safe `XIMProtocol.ts` command table.
- **AREXX Engine**: Interprets Amiga Arexx scripts; all phases (Discussions, `AREXX_PHASE2`, etc.) now archived to keep this summary lean.

## 3. Directory & Module Layout
- `web/backend/src` holds features organized into **feature-based subdirectories** (handlers/message, handlers/file, handlers/chat, etc.) after the Session 13 refactoring.
- **See `BACKEND_ARCHITECTURE.md`** for the complete directory structure, including 9 handler subdirectories, 38 services, and 11 database repositories.
- CLI tooling and script modules live under `dev/scripts` (see `BBS-CLI-IMPLEMENTATION.md` in the archive).
- Security modules use bcrypt, rate limiting, and session management; refer to `archive/BCRYPT_MIGRATION_COMPLETE.md` for upgrade reasoning.

## 4. Observability
- Logs (`logs/backend.log`, `logs/door-68k.log`, `STDERR`) provide the same debugging data express.e features when running under `DEBUG_XIM_OUTPUT=1` or the door harness.
- Use `Pick` commands to trace express.e's `JH_*` message flows, replicating the original 135 commands (highlighted in `archive/COMMAND_HANDLER_MODULARIZATION.md`).

**Next:** Keep this overview updated for new subsystems, but rely on the archived docs for in-depth reasoning.
