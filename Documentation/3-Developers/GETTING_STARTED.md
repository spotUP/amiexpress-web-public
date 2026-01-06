# Developer Getting Started Guide (Summary)
**Deeper tutorials (BBS-CLI, manual test lists, Arexx phases) now live in `archive/`.**

## 1. Environment Setup
- Install Node 18+, npm 10+, and `tsx` (or use `npx tsx`) to run the backend/door scripts (`npx tsx scripts/run-amiga-door.ts ...`).
- Clone the repo, run `npm install` in `web/backend` and `web/frontend`, and copy `.env.example` to `.env`.
- The backend uses TypeScript—compile with `npm run build` or run through `tsx` for development (debug with `DEBUG_XIM_OUTPUT=1`).

## 2. Core Tooling
- The BBS CLI tools (`BBS-CLI-README.md` moved to `archive/`) automate node management, door runs, and log collection.
- Use `dev/scripts/check-context-usage.sh` to ensure you stay within documentation limits.
- Door harnesses (AquaScan, WHO, etc.) are launched via `node web/backend/dist/scripts/run-amiga-door.js Doors/<Door>/<Door>.000 <node> <params>`.

## 3. Key Workflows
- Pull the latest express.e behavior from MCP (via `mcp__amiexpress-docs__read_express_module`) before editing a command.
- For structure changes, follow the directory mapping documented in `archive/DIRECTORY_STRUCTURE_ANALYSIS.md` and `archive/EXPRESS_E_DEEP_AUDIT.md`.
- Implement new features with `npm run lint`, `npm run build`, and `npm run test` so the 1:1 parity doesn't regress.

## 4. Testing & Debugging
- Run `dev/scripts/test-all-doors.sh` for door regression; the script stores output in `dev/scripts/door-test-results.txt`.
- Console debugging via `DEBUG_XIM_OUTPUT=1` and `logs/backend.log`/`logs/door-68k.log` replicates express.e debugging loops.
- Save manual test notes in `archive/manual-test-checklist.md` and cross-check with `archive/BBS-TESTING-GUIDE.md` for sample commands.

**Need more detail?** The bulk of developer notes (Arexx phases, API structures, CLI design, security) now live in the archive folder—refer there for long-form reasoning while this file keeps the basics concise.
