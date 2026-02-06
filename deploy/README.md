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
