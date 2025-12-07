# AmiExpress BBS User Guide (Summary)
**Maintainer Note:** Detailed legacy user/import content now lives in `archive/USER_GUIDE_FULL.md` and `archive/IMPORT_USER_GUIDE.md`.

## 1. Getting Started
- AmiExpress-Web mirrors the classic Amiga BBS look/feel in the browser (ANSI, Petscii, full command set).
- Connect via the web terminal, choose ANSI when prompted, and either log in or type `NEW` to create an account.
- The system keeps running banners, menu prompts, and bulletins just like express.e would.

## 2. Authentication & Navigation
- Login prompts expect username & password; invalid passwords echo the exact express.e message plus `\r\n` to keep prompts aligned.
- Once logged in you see BULL, LOGON, mail scans, and the Menu. Press `?` anytime for your current menu.
- Expert (`X`) vs Novice mode mirrors the original: Novice shows the menu automatically; Expert hides it until requested.

## 3. Message Flow (R, A, E)
- Use `R` to read mail; replies use `R` inside a message, `A` to repeat, `D` to delete, `F` to check attachments, `Q`/`CR` to move on, and `NS` for nonstop.
- Compose messages with `E`; choose recipient (user, ALL, SYSOP, EALL) then subject, privacy, and editor mode.
- Editor commands follow the Amiga-style keystrokes (Ctrl-X delete line, `A` abort, `C` continue, `D` delete specific line).

## 4. File Operations (F, FR, FM, FS, N)
- `FR` lists directories with ASCII art in the continuation block, `FM` shows file info, `FS` shows shelves, `F` displays contents, `N` moves between file areas.
- File uploads create DIR1/DIRx files and require a valid session; the door ensures DIR1 exists when missing to match AmiExpress behavior.
- Use `F/R` commands for flags, `C` for clears, `Q` to exit, and `?` to show help, just as the original FR prompt does.

## 5. Conference Management & Doors
- Commands `J`, `JM`, `C` allow conference navigation; Express-style security levels gate access.
- Doors are launched through the `D` command or via menus; AquaScan and other doors now behave identically to express.e, including prompts and pause control.
- `FR`/`FS` lists reflect ASCII art lines in the 33-column continuation block; art lines are recognized and separated from metadata.

## 6. Chat, Customization & Hotkeys
- Real-time chat uses `K`/`F1` toggles and replicates the original FREQ/INFO flows.
- Customize colors, petscii fonts, editors, and default screens via the `M` and `P` commands; ANSI/monochrome styling matches express.e states exactly.
- Keyboard shortcuts (up/down, tab, etc.) follow the same semantics as the classic client; full hotkey list moved to `Documentation/5-Reference/HOTKEYS.md`.

## 7. Import/Export Snapshot
- The importer accepts LHA, LZX, ZIP, TAR archives (<=100 MB) that contain `User.data`, config files, messages, and bulletins.
- Upload via the sysop interface (`/admin/import`), validate automatically, and the system merges users, conferences, doors, and commands.
- Conflict resolution, field mapping, and troubleshooting tips remain in `archive/IMPORT_USER_GUIDE.md`.

## 8. Practical Tips
- Always press Enter after commands; commands are case insensitive but need an explicit newline to execute.
- For nonstop scans or queued output, use `NS` or `-`/`+` to navigate; the server now tracks your terminal height and pauses every screen just like express.e.
- When in doubt, type `?` or `H` to see help files that are loaded from the original screen files preserved in the repository.

**Still Needed:** For exact command listings, refer to the reference section (`Documentation/5-Reference/COMMAND_REFERENCE.md`).
