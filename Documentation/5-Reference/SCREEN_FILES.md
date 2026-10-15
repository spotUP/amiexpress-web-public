# Screen Files Reference (Summary)
**Complete screen file formats available in `archive/SCREEN_FILES_REFERENCE.md` and `archive/Screen_Files_Quick_Reference.md`.**

- Screens live in `Screens/` and store ANSI/Petscii art; the renderer keeps them at the original widths so prompts display exactly as express.e did.
- `SCREEN.SYS`, `MENU.SYS`, `BULL.SYS`, etc., map to their express.e counterparts; the backend reads them and injects the same `MCI` codes.
- If a screen file includes ASCII art, the parser now keeps art on the 33-space continuation block, preventing it from shifting the primary line content.

For the full format and naming rules, open the archived screen references; this summary keeps the high-level expectations.
