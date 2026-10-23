# Deployment Guide

## Production Deployment: Hetzner VPS

AmiExpress-Web runs on a Hetzner Cloud VPS with automatic deployment via GitHub Actions.

### Current Setup

| Component | Value |
|-----------|-------|
| Provider | Hetzner Cloud |
| Plan | CX22 (4GB RAM, 2 vCPU, 40GB SSD) |
| Cost | ~€3.79/month |
| Server IP | 203.0.113.10 |
| Auto-deploy | GitHub Actions on push to `main` |

### Access Points

- **Web:** http://203.0.113.10:3001
- **Telnet:** `telnet 203.0.113.10 2323`
- **SSH (BBS):** `ssh -p 2222 user@203.0.113.10`
- **Admin:** http://203.0.113.10:3001/admin

### How Deployment Works

1. Push code to `main` branch
2. GitHub Actions runs `.github/workflows/deploy-hetzner.yml`
3. Action SSHs into server and runs:
   ```bash
   cd /app/amiexpress
   git pull origin main
   docker compose up -d --build
   ```
4. Container rebuilds and restarts automatically

### Server Management

**SSH into server:**
```bash
ssh root@203.0.113.10
```

**Common commands:**
```bash
cd /app/amiexpress

# View logs
docker compose logs -f

# Restart BBS
docker compose restart

# Full rebuild
docker compose up -d --build

# Check status
docker compose ps

# Health check
./deploy/status.sh
```

### Environment Variables

Configured in `/app/amiexpress/.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `EMULATOR_MEMORY_MB` | 8 | RAM per 68K door (MB) |
| `FILE_CACHE_MB` | 8 | Screen/bulletin cache (MB) |
| `AMIGA_FILE_CACHE_MB` | 4 | Amiga file cache (MB) |
| `CORS_ORIGINS` | - | Allowed origins for CORS |
| `DEBUG` | false | Enable debug logging |
| `JWT_SECRET`, `JWT_REFRESH_SECRET`, `SESSION_SECRET` | generated | Unset or `CHANGE_ME`: a random value is generated at first start and kept in `/app/data/.secrets` (mode 600). A value in `.env` wins. |
| `BBS_TIMEZONE` | UTC | The board's time zone, e.g. `Europe/Stockholm` |
| `FTP_PASSIVE_ADDRESS` | - | Public IP FTP passive mode advertises; without it PASV answers 425 |
| `FTP_TLS_DIR`, `FTP_TLS_CERT`, `FTP_TLS_KEY`, `FTP_TLS_HOSTS` | - | FTPS. Empty = FTPS off. Host directory with certificates, and the `/certs/...` paths inside the container |
| `DOOR_SERVER_URL` | - | Door server (e.g. `http://doorserver:3010`). Empty = none |

A host that shares a Docker network with a door server adds it in an untracked `docker-compose.override.yml` (see the comment at the end of `docker-compose.yml`).

### Persistent Data

Data is stored in Docker volume `amiexpress-bbs-data`:
- `/app/data/bbs` - BBS files (Screens, Commands, Doors, etc.)
- `/app/data/db` - SQLite database
- `/app/data/amiga-roms` - AROS ROM files for 68K emulation

### Force Reinit Flags

Set these in `.env` temporarily to re-copy default data:

```bash
FORCE_REINIT_SCREENS=1   # Re-copy screen files
FORCE_REINIT_DOORS=1     # Re-copy door files
FORCE_REINIT_ROMS=1      # Re-copy ROM files
FORCE_REINIT_CONFIG=1    # Re-copy .info config files
```

After deploy, set back to 0.

### Troubleshooting

**BBS won't start:**
```bash
docker compose logs --tail=100
```

**Out of memory:**
- Check `EMULATOR_MEMORY_MB` setting
- Consider upgrading to CX32 (8GB RAM)

**Can't connect via Telnet:**
- Check firewall allows port 2323
- Verify container is running: `docker compose ps`

### Backup

```bash
# Backup data volume
docker run --rm -v amiexpress-bbs-data:/data -v $(pwd):/backup alpine tar czf /backup/bbs-backup-$(date +%Y%m%d).tar.gz /data
```

### Initial Setup

See `deploy/README.md` for first-time VPS setup instructions.
