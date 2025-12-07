# MCI Codes Reference (Summary)
**Detailed tables and examples now live in `archive/PROJECT_SAFETY.md` and `archive/MCI_CODES.md` backups.**

- All 90 MCI codes from express.e (e.g., `~h`, `~q`, `~FC`, etc.) are implemented; the backend maps each to the database or the terminal renderer.
- `~SMO`/`~SMC` (slow displays) are intentionally stubbed because they are timing-sensitive; we aim for parity but do not stall the browser.
- Advanced codes like `~CC_`/`~CR_` and file display codes `~FF`/`~FC` rely on the same dataset as the `FR` parser so the output matches the Amiga font spacing.

**Want the full table?** The archived MCI reference includes each code, description, and sample output; this summary keeps only the highlights.
