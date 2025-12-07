# Railway.app Deployment Guide

Deploy AmiExpress BBS to Railway.app in one click!

## Why Railway.app?

Railway.app is the **easiest and most cost-effective** way to deploy AmiExpress BBS:

- **One-Click Deploy**: Deploy directly from GitHub
- **Free Tier**: $5/month in free credits (hobby tier)
- **Persistent Storage**: Built-in volume support for SQLite database
- **WebSocket Support**: Native WebSocket support (critical for BBS)
- **Automatic HTTPS**: SSL certificates included
- **Simple Pricing**: Pay only for what you use ($0.000231/GB-hour for storage)
- **No Credit Card Required**: Free trial available

**Estimated Monthly Cost**: $3-8/month for a small to medium BBS

---

## Quick Deploy (Recommended)

### Option 1: One-Click Deploy Button

Click this button to deploy to Railway:

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/amiexpress)

**Steps:**
1. Click the "Deploy on Railway" button
2. Sign in with GitHub
3. Configure environment variables (see below)
4. Click "Deploy"
5. Wait 3-5 minutes for deployment to complete
6. Access your BBS at the generated Railway URL

---

### Option 2: Manual Railway Deployment

If the one-click button isn't available yet, follow these steps:

#### 1. Create Railway Account

1. Go to [railway.app](https://railway.app)
2. Click "Start a New Project"
3. Sign in with GitHub

#### 2. Create New Project

1. Click "New Project"
2. Select "Deploy from GitHub repo"
3. Choose your AmiExpress fork/repo
4. Railway will detect the configuration automatically

#### 3. Add Persistent Volume

**CRITICAL**: Add a volume for the database

1. In your Railway project, click "Settings"
2. Navigate to "Volumes"
3. Click "Add Volume"
4. Configure:
   - **Mount Path**: `/app/data`
   - **Size**: 1GB (increase as needed)
5. Click "Add Volume"

#### 4. Configure Environment Variables

Click "Variables" and add these:

**Required Variables:**

```bash
# JWT Secret (generate with: openssl rand -base64 32)
JWT_SECRET=your_generated_secret_here

# BBS Configuration
BBS_NAME=Your BBS Name
SYSOP_NAME=Your Name
BBS_LOCATION=Your City, State

# Database
DATABASE_DIR=/app/data
DATABASE_FILE=amiexpress.db

# Node Environment
NODE_ENV=production
```

**Optional Variables:**

```bash
# Ports (Railway assigns PORT automatically, serves all frontends)
BACKEND_PORT=$PORT

# Telnet/SSH (if you want to enable)
TELNET_PORT=2323
SSH_PORT=2222

# SMTP (for email features)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your_email@example.com
SMTP_PASS=your_smtp_password
SMTP_FROM=noreply@yourbbs.com
```

#### 5. Deploy

1. Railway automatically deploys on environment variable save
2. Watch the build logs in the "Deployments" tab
3. Wait for "Deployment successful" message
4. Click the generated URL to access your BBS

---

## Post-Deployment Setup

### 1. Create Admin Account

After first deployment, you need to create your admin account:

**Option A: Using Railway CLI** (Recommended)

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login to Railway
railway login

# Link to your project
railway link

# Run setup command
railway run npm run --prefix web/backend setup-admin

# Follow prompts to create admin user
```

**Option B: Using Database Shell**

1. Go to Railway dashboard
2. Click "Connect" → "Database Shell"
3. Run admin creation script (provided in deployment docs)

### 2. Configure BBS Settings

1. Access your BBS at the Railway URL
2. Login with admin credentials
3. Navigate to Admin Panel
4. Configure:
   - BBS name and description
   - Conferences and file areas
   - User registration settings
   - Security levels

### 3. Import Existing BBS Data (Optional)

If migrating from Amiga:

1. Login as admin
2. Go to Admin → Import/Export
3. Upload your Amiga BBS archive (.lha, .lzx, .zip)
4. Follow import wizard

---

## Railway-Specific Configuration

### Environment Variables

Railway automatically provides:
- `PORT` - The port your app should listen on
- `RAILWAY_ENVIRONMENT` - Current environment (production, staging, etc.)
- `RAILWAY_GIT_COMMIT_SHA` - Current git commit
- `RAILWAY_PUBLIC_DOMAIN` - Your public URL

AmiExpress automatically detects Railway and configures itself.

### Persistent Storage

Your database is stored in the mounted volume at `/app/data`. This persists across deployments.

**Important**:
- Volumes are not backed up automatically
- Use the export feature to create periodic backups
- Download backups to local storage

### Networking

Railway provides:
- **HTTPS**: Automatic SSL certificates
- **WebSocket**: Full WebSocket support (wss://)
- **Custom Domains**: Add your own domain in Settings → Networking

**Note**: Telnet and SSH are not directly supported (Railway is HTTP/WebSocket only). Use the web terminal for user access.

### Scaling

Railway supports:
- **Vertical Scaling**: Increase CPU/RAM in Settings → Resources
- **Horizontal Scaling**: Multiple replicas (requires database migration to PostgreSQL)

For most BBSs, a single instance is sufficient.

---

## Cost Estimation

Railway pricing is usage-based:

**Free Tier:**
- $5/month in credits
- No credit card required
- Perfect for testing

**Hobby Tier ($5/month + usage):**
- Ideal for small to medium BBSs
- Typical costs:
  - Compute: ~$2-4/month (for 24/7 operation)
  - Storage: ~$1-2/month (1-5GB database)
  - Bandwidth: Usually included
- **Total**: $3-8/month

**Pro Tier ($20/month + usage):**
- For larger BBSs with high traffic
- Higher resource limits
- Priority support

**Cost Optimization Tips:**
1. Start with Hobby tier
2. Monitor usage in Railway dashboard
3. Optimize database size (clean old messages/files)
4. Use export feature to archive old data

---

## Troubleshooting

### Deployment Fails

**Check build logs:**
1. Go to Deployments tab
2. Click the failed deployment
3. Review logs for errors

**Common issues:**
- Missing environment variables → Add JWT_SECRET
- Build timeout → Contact Railway support
- Out of memory → Upgrade to larger plan

### Database Not Persisting

**Verify volume is mounted:**
1. Settings → Volumes
2. Ensure mount path is `/app/data`
3. Redeploy if needed

### WebSocket Connection Fails

**Check CORS settings:**
- Railway automatically sets RAILWAY_PUBLIC_DOMAIN
- AmiExpress uses this for CORS
- If custom domain, add to CORS_ORIGINS variable

### Can't Access Admin Panel

**Create admin user:**
```bash
railway run npm run --prefix web/backend setup-admin
```

---

## Backup and Recovery

### Create Backup

**Option 1: Using Export Feature**
1. Login as admin
2. Admin → Import/Export → Export
3. Download archive

**Option 2: Using Railway CLI**
```bash
# Download database file
railway run cat /app/data/amiexpress.db > backup-$(date +%Y%m%d).db
```

### Restore from Backup

1. Stop service (Settings → Pause)
2. Use Railway file upload to restore database
3. Resume service

---

## Advanced Configuration

### Custom Domain

1. Go to Settings → Networking
2. Click "Add Custom Domain"
3. Enter your domain (e.g., bbs.yourdomain.com)
4. Add CNAME record to your DNS:
   ```
   CNAME bbs -> your-project.railway.app
   ```
5. Wait for DNS propagation (5-30 minutes)

### Multiple Environments

Railway supports staging/production environments:

1. Create new environment: Settings → Environments
2. Duplicate variables from production
3. Deploy to staging first, then promote to production

### Monitoring

Railway provides:
- **Metrics**: CPU, RAM, Network usage
- **Logs**: Real-time application logs
- **Alerts**: Set up webhooks for deployment events

---

## Migration from Other Hosts

### From Render.com

1. Export your database from Render
2. Deploy to Railway (follow steps above)
3. Upload database using Railway CLI
4. Update DNS to point to Railway

### From Vercel

Vercel doesn't support WebSocket, so Railway is a better choice.

1. Deploy backend to Railway
2. Keep frontend on Vercel OR move both to Railway
3. Update frontend BACKEND_URL to Railway domain

### From Self-Hosted

1. Export your BBS data using Admin → Export
2. Deploy to Railway
3. Import data using Admin → Import
4. Update DNS

---

## Railway CLI Reference

### Installation
```bash
npm i -g @railway/cli
```

### Common Commands
```bash
# Login
railway login

# Link project
railway link

# View logs
railway logs

# Run command in Railway environment
railway run [command]

# Open project in browser
railway open

# Environment variables
railway variables
```

---

## Support

**Railway Support:**
- Railway Docs: https://docs.railway.app
- Railway Discord: https://discord.gg/railway
- Railway Help: help@railway.app

**AmiExpress Support:**
- Documentation: `/Documentation/` directory
- GitHub Issues: [your-repo]/issues
- BBS Forums: Login and post in Sysop conference

---

## Comparison with Other Hosts

| Feature | Railway | Render | Fly.io | Vercel |
|---------|---------|--------|--------|--------|
| **One-Click Deploy** | ✓ | ✓ | - | ✓ |
| **WebSocket Support** | ✓ | ✓ | ✓ | ✗ |
| **Persistent Storage** | ✓ | ✓ ($7/mo) | ✓ | ✗ |
| **Free Tier** | $5 credit | Limited | Limited | Limited |
| **Pricing** | $3-8/mo | $7+/mo | $5+/mo | Not suitable |
| **Setup Difficulty** | Easy | Easy | Medium | Not suitable |
| **Best For** | **Small-Medium BBS** | Medium-Large | Advanced users | Static sites only |

**Winner for BBS**: Railway.app ⭐

---

## Next Steps

After deployment:

1. ✓ BBS is live on Railway
2. ⏭ Create admin account
3. ⏭ Configure BBS settings
4. ⏭ Customize screens and bulletins
5. ⏭ Install doors and games
6. ⏭ Set up daily backups
7. ⏭ Add custom domain (optional)
8. ⏭ Invite users and start building your community!

---

**Ready to deploy? Click the button:**

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/amiexpress)

Or follow the manual steps above. Questions? See the troubleshooting section or reach out for support!
