# AmiExpress-Web Installation Guide (Summary)
**Summary:** Detailed deployment steps live in `archive/QUICK_START.md`, `archive/PRODUCTION_READINESS.md`, and `archive/DEPLOYMENT_SUMMARY.md`.

## 1. Prerequisites
- **Host**: Linux/macOS/Windows server with Node 18+, npm 10+, SQLite3, and a static IP for sockets.
- **Tools**: `git`, `node`, `npm`, `tsc`, and (optional) `npx tsx` for scripts such as door harnesses.
- **Ports**: Open 3000/4000 (frontend/backend) or whatever you configure via `.env`; the backend uses WebSocket on 4000 by default.
- **Storage**: Ensure persistent storage for `storage/`, `db/`, and `Doors/` to keep files and door logs.
- **Amiga ROM (native 68k doors)**: Place Kickstart 3.1 rev 40.63 (A500/A600/A2000) at `data/amiga-roms/Kickstart v3.1 rev 40.63 (1993)(Commodore)(A500-A600-A2000).rom`. Optional: keep AROS (`aros-rom.bin` + `aros-ext.bin`) in the same directory. Kickstart is preferred by default; set `AEDOOR_ROM=aros` to force AROS.

## 2. Bootstrap Steps
1. Clone the repo (`git clone ...`) and `cd` into `/amiexpress-web`.
2. Install dependencies: `npm install` in both `/web/backend` and `/web/frontend` if you are running both locally.
3. Create `.env` from `.env.example` and set `PORT`, `DATABASE_URL`, `SOCKET_PORT`, and optional API tokens.
4. Run `npm run build` in `web/backend` to compile TypeScript, and `npm run build` in `web/frontend` for React.
5. Start servers via `npm run start:dev` for development or `node ./web/backend/dist/src/index.js` for production.
6. Use `dev/scripts/start-servers.sh` and `kill-servers.sh` for reproducible multi-node startups (details in `archive/DEPLOYMENT_SCRIPTS.md`).

### Native 68k doors (Kickstart/AROS ROM handling)
- Location: `data/amiga-roms/`. Keep only one Kickstart and the AROS pair to avoid ambiguity.
- Default preference: Kickstart is used if present. Override with `AEDOOR_ROM=aros` to force AROS, or `AEDOOR_ROM=kickstart` to lock it.
- Extraction: On startup, if `romtool` is installed, the backend auto-extracts core ROM libs (e.g., `dos.library`, `utility.library`, `console.device`) into `Libs/` when they’re missing. No manual copy is needed beyond placing the ROM.
- File names: Use the exact Kickstart filename above; AROS files must be named `aros-rom.bin` and `aros-ext.bin`.

## 3. After Installation
- Confirm SQLite database migrations ran by checking `db/main.sqlite` and verifying the `users` table includes AmiExpress fields.
- Upload `Screens/` and `Commands/` directories to match express.e EXACT format (names and contents) to keep the terminal matching.
- Register nodes via `node web/backend/dist/scripts/run-amiga-door.js <door> <node>` for door testing.

## 4. Production Readiness
- Review `archive/PRODUCTION_READINESS.md` for high-level items: security hardening, TLS, rate limiting, firewall rules, and monitoring.
- Use `archive/RAILWAY_DEPLOYMENT.md` or `archive/UNIFIED_DEPLOYMENT.md` for platform-specific instructions (Railway, Render, custom Docker, etc.).
- Keep `.env` secrets safe (`SESSION_SECRET`, `REDIS_URL` if used) and rotate tokens as needed.

**Tip:** Backups and import/export (from `Documentation/1-Users/archive/IMPORT_USER_GUIDE.md`) should run before each release to preserve user data.
