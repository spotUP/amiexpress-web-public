# AmiExpress-Web Current Status
**Last updated:** 2025-12-04 (Documentation consolidation complete)

## 1. Documentation & References
- The reshuffle now leaves exactly the reader-facing summaries in `Documentation/1-6` (User, Sysop, Developer, Door, Reference, Progress) while all other historic `.md` files live inside each directory’s `archive/` subfolder.
- Door binaries, emulator trees, and other reference sources now sit under `Documentation/7-Reference Sources/`, keeping textual docs lean while preserving verbatim artifacts.
- Each summary file (e.g., `1-Users/USER_GUIDE.md`, `3-Developers/ARCHITECTURE.md`, `4-Door-Developers/DOOR_DEVELOPMENT.md`, `5-Reference/COMMAND_REFERENCE.md`) synthesizes the key knowledge from the archived documents while pointing readers to deeper write-ups when needed.

## 2. System Implementation Status
- The backend still targets 1:1 parity with `express.e`: command flows, MCI codes, FR parsing, door handshakes, and the security stack replicate the Amiga behaviors exactly.
- Doors (AquaScan, WHO) now launch through `node web/backend/dist/scripts/run-amiga-door.js`; logs (`logs/door-68k.log`, `/tmp/bulls.out`) are available for each run, and debug logging (`DEBUG_XIM_OUTPUT`) records every `JH_*` exchange.
- File uploads/regeneration automatically rebuild missing `Dir1` files, art lines are compacted into continuation blocks, and the FR output honors the stored terminal height, fixing the earlier ASCII/art misalignment.

## 3. Remaining Work & Risks
- **AquaScan FR output** still needs fine-tuning: double line breaks, occasional ASCII wrap, and pause timing rely on correctly splitting metadata vs art; the door tests capture the remaining glitches.
- **68K door emulation** is paused for SIM-style doors due to port-handshake mysteries (see archived `68K_DOOR_EMULATION_SUMMARY.md`). XIM doors do run, but TM/SIM execution paths remain unverified.
- **GitHub verification**: network access to `registry.npmjs.org` is blocked in the sandbox, so offline testing is limited until network permission is restored. Use local caches or ask for full network access to run door/time-critical tests.

The new documentation structure now mirrors the instructions in AGENTS.md and CLAUDE.md: summaries are short, references preserved elsewhere, and the master plan is being updated next.
