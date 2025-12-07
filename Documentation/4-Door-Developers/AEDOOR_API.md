# AEDoor API Reference (Summary)
**In-depth AEDoor offsets and library notes now live in `archive/AEDoor_LIBRARY_NOTES.md` and the disassembly docs.**

## 1. AEDoor Basics
- AmiExpress doors talk to the BBS through `DoorInfo`, `INIT`, `STAT`, `DONE`, and `LOGOFF` messages; the structure offsets mirror express.e and are documented in the archived disassembly.
- The backend sends `JH_*` messages via `XIMProtocol.ts` while the door perceives a normal AEDoor session with command/response semantics.
- Door logs appear in `logs/door-68k.log`, `/tmp/bulls.out`, and per-run harness outputs; these log files must be reviewed before debugging.

## 2. Current Coverage
- JH calls (e.g., `JH_REGISTER`, `JH_SHUTDOWN`, `JH_WRITE`) implement the same flow as express.e, ensuring our QuickKey, output, and line input behavior are identical.
- `TWA` (time waiting) and `STAT` commands now respond exactly as the old BBS did, so doors paging or waiting for input see the known values.
- The door manager mirrors `DoorControl` structures (use `archive/Bulls_DISASM_NOTES.md` to match the original offsets).

## 3. Troubleshooting AEDoor Flows
- If a door exits silently, inspect the `/tmp/bulls.out` log to ensure it received the expected `JH_*` commands and that the reply port was valid.
- The system auto-creates Dir files and handles missing ACS entries so doors do not crash when encountering absent file areas.
- For any change, confirm the `doorInfo` struct still matches the express.e layout by referring to the archived disassembly notes.

Keep the archived AEDoor notes handy for exact structure offsets; this summary keeps the protocol overview short and points to the exact reference files.
