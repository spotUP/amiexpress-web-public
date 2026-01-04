# AmiExpress-Web Production Deployment Guide

**Last Updated:** 2026-01-04

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Security Configuration](#security-configuration)
3. [SSL/TLS Setup](#ssltls-setup)
4. [Docker Deployment](#docker-deployment)
5. [Environment Variables](#environment-variables)
6. [Backup & Restore](#backup--restore)
7. [Monitoring & Logging](#monitoring--logging)
8. [Performance Tuning](#performance-tuning)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

- Docker 20.10+ and Docker Compose 2.0+
- 2GB+ RAM (4GB+ recommended for multi-node)
- 10GB+ disk space
- Domain name (for SSL/TLS)
- Ports 80, 443 (HTTP/HTTPS), 2323 (Telnet), 2222 (SSH)

---

## Security Configuration

### 1. Generate Secrets

**NEVER use default secrets in production!**

```bash
# Generate strong secrets
export JWT_SECRET=$(openssl rand -base64 64)
export SESSION_SECRET=$(openssl rand -base64 64)
export DATABASE_ENCRYPTION_KEY=$(openssl rand -base64 32)

# Save to .env.production (NEVER commit to git!)
cat > .env.production <<EOF
JWT_SECRET=$JWT_SECRET
SESSION_SECRET=$SESSION_SECRET
DATABASE_ENCRYPTION_KEY=$DATABASE_ENCRYPTION_KEY
NODE_ENV=production
EOF

# Secure the file
chmod 600 .env.production
```

### 2. Security Headers

Create `nginx.conf` for reverse proxy with security headers:

```nginx
# Rate limiting
limit_req_zone $binary_remote_addr zone=bbs_limit:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=30r/s;
limit_conn_zone $binary_remote_addr zone=conn_limit:10m;

server {
    listen 443 ssl http2;
    server_name yourbbs.example.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/yourbbs.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourbbs.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' wss://yourbbs.example.com;" always;

    # Rate Limiting
    limit_req zone=bbs_limit burst=20 nodelay;
    limit_conn conn_limit 10;

    # Max upload size
    client_max_body_size 100M;

    # Proxy settings
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # WebSocket support
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    # API rate limiting
    location /api/ {
        limit_req zone=api_limit burst=50 nodelay;
        proxy_pass http://localhost:3001/api/;
    }

    # Static assets caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://localhost:3001;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name yourbbs.example.com;
    return 301 https://$server_name$request_uri;
}
```

---

## SSL/TLS Setup

### Using Let's Encrypt (Recommended)

```bash
# Install certbot
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d yourbbs.example.com

# Auto-renewal (certbot sets this up automatically)
sudo certbot renew --dry-run
```

### Using Custom Certificates

```bash
# Place your certificates
sudo cp fullchain.pem /etc/ssl/certs/yourbbs.crt
sudo cp privkey.pem /etc/ssl/private/yourbbs.key
sudo chmod 600 /etc/ssl/private/yourbbs.key

# Update nginx.conf paths accordingly
```

---

## Docker Deployment

### Production docker-compose.yml

Create `docker-compose.production.yml`:

```yaml
version: '3.8'

services:
  bbs:
    image: yourusername/amiexpress-web:latest
    container_name: amiexpress-production
    restart: always

    ports:
      - "127.0.0.1:3001:3001"  # Only localhost (nginx will proxy)
      - "2323:2323"             # Telnet (external)
      - "2222:2222"             # SSH (external)

    volumes:
      - bbs-data:/app/data
      - bbs-db:/app/data/db
      - bbs-logs:/app/logs

    environment:
      - NODE_ENV=production
      - PORT=3001

    env_file:
      - .env.production

    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2G
        reservations:
          cpus: '1.0'
          memory: 1G

    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s

    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "5"

    networks:
      - bbs-network

  # Nginx reverse proxy
  nginx:
    image: nginx:alpine
    container_name: amiexpress-nginx
    restart: always

    ports:
      - "80:80"
      - "443:443"

    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
      - nginx-cache:/var/cache/nginx

    depends_on:
      - bbs

    networks:
      - bbs-network

    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "5"

volumes:
  bbs-data:
    driver: local
  bbs-db:
    driver: local
  bbs-logs:
    driver: local
  nginx-cache:
    driver: local

networks:
  bbs-network:
    driver: bridge
```

### Deploy

```bash
# Build image
docker build -t yourusername/amiexpress-web:latest .

# Start services
docker-compose -f docker-compose.production.yml up -d

# View logs
docker-compose -f docker-compose.production.yml logs -f

# Stop services
docker-compose -f docker-compose.production.yml down
```

---

## Environment Variables

### Required Variables

```bash
# .env.production (NEVER commit to version control!)

# Security (REQUIRED - generate with openssl rand -base64 64)
JWT_SECRET=your-super-secret-jwt-key-here
SESSION_SECRET=your-super-secret-session-key-here

# Database
DATABASE_DIR=/app/data/db
DATABASE_FILE=amiexpress.db

# BBS Configuration
BBS_DATA_DIR=/app/data/bbs
BBS_NAME="Your BBS Name"
SYSOP_NAME="Your Name"
NODE_ID=0

# Server
NODE_ENV=production
PORT=3001
BACKEND_PORT=3001

# Optional: Logging
LOG_LEVEL=info
XIM_DEBUG=0
DEBUG=false

# Optional: Email notifications (if configured)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=youremail@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@yourbbs.com

# Optional: SSH
SSH_HOST_KEY_PATH=/app/data/ssh/host_key
```

---

## Backup & Restore

### Automated Backup Script

Create `/usr/local/bin/backup-bbs.sh`:

```bash
#!/bin/bash
# AmiExpress-Web Backup Script

BACKUP_DIR="/backups/amiexpress"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="amiexpress_backup_$DATE"

mkdir -p "$BACKUP_DIR"

# Stop BBS (optional, for consistency)
# docker-compose -f /path/to/docker-compose.production.yml stop bbs

# Backup database
docker run --rm \
  -v amiexpress-web_bbs-db:/data \
  -v "$BACKUP_DIR":/backup \
  alpine tar czf "/backup/${BACKUP_NAME}_db.tar.gz" -C /data .

# Backup BBS data
docker run --rm \
  -v amiexpress-web_bbs-data:/data \
  -v "$BACKUP_DIR":/backup \
  alpine tar czf "/backup/${BACKUP_NAME}_data.tar.gz" -C /data .

# Restart BBS (if stopped)
# docker-compose -f /path/to/docker-compose.production.yml start bbs

# Keep only last 30 days of backups
find "$BACKUP_DIR" -name "amiexpress_backup_*.tar.gz" -mtime +30 -delete

echo "Backup complete: $BACKUP_NAME"
```

### Schedule Backups

```bash
# Make executable
chmod +x /usr/local/bin/backup-bbs.sh

# Add to crontab (daily at 2 AM)
crontab -e

# Add this line:
0 2 * * * /usr/local/bin/backup-bbs.sh >> /var/log/bbs-backup.log 2>&1
```

### Restore from Backup

```bash
#!/bin/bash
# Restore from backup

BACKUP_FILE=$1

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: $0 <backup-file.tar.gz>"
    exit 1
fi

# Stop BBS
docker-compose -f /path/to/docker-compose.production.yml stop bbs

# Restore database
if [[ $BACKUP_FILE == *"_db.tar.gz" ]]; then
    docker run --rm \
      -v amiexpress-web_bbs-db:/data \
      -v "$(dirname $BACKUP_FILE)":/backup \
      alpine sh -c "rm -rf /data/* && tar xzf /backup/$(basename $BACKUP_FILE) -C /data"
fi

# Restore data
if [[ $BACKUP_FILE == *"_data.tar.gz" ]]; then
    docker run --rm \
      -v amiexpress-web_bbs-data:/data \
      -v "$(dirname $BACKUP_FILE)":/backup \
      alpine sh -c "rm -rf /data/* && tar xzf /backup/$(basename $BACKUP_FILE) -C /data"
fi

# Restart BBS
docker-compose -f /path/to/docker-compose.production.yml start bbs

echo "Restore complete!"
```

---

## Monitoring & Logging

### Application Logs

```bash
# View live logs
docker-compose -f docker-compose.production.yml logs -f bbs

# View last 100 lines
docker-compose -f docker-compose.production.yml logs --tail=100 bbs

# Export logs
docker logs amiexpress-production > bbs-logs-$(date +%Y%m%d).log
```

### Health Monitoring

```bash
# Check container health
docker ps
docker inspect amiexpress-production | grep -A 5 Health

# Check resource usage
docker stats amiexpress-production
```

### External Monitoring (Optional)

- **UptimeRobot**: Free uptime monitoring
- **Prometheus + Grafana**: Advanced metrics
- **CloudWatch/DataDog**: Enterprise monitoring

---

## Performance Tuning

### Node.js Optimization

Add to `docker-compose.production.yml`:

```yaml
environment:
  - NODE_ENV=production
  - NODE_OPTIONS="--max-old-space-size=1536"  # 1.5GB heap
```

### Database Optimization

```bash
# Inside container
docker exec -it amiexpress-production sh

# Optimize SQLite
cd /app/web/backend
npx tsx -e "
const db = require('better-sqlite3')('/app/data/db/amiexpress.db');
db.pragma('optimize');
db.pragma('vacuum');
db.close();
"
```

### Resource Limits

Already configured in `docker-compose.production.yml`:
- CPU: 1-2 cores
- Memory: 1-2GB
- Disk I/O: Consider SSD for database

---

## Troubleshooting

### Common Issues

#### 1. Container won't start

```bash
# Check logs
docker logs amiexpress-production

# Check if ports are in use
sudo netstat -tlnp | grep -E '(3001|2323|2222)'

# Restart container
docker restart amiexpress-production
```

#### 2. Database locked errors

```bash
# Check for zombie connections
docker exec amiexpress-production sh -c "lsof /app/data/db/amiexpress.db"

# Restart if needed
docker restart amiexpress-production
```

#### 3. Out of memory

```bash
# Check memory usage
docker stats amiexpress-production

# Increase memory limit in docker-compose.production.yml
```

#### 4. SSL certificate renewal failed

```bash
# Manual renewal
sudo certbot renew --force-renewal

# Check nginx config
sudo nginx -t
sudo systemctl reload nginx
```

### Emergency Procedures

#### Rollback Deployment

```bash
# Restore from backup
./restore-backup.sh /backups/amiexpress/amiexpress_backup_YYYYMMDD_HHMMSS_db.tar.gz
./restore-backup.sh /backups/amiexpress/amiexpress_backup_YYYYMMDD_HHMMSS_data.tar.gz

# Use previous image
docker-compose -f docker-compose.production.yml down
docker pull yourusername/amiexpress-web:previous-tag
docker-compose -f docker-compose.production.yml up -d
```

#### Database Corruption

```bash
# Restore from backup
./restore-backup.sh /backups/amiexpress/latest_db_backup.tar.gz

# If no backup, try to recover
docker exec -it amiexpress-production sh
cd /app/web/backend
sqlite3 /app/data/db/amiexpress.db ".recover" | sqlite3 /app/data/db/recovered.db
mv /app/data/db/amiexpress.db /app/data/db/amiexpress.db.corrupt
mv /app/data/db/recovered.db /app/data/db/amiexpress.db
```

---

## Security Checklist

**IMPORTANT:** Review `SECURITY_AUDIT.md` for detailed security analysis and remediation steps.

**Critical Security Fixes (MUST complete before production):**
- [ ] Fixed SQL injection vulnerability (file-maintenance.handler.ts:701) - ✅ FIXED
- [ ] Configured CORS to restrict allowed origins - ✅ FIXED
- [ ] Set ALLOWED_ORIGIN environment variable in production
- [ ] Implemented CSRF protection for REST API endpoints
- [ ] Changed all default secrets (JWT_SECRET, SESSION_SECRET - use 64+ byte values)
- [ ] Added rate limiting middleware
- [ ] Configured security headers (via helmet or nginx)

**Additional Security Requirements:**
- [ ] SSL/TLS certificate installed and auto-renewal configured
- [ ] Nginx reverse proxy with security headers
- [ ] Firewall configured (UFW/iptables)
- [ ] Backups automated and tested
- [ ] Monitoring/alerting configured
- [ ] Docker containers run as non-root
- [ ] Resource limits configured
- [ ] Logs rotation configured
- [ ] Regular security updates scheduled
- [ ] Admin interface protected (strong passwords, 2FA if available)

---

## Support

- **Documentation**: See `Documentation/` folder
- **Issues**: GitHub issues or contact sysop
- **Security**: Report security issues privately to your@email.com

---

**Ready for Production!** Follow this guide carefully and your BBS will be secure, reliable, and performant.
