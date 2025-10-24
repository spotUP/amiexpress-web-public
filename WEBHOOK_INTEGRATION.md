# Webhook Integration Guide

**📚 For Sysops:** See [SYSOP_WEBHOOK_GUIDE.md](./SYSOP_WEBHOOK_GUIDE.md) for a step-by-step setup guide

**👨‍💻 For Developers:** This document covers technical integration details

---

## Overview
AmiExpress-Web now supports webhooks for Discord and Slack notifications.

## Features
- **Discord** and **Slack** webhook support
- **17 trigger types** for various BBS events
- **Sysop-only** webhook management via `WEBHOOK` command
- **Test functionality** to verify webhook configurations

## Available Triggers

| Trigger | Description |
|---------|-------------|
| `new_upload` | When a user uploads a file |
| `new_message` | When a user posts a message |
| `new_user` | When a new user registers |
| `sysop_paged` | When a user pages the sysop |
| `user_login` | When a user logs in |
| `user_logout` | When a user logs out |
| `file_downloaded` | When a file is downloaded |
| `comment_posted` | When a comment to sysop is posted |
| `node_full` | When all nodes are busy |
| `system_error` | When a critical error occurs |
| `conference_joined` | When a user joins a conference |
| `security_changed` | When user security level changes |
| `door_launched` | When a door program is launched |
| `vote_cast` | When a user votes in voting booth |
| `private_message` | When a private message is sent |
| `user_kicked` | When a user is kicked/banned |
| `mail_scan` | When a user performs mail scan |

## Database Schema

```sql
CREATE TABLE webhooks (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('discord', 'slack')),
  enabled BOOLEAN DEFAULT true,
  triggers TEXT[] DEFAULT '{}',
  created TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
```

## Usage

### Sysop Commands

```
WEBHOOK          - Display webhook management menu

Webhook Menu Options:
  [L] List Webhooks       - Show all configured webhooks
  [A] Add Webhook         - Create a new webhook
  [E] Edit Webhook        - Enable/disable a webhook
  [D] Delete Webhook      - Remove a webhook
  [T] Test Webhook        - Send a test notification
  [S] Show Triggers       - List all available triggers
```

### Adding a Webhook

1. Run `WEBHOOK` command
2. Select `[A] Add Webhook`
3. Enter webhook name (e.g., "Discord Notifications")
4. Enter webhook URL (from Discord/Slack)
5. Select type (`DISCORD` or `SLACK`)
6. Enter triggers (comma-separated or `ALL`)

### Getting Webhook URLs

**Discord:**
1. Server Settings → Integrations → Webhooks
2. Create webhook → Copy URL

**Slack:**
1. Workspace Settings → Manage Apps
2. Search "Incoming Webhooks" → Add to Slack
3. Choose channel → Copy webhook URL

## Integration Points

### Current Integrations

| Event | File | Line | Status |
|-------|------|------|--------|
| New User | `new-user.handler.ts` | 405-416 | ✅ Integrated |
| User Login | `auth.handler.ts` | TBD | ⏳ TODO |
| New Message | `message-commands.handler.ts` | TBD | ⏳ TODO |
| File Upload | `file.handler.ts` | TBD | ⏳ TODO |
| File Download | `file.handler.ts` | TBD | ⏳ TODO |
| Sysop Paged | `chat.handler.ts` | TBD | ⏳ TODO |
| Comment Posted | `system-commands.handler.ts` | TBD | ⏳ TODO |

### Adding Webhook Triggers

To add a webhook trigger to an event:

```typescript
import { webhookService, WebhookTrigger } from '../services/webhook.service';

// After the event occurs:
try {
  await webhookService.sendWebhook(WebhookTrigger.NEW_MESSAGE, {
    username: session.user.username,
    subject: messageSubject,
    conference: conferenceNamem,
    messageBase: messageBaseName
  });
} catch (error) {
  console.error('[Webhook] Error sending webhook:', error);
}
```

## Testing

### Local Testing

1. Create a test webhook URL (Discord/Slack)
2. Add webhook via `WEBHOOK` command
3. Use `[T] Test Webhook` option
4. Check Discord/Slack channel for test notification

### Production Testing

1. Configure real webhook URL
2. Perform actual BBS actions (register, post message, etc.)
3. Verify notifications appear

## Architecture

```
webhooks table (database.ts)
       ↓
webhook CRUD methods (database.ts)
       ↓
WebhookService (webhook.service.ts)
       ↓
Event Handlers (various)
       ↓
Discord/Slack APIs
```

## Security

- **Sysop-only access** - Only users with security level 255 can manage webhooks
- **Permission checks** - All webhook commands check `PermissionsUtil.isSysop()`
- **Error handling** - Webhook failures don't crash the BBS
- **Async execution** - Webhooks send in background, don't block user actions

## Future Enhancements

- [ ] Webhook templates (customize message format)
- [ ] Webhook rate limiting
- [ ] Webhook retry logic
- [ ] More detailed event data
- [ ] Webhook activity logs
- [ ] Multiple webhooks per trigger
- [ ] Conditional webhooks (filters)

## Troubleshooting

**Webhook not sending:**
- Check webhook is enabled (use `[E] Edit Webhook`)
- Verify trigger is in webhook's trigger list (use `[L] List Webhooks`)
- Test webhook URL (use `[T] Test Webhook`)
- Check backend console for errors

**Discord/Slack not receiving:**
- Verify webhook URL is correct
- Check channel permissions
- Test URL with curl:
  ```bash
  curl -X POST -H 'Content-Type: application/json' \
    -d '{"content":"Test"}' YOUR_WEBHOOK_URL
  ```

**Permission denied:**
- Only sysops (security level 255) can manage webhooks
- Use `S` command to check your security level

## Files Created/Modified

### New Files:
- `backend/src/services/webhook.service.ts` - Webhook service
- `backend/src/handlers/webhook-commands.handler.ts` - WEBHOOK command
- `WEBHOOK_INTEGRATION.md` - This documentation

### Modified Files:
- `backend/src/database.ts` - Added webhooks table and CRUD methods
- `backend/src/handlers/command.handler.ts` - Added WEBHOOK command routing
- `backend/src/handlers/new-user.handler.ts` - Added new user webhook trigger
- `CLAUDE.md` - Added main menu update rule

## Support

For issues or feature requests:
- Check backend logs for webhook errors
- Verify database has `webhooks` table
- Test webhook URL externally
- Report issues with webhook details (not including URLs)
