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
| `DOOR_REPO_ROLE` | unset (built-in default: consumer) | `owner` enables the door-repo curation UI in DOORMAN (including the `S`=Strip action) and serves the Door Repo API from this box's own local catalog/archives. Unset (or `consumer`) fetches the manifest from `DOOR_REPO_URL` instead. |
| `DOOR_REPO_URL` | unset (built-in default: see `Doors/door-manager/repoDataSource.ts`) | Base URL a consumer box fetches the door-repo manifest from. An explicit empty string disables the door repo entirely (DOORMAN falls back to its local catalog only). Ignored in owner mode. |

### Door repo variables must live in .env, not in compose

`DOOR_REPO_ROLE` and `DOOR_REPO_URL` are deliberately NOT listed in the
compose `environment:` block. A bare `- DOOR_REPO_ROLE` entry there resolves
to an EMPTY value whenever the variable is not set in the deploying shell, and
an `environment:` entry SHADOWS `env_file` -- which silently overrode
`.env.local` and took the live door-repo API offline on 2026-08-17 (the
router is gated on the role, so an empty value un-mounts it). Put them in
`/app/amiexpress/.env` (or `.env.local`); both are loaded via `env_file`.

After changing either variable, the container must be RECREATED, not just
restarted, for the new environment to apply:

```
cd /app/amiexpress && docker compose up -d
docker exec amiexpress-bbs sh -c 'echo $DOOR_REPO_ROLE'   # expect: owner
curl -s -o /dev/null -w '%{http_code}\n' \
  http://bbs.uprough.net/api/door-repo/health              # expect: 200
```

### Door repo: owner vs. consumer

Exactly one BBS in the network should run as the **owner** -- the box whose
door catalog is curated and republished for everyone else. That box MUST set
`DOOR_REPO_ROLE=owner` in **its own** `.env.local` (never in the committed
`docker-compose.yml`/`docker-compose.multi-node.yml`, which leave the
variable unset so a copied compose file does not silently make every
deployment believe it owns the catalog).

`docker-compose.yml` and `docker-compose.multi-node.yml` both pass
`DOOR_REPO_ROLE` and `DOOR_REPO_URL` through to the container as bare
entries in their `environment:` blocks (no `=value`). Bare entries forward
the variable's value from the shell/`.env.local` when it is set, and are
simply absent from the container when it is not -- so an unset variable
falls through to the single built-in default defined in
`Doors/door-manager/repoDataSource.ts` (`resolveDoorRepoMode`), rather than
duplicating that URL into the compose files as a second source of truth. TS
doors (including DOORMAN) run in-process in the backend and inherit this
compose environment directly -- there is no separate per-door environment to
configure.

If the owner box forgets to set `DOOR_REPO_ROLE=owner`: on the next deploy it
resolves to consumer mode, starts fetching its OWN manifest back over the
network instead of reading its local catalog, and loses the `S`=Strip
curation action in DOORMAN -- on the one machine whose entire purpose is
curation. There is no automatic detection of this misconfiguration; verify
after every deploy of the owner host that DOORMAN's repo view still shows the
curation actions.

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
automatic redirect for that host. Inside that block, `handle` directives are
mutually exclusive and evaluated in source order (unlike `redir`, which Caddy
sorts ahead of `handle`/`route`/`reverse_proxy` by its default directive
order regardless of where it appears in the file -- a bare `redir` next to a
`reverse_proxy` for a path matcher would fire for every request, including
the door-repo prefix, defeating the exemption). Use `handle` blocks so the
door-repo prefix is matched first and everything else falls through to the
redirect:

```bash
cat > /etc/caddy/Caddyfile << 'EOF'
bbs.uprough.net {
    reverse_proxy localhost:3001
}

http://bbs.uprough.net {
    handle /api/door-repo/* {
        header Cross-Origin-Resource-Policy "cross-origin"
        reverse_proxy localhost:3001
    }
    handle {
        redir https://{host}{uri} permanent
    }
}
EOF

# Validate before reloading (fails closed on a syntax error)
caddy validate --config /etc/caddy/Caddyfile

systemctl reload caddy
```

Verify: `curl -s -o /dev/null -w '%{http_code}' http://bbs.uprough.net/api/door-repo/health`
must return `200`; `curl -s -o /dev/null -w '%{http_code}' http://bbs.uprough.net/health`
must return `301` (`redir ... permanent` is a 301, not 308; every other path
keeps redirecting to HTTPS). Measured against the live host on 2026-08-17:
`/api/door-repo/health` -> `200`, `/health` -> `301`.

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
