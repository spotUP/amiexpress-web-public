# Troubleshooting Guide (Summary)
**Detailed incident reports live under `archive/` (e.g., `AQUASCAN_DEBUG.md`, `WEBHOOKS_README.md`). This summary collects the recurring pain points.**

## 1. Fresh Install Issues
- **Missing Dir Files**: When FR complains or doors fail because `Dir1`/`DirX` are absent, the server now auto-creates them. If you still see `Couldn't Open DirFile!`, inspect the conference directories for permission issues and check the `logs/backend.log` entry that notes the creation failure.
- **Upload Session Invalid**: Happens when the `upload` directory is missing or the session cookie expires. Confirm `storage/uploads/sessions` is writable and that the upload form's `sessionToken` matches the backend.

## 2. Door & FR Problems
- **Double Outputs/Line Breaks**: Old logs show ASCII art being appended twice; now the parser flags art lines and keeps them in the continuation block. To debug, enable `DEBUG_XIM_OUTPUT=1` and inspect `/tmp/*door*.log` and `logs/door-68k.log` for FR prompts.
- **Pauses Too Late**: The door now respects the user’s terminal height from their profile; verify the `users` table fields `screenHeight` and `pauseAfterLines` contain valid numbers.
- **ASCII Logos Trimmed**: If logos wrap early, ensure the `DirX` entry includes a `33-spaces` continuation block; the new parser stores art lines there.

## 3. Server & Networking
- **npm Access**: If `npx` fails due to `ENOTFOUND registry.npmjs.org`, check your network firewall or temporary offline caches; consider setting `npm config set registry https://registry.npmjs.org/` and ensure DNS resolves.
- **Homebrew `ps` Permission**: macOS Catalina+ may block `/bin/ps`; use `sudo` or disable restricted shell environment for `homebrew environ` scripts.

## 4. Logs & Diagnostics
- Always read `logs/backend.log` first—per the AGENT instructions. Follow it with `logs/door-68k.log` and `/tmp/bulls.out` whenever a door run fails.
- Additional per-run captures are stored via `node web/backend/dist/scripts/run-amiga-door.js ...`; the harness now outputs more context, including missing screen files and debug lines.

**Need more help?** Review the archived issue reports (`AQUASCAN_ROOT_CAUSE.md`, `AQUASCAN_SOLUTION.md`) or re-run the door manually with extra logging to preserve the output for future analysis.
