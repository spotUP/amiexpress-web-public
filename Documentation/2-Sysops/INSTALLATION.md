# AmiExpress-Web Installation Guide (Summary)
**Summary:** Detailed deployment steps live in `archive/QUICK_START.md`, `archive/PRODUCTION_READINESS.md`, and `archive/DEPLOYMENT_SUMMARY.md`.

## 1. Prerequisites
- **Host**: Linux/macOS/Windows server with Node 18+, npm 10+, SQLite3, and a static IP for sockets.
- **Tools**: `git`, `node`, `npm`, `tsc`, and (optional) `npx tsx` for scripts such as door harnesses.
- **Ports**: HTTP and WebSocket 3001, telnet 64128, SSH 31337, FTP 1541 plus passive 50101-50107 (see `docker-compose.yml` and `.env.example`).
- **Storage**: Ensure persistent storage for `storage/`, `db/`, and `Doors/` to keep files and door logs.
- **Amiga ROM (native 68k doors)**: Any plain 512K Kickstart 3.x image (for example 3.1 for A500/A1200/A4000); the filename does not matter. Upload it on the admin Health page (Kickstart card) or place it in `data/amiga-roms/` (Docker: `ROM_DIR=/app/data/amiga-roms` on the data volume). No Kickstart is shipped. Without one, 68K doors run on the AROS fallback (`aros-rom.bin` + `aros-ext.bin`).

## 2. Bootstrap Steps
1. Clone the repo (`git clone ...`) and `cd` into `/amiexpress-web`.
2. Install dependencies: `npm install` in both `/web/backend` and `/web/frontend` if you are running both locally.
3. Create `.env` from `.env.example` and set `PORT`, `DATABASE_URL`, `SOCKET_PORT`, and optional API tokens.
4. Run `npm run build` in `web/backend` to compile TypeScript, and `npm run build` in `web/frontend` for React.
5. Start servers via `npm run start:dev` for development or `node ./web/backend/dist/src/index.js` for production.
6. Use `dev/scripts/start-servers.sh` and `kill-servers.sh` for reproducible multi-node startups (details in `archive/DEPLOYMENT_SCRIPTS.md`).

### Native 68k doors (Kickstart/AROS ROM handling)
- Location: the upload on the admin Health page, or `data/amiga-roms/` (`ROM_DIR` overrides; Docker sets `/app/data/amiga-roms`). Keep one Kickstart there.
- Accepted: a plain 512K Kickstart 3.x image under any filename. Encrypted Cloanto ROMs, 256K (1.x/2.x) and 1MB images are rejected. Every admin page shows a banner until one is installed, and a sysop sees a notice at logon.
- Default preference: Kickstart is used if present. Set `AEDOOR_ROM=aros` to force AROS, or `AEDOOR_ROM_FILE` to name one exact file.
- Library modules: on the first 68K door launch the backend splits the installed Kickstart by its RomTags into `tmp/rom-modules/<sha1>/`. No external tool (such as romtool) is needed.
- AROS fallback files must be named `aros-rom.bin` and `aros-ext.bin`.

## 3. After Installation
- Confirm SQLite database migrations ran by checking `db/main.sqlite` and verifying the `users` table includes AmiExpress fields.
- Upload `Screens/` and `Commands/` directories to match express.e EXACT format (names and contents) to keep the terminal matching.
- Register nodes via `node web/backend/dist/scripts/run-amiga-door.js <door> <node>` for door testing.

## 4. Production Readiness
- Review `archive/PRODUCTION_READINESS.md` for high-level items: security hardening, TLS, rate limiting, firewall rules, and monitoring.
- Use `archive/RAILWAY_DEPLOYMENT.md` or `archive/UNIFIED_DEPLOYMENT.md` for platform-specific instructions (Railway, Render, custom Docker, etc.).
- Keep `.env` secrets safe (`SESSION_SECRET`, `REDIS_URL` if used) and rotate tokens as needed.

**Tip:** Backups and import/export (from `Documentation/1-Users/archive/IMPORT_USER_GUIDE.md`) should run before each release to preserve user data.
