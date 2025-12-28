# AmiExpress 1:1 Parity Masterplan (Revised)
**Goal:** Keep every subsystem tied directly to the express.e intentions while making the distilled knowledge easy to find via `Documentation/1-6` and the source archives.
**Last updated:** 2025-12-27

## 1. Documentation Alignment
- Each numbered directory exposes a single summary doc (e.g., `1-Users/USER_GUIDE.md`, `2-Sysops/ADMINISTRATION.md`, `3-Developers/ARCHITECTURE.md`, `4-Door-Developers/DOOR_DEVELOPMENT.md`, `5-Reference/COMMAND_REFERENCE.md`, `6-Progress/CURRENT_STATUS.md`) that explains the current state and links down to the richer `archive/` material.
- The `Documentation/6-Progress` section now tracks progress via `CURRENT_STATUS.md`, `MILESTONES.md`, `KNOWN_ISSUES.md`, and a dedicated `archive/` of historical logs, while `handoff.md` records blockages for quick session handoffs.
- `Scripts/README.md` documents where all testing and support harnesses live so contributors can find automation quickly.
- Reference source material (petscii screens, vAmiga manuals, UADE bits, door sources, etc.) stays verbatim in `Documentation/7-Reference Sources/` so we can prove behavior 1:1 with express.e.

## 2. Engineering Progress
- **BBS features**: Core commands, files, conferences, chat, and Arexx support remain in place, and the session tracking docs now point at the reorganized directories instead of the old scattered notes.
- **Door operations**: AquaScan, WHO, and mtop now run through the TypeScript harness with logs saved under `logs/door-68k-{NAME}-{TIME}.-N{NODE}.log`, and `dir-file.util.ts` now splits ASCII art from metadata so `Dir1` mirrors express.e at a 1:1 level.
- **Batch utilities (non-interactive 68K)**: FULLY WORKING as of 2025-12-27
  - mtop/MultiTop: All 5 bulletin generation commands work from batch files
  - Bulls: Working
  - WHO: Working
  - User file format: 1:1 match with Amiga (232/56/248 bytes, 2-byte alignment, big-endian)
- **68K interactive doors**: ~72% complete with 3 CRITICAL gaps for interactive doors:
  1. Environment Variables (SetVar/DeleteVar/FindVar) - 20% complete
  2. Signal Delivery (Wait/Signal blocking) - 30% complete
  3. DOS Error Codes (IoErr completeness) - 70% complete
  - **Detailed plan**: See `Documentation/6-Progress/68K_DOOR_COMPLETION_PLAN.md` for phased implementation (20-30 hours to 100%)
  - **Phase 1 target**: Fix critical gaps -> 85%+ interactive door compatibility
- **AREXX doors**: 100% complete with full AmiExpress API (SendString, Transmit, GetUser, GETCHAR, Showfile, etc.)

## 3. Stabilization & Next Steps
1. **Reproduce AquaScan FR in the live BBS** so `DOORUSE=FR/REVSCAN` is set, collect `logs/xim-output.log` plus `logs/door-68k-AquaScan_*`, and verify the ASCII art lines plus `press <RETURN>` pacing now match the express.e trace in `Documentation/4-Door-Developers/archive/AQUASCAN_ANALYSIS_SUMMARY.md`.
2. **Translate `Dir1` parsing to the door** by ensuring the 68K harness consumes the clean continuation lines produced by `lookslikeAsciiArt`/`writeDirEntry`.
3. **Continue the SIM door work** by aligning our TypeScript handshake with the documented `FindPort`/`DoorControl` sequence in `Documentation/4-Door-Developers/archive/68K_DOOR_EMULATION_SUMMARY.md`.
4. **Fix sandbox network access**—`registry.npmjs.org` still resolves to `ENOTFOUND`, so the frontend/test harnesses can’t download fonts or NPM packages until that is corrected.
5. **Keep referencing the archives** when debugging command handlers, door IO, or Arexx; they are the source-of-truth for any 1:1 parity work.

Following these steps keeps the ship aligned with express.e behavior while giving new contributors a clean overview plus the ability to dig into the archived research when required.
