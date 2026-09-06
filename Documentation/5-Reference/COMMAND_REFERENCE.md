# Command Reference (Summary)
**Detailed command lists and safety notes now live in `archive/COMPLETE_COMMAND_LIST.md`, `archive/COMMANDS.md`, and `archive/PROJECT_SAFETY.md`.**

## 1. Core Commands
- Express.e commands (letters, combos) behave the same: e.g., `R` to read mail, `E` to mail, `F`/`FR`/`FM` for files, `C` for conference, `D` for door, and `Q` to quit.
- `?` shows the current menu, `X` toggles Expert/Novice, and `H` displays the help screens that are stored in `Screens/` as ANSI files.
- `NS` toggles nonstop scanning; `+` and `-` move forward/back through messages, replicating the original key mappings.

## 2. File & Door Commands
- `F Listing`: `FR` lists files and handles ASCII art, `FM` selects an entry, `FS` shows shelves, `N` moves file areas.
- `D Doors`: The door list is curated; each door run logs via `node web/backend/dist/scripts/run-amiga-door.js` and is subject to the same security levels.
- `S` shows your stats, `M` toggles ANSI, `T` shows time, and `O` lists online users—these all match the express.e statuses and prompts.

## 3. System Admin Commands
- Access level commands (`ACC`, `SEC`, etc.) still rely on the ACS bits; consult `archive/COMMAND_HANDLER_MODULARIZATION.md` for details on how they map to backend logic.
- Auto-commands (`Z`, `ZOOM`, etc.) remain stubbed to the original 1:1 logic. Use `archive/PROJECT_SAFETY.md` to see how we guard against dangerous operations.

**Need the full command table?** The archived COMPLETE_COMMAND_LIST includes every single command plus security notes, while this summary keeps the beginner-friendly commands clear.

## Legacy Archives

- The `Documentation/AmiExpressDocs` bundle is now located at `Documentation/5-Reference/archive/AmiExpressDocs/`.
- Other deep dives (emulation logs, backend design notes, SASC manual, BBSTITLE) are in their respective archive folders as outlined in `Documentation/README.md`.
