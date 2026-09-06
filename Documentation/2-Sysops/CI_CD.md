# CI/CD Pipeline Documentation

**Last Updated**: 2026-02-06

## Overview

AmiExpress-Web uses GitHub Actions for automatic deployment to Hetzner VPS.

## Workflow

**File**: `.github/workflows/deploy-hetzner.yml`

**Triggers**:
- Push to `main` branch (automatic)
- Manual trigger via GitHub Actions UI (`workflow_dispatch`)

**Steps**:
1. SSH into Hetzner server
2. Pull latest code from GitHub
3. Rebuild and restart Docker container

**Deploy Time**: 3-5 minutes

## GitHub Secrets Required

| Secret | Description |
|--------|-------------|
| `HETZNER_HOST` | Server IP address (203.0.113.10) |
| `HETZNER_SSH_KEY` | Private SSH key (no passphrase) |

## Setup Instructions

### 1. Generate Deploy Key

```bash
# On your local machine
ssh-keygen -t ed25519 -f ~/.ssh/hetzner_deploy -N "" -C "github-deploy"

# Add public key to server
ssh root@203.0.113.10 "echo '$(cat ~/.ssh/hetzner_deploy.pub)' >> ~/.ssh/authorized_keys"
```

### 2. Add GitHub Secrets

1. Go to: https://github.com/YOUR-ORG/amiexpress-web/settings/secrets/actions
2. Add `HETZNER_HOST`: `203.0.113.10`
3. Add `HETZNER_SSH_KEY`: contents of `~/.ssh/hetzner_deploy`

### 3. Verify

Push a commit to `main` and check:
https://github.com/YOUR-ORG/amiexpress-web/actions

## Workflow Status

- **Green checkmark** = Deploy successful
- **Red X** = Deploy failed (check logs)
- **Yellow circle** = Deploy in progress

## Manual Deployment

If needed, deploy manually:

```bash
ssh root@203.0.113.10
cd /app/amiexpress
git pull origin main
docker compose up -d --build
```

## Troubleshooting

### SSH Authentication Failed

```
ssh: unable to authenticate
```

- Ensure SSH key has no passphrase
- Verify public key is in server's `~/.ssh/authorized_keys`
- Check `HETZNER_SSH_KEY` secret is the private key (not public)

### Deploy Script Failed

Check server logs:
```bash
ssh root@203.0.113.10 "docker compose -f /app/amiexpress/docker-compose.yml logs --tail=50"
```

## See Also

- [DEPLOYMENT.md](./DEPLOYMENT.md) - Full deployment guide
- [deploy/README.md](/deploy/README.md) - Server setup scripts
