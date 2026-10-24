# AmiExpress-Web Installation Guide

Docker Compose is the supported way to install a board. This page lists what
the host needs and the order of the steps. The step-by-step commands are in the
repository [README](../../README.md#quick-start-with-docker-compose).

## 1. Prerequisites

- **Host**: Linux, macOS or Windows with Docker and the compose plugin.
- **Disk**: about 10 GB free for the image build.
- **Ports**: HTTP and WebSocket 3001, telnet 64128, SSH 31337, FTP 1541 plus
  passive 50101-50107 (see `docker-compose.yml` and `.env.example`).
- **Storage**: board data (database, files, doors' data, ROMs) lives in the
  `bbs-data` volume, mounted at `/app/data`. Back it up
  ([BACKUP_AND_RESTORE.md](./BACKUP_AND_RESTORE.md)).

## 2. Install

1. Clone the repository and `cd` into it.
2. `cp .env.example .env`. The secrets are generated on first start when you
   leave them unset. Set `BBS_TIMEZONE` and `CORS_ORIGINS` (your public URL)
   if needed.
3. `docker compose up -d`.
4. Create the sysop account with the one-time setup code from the server log:
   `docker compose logs | grep "Setup code"`. The steps are in
   [SYSOP_GUIDE.md](./SYSOP_GUIDE.md#create-the-sysop-account).
5. Log in to the admin at `http://localhost:3001/admin/` and set the BBS name
   and the other board settings.
6. Optional: install a Kickstart ROM for the 68K doors (next section).

Server deployment (firewall, TLS, the deploy scripts) is in
[DEPLOYMENT.md](./DEPLOYMENT.md) and [deploy/README.md](../../deploy/README.md).
Development without Docker is under "Local development" in the README.

## 3. Native 68K doors (Kickstart/AROS ROM handling)

- No Kickstart is shipped. Without one, 68K doors run on the AROS fallback
  (`aros-rom.bin` + `aros-ext.bin`).
- Install: upload the ROM on the admin Health page (Kickstart card), or place
  it in `data/amiga-roms/` (`ROM_DIR` overrides; Docker sets
  `/app/data/amiga-roms`). Keep one Kickstart there.
- Accepted: a plain 512K Kickstart 3.x image under any filename. Encrypted
  Cloanto ROMs, 256K (1.x/2.x) and 1MB images are rejected. Every admin page
  shows a banner until one is installed, and a sysop sees a notice at logon.
- Default preference: Kickstart is used if present. Set `AEDOOR_ROM=aros` to
  force AROS, or `AEDOOR_ROM_FILE` to name one exact file.
- Library modules: on the first 68K door launch the backend splits the
  installed Kickstart by its RomTags into `tmp/rom-modules/<sha1>/`. No
  external tool (such as romtool) is needed.

## 4. Production readiness

- Put a reverse proxy with TLS in front of port 3001 and pass WebSocket
  upgrade headers ([DOCKER.md](./DOCKER.md#2-reverse-proxy-recommended)).
- Open only the ports you use in the firewall.
- Keep `/app/data/.secrets` and your `.env` private.
