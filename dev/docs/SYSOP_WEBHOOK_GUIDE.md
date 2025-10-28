# Sysop Guide: Setting Up Webhooks

## What Are Webhooks?

Webhooks allow your BBS to send automatic notifications to Discord or Slack whenever important events happen. Think of them as automated messengers that tell you:

- When new users register
- When users log in
- When messages are posted
- When files are uploaded
- When someone pages you

Instead of constantly checking your BBS, you get instant notifications in Discord or Slack!

---

## Part 1: Getting Your Webhook URL

### For Discord:

**Step 1:** Open your Discord server where you want notifications

**Step 2:** Click the server name → Server Settings

**Step 3:** Click "Integrations" in the left sidebar

**Step 4:** Click "Webhooks" → "New Webhook"

**Step 5:** Configure your webhook:
- **Name:** AmiExpress BBS (or whatever you prefer)
- **Channel:** Select the channel where notifications should appear
- Click "Copy Webhook URL"

**Step 6:** Save the webhook URL somewhere safe - you'll need it in a moment!

**Example Discord URL:**
```
https://discord.com/api/webhooks/1234567890/AbCdEfGhIjKlMnOpQrStUvWxYz
```

### For Slack:

**Step 1:** Go to your Slack workspace

**Step 2:** Click workspace name → Settings & administration → Manage apps

**Step 3:** Search for "Incoming Webhooks" → Add to Slack

**Step 4:** Choose the channel where you want notifications

**Step 5:** Click "Add Incoming Webhooks Integration"

**Step 6:** Copy the Webhook URL

**Step 7:** (Optional) Customize the name and icon

**Example Slack URL:**
```
https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXX
```

---

## Part 2: Adding the Webhook to Your BBS

**Step 1:** Login to your BBS as sysop (you need security level 255)

**Step 2:** At the main menu, type:
```
WEBHOOK
```

**Step 3:** You'll see the Webhook Management menu:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
           WEBHOOK MANAGEMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[L] List Webhooks
[A] Add Webhook
[E] Edit Webhook
[D] Delete Webhook
[T] Test Webhook
[S] Show Triggers

Select option <CR>=QUIT:
```

**Step 4:** Type `A` to add a new webhook

**Step 5:** Enter the information when prompted:

```
Webhook Name: Discord Notifications
Webhook URL: [paste your Discord/Slack URL here]
Type [DISCORD/SLACK]: DISCORD
Triggers (comma-separated, or ALL): ALL
```

**Step 6:** Done! You'll see:
```
Webhook created successfully! ID: 1
Press any key to continue...
```

---

## Part 3: Understanding Triggers

Triggers are the events that activate your webhook. When you set up a webhook, you can choose which events to monitor.

### Available Triggers:

| Trigger | When It Fires |
|---------|---------------|
| `new_upload` | User uploads a file |
| `new_message` | User posts a message |
| `new_user` | New user registers |
| `sysop_paged` | User pages the sysop |
| `user_login` | User logs in |
| `user_logout` | User logs out |
| `file_downloaded` | User downloads a file |
| `comment_posted` | Comment to sysop posted |
| `node_full` | All BBS nodes are busy |
| `system_error` | Critical system error |
| `conference_joined` | User joins a conference |
| `security_changed` | User security level changes |
| `door_launched` | Door program launched |
| `vote_cast` | User votes in voting booth |
| `private_message` | Private message sent |
| `user_kicked` | User kicked/banned |
| `mail_scan` | User performs mail scan |

### Choosing Triggers:

**Option 1 - Get All Notifications:**
```
Triggers: ALL
```
This will send notifications for every event. Good for monitoring everything.

**Option 2 - Specific Events Only:**
```
Triggers: new_user, new_upload, sysop_paged
```
Only get notified about new users, uploads, and sysop pages.

**Pro Tip:** Start with `ALL` to see what kinds of notifications you get, then edit the webhook later to filter only what you want.

---

## Part 4: Testing Your Webhook

After adding a webhook, test it to make sure it's working:

**Step 1:** From the Webhook Management menu, type `T`

**Step 2:** Enter the webhook ID (probably `1` if it's your first):
```
Webhook ID to test: 1
```

**Step 3:** You'll see:
```
Sending test notification...
Test notification sent successfully!
```

**Step 4:** Check your Discord/Slack channel - you should see a test message like:
```
❌ System Error
A system error occurred
└─ Error: This is a test notification from AmiExpress BBS
          If you see this message, the webhook is working correctly!
```

If you see this message, your webhook is working! 🎉

---

## Part 5: Managing Webhooks

### Listing Your Webhooks

```
Command: WEBHOOK
Select: L
```

You'll see all configured webhooks:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                 WEBHOOKS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[1] Discord Notifications [ENABLED]
     Type: DISCORD
     URL: https://discord.com/api/webhooks/1234567890...
     Triggers: new_upload, new_message, new_user, sysop_paged, user_login

[2] Slack Alerts [DISABLED]
     Type: SLACK
     URL: https://hooks.slack.com/services/T00000000...
     Triggers: system_error, node_full
```

### Editing a Webhook (Enable/Disable)

```
Command: WEBHOOK
Select: E
Webhook ID to edit: 1
Enable/Disable [E/D]: D
```

This disables the webhook without deleting it. Use `E` to re-enable.

### Deleting a Webhook

```
Command: WEBHOOK
Select: D
Webhook ID to delete: 2
Webhook deleted
```

### Viewing Available Triggers

```
Command: WEBHOOK
Select: S
```

Shows the complete list of available triggers with descriptions.

---

## Part 6: What You'll See

### Discord Notification Examples:

**New User Registration:**
```
👤 New User Registration
New user registered: JohnDoe

┌─ Username: JohnDoe
└─ User ID: usr_abc123
```

**File Upload:**
```
📁 New File Upload
SarahTech uploaded a file

┌─ Filename: cool_demo.zip
├─ Size: 2.5 MB
└─ Conference: Main Files
```

**New Message:**
```
💬 New Message Posted
MikeUser posted a message

┌─ Subject: Check out my new project!
├─ Conference: General Discussion
└─ Message Base: Main Board
```

**Sysop Page:**
```
🔔 Sysop Page Request
Alice is paging the sysop

└─ Message: Sysop page request via O command
```

**User Login:**
```
🔓 User Login
JohnDoe logged in

└─ Username: JohnDoe
```

---

## Part 7: Troubleshooting

### "Permission denied" when trying WEBHOOK command

**Problem:** You're not a sysop

**Solution:** You need security level 255. Check your level with the `S` command. Only the main sysop can manage webhooks.

---

### Test notification not appearing

**Possible causes:**

1. **Wrong webhook URL**
   - Double-check you copied the complete URL
   - Discord URLs start with `https://discord.com/api/webhooks/`
   - Slack URLs start with `https://hooks.slack.com/services/`

2. **Webhook deleted on Discord/Slack**
   - Go back to Discord/Slack settings
   - Verify the webhook still exists
   - If deleted, create a new one and update BBS

3. **Channel permissions**
   - Make sure the webhook has permission to post in the channel
   - Try creating a new webhook in a different channel

---

### Notifications not appearing for real events

**Check these:**

1. **Is the webhook enabled?**
   ```
   Command: WEBHOOK
   Select: L
   ```
   Look for `[ENABLED]` next to your webhook name

2. **Does the webhook have the right trigger?**
   - List webhooks to see which triggers are active
   - If you only selected specific triggers, make sure the event you're testing is in that list

3. **Test with a simple action:**
   - Try creating a new user account
   - This should trigger `new_user` if you have `ALL` triggers

---

### Too many notifications

**Solution:** Edit your webhook to use specific triggers instead of `ALL`

Example - Only monitor important events:
```
Command: WEBHOOK
Select: E
Webhook ID: 1
[Follow prompts to update triggers to: new_user, sysop_paged, system_error]
```

---

### Want notifications in multiple channels

**Solution:** Create multiple webhooks!

Example setup:
- Webhook 1 → #bbs-activity (ALL triggers)
- Webhook 2 → #sysop-alerts (sysop_paged, system_error, node_full)
- Webhook 3 → #new-users (new_user only)

Each webhook can point to a different Discord/Slack channel.

---

## Part 8: Best Practices

### Recommended Setup for Most Sysops:

**Webhook 1: General Activity (Discord/Slack channel: #bbs-activity)**
```
Triggers: user_login, new_message, new_upload
```
Monitor day-to-day BBS activity

**Webhook 2: Sysop Alerts (Discord/Slack channel: #alerts)**
```
Triggers: sysop_paged, system_error, node_full, new_user
```
Get notified when you need to take action

**Webhook 3: Statistics (Discord/Slack channel: #stats)**
```
Triggers: file_downloaded, conference_joined, vote_cast
```
Track BBS usage patterns

### Privacy Considerations:

- Webhook notifications show usernames and some content (message subjects, filenames)
- Make sure your Discord/Slack channel has appropriate permissions
- Consider private channels for sensitive notifications
- Don't share webhook URLs publicly (anyone with the URL can send messages)

### Performance:

- Webhooks are sent asynchronously and won't slow down your BBS
- If a webhook fails, it's logged but doesn't affect BBS operation
- No limit on number of webhooks (but be reasonable!)

---

## Quick Reference Card

```
╔════════════════════════════════════════════════════════╗
║         WEBHOOK COMMAND QUICK REFERENCE                ║
╠════════════════════════════════════════════════════════╣
║  WEBHOOK        Open webhook management menu           ║
║  L              List all webhooks                      ║
║  A              Add new webhook                        ║
║  E              Edit webhook (enable/disable)          ║
║  D              Delete webhook                         ║
║  T              Test webhook (send test notification)  ║
║  S              Show available triggers                ║
║  <ENTER>        Quit back to main menu                 ║
╚════════════════════════════════════════════════════════╝
```

---

## Need Help?

If you're still having trouble:

1. Check the backend logs for webhook errors
2. Test your webhook URL with curl:
   ```bash
   curl -X POST -H 'Content-Type: application/json' \
     -d '{"content":"Test"}' YOUR_WEBHOOK_URL
   ```
3. Verify the webhooks table exists in your database
4. Make sure you're running the latest BBS version

---

## Examples from Real Sysops

### Example 1: Small BBS (1-10 users)

"I use one Discord webhook with ALL triggers. I have a small community and like seeing everything that happens. It's like having a window into my BBS!"

**Setup:**
- 1 webhook → #bbs-activity
- Triggers: ALL

---

### Example 2: Medium BBS (10-50 users)

"I have two webhooks - one for normal activity and one for things that need my attention. The alert channel pings me on my phone so I can respond quickly to pages."

**Setup:**
- Webhook 1 → #bbs-activity (new_message, new_upload, user_login)
- Webhook 2 → #sysop-alerts (sysop_paged, new_user, system_error) with @mentions

---

### Example 3: Large BBS (50+ users)

"I filter by event type into different channels so I can focus on what matters. The stats channel helps me see trends over time."

**Setup:**
- Webhook 1 → #new-users (new_user)
- Webhook 2 → #content (new_message, new_upload)
- Webhook 3 → #alerts (sysop_paged, system_error, node_full)
- Webhook 4 → #logins (user_login, user_logout)

---

## Advanced: Webhook Formatting

Both Discord and Slack webhooks are automatically formatted by the BBS with:
- Color coding (green for good news, red for errors, etc.)
- Emojis for visual categorization
- Structured fields for easy reading
- Timestamps
- Footer showing "AmiExpress BBS"

You don't need to do anything - the BBS handles all the formatting!

---

## Changelog

**Version 1.0 (2025-10-24)**
- Initial webhook system release
- Support for Discord and Slack
- 17 trigger types
- Sysop management interface

---

**Questions? Need help?** Check the main webhook documentation in `WEBHOOK_INTEGRATION.md` or reach out to your BBS software maintainer.

---

**Happy monitoring! 🎉**

Your BBS will now keep you informed of everything happening, so you can focus on building your community instead of constantly checking in.
