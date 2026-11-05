# Discord Bridge - Design Document

**Version**: 1.0 (Design Phase)
**Status**: Planning
**Date**: 2024-12-24

## Overview

The Discord Bridge enables bidirectional message mirroring between LiveChat channels and Discord channels, allowing BBS users and Discord users to communicate seamlessly across platforms.

## Goals

### Primary Goals
1. **Bidirectional Messaging**: Messages flow from LiveChat → Discord and Discord → LiveChat
2. **Channel Mapping**: Configure which LiveChat channels map to which Discord channels
3. **User Attribution**: Messages show original sender's username from source platform
4. **Rich Content**: Support @mentions, emojis, and basic formatting
5. **Zero Downtime**: Bridge failures don't affect LiveChat or Discord operation

### Secondary Goals
1. **Typing Indicators**: Show when users are typing (Discord → LiveChat)
2. **Presence Sync**: Show online/offline status across platforms
3. **Reactions**: Mirror emoji reactions between platforms
4. **File Attachments**: Share files between platforms (future)

### Non-Goals (Out of Scope)
- Voice/video bridging
- Discord slash commands in LiveChat
- Full Discord bot commands (beyond bridging)
- Message editing/deletion sync (v2.0 feature)

## Architecture

### High-Level Design

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   LiveChat      │         │  Discord Bridge  │         │    Discord      │
│   (BBS Door)    │◄───────►│   (Backend)      │◄───────►│   (Bot API)     │
└─────────────────┘         └──────────────────┘         └─────────────────┘
        │                            │                             │
        │ Socket.IO Events           │ Discord.js Library          │
        │ (chat:message)             │ (Client Events)             │
        │                            │                             │
        ▼                            ▼                             ▼
  LiveChat Users              Bridge Service                Discord Users
  send messages           routes messages both ways       send messages
```

### Component Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                         Backend Server                              │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ Discord Bridge Service (web/backend/src/services/)          │  │
│  │                                                              │  │
│  │  ┌──────────────────┐      ┌──────────────────┐            │  │
│  │  │ Discord Bot      │      │ Channel Manager  │            │  │
│  │  │ (discord.js)     │      │ (mappings)       │            │  │
│  │  │                  │      │                  │            │  │
│  │  │ - Connect to API │      │ - Load config    │            │  │
│  │  │ - Receive msgs   │      │ - Map channels   │            │  │
│  │  │ - Send msgs      │      │ - Validate       │            │  │
│  │  └──────────────────┘      └──────────────────┘            │  │
│  │           │                          │                      │  │
│  │           └──────────┬───────────────┘                      │  │
│  │                      │                                      │  │
│  │           ┌──────────▼───────────────┐                     │  │
│  │           │ Message Transformer      │                     │  │
│  │           │                          │                     │  │
│  │           │ - Format LiveChat → DC   │                     │  │
│  │           │ - Format DC → LiveChat   │                     │  │
│  │           │ - Handle @mentions       │                     │  │
│  │           │ - Convert emojis         │                     │  │
│  │           └──────────────────────────┘                     │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ Socket.IO Handler (web/backend/src/handlers/)               │  │
│  │                                                              │  │
│  │  - Listen for chat:message events from LiveChat             │  │
│  │  - Emit chat:message events to LiveChat                     │  │
│  │  - Check if channel is bridged                              │  │
│  │  - Forward to Discord Bridge Service                        │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                     │
└────────────────────────────────────────────────────────────────────┘
```

## Data Flow

### LiveChat → Discord Message Flow

```
1. User types message in LiveChat
   ↓
2. LiveChat emits Socket.IO event: chat:message
   {
     channelId: "general",
     userId: 42,
     username: "alice",
     message: "Hello from BBS!",
     timestamp: Date
   }
   ↓
3. Backend Socket.IO handler receives event
   ↓
4. Check if channel is bridged
   IF bridged:
     ↓
5. Discord Bridge Service receives message
   ↓
6. Message Transformer formats for Discord:
   - Add BBS prefix: "[BBS] alice: Hello from BBS!"
   - Convert :emoji: codes to Discord emojis
   - Convert @mentions to Discord mentions
   ↓
7. Discord Bot sends message to mapped channel
   discordChannel.send("[BBS] alice: Hello from BBS!")
   ↓
8. Discord users see message
```

### Discord → LiveChat Message Flow

```
1. Discord user types message
   ↓
2. Discord Bot receives "messageCreate" event
   {
     channel: DiscordChannel,
     author: DiscordUser,
     content: "Hello from Discord!",
     timestamp: Date
   }
   ↓
3. Check if channel is bridged
   IF bridged:
     ↓
4. Message Transformer formats for LiveChat:
   - Add Discord prefix: "[DC] bob: Hello from Discord!"
   - Convert Discord emojis to :emoji: codes
   - Convert Discord mentions to @username
   ↓
5. Backend emits Socket.IO event: chat:message
   socket.to(channelId).emit('chat:message', {
     channelId: "general",
     userId: 0,  // System user
     username: "bob",
     message: "[DC] bob: Hello from Discord!",
     bridged: true,
     source: "discord"
   })
   ↓
6. LiveChat receives and displays message
```

## Implementation Plan

### Phase 1: Core Infrastructure (2-3 hours)

**Files to Create**:
1. `web/backend/src/services/discord-bridge/DiscordBridgeService.ts`
   - Main service class
   - Initialize Discord bot
   - Manage connection lifecycle
   - Route messages

2. `web/backend/src/services/discord-bridge/ChannelMapper.ts`
   - Load channel mappings from config
   - Validate mappings
   - Lookup methods (LiveChat → Discord, Discord → LiveChat)

3. `web/backend/src/services/discord-bridge/MessageTransformer.ts`
   - Format messages for each platform
   - Handle @mentions, emojis, formatting

4. `web/backend/src/config/discord-bridge.config.json`
   - Channel mappings configuration
   - Bot settings

**Dependencies**:
```json
{
  "discord.js": "^14.14.1"
}
```

**Example Service Initialization**:
```typescript
// web/backend/src/index.ts
import { DiscordBridgeService } from './services/discord-bridge/DiscordBridgeService';

// Initialize Discord bridge if configured
if (process.env.DISCORD_BOT_TOKEN) {
  const discordBridge = new DiscordBridgeService({
    token: process.env.DISCORD_BOT_TOKEN,
    socketIO: io,
  });
  await discordBridge.start();
}
```

### Phase 2: Socket.IO Integration (1-2 hours)

**Modify**:
1. `web/backend/src/handlers/chat/group-chat.handler.ts`
   - Add bridge check to message handler
   - Forward bridged messages to Discord

2. `web/backend/src/server/socket-handlers.ts`
   - Register bridge event listeners

**Example Integration**:
```typescript
socket.on('chat:message', async (data) => {
  // Existing LiveChat handling
  await handleChatMessage(socket, data);

  // Bridge to Discord if channel is mapped
  if (discordBridge && discordBridge.isBridged(data.channelId)) {
    await discordBridge.sendToDiscord(data.channelId, {
      username: data.username,
      message: data.message,
      timestamp: new Date(),
    });
  }
});
```

### Phase 3: Discord Bot Implementation (2-3 hours)

**Core Discord Bot Logic**:
```typescript
// DiscordBridgeService.ts
import { Client, GatewayIntentBits } from 'discord.js';

export class DiscordBridgeService {
  private client: Client;
  private channelMapper: ChannelMapper;
  private transformer: MessageTransformer;
  private io: Server;

  async start() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    // Handle Discord messages
    this.client.on('messageCreate', async (message) => {
      if (message.author.bot) return; // Ignore bot messages

      const livechatChannel = this.channelMapper.getlivechatChannel(
        message.channel.id
      );

      if (livechatChannel) {
        const formatted = this.transformer.discordToLiveChat(message);

        // Emit to LiveChat via Socket.IO
        this.io.to(livechatChannel).emit('chat:message', {
          channelId: livechatChannel,
          userId: 0, // System/bridge user
          username: message.author.username,
          message: formatted.message,
          bridged: true,
          source: 'discord',
          timestamp: message.createdAt,
        });
      }
    });

    await this.client.login(this.token);
  }

  async sendToDiscord(livechatChannelId: string, data: MessageData) {
    const discordChannelId = this.channelMapper.getDiscordChannel(livechatChannelId);
    if (!discordChannelId) return;

    const channel = await this.client.channels.fetch(discordChannelId);
    if (!channel.isTextBased()) return;

    const formatted = this.transformer.livechatToDiscord(data);
    await channel.send(formatted.content);
  }
}
```

### Phase 4: Configuration (1 hour)

**Channel Mapping Config**:
```json
// web/backend/src/config/discord-bridge.config.json
{
  "enabled": true,
  "botToken": "${DISCORD_BOT_TOKEN}",
  "guildId": "123456789012345678",
  "channelMappings": [
    {
      "livechatChannel": "general",
      "discordChannel": "REDACTED",
      "bidirectional": true,
      "prefix": {
        "livechat": "[BBS]",
        "discord": "[DC]"
      }
    },
    {
      "livechatChannel": "gaming",
      "discordChannel": "REDACTED",
      "bidirectional": true
    }
  ],
  "features": {
    "typingIndicators": false,
    "reactions": false,
    "presence": false
  }
}
```

**Environment Variables**:
```bash
# .env.local
DISCORD_BOT_TOKEN=your_bot_token_here
DISCORD_GUILD_ID=your_guild_id_here
DISCORD_BRIDGE_ENABLED=true
```

### Phase 5: Message Formatting (1-2 hours)

**MessageTransformer Implementation**:
```typescript
export class MessageTransformer {
  livechatToDiscord(data: LiveChatMessage): DiscordMessage {
    let content = data.message;

    // Convert :emoji: codes to Discord emoji
    content = this.convertEmojisToDiscord(content);

    // Convert @username to Discord mentions (requires user mapping)
    content = this.convertMentionsToDiscord(content);

    // Add BBS prefix with username
    content = `**[BBS] ${data.username}:** ${content}`;

    return { content };
  }

  discordToLiveChat(message: DiscordMessage): LiveChatMessage {
    let content = message.content;

    // Convert Discord emojis to :emoji: codes
    content = this.convertEmojisToLiveChat(content);

    // Convert Discord mentions to @username
    content = this.convertMentionsToLiveChat(content);

    // Add Discord prefix
    content = `[DC] ${message.author.username}: ${content}`;

    return { message: content };
  }

  private convertEmojisToDiscord(text: string): string {
    // Map :smile: → 😊
    return text.replace(/:([a-z_]+):/g, (match, name) => {
      const emojiMap: Record<string, string> = {
        smile: '😊',
        heart: '❤️',
        fire: '🔥',
        // ... more mappings
      };
      return emojiMap[name] || match;
    });
  }

  private convertEmojisToLiveChat(text: string): string {
    // Map 😊 → :smile:
    const reverseMap: Record<string, string> = {
      '😊': ':smile:',
      '❤️': ':heart:',
      '🔥': ':fire:',
      // ... more mappings
    };

    return text.replace(/[\u{1F300}-\u{1F9FF}]/gu, (emoji) => {
      return reverseMap[emoji] || emoji;
    });
  }
}
```

## Configuration Examples

### Basic Setup (1 Channel)

```json
{
  "channelMappings": [
    {
      "livechatChannel": "general",
      "discordChannel": "REDACTED",
      "bidirectional": true
    }
  ]
}
```

### Advanced Setup (Multiple Channels)

```json
{
  "channelMappings": [
    {
      "livechatChannel": "general",
      "discordChannel": "REDACTED",
      "bidirectional": true,
      "prefix": { "livechat": "[BBS]", "discord": "[DC]" }
    },
    {
      "livechatChannel": "gaming",
      "discordChannel": "REDACTED",
      "bidirectional": true
    },
    {
      "livechatChannel": "announcements",
      "discordChannel": "REDACTED",
      "bidirectional": false,
      "direction": "livechat-to-discord"
    }
  ]
}
```

## Discord Bot Setup

### Prerequisites

1. **Create Discord Bot**:
   - Go to https://discord.com/developers/applications
   - Create New Application
   - Go to "Bot" tab
   - Click "Add Bot"
   - Copy bot token

2. **Configure Bot Permissions**:
   - Enable "Message Content Intent" (required)
   - Required permissions:
     - Read Messages/View Channels
     - Send Messages
     - Read Message History
     - Add Reactions (optional)

3. **Invite Bot to Server**:
   - Go to "OAuth2" → "URL Generator"
   - Select scopes: `bot`
   - Select permissions: `Send Messages`, `View Channels`, `Read Message History`
   - Copy generated URL and visit it to invite bot

4. **Get Channel IDs**:
   - Enable Developer Mode in Discord (User Settings → Advanced)
   - Right-click channel → "Copy ID"

## Testing Plan

### Unit Tests
- [ ] ChannelMapper correctly maps channels bidirectionally
- [ ] MessageTransformer converts emojis correctly
- [ ] MessageTransformer handles @mentions
- [ ] Config loading validates mappings

### Integration Tests
- [ ] LiveChat message → Discord message
- [ ] Discord message → LiveChat message
- [ ] Emoji conversion (both directions)
- [ ] Mention conversion (both directions)
- [ ] Bot reconnect on disconnect
- [ ] Multiple channel mappings

### Manual Tests
- [ ] Send message in LiveChat, verify in Discord
- [ ] Send message in Discord, verify in LiveChat
- [ ] Test with emojis (:smile:, 😊)
- [ ] Test with @mentions
- [ ] Test with multiple users simultaneously
- [ ] Test bot offline/online scenarios

## Error Handling

### Connection Failures
```typescript
client.on('error', (error) => {
  logger.error('Discord client error:', error);
  // Attempt reconnect with exponential backoff
});

client.on('disconnect', () => {
  logger.warn('Discord bot disconnected, attempting reconnect...');
  setTimeout(() => this.reconnect(), 5000);
});
```

### Message Send Failures
```typescript
try {
  await channel.send(message);
} catch (error) {
  logger.error('Failed to send message to Discord:', error);
  // Don't crash LiveChat - bridge failure is non-fatal
}
```

## Security Considerations

1. **Bot Token Security**:
   - Store in environment variables
   - Never commit to git
   - Rotate regularly

2. **Rate Limiting**:
   - Discord API limits: 50 requests/second
   - Implement message queuing if needed

3. **Message Validation**:
   - Sanitize messages before forwarding
   - Prevent injection attacks
   - Limit message length

4. **User Privacy**:
   - Don't expose BBS user IDs to Discord
   - Consider username mapping/anonymization

## Performance Considerations

1. **Message Queue**:
   - Buffer messages during high traffic
   - Prevent rate limit violations

2. **Connection Pooling**:
   - Single Discord client instance
   - Reuse connections

3. **Caching**:
   - Cache channel mappings
   - Cache user mappings (if implemented)

## Future Enhancements

### v2.0 Features
1. **Typing Indicators**: Show "user is typing..." across platforms
2. **Reactions Sync**: Mirror emoji reactions
3. **Edit/Delete Sync**: Sync message edits and deletions
4. **File Attachments**: Share images/files between platforms
5. **User Presence**: Show online/offline status
6. **Rich Embeds**: Use Discord embeds for better formatting

### v3.0 Features
1. **Multiple Discord Servers**: Bridge to multiple guilds
2. **DM Bridging**: Private message bridging
3. **Command Bridging**: Run LiveChat commands from Discord
4. **Webhook Support**: Use webhooks for better username/avatar display
5. **Thread Support**: Map Discord threads to LiveChat threads

## Rollout Strategy

### Phase 1: Development (1-2 days)
- Implement core bridge service
- Basic message forwarding
- Single channel mapping

### Phase 2: Testing (1 day)
- Internal testing with small group
- Fix bugs and edge cases
- Performance testing

### Phase 3: Beta (1 week)
- Enable for select channels
- Collect user feedback
- Monitor for issues

### Phase 4: Production (Ongoing)
- Enable for all configured channels
- Monitor performance and errors
- Iterate based on feedback

## Documentation Requirements

1. **User Guide**: How to configure and use the bridge
2. **Admin Guide**: How to set up Discord bot and mappings
3. **Developer Guide**: Architecture and API reference
4. **Troubleshooting**: Common issues and solutions

## Success Metrics

1. **Reliability**: 99.9% uptime for bridge
2. **Latency**: < 500ms message delivery time
3. **Error Rate**: < 0.1% message delivery failures
4. **User Satisfaction**: Positive feedback from both platforms

---

**Status**: Design Complete - Ready for Implementation
**Estimated Effort**: 6-8 hours development + 4 hours testing
**Dependencies**: discord.js npm package
**Next Step**: Begin Phase 1 implementation