# Amiga Emulation Guide (Summary)
**Extensive emulation references (68K logs, Bulls disassembly, UADE studies) now live under `archive/` and `Documentation/7-Reference Sources/`.**

## 1. Emulation Stack
- The door harness emulates 68k traps by forwarding `JH_*` messages through `XIMProtocol.ts`, replicating express.e’s message loop and command formats.
- Doors requiring full Amiga state (Bulls, RTW) log to `/tmp/bulls.out` and `logs/door-68k.log`—always inspect these files if a door loops or times out.
- When emulation fails, check for missing `doorInfo` fields (offsets per `AEDoor_LIBRARY_NOTES`). The 68k schedule runs through `ExpressHooks` and the `DoorManager` state machine.

## 2. Matching express.e Behavior
- The backend now respects pause prompts, ASCII art boundaries, and the original `FR` formatting thanks to `buildDescriptionLines` mimicry in `dir-file.util.ts`.
- Screen dimensions, command flow, and door handshake sequences strictly follow express.e’s logic (use the MCP `express.e` source to verify any deviation).
- Logging replicates the original: `Normal: Press <RETURN>` prompts, multi-screen pagination, and door banner retention.

## 3. Reference Artifacts
- Archive directories such as `archive/68K_QUICK_REFERENCE.md`, `archive/AEDoor_LIBRARY_NOTES.md`, and `Documentation/7-Reference Sources/vAmiga/` hold the disassembly, door binaries, and emulator docs needed for accurate emulation.
- The `Documentation/7-Reference Sources/Doors_with_Source/` collection preserves binaries showing how the original express.e doors behave, for quick 1:1 comparison.

## 4. Current Focus
- XIM doors (AquaScan, WHO) now run and log properly; SIM doors remain pending and have dedicated root-cause docs in the archive.
- Door output now handles ASCII art, line wrap, and prompt pauses; use the `door` harness to reproduce before reporting a regression.
- The integration layer in `web/backend/src/amiga-emulation/` ensures the physical door process receives the same ACC messages as the original.

Detailed debugging notes, problem logs, and root causes are preserved in the archive and new `7-Reference Sources` directories for specialists needing line-by-line parity.
