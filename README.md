# AmiExpress Web

A TypeScript port of the AmiExpress BBS. Callers connect over a web terminal, telnet or SSH. Classic Amiga 68K doors run on a built-in 68K emulator, next to doors written in TypeScript. A web admin lets the sysop configure the board.

Read [Documentation/PROJECT_SAFETY.md](Documentation/PROJECT_SAFETY.md) and [Documentation/1-Users/PRIVACY.md](Documentation/1-Users/PRIVACY.md) before running a public board.

## Quick start with Docker Compose

Requirements: Docker with the compose plugin, and about 10 GB of free disk for the image build (a fresh-clone build had used about 7 GB before it was halfway done).

1. Copy the example environment file:

   ```
   cp .env.example .env
   ```

2. Secrets. You do not need to set `JWT_SECRET`, `JWT_REFRESH_SECRET` or `SESSION_SECRET`. When they are unset or left at a placeholder (`CHANGE_ME`, `your_*_here`), the container generates strong values on first start and keeps them in `/app/data/.secrets` on the data volume (`docker/ensure-secrets.sh`). A value you set always wins. Optional settings in `.env`: `BBS_TIMEZONE` (default `UTC`, for example `Europe/Stockholm`), `CORS_ORIGINS` (your public URL, comma separated), and the FTP and AI keys described in `.env.example`.

3. Start the board:

   ```
   docker compose up -d
   docker compose logs -f
   ```

4. Create your sysop account. No account is pre-seeded. While the board has no sysop, it prints a one-time setup code in the server log at every start:

   ```
   docker compose logs | grep "Setup code"
   ```

   Connect with the web terminal at http://localhost:3001, or `telnet localhost 64128`. The logon screen says the board has no sysop yet. Type the sysop name you want, answer `C` to create the account, and enter the setup code (case and the dash do not matter). Then finish the normal registration. That account gets level 255, and the setup code stops working. A wrong code disconnects the caller and creates nothing, so a stranger who reaches the board first cannot take it. A restart before setup makes a new code.

5. Install a Kickstart ROM (next section), then open the admin at http://localhost:3001/admin/.

### Ports

| Port | Service | Notes |
|------|---------|-------|
| 3001 | HTTP and WebSocket | Web terminal, admin at `/admin/`, SDK at `/sdk/` |
| 64128 | Telnet | `telnet localhost 64128` |
| 31337 | SSH | Needs an SSH host key, generated in the admin configuration portal |
| 1541 | FTP control | Active when the sysop enables the FTP server in the admin |
| 50101-50107 | FTP passive data | Set `FTP_PASSIVE_ADDRESS` in `.env` to the public IP; open the range in your firewall |

Host ports are published in `docker-compose.yml`. Board data (database, files, ROMs) lives in the `bbs-data` volume mounted at `/app/data`.

## Kickstart ROM

No Kickstart ROM is shipped, because it is copyrighted. Without one, 68K doors run on the AROS fallback.

To install one, log in to the admin as sysop, open the Health page (`/admin/health`) and upload a Kickstart 3.x ROM on the Kickstart card (`POST /api/upload/kickstart`). The file must be a plain 512K Kickstart 3.x image; the filename does not matter. Encrypted Cloanto ROMs, 256K (1.x or 2.x) ROMs and 1MB ROMs are rejected. Every admin page shows a banner until a ROM is installed.

You can also drop the file into the ROM directory on disk. The directory is chosen in `web/backend/src/amiga-emulation/rom/amiga-rom.ts`:

- If `ROM_DIR` is set, only that directory is used. Docker sets it to `/app/data/amiga-roms`, which is `amiga-roms/` inside the `bbs-data` volume.
- Otherwise the backend searches `<board root>/data/amiga-roms`, `./data/amiga-roms` (the current working directory), `web/backend/data/amiga-roms` and `<repo>/data/amiga-roms`. Uploads go to the first of these.

## Local development

After cloning, turn on the repository's git hooks (the pre-push hook type-checks what you push):

```
git config core.hooksPath dev/hooks
```

The backend test type-check also reads door sources, so the doors it reaches need their own `node_modules`. Install the missing ones (and only those) with:

```
cd web/backend && npm ci
dev/scripts/install-door-deps.sh            # --check only lists them
```

```
./dev/scripts/start-servers.sh              # BBS, admin and SDK
./dev/scripts/start-servers.sh --debug      # with debug logging
./dev/scripts/kill-servers.sh               # stop everything

cd web/backend && npm run build             # build backend
cd web/backend && npx tsc --noEmit          # type-check backend
cd web/backend && npm test                  # backend tests
cd web/frontend && npm run build            # build frontend
cd sdk && npm run build                     # build SDK
```

Development ports (from `.env.example`): backend 3001, frontend 5173, telnet 64128, SSH 31337, SDK preview 8080 (`SDK_PREVIEW_PORT`). The web frontend served by the backend is a built bundle, so rebuild `packages/terminal` and `web/frontend` after changing them.

[RULES.md](RULES.md) holds the full conventions, the complete command list and the debugging protocols for 68K doors.

## Documentation

- [Documentation/README.md](Documentation/README.md): index of all documentation
- [Documentation/2-Sysops/INSTALLATION.md](Documentation/2-Sysops/INSTALLATION.md) and [DOCKER.md](Documentation/2-Sysops/DOCKER.md): installation and Docker
- [Documentation/2-Sysops/CONFIGURATION.md](Documentation/2-Sysops/CONFIGURATION.md) and [ADMINISTRATION.md](Documentation/2-Sysops/SYSOP_GUIDE.md): configuration and admin
- [Documentation/2-Sysops/BACKUP_AND_RESTORE.md](Documentation/2-Sysops/BACKUP_AND_RESTORE.md) and [TROUBLESHOOTING.md](Documentation/2-Sysops/SYSOP_GUIDE.md)
- [Documentation/2-Sysops/SSH_REMOTE_ACCESS.md](Documentation/2-Sysops/SSH_REMOTE_ACCESS.md): SSH access
- [deploy/README.md](deploy/README.md): server deployment scripts
- [Documentation/4-Door-Developers/DOOR-REPO-API.md](Documentation/4-Door-Developers/DOOR-REPO-API.md): door repository API
- [Documentation/5-Reference/RELEASE_NOTES.md](Documentation/5-Reference/RELEASE_NOTES.md): release notes
