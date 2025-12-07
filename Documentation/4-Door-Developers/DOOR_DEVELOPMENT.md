# Door Development Guide (Summary)
**Detailed postmortems (AquaScan analysis, Bulls notes, SDK plans) now live in `archive/`.**

## 1. Workflow
- Door runs use the harness `node web/backend/dist/scripts/run-amiga-door.js <door> <node> <command>` and log to `logs/door-68k.log`, `/tmp/bulls.out`, and `/tmp/*.log`. Use `DEBUG_XIM_OUTPUT=1` for extra tracing.
- The backend follows express.e’s AEDoor/doorInfo expectations; consult `archive/Bulls_DISASM_NOTES.md` and `archive/AEDoor_LIBRARY_NOTES.md` for offsets.
- When parsing Dir files, the system now honors art lines by storing them in the continuation block; art lines no longer truncate before ASCII logos.

## 2. Protocols & Parsers
- XIM doors (AquaScan, WHO) use the 135-command implementation in `XIMProtocol.ts`, handling `JH_*`, `DT_*`, `BB_*`, and system commands exactly as express.e does.
- SIM doors remain deferred but documented; `archive/SIM_DOOR_0x790_IMPLEMENTATION_PLAN.md` covers the synchronous execution differences (async=FALSE) and the port cleanup behavior.
- Door input uses `petscii` screen files routed through `Screens/` and the 33-space continuation block (matching `express.e`'s `buildDescriptionLines`).

## 3. Tools & Reference Sources
- Use `Documentation/7-Reference Sources/Doors_with_Source/` for preserved door binaries, and `vAmiga` for emulator references—their README files describe how the AI harnessed them.
- The `Door Manager` logs door statuses, handles pause prompts, and adapts to per-user screen height so the FR pause now matches express.e's expected behavior.
- Run `dev/scripts/test-all-doors.sh` to exercise each door; inspect `dev/scripts/door-test-results.txt` for `pass/fail/timeout` counts.

## 4. Key Achievements
- AquaScan debugging logs and root cause fix descriptions now live in `archive/AQUASCAN_*` documents, showing how the parser now treats art lines and identifies `DIR1` creation issues.
- The summary of 68k emulator progress (`archive/68K_DOOR_EMULATION_SUMMARY.md`) partners with the debugging log from `archive/DOOR_DEBUG_SUMMARY.md`, capturing the last steps before pausing 68k emulation.
- `Doors/` folder now contains door data files sanitized to match express.e; replicating the ASCII art and pause prompts ensures FR output matches the BBS.

**Need deeper detail?** Jump into the archived investigations for step-by-step root cause analysis, disassembly notes, and SDA door research references.
