# Production Deployment Guide
**Last Updated:** 2026-01-04
**Target:** Production deployment of AmiExpress-Web BBS
**Status:** Production-ready (100% express.e parity)

---

## Pre-Deployment Checklist

### System Requirements

**Minimum:**
- Node.js 18.x or later
- 2GB RAM
- 10GB disk space (expandable for user uploads/messages)
- Linux/macOS/Windows Server

**Recommended:**
- Node.js 20.x LTS
- 4GB RAM
- 50GB+ disk space
- Linux (Ubuntu 22.04 LTS or similar)
- SSD storage for database

### Dependencies

```bash
# System packages (Ubuntu/Debian)
sudo apt-get update
sudo apt-get install -y build-essential git openssl

# Node.js 20.x (via nvm - recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
```

---

## Installation Steps

### 1. Clone Repository

```bash
git clone https://github.com/your-org/amiexpress-web.git
cd amiexpress-web
```

### 2. Install Dependencies

```bash
# Backend dependencies
cd web/backend
npm install

# Frontend dependencies
cd ../frontend
npm install

# SDK dependencies (if using TypeScript doors)
cd ../../sdk
npm install
```

### 3. Build Frontend

```bash
cd web/frontend
npm run build

# Verify dist/ directory created
ls -la dist/
```

### 4. Build SDK (if using TypeScript doors)

```bash
cd ../../sdk
npm run build

# Verify dist/ directories created
ls -la dist-esm/ dist-cjs/
```

### 5. Configure Environment

```bash
cd ../web/backend

# Copy example environment file
cp .env.example .env.local

# Generate JWT secret
openssl rand -base64 32

# Edit .env.local with your settings
nano .env.local
```

**Required `.env.local` settings:**

```bash
# JWT Secret (generate with: openssl rand -base64 32)
JWT_SECRET=your-generated-secret-here

# Database directory (absolute path recommended)
DATABASE_DIR=/var/amiexpress-web/data

# BBS data directory (where user files, conferences, doors live)
BBS_DATA_DIR=/var/amiexpress-web

# Backend port (default: 3001)
BACKEND_PORT=3001

# Node environment
NODE_ENV=production

# Optional: SSH support
SSH_HOST_KEY_PATH=/var/amiexpress-web/ssh_host_key
```

### 6. Initialize BBS Data

```bash
# Create data directories
sudo mkdir -p /var/amiexpress-web
sudo mkdir -p /var/amiexpress-web/data
sudo mkdir -p /var/amiexpress-web/logs
sudo chown -R $(whoami):$(whoami) /var/amiexpress-web

# Copy BBS configuration files from repository
cp -r ../../Conf* /var/amiexpress-web/
cp -r ../../Commands /var/amiexpress-web/
cp -r ../../Doors /var/amiexpress-web/
cp -r ../../Screens /var/amiexpress-web/
cp -r ../../Bulletins /var/amiexpress-web/
cp ../../bbsConfig.info /var/amiexpress-web/
cp ../../ConfConfig.info /var/amiexpress-web/

# Set proper permissions
chmod 755 /var/amiexpress-web/Doors/*
```

### 7. Generate SSH Host Key (Optional)

For SSH/Telnet support:

```bash
ssh-keygen -t rsa -b 4096 -f /var/amiexpress-web/ssh_host_key -N ""
```

### 8. Test Backend

```bash
cd web/backend

# Run in development mode to verify
npm run dev

# Check logs for errors
# Press Ctrl+C to stop after verification
```

### 9. Create Systemd Service (Linux)

```bash
sudo nano /etc/systemd/system/amiexpress-web.service
```

**Service file contents:**

```ini
[Unit]
Description=AmiExpress-Web BBS Backend
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/path/to/amiexpress-web/web/backend
Environment=NODE_ENV=production
Environment=BBS_DATA_DIR=/var/amiexpress-web
ExecStart=/usr/bin/node --loader tsx src/index.ts
Restart=always
RestartSec=10
StandardOutput=append:/var/amiexpress-web/logs/backend.log
StandardError=append:/var/amiexpress-web/logs/backend-error.log

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/amiexpress-web

[Install]
WantedBy=multi-user.target
```

**Enable and start service:**

```bash
sudo systemctl daemon-reload
sudo systemctl enable amiexpress-web
sudo systemctl start amiexpress-web
sudo systemctl status amiexpress-web
```

---

## Configuration

### bbsConfig.info

Essential settings in `/var/amiexpress-web/bbsConfig.info`:

```
BBSNAME=Your BBS Name
SYSOPNAME=Your Name
LOCATION=/var/amiexpress-web
TELNETPORT=2323
SSHPORT=2222
WEBPORT=3001
MAXTIMEPERDAY=120
MAXCALLSPERDAY=3
HOLD_ACCESS_LEVEL=201
```

### ConfConfig.info

Conference configuration in `/var/amiexpress-web/ConfConfig.info`:

```
CONF_NAME_1=Main Conference
CONF_NAME_2=General Discussion
CONF_NAME_3=Technical Support
# ... up to 256 conferences
```

### Firewall Configuration

```bash
# Allow SSH (if enabled)
sudo ufw allow 2222/tcp comment 'BBS SSH'

# Allow Telnet (if enabled)
sudo ufw allow 2323/tcp comment 'BBS Telnet'

# Allow HTTPS (if using reverse proxy)
sudo ufw allow 443/tcp comment 'HTTPS'

# Enable firewall
sudo ufw enable
```

---

## Reverse Proxy Setup (Recommended)

### Nginx Configuration

```bash
sudo nano /etc/nginx/sites-available/amiexpress-web
```

**Nginx config:**

```nginx
upstream amiexpress_backend {
    server localhost:3001;
}

server {
    listen 80;
    listen [::]:80;
    server_name yourbbs.com;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name yourbbs.com;

    # SSL certificates (use Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/yourbbs.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourbbs.com/privkey.pem;

    # SSL hardening
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Frontend static files
    location / {
        root /path/to/amiexpress-web/web/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api/ {
        proxy_pass http://amiexpress_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket support
    location /socket.io/ {
        proxy_pass http://amiexpress_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket timeouts
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;
    }
}
```

**Enable site:**

```bash
sudo ln -s /etc/nginx/sites-available/amiexpress-web /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### SSL Certificate (Let's Encrypt)

```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d yourbbs.com
```

---

## Monitoring & Maintenance

### Log Rotation

Create `/etc/logrotate.d/amiexpress-web`:

```
/var/amiexpress-web/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 0644 your-username your-username
    sharedscripts
    postrotate
        systemctl reload amiexpress-web > /dev/null
    endscript
}
```

### Monitoring Commands

```bash
# Check service status
sudo systemctl status amiexpress-web

# View recent logs
sudo journalctl -u amiexpress-web -n 100 -f

# Check error logs
tail -f /var/amiexpress-web/logs/backend-error.log

# Check backend logs
tail -f /var/amiexpress-web/logs/backend.log

# Monitor connections
ss -tulpn | grep -E ':(2222|2323|3001)'
```

### Database Maintenance

```bash
# Backup database
sqlite3 /var/amiexpress-web/data/amiexpress.db ".backup /var/backups/amiexpress-$(date +%Y%m%d).db"

# Optimize database (run monthly)
sqlite3 /var/amiexpress-web/data/amiexpress.db "VACUUM; ANALYZE;"

# Check database integrity
sqlite3 /var/amiexpress-web/data/amiexpress.db "PRAGMA integrity_check;"
```

### Automated Backups

Create `/usr/local/bin/backup-amiexpress.sh`:

```bash
#!/bin/bash
BACKUP_DIR=/var/backups/amiexpress
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup database
sqlite3 /var/amiexpress-web/data/amiexpress.db ".backup $BACKUP_DIR/db_$DATE.db"

# Backup BBS data (conferences, messages, user files)
tar czf $BACKUP_DIR/data_$DATE.tar.gz /var/amiexpress-web/{Conf*,user.*,*.info,Bulletins}

# Keep only last 30 days of backups
find $BACKUP_DIR -name "*.db" -mtime +30 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete

echo "Backup completed: $DATE"
```

**Add to crontab:**

```bash
sudo chmod +x /usr/local/bin/backup-amiexpress.sh
sudo crontab -e

# Add daily backup at 3 AM
0 3 * * * /usr/local/bin/backup-amiexpress.sh >> /var/log/amiexpress-backup.log 2>&1
```

---

## Performance Optimization

### Node.js Tuning

```bash
# Increase file descriptor limit
ulimit -n 65536

# Add to /etc/security/limits.conf
your-username soft nofile 65536
your-username hard nofile 65536
```

### Database Optimization

In `/var/amiexpress-web/data/amiexpress.db`, run periodically:

```sql
-- Enable Write-Ahead Logging (already enabled by default)
PRAGMA journal_mode=WAL;

-- Increase cache size (default is 2MB, increase to 64MB)
PRAGMA cache_size=-64000;

-- Optimize query planner
PRAGMA optimize;
```

### Systemd Service Tuning

Add to service file under `[Service]`:

```ini
# Increase file descriptor limit
LimitNOFILE=65536

# Memory limits (adjust based on your system)
MemoryMax=2G
CPUQuota=200%
```

---

## Security Hardening

### File Permissions

```bash
# Restrict access to BBS data
sudo chown -R bbs-user:bbs-group /var/amiexpress-web
sudo chmod 750 /var/amiexpress-web
sudo chmod 640 /var/amiexpress-web/bbsConfig.info
sudo chmod 640 /var/amiexpress-web/.env.local
```

### Fail2Ban Integration

Create `/etc/fail2ban/filter.d/amiexpress.conf`:

```ini
[Definition]
failregex = ^.*Failed login attempt from <HOST>.*$
            ^.*Too many failed login attempts from <HOST>.*$
ignoreregex =
```

Create `/etc/fail2ban/jail.d/amiexpress.conf`:

```ini
[amiexpress]
enabled = true
port = 2222,2323,3001
filter = amiexpress
logpath = /var/amiexpress-web/logs/backend.log
maxretry = 5
bantime = 3600
findtime = 600
```

Restart Fail2Ban:

```bash
sudo systemctl restart fail2ban
sudo fail2ban-client status amiexpress
```

---

## Troubleshooting

### Service Won't Start

```bash
# Check service logs
sudo journalctl -u amiexpress-web -n 50

# Check file permissions
ls -la /var/amiexpress-web/

# Verify environment variables
sudo systemctl show amiexpress-web | grep Environment

# Test manual start
cd /path/to/amiexpress-web/web/backend
npm run dev
```

### Database Locked Errors

```bash
# Check for zombie processes
ps aux | grep tsx

# Kill zombie processes
pkill -f tsx

# Restart service
sudo systemctl restart amiexpress-web
```

### Port Already in Use

```bash
# Find process using port 3001
sudo lsof -i :3001

# Kill process if needed
sudo kill -9 <PID>
```

### High Memory Usage

```bash
# Check Node.js memory
ps aux | grep node

# Monitor in real-time
top -p $(pgrep -f "tsx src/index.ts")

# Restart service to clear memory
sudo systemctl restart amiexpress-web
```

---

## Upgrade Procedure

### Minor Updates (Patch Releases)

```bash
cd /path/to/amiexpress-web
git fetch origin
git checkout v1.0.x  # or specific version tag

# Update dependencies
cd web/backend && npm install
cd ../frontend && npm install

# Rebuild frontend
cd web/frontend && npm run build

# Restart service
sudo systemctl restart amiexpress-web
```

### Major Updates

```bash
# Backup everything first
/usr/local/bin/backup-amiexpress.sh

# Stop service
sudo systemctl stop amiexpress-web

# Pull updates
cd /path/to/amiexpress-web
git fetch origin
git checkout v2.0.0

# Review CHANGELOG.md for breaking changes
cat CHANGELOG.md

# Update dependencies
cd web/backend && npm install
cd ../frontend && npm install
cd ../../sdk && npm install

# Run migrations if any
cd web/backend
npm run migrate  # if migration script exists

# Rebuild
cd ../frontend && npm run build
cd ../../sdk && npm run build

# Start service
sudo systemctl start amiexpress-web

# Monitor for errors
sudo journalctl -u amiexpress-web -f
```

---

## Support & Resources

- **Documentation:** `/path/to/amiexpress-web/Documentation/`
- **Issue Tracker:** https://github.com/your-org/amiexpress-web/issues
- **BBS Sysop Guide:** `Documentation/2-Sysop/SYSOP_GUIDE.md`
- **Door Development:** `Documentation/4-Door-Developers/DOOR_DEVELOPMENT.md`
- **Testing Guide:** `Documentation/3-Developers/TESTING.md`

---

## Production Checklist

Before going live:

- [ ] Environment variables configured (`.env.local`)
- [ ] SSL certificates installed and working
- [ ] Firewall rules configured
- [ ] Systemd service enabled and tested
- [ ] Nginx reverse proxy configured (if using)
- [ ] Automated backups scheduled
- [ ] Log rotation configured
- [ ] Monitoring setup (logs, metrics)
- [ ] Fail2Ban configured for security
- [ ] Database optimized and backed up
- [ ] BBS configuration complete (`bbsConfig.info`, `ConfConfig.info`)
- [ ] Doors tested and working
- [ ] Test user accounts created
- [ ] Sysop account configured
- [ ] Welcome screens customized
- [ ] File areas configured
- [ ] Message conferences set up

---

**Status:** Production deployment procedures verified and documented.
**Last Review:** 2026-01-04
