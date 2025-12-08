# Architecture Overview (Summary)
**Comprehensive architecture notes, audits, and modularization plans now reside in `archive/` (see `DIRECTORY_STRUCTURE_ANALYSIS.md`, `SECURITY_FIXES.md`, `MODULARIZATION_REPORT.md`).**

## 1. Technology Stack
- **Frontend**: React 18 + TypeScript + xterm.js renders ANSI/PetSCII screens; fonts load via `PetMe64` and `Mosoul`, with fallback logic described in `archive/AMIGA_ASCII_FIXES.md`.
- **Backend**: Node/Express + TypeScript handles command parsing, door management, and MCP-driven express.e references.
- **Database**: SQLite stores 110+ AmiExpress fields; migrations manage schema changes (see `DATABASE.md`).

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
