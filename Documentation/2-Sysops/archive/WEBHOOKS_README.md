# Webhooks for AmiExpress BBS

Get real-time notifications from your BBS in Discord or Slack!

## What Can You Monitor?

- 👤 New user registrations
- 🔓 User logins
- 💬 New messages and posts
- 📁 File uploads and downloads
- 🔔 Sysop page requests
- 💌 Comments to sysop
- ⚠️ System errors
- 🚪 Conference joins
- 🚀 Door launches
- ...and more!

## Documentation

### 🎯 I'm a Sysop - How Do I Set This Up?

**→ Read: [SYSOP_WEBHOOK_GUIDE.md](./SYSOP_WEBHOOK_GUIDE.md)**

Step-by-step guide with screenshots and examples. No technical knowledge required!

**Quick Start:**
1. Get a webhook URL from Discord or Slack (5 minutes)
2. Login to BBS and run `WEBHOOK` command
3. Add your webhook URL
4. Choose which events to monitor
5. Done! Get instant notifications

---

### 💻 I'm a Developer - How Do I Integrate This?

**→ Read: [WEBHOOK_INTEGRATION.md](./WEBHOOK_INTEGRATION.md)**

Technical documentation covering:
- Architecture and design
- Database schema
- API reference
- Adding new triggers
- Testing and debugging

**Quick Integration:**
```typescript
import { webhookService, WebhookTrigger } from './services/webhook.service';

await webhookService.sendWebhook(WebhookTrigger.YOUR_EVENT, {
  username: 'example',
  ...moreData
});
```

---

## Features

✅ **Discord & Slack Support**
- Beautiful formatted messages with colors and emojis
- Rich embeds with structured data
- Automatic timestamping

✅ **17 Event Triggers**
- New uploads, messages, users
- System alerts and errors
- User activity monitoring

✅ **Sysop Management**
- Easy-to-use `WEBHOOK` command
- List, add, edit, delete webhooks
- Test webhooks before going live
- Enable/disable without deleting

✅ **Secure & Reliable**
- Sysop-only access (security level 255)
- Async delivery (doesn't block BBS)
- Graceful error handling
- No impact on BBS performance

---

## Example Notifications

### Discord

```
📁 New File Upload
JohnDoe uploaded a file

┌─ Filename: awesome_demo.zip
├─ Size: 2.5 MB
└─ Conference: Main Files
```

### Slack

```
:file_folder: New File Upload

User:        JohnDoe
Filename:    awesome_demo.zip
Size:        2.5 MB
Conference:  Main Files
```

---

## Quick Command Reference

```
WEBHOOK          Open webhook management menu

[L] List         Show all configured webhooks
[A] Add          Create a new webhook
[E] Edit         Enable/disable a webhook
[D] Delete       Remove a webhook
[T] Test         Send test notification
[S] Triggers     Show available event types
```

---

## Common Use Cases

### 📊 Monitor BBS Activity
Get notified when users are active so you can join conversations in real-time.

### 🚨 Sysop Alerts
Immediate notifications when someone pages you or when errors occur.

### 📈 Track Growth
See when new users register and welcome them personally.

### 🔒 Security Monitoring
Track logins, security level changes, and user kicks.

### 📁 Content Management
Know immediately when new files or messages are posted.

---

## Requirements

- Sysop access (security level 255)
- Discord or Slack account
- 5 minutes for setup

---

## Support

- **Sysop Guide:** [SYSOP_WEBHOOK_GUIDE.md](./SYSOP_WEBHOOK_GUIDE.md)
- **Developer Docs:** [WEBHOOK_INTEGRATION.md](./WEBHOOK_INTEGRATION.md)
- **Troubleshooting:** See the guides above

---

## Version

**Current:** v1.0 (2025-10-24)
- Discord webhook support
- Slack webhook support
- 17 trigger types
- Sysop management interface
- Integrated with 5 key events

---

**Ready to get started?** Head over to [SYSOP_WEBHOOK_GUIDE.md](./SYSOP_WEBHOOK_GUIDE.md) for the complete walkthrough!
