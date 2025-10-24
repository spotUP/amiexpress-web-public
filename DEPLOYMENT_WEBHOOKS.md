# Deployment Webhook Notifications

Get notified in Discord or Slack when your BBS is deployed!

## What You'll Get

Automatic notifications for:
- 🚀 **Deployment Started** - When deployment begins
- ✅ **Backend Deployed** - When backend is live on Render
- ✅ **Frontend Deployed** - When frontend is live on Vercel
- 🎉 **Deployment Complete** - Final success summary

## Setup (2 Minutes)

### Step 1: Get Your Webhook URL

**For Discord:**
1. Open Discord server → Server Settings → Integrations → Webhooks
2. Click "New Webhook"
3. Name it "Deployments" (or whatever you want)
4. Select the channel for notifications
5. Copy the webhook URL

**For Slack:**
1. Go to your workspace → Settings & administration → Manage apps
2. Search for "Incoming Webhooks" → Add to Slack
3. Choose channel → Copy webhook URL

### Step 2: Set Environment Variable

Add this to your shell profile (`~/.bashrc`, `~/.zshrc`, etc.):

```bash
export DEPLOY_WEBHOOK_URL="your-webhook-url-here"
```

**Example:**
```bash
export DEPLOY_WEBHOOK_URL="https://discord.com/api/webhooks/123456/abcdef"
```

Then reload your shell:
```bash
source ~/.bashrc  # or ~/.zshrc
```

### Step 3: Deploy!

Just run your normal deployment command:

```bash
./Scripts/deployment/deploy.sh
```

You'll now get notifications in Discord/Slack! 🎉

## What The Notifications Look Like

### Discord

```
🚀 Deployment Started
Deploying commit `ed68427`

Changes:
fix: Show sysop commands in expert mode too

---

✅ Backend Deployed
Backend successfully deployed to Render

Service: amiexpress-backend
Commit: `ed68427`

---

✅ Frontend Deployed
Frontend successfully deployed to Vercel

URL: https://bbs.uprough.net
Commit: `ed68427`

---

🎉 Deployment Complete
Full-stack deployment successful!

Backend: https://amiexpress-backend.onrender.com
Frontend: https://bbs.uprough.net
Commit: `ed68427` - fix: Show sysop commands in expert mode too
```

### Slack

Same information, formatted for Slack with color-coded attachments.

## Disable Notifications

Simply unset the environment variable:

```bash
unset DEPLOY_WEBHOOK_URL
```

Or comment it out in your shell profile.

## Multiple Webhooks

Want notifications in multiple channels? Create a script wrapper:

```bash
#!/bin/bash
# deploy-notify-all.sh

# Send to Discord
export DEPLOY_WEBHOOK_URL="https://discord.com/api/webhooks/123/abc"
./Scripts/deployment/deploy.sh

# Send to Slack (future deployments)
# export DEPLOY_WEBHOOK_URL="https://hooks.slack.com/services/T00/B00/XXX"
```

## Troubleshooting

### Not receiving notifications?

1. **Check the environment variable:**
   ```bash
   echo $DEPLOY_WEBHOOK_URL
   ```
   Should print your webhook URL.

2. **Test the webhook manually:**
   ```bash
   curl -X POST "$DEPLOY_WEBHOOK_URL" \
     -H "Content-Type: application/json" \
     -d '{"content":"Test notification"}'
   ```

3. **Check webhook is still active:**
   - Discord: Server Settings → Integrations → Webhooks
   - Slack: Check the webhook URL is still valid

### Notifications not formatted correctly?

- Make sure your webhook URL is complete
- Discord URLs start with `https://discord.com/api/webhooks/`
- Slack URLs start with `https://hooks.slack.com/services/`

## Advanced: Customize Notifications

Edit the `send_webhook()` function in `Scripts/deployment/deploy.sh` to customize:
- Colors (Discord embeds)
- Emojis
- Message format
- Additional fields

## Why This Is Useful

- **Monitor deployments remotely** - No need to watch terminal
- **Team coordination** - Everyone knows when updates go live
- **Deployment history** - See what was deployed and when
- **Quick access** - Links to backend and frontend in notifications
- **Status at a glance** - Green = success, color-coded messages

## Security Note

Webhook URLs allow anyone to send messages to your channel. Keep them private:
- Don't commit them to git
- Use environment variables
- Don't share webhook URLs publicly

## Questions?

See the main deployment documentation or webhook guides:
- `WEBHOOK_INTEGRATION.md` - BBS webhook system
- `SYSOP_WEBHOOK_GUIDE.md` - Webhook setup guide
