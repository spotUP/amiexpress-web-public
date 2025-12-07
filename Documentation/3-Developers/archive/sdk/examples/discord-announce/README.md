# Discord Announce Door

Announces user logins/logoffs to a Discord channel via webhook.

**Pattern**: `runDoor()` (TYPE=TS)
**Category**: Utility
**Author**: REbEL/QTX (Ported by AmiExpress Team)

## Description

This door sends notifications to Discord when users log in or log out of the BBS. It uses Discord webhooks to post messages with customizable bot names and avatars.

## Usage

This is a reference example of the `runDoor()` pattern. It cannot be built standalone as it requires the BBS backend context (Socket.IO, session).

To use this door in your BBS:
1. Copy to `web/backend/src/doors/discord-announce/`
2. Create configuration file `doors/discord-announce/dannounce.cfg`
3. Register in BBS with `TYPE=TS`

## Configuration

Create `doors/discord-announce/dannounce.cfg`:
```
WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_WEBHOOK_URL
BOT_NAME=/X Announce Bot
AVATAR_URL=
ENABLED=true
```

Or use environment variable:
```bash
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_WEBHOOK_URL
```

## Original Source

Ported from: `dev/docs/AmiExpressEDoorSources/DiscordAnnounce/dannounce.e`

## Pattern: runDoor()

This door uses the `runDoor()` pattern which is simpler than the SDK `Door` class:

```typescript
export async function runDoor(doorSession: DoorSession) {
  const { socket, session } = doorSession;

  // Door logic here
  socket.emit('ansi-output', 'Hello!\\r\\n');
}
```

**When to use runDoor():**
- Simple utility doors
- Chat systems
- File browsers
- Configuration tools
- Announcement systems

**When to use Door class:**
- Action games with game loops
- Real-time multiplayer
- Games requiring 60 FPS updates
