# AmiExpress BBS - Deployment Scripts

Scripts for deploying AmiExpress BBS on a VPS (Hetzner, DigitalOcean, etc.)

## Quick Start (Hetzner CX22)

### 1. Create Server
- Go to [Hetzner Cloud Console](https://console.hetzner.cloud)
- Create new server: **Ubuntu 24.04**, **CX22** (4GB RAM, €3.79/mo)
- Add your SSH key

### 2. Initial Setup
SSH into your server and run:
```bash
ssh root@YOUR_SERVER_IP

# Download and run setup script
curl -fsSL https://raw.githubusercontent.com/YOUR_USER/amiexpress-web/main/deploy/hetzner-setup.sh -o setup.sh
bash setup.sh
```

### 3. Start BBS
```bash
cd /app/amiexpress
docker compose up -d
```

### 4. Access Your BBS
- **Web:** http://YOUR_SERVER_IP:3001
- **Telnet:** `telnet YOUR_SERVER_IP 2323`
- **Admin:** http://YOUR_SERVER_IP:3001/admin

## Scripts

| Script | Purpose |
|--------|---------|
| `hetzner-setup.sh` | Initial VPS setup (run once) |
| `update.sh` | Pull latest code and rebuild |
| `status.sh` | Check BBS health and status |

## Updating

After initial setup, update with:
```bash
cd /app/amiexpress
./deploy/update.sh
```

Or manually:
```bash
cd /app/amiexpress
git pull
docker compose up -d --build
```

## Useful Commands

```bash
# View live logs
docker compose logs -f

# Restart BBS
docker compose restart

# Stop BBS
docker compose down

# Check resource usage
docker stats amiexpress-bbs

# Enter container shell
docker exec -it amiexpress-bbs /bin/sh

# Backup data volume
docker run --rm -v amiexpress-bbs-data:/data -v $(pwd):/backup alpine tar czf /backup/bbs-backup.tar.gz /data
```

## Environment Variables

Edit `/app/amiexpress/.env` to configure:

| Variable | Default | Description |
|----------|---------|-------------|
| `EMULATOR_MEMORY_MB` | 8 | RAM per 68K door (MB) |
| `FILE_CACHE_MB` | 8 | Screen/bulletin cache (MB) |
| `AMIGA_FILE_CACHE_MB` | 4 | Amiga file cache (MB) |
| `CORS_ORIGINS` | - | Allowed origins for CORS |
| `DEBUG` | false | Enable debug logging |

## SSL/HTTPS Setup (Optional)

For production, add a reverse proxy. Recommended: [Caddy](https://caddyserver.com)

```bash
# Install Caddy
apt install -y caddy

# Configure
cat > /etc/caddy/Caddyfile << 'EOF'
bbs.yourdomain.com {
    reverse_proxy localhost:3001
}
EOF

# Restart
systemctl restart caddy
```

Caddy automatically handles SSL certificates via Let's Encrypt.

### Exempting /api/door-repo/ from the HTTPS redirect

Caddy's automatic HTTPS adds an implicit 308 redirect from `http://` to
`https://` for any bare domain site block (see above). The Door Repo API
(`docs/DOOR-REPO-API.md`) promises plain-HTTP access for classic AmigaDOS TCP
stacks that cannot do TLS, so `/api/door-repo/*` must be reachable over
`http://` without a redirect while every other path keeps redirecting.
Declaring an explicit `http://` site block for the host suppresses Caddy's
automatic redirect for that host; the block below then re-adds the redirect
for everything except the door-repo prefix:

```bash
cat > /etc/caddy/Caddyfile << 'EOF'
bbs.uprough.net {
    reverse_proxy localhost:3001
}

http://bbs.uprough.net {
    @doorrepo path /api/door-repo/*
    reverse_proxy @doorrepo localhost:3001

    redir https://bbs.uprough.net{uri} 308
}
EOF

# Validate before reloading (fails closed on a syntax error)
caddy validate --config /etc/caddy/Caddyfile

systemctl reload caddy
```

Verify: `curl -s -o /dev/null -w '%{http_code}' http://bbs.uprough.net/api/door-repo/health`
must return `200`; `curl -s -o /dev/null -w '%{http_code}' http://bbs.uprough.net/health`
must still return `308` (every other path keeps redirecting to HTTPS).

Note: a browser that has already received the HSTS header from
`https://bbs.uprough.net` will keep rewriting `http://` requests to `https://`
itself and never reach this exemption -- that is expected and does not affect
Amiga clients, which do not implement HSTS.

## Firewall

Required ports:
- **22** - SSH (server admin)
- **3001** - HTTP/WebSocket (or 80/443 with reverse proxy)
- **2323** - Telnet
- **2222** - SSH (BBS login)

Configure in Hetzner Console → Firewalls, or use ufw:
```bash
ufw allow 22,3001,2323,2222/tcp
ufw enable
```

## Troubleshooting

### BBS won't start
```bash
docker compose logs
```

### Out of memory
Increase `EMULATOR_MEMORY_MB` or upgrade to CX32 (8GB).

### Can't connect via Telnet
Check firewall allows port 2323.

### Health check failing
```bash
curl -v http://localhost:3001/health
```
