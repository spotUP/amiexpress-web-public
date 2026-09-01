# Architecture Overview (Summary)
**Comprehensive architecture notes, audits, and modularization plans now reside in `archive/` (see `DIRECTORY_STRUCTURE_ANALYSIS.md`, `SECURITY_FIXES.md`, `MODULARIZATION_REPORT.md`).**

## 1. Technology Stack
- **Frontend**: React 18 + TypeScript, two renderers. **xterm.js** renders ANSI screens (fonts `Topaz`/`mOsOul`) and also the legacy PETSCII path (PUA glyphs from `PetMe64`, `packages/terminal/src/components/BBSTerminal.tsx`) for screens still delivered as pre-converted Unicode text. **PetsciiCanvas** (`packages/terminal/src/petscii/PetsciiCanvas.tsx`) is a KERNAL-accurate 40x25 C64 screen-editor emulator — `PetsciiMachine` (`petscii-machine.ts`) applies raw PETSCII bytes to a 1000-cell screen-code + color-RAM matrix (logical 80-char lines, global charset-flip repaints, destructive DELETE/INSERT), and the canvas rasterizes it from a PetMe64-derived glyph atlas with the VIC-II Colodore palette and border. It is fed over a dedicated `petscii-bytes` socket event (base64-encoded raw bytes, baud-paced like `ansi-output`); on receipt the frontend hides (not destroys) xterm and shows the canvas. `petscii-output` (PUA-over-xterm) remains as a fallback for code paths not yet converted to raw bytes. See `archive/AMIGA_ASCII_FIXES.md` for xterm-side font fallback history.
- **Backend**: Node/Express + TypeScript handles command parsing, door management, and MCP-driven express.e references. PETSCII conversion lives in `web/backend/src/utils/petscii.util.ts` (screen-code glyph bank incl. reverse video, control-code no-ops, RETURN cancels reverse video, `PetsciiStreamConverter` for streaming state), `web/backend/src/utils/c64-palette.ts` (VIC-II truecolor palettes, Colodore default + Pepto, duplicated verbatim in `packages/terminal/src/petscii/c64-palette.ts` since the frontend package cannot import the backend), and `web/backend/src/utils/petscii-unicode-map.ts` (screen-code -> Unicode fallback map from normative Unicode-13 Symbols-for-Legacy-Computing sources, used when rendering PETSCII as plain Unicode text). Real C64 telnet callers get raw PETSCII bytes end to end (reverse-video bytes, an ANSI->PETSCII parser for legacy content, and a `$0E` charset prelude); IAC bytes are doubled at the telnet transport layer, not by the converter. Doors call `BBSApi.writePetscii(Buffer)` to emit `petscii-bytes` directly.
- **Database**: SQLite stores 110+ AmiExpress fields; migrations manage schema changes (see `DATABASE.md`).

**Known PETSCII limitations** (by design, not bugs): `BBSApi.writePetsciiLine(Buffer)` still converts to the PUA/xterm path, not raw bytes; cursor keys and function keys typed by a real C64 caller are dropped by the input converter (`petscii.util.ts` `convertPetsciiInputToAscii`) rather than reaching the door; the canvas requires a click to focus for keyboard input; PETSCII screens bypass MCI codes and `~SP` screen-pause sequences (raw binary content, not text).

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
