# AmiExpress 1:1 Parity Masterplan (Revised)
**Goal:** Keep every subsystem tied directly to the express.e intentions while ensuring readers can find the distilled knowledge in `Documentation/1-6` and the archives.

## 1. Documentation Alignment
- Each numbered directory now exposes a single summary doc (e.g., `1-Users/USER_GUIDE.md`, `2-Sysops/ADMINISTRATION.md`, `3-Developers/ARCHITECTURE.md`, etc.) that explains the current status and points to the archived legacy files inside `archive/`.
- All command, door, and backend test harnesses now live under `Scripts/` (see `Scripts/README.md`) so automation is centralized and simple to locate.
- Archives retain the detailed reference material, experiments, and investigations (AquaScan root cause, Arexx phase notes, door disassembly) without front-loading the main navigation structure.
- All reference source code (doors, emulators, petscii assets) lives under `Documentation/7-Reference Sources/`, keeping textual docs concise while preserving the raw artifacts needed for 1:1 parity verification.

## 2. Engineering Progress
- **BBS features**: Core commands, files, conferences, chat, and Arexx support have been retained to match express.e syntax and prompts; statuses are tracked in `CURRENT_STATUS.md`, `MILESTONES.md`, and `KNOWN_ISSUES.md`.
- **Door operations**: AquaScan and WHO launch through the TypeScript harness, output logs exactly mimic express.e, and the `dir-file.util.ts` parser now separates ASCII art from metadata before writing `Dir1` entries.
- **68K doors**: XIM protocol is stable (JH_/DT_/BB_ commands), but SIM doors still wait on clearing the synchronous `FindPort` handshake—this remains the main showstopper.

## 3. Stabilization & Next Steps
1. **Finalize AquaScan FR pagination**: ensure every ASCII art line is placed into the continuation column so the rendered list never folds or double-draws, and adjust the pause frequency to match the user’s saved terminal height.
2. **Verify AquaScan/WHO prompts**: confirm `press <RETURN>` prompts pause per screen and that any abnormal combinations (punctuation, `.` fragments) no longer break the layout.
3. **Revisit SIM door emulation**: map the express.e lines that call `DoorControl` and `FindPort` to the TypeScript version, reviewing the archived `68K_DOOR_EMULATION_SUMMARY.md` for trap sequences.
4. **Restore network/dependency access**: the sandbox currently resolves `registry.npmjs.org` to `ENOTFOUND`, blocking NPM installs and font downloads—this must be addressed before further door or frontend validation.
5. **Keep referencing the archives**: when debugging (command handler, door IO, Arexx), consult the archived docs before changing code to remain 1:1.

Following these steps keeps the ship aligned with express.e behavior while giving new contributors a clean overview plus the ability to dig into the archived research when required.
