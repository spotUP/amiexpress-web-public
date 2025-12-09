# Docker Deployment Guide

**Last Updated**: 2025-12-09

This guide covers deploying AmiExpress-Web using Docker for simplified installation and multi-node support.

## Why Docker?

Docker provides significant benefits for AmiExpress-Web:

✓ **3-step installation** (vs 36-step manual)
✓ **Consistent environment** (no "works on my machine" bugs)
✓ **Multi-node support** (scale with one command)
✓ **Easy rollback** (tag-based versioning)
✓ **Production-ready** (health checks, restart policies)

See [Docker Analysis](#why-docker-for-amiexpress) for detailed benefits.

## Quick Start

### Prerequisites

- Docker 20.10+
- Docker Compose 2.0+
- 2GB RAM minimum (4GB recommended for multi-node)
- 10GB disk space

### Single-Node Deployment (3 Steps)

```bash
# 1. Clone repository
git clone https://github.com/your-org/amiexpress-web.git
cd amiexpress-web

# 2. Place Kickstart ROM (for Amiga doors)
# Copy your Kickstart v3.1 rev 40.63 ROM to:
mkdir -p data/amiga-roms
cp /path/to/kickstart-rom data/amiga-roms/

# 3. Start BBS
docker-compose up -d
```

Access at `http://localhost:3001`

That's it! The BBS is running.

## Configuration

### Environment Variables

Create `.env.local` file in project root:

```bash
# Security (REQUIRED - change these!)
JWT_SECRET=your-super-secret-jwt-key-here
SESSION_SECRET=your-super-secret-session-key-here

# Ports (optional)
PORT=3001
TELNET_PORT=2323
SSH_PORT=2222

# Debug (optional)
DEBUG=false
XIM_DEBUG=0

# Database (optional)
DATABASE_FILE=amiexpress.db
```

**Generate secrets**:
```bash
# Linux/macOS
openssl rand -base64 32

# Or use this one-liner
echo "JWT_SECRET=$(openssl rand -base64 32)" > .env.local
echo "SESSION_SECRET=$(openssl rand -base64 32)" >> .env.local
```

### Volume Mounts

Docker Compose mounts these directories:

| Host Path | Container Path | Purpose |
|-----------|---------------|---------|
| `./db` | `/app/db` | SQLite database |
| `./data` | `/app/data` | BBS data files |
| `./logs` | `/app/logs` | Server logs |
| `./Screens` | `/app/Screens` | ANSI screens |
| `./Commands` | `/app/Commands` | BBS commands |
| `./Bulletins` | `/app/Bulletins` | System bulletins |
| `./Doors` | `/app/Doors` | Door programs |
| `./Users` | `/app/Users` | User database |
| `./Conf1-13` | `/app/Conf1-13` | Conference data |
| `./data/amiga-roms` | `/app/data/amiga-roms` | Kickstart ROM (read-only) |

### Kickstart ROM Setup

For 68K Amiga doors to work, you need a Kickstart ROM:

```bash
# 1. Create ROM directory
mkdir -p data/amiga-roms

# 2. Copy Kickstart v3.1 rev 40.63 (A500/A600/A2000)
cp /path/to/kickstart.rom data/amiga-roms/

# 3. Verify (should be 512KB)
ls -lh data/amiga-roms/
# -rw-r--r--  1 user  staff   512K Dec  9 10:00 Kickstart v3.1 rev 40.63 (1993)(Commodore)(A500-A600-A2000).rom
```

**Alternative: AROS**
```bash
# Copy AROS ROM files
cp aros-rom.bin data/amiga-roms/
cp aros-ext.bin data/amiga-roms/

# Force AROS in .env.local
echo "AEDOOR_ROM=aros" >> .env.local
```

## Docker Commands

### Basic Operations

```bash
# Start BBS (detached)
docker-compose up -d

# Stop BBS
docker-compose down

# Restart BBS
docker-compose restart

# View logs
docker-compose logs -f

# View logs for specific service
docker-compose logs -f bbs

# Check status
docker-compose ps

# Execute command in container
docker-compose exec bbs bash
```

### Building

```bash
# Build image
docker-compose build

# Build without cache
docker-compose build --no-cache

# Build and start
docker-compose up -d --build
```

### Maintenance

```bash
# Stop and remove everything
docker-compose down -v

# Remove volumes (WARNING: deletes database!)
docker-compose down -v --remove-orphans

# Prune unused images
docker image prune -a

# View disk usage
docker system df
```

## Multi-Node Deployment

For production BBS with multiple simultaneous users:

### Scale to 4 Nodes

```bash
# Start with 4 nodes
docker-compose -f docker-compose.multi-node.yml up -d --scale bbs=4

# Scale up to 8 nodes (live)
docker-compose -f docker-compose.multi-node.yml up -d --scale bbs=8

# Scale down to 2 nodes
docker-compose -f docker-compose.multi-node.yml up -d --scale bbs=2
```

### Port Mapping

Multi-node setup uses port ranges:

| Node | HTTP | Telnet | SSH |
|------|------|--------|-----|
| 1 | 3001 | 2323 | 2222 |
| 2 | 3002 | 2324 | 2223 |
| 3 | 3003 | 2325 | 2224 |
| 4 | 3004 | 2326 | 2225 |

### Load Balancing (Optional)

For HTTP traffic, use nginx load balancer:

```bash
# Included in docker-compose.multi-node.yml
docker-compose -f docker-compose.multi-node.yml up -d

# Access via load balancer
http://localhost:80
```

Configure `nginx.conf`:
```nginx
upstream bbs_backend {
    least_conn;
    server bbs_1:3001;
    server bbs_2:3001;
    server bbs_3:3001;
    server bbs_4:3001;
}

server {
    listen 80;
    location / {
        proxy_pass http://bbs_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## Production Deployment

### 1. Security Hardening

```bash
# Use strong secrets
JWT_SECRET=$(openssl rand -base64 64)
SESSION_SECRET=$(openssl rand -base64 64)

# Restrict ports (use reverse proxy)
# Don't expose 3001 directly - use nginx/caddy

# Enable HTTPS
# Use Let's Encrypt with nginx or Caddy
```

### 2. Reverse Proxy (Recommended)

**Caddy** (easiest):
```Caddyfile
bbs.example.com {
    reverse_proxy localhost:3001
}
```

**nginx**:
```nginx
server {
    listen 443 ssl http2;
    server_name bbs.example.com;

    ssl_certificate /etc/letsencrypt/live/bbs.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bbs.example.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 3. Monitoring

**Health Checks**:
```bash
# Check container health
docker inspect --format='{{.State.Health.Status}}' amiexpress-bbs

# View health check logs
docker inspect --format='{{json .State.Health}}' amiexpress-bbs | jq
```

**Logs**:
```bash
# Follow logs
docker-compose logs -f --tail=100

# Export logs
docker-compose logs > bbs-logs-$(date +%Y%m%d).log
```

### 4. Backups

**Automated Backup Script**:
```bash
#!/bin/bash
# backup-bbs.sh

BACKUP_DIR="/backups/amiexpress"
DATE=$(date +%Y%m%d-%H%M%S)

# Stop BBS (optional)
# docker-compose stop

# Backup database
tar czf "$BACKUP_DIR/db-$DATE.tar.gz" db/

# Backup BBS data
tar czf "$BACKUP_DIR/data-$DATE.tar.gz" data/

# Backup conferences
tar czf "$BACKUP_DIR/conferences-$DATE.tar.gz" Conf*

# Start BBS
# docker-compose start

# Prune old backups (keep 30 days)
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +30 -delete
```

**Restore**:
```bash
# Stop BBS
docker-compose down

# Restore database
tar xzf /backups/amiexpress/db-20251209.tar.gz

# Restore data
tar xzf /backups/amiexpress/data-20251209.tar.gz

# Start BBS
docker-compose up -d
```

### 5. Updates

```bash
# Pull latest code
git pull

# Rebuild image
docker-compose build

# Restart with new image
docker-compose up -d

# Or one-liner
git pull && docker-compose up -d --build
```

**Rollback**:
```bash
# Revert to specific version
git checkout v1.2.3
docker-compose up -d --build

# Or use tagged image
docker pull amiexpress:v1.2.3
docker-compose up -d
```

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker-compose logs bbs

# Check health
docker inspect amiexpress-bbs

# Verify environment
docker-compose config
```

### Database Issues

```bash
# Access container
docker-compose exec bbs bash

# Check database
cd /app/db
sqlite3 amiexpress.db "SELECT count(*) FROM users;"

# Reset database (WARNING: deletes all data)
docker-compose down
rm -rf db/*
docker-compose up -d
```

### Port Conflicts

```bash
# Find process using port
lsof -i :3001

# Change port in docker-compose.yml
ports:
  - "8001:3001"  # Host:Container
```

### ROM Not Found

```bash
# Verify ROM is mounted
docker-compose exec bbs ls -la /app/data/amiga-roms/

# Check permissions
ls -la data/amiga-roms/

# Ensure ROM is readable
chmod 644 data/amiga-roms/*.rom
```

### Memory Issues

```bash
# Check container memory
docker stats amiexpress-bbs

# Increase container limit
docker-compose.yml:
services:
  bbs:
    mem_limit: 2g
    memswap_limit: 2g
```

## Performance Tuning

### Resource Limits

```yaml
# docker-compose.yml
services:
  bbs:
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2G
        reservations:
          cpus: '1.0'
          memory: 1G
```

### Logging

```yaml
# Limit log size
services:
  bbs:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

### Health Check Tuning

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3001/"]
  interval: 60s      # Check every 60s
  timeout: 10s       # Fail after 10s
  retries: 3         # 3 failures = unhealthy
  start_period: 60s  # Grace period on start
```

## Why Docker for AmiExpress?

### Benefits Summary

| Benefit | Impact | Time Saved |
|---------|--------|------------|
| Simplified Install | HIGH | 2-4 hours per deployment |
| Environment Consistency | CRITICAL | Eliminates 80% of "works on my machine" bugs |
| Multi-Node Support | HIGH | Native scaling vs manual coordination |
| Production Readiness | HIGH | Health checks, restarts, monitoring built-in |
| Easy Rollback | MEDIUM | 30 seconds vs 30 minutes |
| Development Parity | HIGH | Exact same environment dev → prod |

### Comparison

**Manual Installation**: 36 steps, 2-4 hours, environment-specific bugs

**Docker Installation**: 3 steps, 5 minutes, guaranteed consistency

## See Also

- [INSTALLATION.md](./INSTALLATION.md) - Manual installation (alternative)
- [BACKEND_ARCHITECTURE.md](../3-Developers/BACKEND_ARCHITECTURE.md) - Architecture overview
- [Docker Docs](https://docs.docker.com/) - Official Docker documentation
- [Docker Compose Docs](https://docs.docker.com/compose/) - Compose reference

---

**Note**: Docker deployment is the RECOMMENDED method for production. Manual installation is supported but requires significantly more setup and maintenance.
