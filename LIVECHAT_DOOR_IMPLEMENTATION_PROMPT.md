# LiveChat Door - Advanced Multi-User BBS Chat System
## Implementation Prompt v2.0

---

## MANDATORY: Modularization Requirements

**THIS IS NON-NEGOTIABLE. Follow these rules strictly:**

1. **File Size Limit: 2000 CHARACTERS maximum per file** (not lines - characters!)
2. **No single file may exceed 2000 characters** including comments and whitespace
3. **Split functionality into focused modules:**
   - Each module handles ONE concern (e.g., `keystroke-handler.ts`, `channel-manager.ts`)
   - Use barrel exports (`index.ts`) to re-export from modules
   - Keep interfaces/types in separate `types/` directory
4. **Directory Structure Example:**
   ```
   doors/livechat/
   ├── index.ts              # Entry point (~500 chars)
   ├── types/
   │   ├── channel.types.ts  # Channel interfaces
   │   ├── message.types.ts  # Message interfaces
   │   └── user.types.ts     # User interfaces
   ├── handlers/
   │   ├── keystroke.ts      # Real-time keystroke handling
   │   ├── message.ts        # Message send/receive
   │   └── command.ts        # /command processing
   ├── ui/
   │   ├── layout.ts         # Main neo-blessed layout
   │   ├── chat-panel.ts     # Chat message display
   │   ├── typing-area.ts    # Live typing preview
   │   └── sidebar.ts        # Channel/user lists
   ├── services/
   │   ├── channel.ts        # Channel CRUD
   │   ├── events.ts         # BBS event announcements
   │   └── socket.ts         # Socket.IO integration
   └── utils/
       ├── format.ts         # Message formatting
       └── ansi.ts           # ANSI helpers
   ```
5. **Before writing any file, verify character count**
6. **If a module grows beyond 2000 chars, immediately split it**

---

## Executive Summary

Transform the current basic LIVECHAT internal command into a **state-of-the-art TypeScript door** featuring Discord/Slack/IRC-inspired functionality with modern TUI (Terminal User Interface) using neo-blessed. This will be the most advanced multi-user/node BBS chat system ever created, combining retro BBS aesthetics with modern chat paradigms.

**Key Objectives:**
1. Build foundation for group chats (3+ users)
2. Implement Discord-like channels, DMs, and reactions
3. Create a slick neo-blessed TUI with split-pane interface
4. Add advanced features: threading, mentions, reactions, file sharing
5. **CRITICAL: Real-time character-by-character typing** (like current livechat)
6. **CRITICAL: BBS system event announcements** (logins, uploads, door activity, etc.)
7. Keep current livechat as reference until completion
8. **CRITICAL: Modularized architecture** (max 2000 chars per file)

---

## CRITICAL REQUIREMENTS

### Real-Time Character-by-Character Display

**THIS IS NON-NEGOTIABLE.** The chat MUST show each character as it's typed, creating the authentic "watching someone type" experience that makes BBS chat magical.

**Current Implementation Reference** (preserve this behavior):
```
web/backend/src/handlers/chat/internode-chat.handler.ts
web/backend/src/handlers/operator-chat.handler.ts (keystroke handling)
```

**How It Works:**
1. Each keystroke is captured and transmitted immediately via Socket.IO
2. Other users see characters appear one-by-one in real-time
3. Backspace removes the last character visually
4. Enter finalizes the message and moves it to the chat log
5. A "typing preview" area shows what the user is currently composing

**Implementation Pattern:**
```typescript
// Keystroke transmission (sender side)
bbsSession.doorInputHandler = (data: string) => {
  if (data.length === 1 && data >= ' ' && data <= '~') {
    // Printable character - transmit immediately
    socket.emit('chat:keystroke', {
      channelId: currentChannel,
      char: data,
      userId: session.user.id
    });
    // Also update local buffer
    inputBuffer += data;
    renderTypingPreview();
  } else if (data === '\x7f' || data === '\b') {
    // Backspace
    if (inputBuffer.length > 0) {
      inputBuffer = inputBuffer.slice(0, -1);
      socket.emit('chat:keystroke', {
        channelId: currentChannel,
        char: 'BACKSPACE',
        userId: session.user.id
      });
      renderTypingPreview();
    }
  } else if (data === '\r' || data === '\n') {
    // Enter - finalize message
    if (inputBuffer.trim()) {
      sendMessage(currentChannel, inputBuffer);
      inputBuffer = '';
    }
  }
};

// Keystroke reception (receiver side)
socket.on('chat:keystroke', (data) => {
  const { channelId, char, userId } = data;
  if (channelId !== currentChannel) return;

  const username = getUsernameById(userId);

  if (char === 'BACKSPACE') {
    // Remove last char from typing preview
    removeLastCharFromPreview(userId);
  } else {
    // Add char to typing preview - CHARACTER BY CHARACTER
    appendCharToPreview(userId, char);
  }

  renderTypingArea();
});
```

**UI Layout for Live Typing:**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ [10:23] Sysop: Welcome everyone!                                           │
│ [10:24] Alice: Hey there! How's everyone doing today?                      │
│ [10:25] Bob: Just uploaded a new file to the games area!                   │
├─────────────────────────────────────────────────────────────────────────────┤
│ Alice: I think we should try th|                         <- LIVE TYPING    │
│ Bob: That sounds gre|                                    <- LIVE TYPING    │
├─────────────────────────────────────────────────────────────────────────────┤
│ > Your message here...|                                  <- YOUR INPUT     │
└─────────────────────────────────────────────────────────────────────────────┘
```

**The typing preview area shows ALL users currently typing, each on their own line, with characters appearing in real-time as they type.**

### BBS System Event Announcements

The chat MUST display important BBS events as system messages. This makes the chat feel "alive" and keeps users informed about system activity.

**Event Types to Announce:**

1. **User Activity**
   - User logged in: `[SYSTEM] Alice has logged in from Node 3`
   - User logged out: `[SYSTEM] Bob has logged off`
   - User went idle: `[SYSTEM] Charlie is now idle`
   - User returned: `[SYSTEM] Charlie is back`

2. **File Activity**
   - Upload started: `[SYSTEM] Alice started uploading "game.lha" (2.4 MB)`
   - Upload completed: `[SYSTEM] Alice uploaded "game.lha" to Games area`
   - Download started: `[SYSTEM] Bob is downloading "demo.lha"`
   - Download completed: `[SYSTEM] Bob downloaded "demo.lha"`

3. **Door/Game Activity**
   - Door entered: `[SYSTEM] Charlie entered TradeWars 2002`
   - Door exited: `[SYSTEM] Charlie left TradeWars 2002`
   - High score: `[SYSTEM] Alice set a new high score in Tetris: 15,000!`

4. **Message Activity**
   - New public message: `[SYSTEM] New message in "General" by Sysop`
   - User paged sysop: `[SYSTEM] Bob is paging the Sysop`
   - Private message: (only notify recipient) `[SYSTEM] You have a new private message from Alice`

5. **Conference/Area Changes**
   - Joined conference: `[SYSTEM] Alice joined Conference: Games`
   - Left conference: `[SYSTEM] Bob left Conference: Amiga`

6. **System Events**
   - Node connected: `[SYSTEM] Node 3 is now active`
   - Node disconnected: `[SYSTEM] Node 2 went offline`
   - Scheduled maintenance: `[SYSTEM] System maintenance in 10 minutes`
   - New file area: `[SYSTEM] New file area created: "Demo Scene"`

**Implementation:**
```typescript
// BBS Event Bus (backend service)
interface BBSEvent {
  type: 'user_login' | 'user_logout' | 'upload_start' | 'upload_complete' |
        'download_start' | 'download_complete' | 'door_enter' | 'door_exit' |
        'new_message' | 'page_sysop' | 'conference_join' | 'node_activity' |
        'system_announcement';
  userId?: number;
  username?: string;
  nodeId?: number;
  details: Record<string, any>;
  timestamp: Date;
  visibility: 'all' | 'channel' | 'user';
  channelId?: string;
}

// Event emitter (called from various BBS handlers)
function emitBBSEvent(event: BBSEvent): void {
  // Store in database for history
  db.createSystemMessage(event);

  // Broadcast to chat channels
  if (event.visibility === 'all') {
    io.emit('bbs:event', event);
  } else if (event.visibility === 'channel' && event.channelId) {
    io.to(`channel:${event.channelId}`).emit('bbs:event', event);
  } else if (event.visibility === 'user' && event.userId) {
    io.to(`user:${event.userId}`).emit('bbs:event', event);
  }
}

// Rendering system events (chat door)
socket.on('bbs:event', (event: BBSEvent) => {
  const formattedMessage = formatSystemEvent(event);

  // Display in special color (gray/system color)
  chatLog.log(`{gray-fg}${formattedMessage}{/}`);

  // Optional: Play subtle notification sound
  if (shouldPlaySound(event.type)) {
    audio.playNote('A3', 0.05); // Subtle ping
  }
});

function formatSystemEvent(event: BBSEvent): string {
  const time = formatTime(event.timestamp);

  switch (event.type) {
    case 'user_login':
      return `[${time}] --> ${event.username} has logged in (Node ${event.nodeId})`;
    case 'user_logout':
      return `[${time}] <-- ${event.username} has logged off`;
    case 'upload_complete':
      return `[${time}] [UPLOAD] ${event.username} uploaded "${event.details.filename}" to ${event.details.area}`;
    case 'download_start':
      return `[${time}] [DOWNLOAD] ${event.username} is downloading "${event.details.filename}"`;
    case 'door_enter':
      return `[${time}] [DOOR] ${event.username} entered ${event.details.doorName}`;
    case 'door_exit':
      return `[${time}] [DOOR] ${event.username} left ${event.details.doorName}`;
    case 'new_message':
      return `[${time}] [MSG] New message in "${event.details.conference}" by ${event.username}`;
    case 'system_announcement':
      return `[${time}] *** ${event.details.message} ***`;
    default:
      return `[${time}] [SYSTEM] ${JSON.stringify(event.details)}`;
  }
}
```

**Event Filtering (User Preferences):**
```typescript
// Users can customize which events they want to see
interface ChatEventPreferences {
  showLogins: boolean;      // User login/logout
  showFileActivity: boolean; // Uploads/downloads
  showDoorActivity: boolean; // Door enter/exit
  showMessages: boolean;     // New message notifications
  showSystemAnnouncements: boolean; // Sysop announcements
  muteAllEvents: boolean;    // Master mute
}

// Slash command to toggle
// /events on|off|logins|files|doors|messages
```

---

## Part 1: Deep Research Foundation

### 1.1 Study TypeScript Door SDK Documentation

**CRITICAL**: Before any implementation, thoroughly study these SDK documents:

1. **SDK v2.0 Comprehensive Guide** (`Documentation/4-Door-Developers/SDK_V2_COMPREHENSIVE.md`)
   - Full BBS API (40+ functions)
   - UI Engine (neo-blessed) - sections 362-410
   - Game engines (audio, graphics, physics)
   - Complete door patterns

2. **TypeScript Door Guide** (`Documentation/4-Door-Developers/TYPESCRIPT_DOOR_GUIDE.md`)
   - Door structure and lifecycle
   - Input/output patterns
   - Session management
   - Error handling

3. **Neo-Blessed Examples**
   - Review `sdk/examples/` for neo-blessed patterns
   - Study `NEOBLESSED_SHOWCASE_IMPLEMENTATION_PROMPT.md`
   - Understand blessed-contrib widgets (charts, logs, tables)

**Key SDK Features to Use:**

```typescript
// BBS API Functions
ctx.bbs.write(text)           // Output without newline
ctx.bbs.writeLine(text)       // Output with newline
ctx.bbs.clearScreen()         // Clear terminal
ctx.bbs.moveCursor(row, col)  // Position cursor
ctx.bbs.setColor(code)        // ANSI color
ctx.bbs.getLine(prompt, max)  // Get line input
ctx.bbs.getKey(prompt)        // Get single key
ctx.bbs.hotkey(keys, prompt)  // Menu selection
ctx.bbs.enableGameMode()      // Real-time input
ctx.bbs.onKeyDown(callback)   // Keystroke handler
ctx.bbs.getUser()             // Current user info
ctx.bbs.getNodes()            // Who's online
ctx.bbs.getSystemInfo()       // BBS info
ctx.bbs.readFile(path)        // Read file
ctx.bbs.writeFile(path, data) // Write file
ctx.bbs.displayMCI(text)      // Process MCI codes

// Audio Engine
const audio = new AudioEngine();
audio.playNote('C4', 0.5)        // Play note
audio.playChord(['C4','E4'], 1)  // Play chord
audio.playSoundEffect('ping')    // Sound effect
audio.playBackgroundMusic('bgm') // Background music

// UI Engine (Neo-Blessed)
const ui = new UIEngine(ctx.bbs);
const menu = ui.createMenu({ title, items });
const confirm = await ui.confirm('Are you sure?');
const input = await ui.prompt('Enter name:');
const progress = ui.createProgressBar({ max: 100 });
ui.createStatusBar({ left, center, right });
```

### 1.2 Analyze Current LiveChat Implementation

**Files to Study (CRITICAL - Read These):**

| File | Purpose |
|------|---------|
| `web/backend/src/handlers/chat/chat-commands.handler.ts` | LIVECHAT command, user selection |
| `web/backend/src/handlers/chat/internode-chat.handler.ts` | Core chat logic, keystroke handling |
| `web/backend/src/handlers/operator-chat.handler.ts` | Real-time keystroke transmission |
| `web/backend/src/constants/bbs-states.ts` | LoggedOnSubState.CHAT states |

**Current Features (MUST preserve):**
- Real-time character-by-character typing display
- Arrow key user selection
- Chat accept/decline flow
- Availability toggling (CHAT TOGGLE)
- Session state management (CHAT substate)
- Typing indicators with cursor

**Current Limitations (to solve):**
- Only 1-on-1 chat (no group support)
- No persistent message history
- No channels/rooms concept
- No threading or reactions
- No file sharing
- Basic text-only interface

### 1.3 Modern Chat Features Research

**Discord Features to Implement:**
- **Servers/Channels**: Persistent topic-based chat rooms (#general, #random, #help)
- **Direct Messages**: Private 1-on-1 or group DMs
- **Threads**: Reply to specific messages without cluttering main channel
- **Reactions**: Emoji reactions (👍 ❤️ 😂 🔥 👎 🎉)
- **Mentions**: @username, @here, @everyone highlighting
- **Typing Indicators**: "User is typing..." (multiple users supported)
- **Message History**: Scrollable, searchable history with timestamps
- **Rich Presence**: Online, Away, DND, Invisible, custom status
- **Categories**: Group channels ("Public", "Private", "Games")
- **Pinned Messages**: Important messages stick to top
- **Voice Indicators**: Show when user is in voice (for future)

**Slack Features to Implement:**
- **Threaded Replies**: Fork conversations into sub-threads
- **Quick Reactions**: Emoji picker for common reactions
- **Global Search**: Full-text search across all channels
- **Channel Topics**: Editable description shown in header
- **User Profiles**: Quick view with stats (calls, uploads, sec level)
- **Huddles**: Quick voice chat indicators
- **Workflows**: Automated message triggers
- **Apps/Integrations**: Webhook support for external services

**IRC Features to Implement:**
- **Slash Commands**: `/join`, `/msg`, `/topic`, `/who`, `/kick`, `/ban`, `/mode`
- **Channel Modes**: +o (op), +v (voice), +m (moderated), +i (invite-only)
- **Operators**: Channel ops with moderation powers
- **MOTD**: Message of the day on channel join
- **Away**: `/away` with custom message
- **Nick Colors**: Consistent colors per username
- **Action Messages**: `/me does something`
- **Notices**: Server announcements

**Research Sources:**
- [Slack vs. Discord Feature Comparison (Zapier)](https://zapier.com/blog/slack-vs-discord/)
- [Slack vs Discord Workspace Platform (UnSpot)](https://unspot.com/blog/slack-vs-discord/)
- [Slack vs Discord 2025 Features (RemoteWize)](https://remotewize.com/slack-vs-discord/)

---

## Part 2: Architecture & Foundation

### 2.1 Database Schema for Group Chats

**New Tables:**

```sql
-- Chat channels (persistent rooms)
CREATE TABLE chat_channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  display_name TEXT,
  topic TEXT,
  type TEXT CHECK(type IN ('public', 'private', 'dm', 'dm_group', 'system')) DEFAULT 'public',
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  archived BOOLEAN DEFAULT 0,
  category TEXT, -- "Public", "Private", "Admin Only", "Games"
  max_users INTEGER DEFAULT 100,
  slow_mode_seconds INTEGER DEFAULT 0, -- Rate limiting
  read_only BOOLEAN DEFAULT 0,
  invite_only BOOLEAN DEFAULT 0,
  password_hash TEXT, -- For protected channels
  motd TEXT, -- Message of the day
  UNIQUE(name)
);

-- Default system channels
INSERT INTO chat_channels (id, name, display_name, type, topic, category) VALUES
  ('general', 'general', 'General', 'public', 'Welcome to the BBS!', 'Public'),
  ('random', 'random', 'Random', 'public', 'Off-topic chat', 'Public'),
  ('help', 'help', 'Help', 'public', 'Get help from other users', 'Public'),
  ('system', 'system', 'System Events', 'system', 'BBS activity feed', 'System');

-- Channel members
CREATE TABLE chat_channel_members (
  channel_id TEXT REFERENCES chat_channels(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  role TEXT CHECK(role IN ('member', 'voice', 'moderator', 'admin', 'owner')) DEFAULT 'member',
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_read_at DATETIME,
  last_read_message_id TEXT,
  notifications TEXT CHECK(notifications IN ('all', 'mentions', 'none')) DEFAULT 'all',
  muted_until DATETIME,
  banned BOOLEAN DEFAULT 0,
  ban_reason TEXT,
  PRIMARY KEY (channel_id, user_id)
);

-- Chat messages (persistent history)
CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY,
  channel_id TEXT REFERENCES chat_channels(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  username TEXT NOT NULL, -- Denormalized for deleted users
  message TEXT NOT NULL,
  message_html TEXT, -- Rendered with formatting
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  edited_at DATETIME,
  thread_id TEXT REFERENCES chat_messages(id), -- Parent for threaded replies
  reply_count INTEGER DEFAULT 0,
  type TEXT CHECK(type IN ('message', 'system', 'file', 'action', 'join', 'leave', 'topic')) DEFAULT 'message',
  metadata TEXT, -- JSON: file info, mentions, embeds, etc.
  deleted BOOLEAN DEFAULT 0,
  deleted_by INTEGER REFERENCES users(id),
  deleted_at DATETIME
);

-- Message reactions
CREATE TABLE chat_reactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL, -- Unicode emoji or custom :code:
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(message_id, user_id, emoji)
);

-- Pinned messages
CREATE TABLE chat_pinned_messages (
  channel_id TEXT REFERENCES chat_channels(id) ON DELETE CASCADE,
  message_id TEXT REFERENCES chat_messages(id) ON DELETE CASCADE,
  pinned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  pinned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (channel_id, message_id)
);

-- User presence/status
CREATE TABLE chat_user_presence (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status TEXT CHECK(status IN ('online', 'away', 'dnd', 'invisible', 'offline')) DEFAULT 'online',
  custom_status TEXT,
  custom_emoji TEXT,
  activity TEXT, -- "Playing TradeWars", "Uploading files"
  last_active DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User chat preferences
CREATE TABLE chat_user_preferences (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  show_logins BOOLEAN DEFAULT 1,
  show_file_activity BOOLEAN DEFAULT 1,
  show_door_activity BOOLEAN DEFAULT 1,
  show_messages BOOLEAN DEFAULT 1,
  show_system_announcements BOOLEAN DEFAULT 1,
  mute_all_events BOOLEAN DEFAULT 0,
  compact_mode BOOLEAN DEFAULT 0,
  show_timestamps BOOLEAN DEFAULT 1,
  timestamp_format TEXT DEFAULT '24h', -- '12h' or '24h'
  notification_sound BOOLEAN DEFAULT 1,
  mention_sound BOOLEAN DEFAULT 1,
  message_preview_length INTEGER DEFAULT 100,
  theme TEXT DEFAULT 'default'
);

-- BBS System Events (for announcement feed)
CREATE TABLE bbs_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  username TEXT,
  node_id INTEGER,
  details TEXT, -- JSON
  visibility TEXT CHECK(visibility IN ('all', 'channel', 'user')) DEFAULT 'all',
  channel_id TEXT REFERENCES chat_channels(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Custom emojis (sysop-defined)
CREATE TABLE chat_custom_emojis (
  code TEXT PRIMARY KEY, -- :bbs: :amiga: :sysop:
  name TEXT NOT NULL,
  ascii_art TEXT NOT NULL, -- Multi-line ASCII representation
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Channel invites
CREATE TABLE chat_channel_invites (
  id TEXT PRIMARY KEY,
  channel_id TEXT REFERENCES chat_channels(id) ON DELETE CASCADE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  expires_at DATETIME,
  max_uses INTEGER,
  use_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Critical Indexes:**
```sql
CREATE INDEX idx_messages_channel_time ON chat_messages(channel_id, created_at DESC);
CREATE INDEX idx_messages_thread ON chat_messages(thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX idx_messages_user ON chat_messages(user_id);
CREATE INDEX idx_messages_search ON chat_messages(message);
CREATE INDEX idx_reactions_message ON chat_reactions(message_id);
CREATE INDEX idx_channel_members_user ON chat_channel_members(user_id);
CREATE INDEX idx_events_time ON bbs_events(created_at DESC);
CREATE INDEX idx_events_type ON bbs_events(type);
CREATE INDEX idx_presence_status ON chat_user_presence(status);
```

### 2.2 Real-Time Architecture

**Socket.IO Event Flow:**

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   User A (TUI)  │    │  Chat Service   │    │   User B (TUI)  │
└────────┬────────┘    └────────┬────────┘    └────────┬────────┘
         │                      │                      │
         │ chat:keystroke       │                      │
         │─────────────────────>│                      │
         │                      │ chat:keystroke       │
         │                      │─────────────────────>│
         │                      │                      │
         │                      │                      │ (char appears)
         │                      │                      │
         │ chat:send-message    │                      │
         │─────────────────────>│                      │
         │                      │ (save to DB)         │
         │                      │                      │
         │                      │ chat:message         │
         │                      │─────────────────────>│
         │ chat:message         │                      │
         │<─────────────────────│                      │
         │                      │                      │
```

**Socket.IO Rooms Structure:**
```
channel:general     - All users in #general
channel:random      - All users in #random
user:123            - User-specific notifications
node:1              - Node-specific broadcasts
sysops              - All sysop-level users
chat:active         - All users with chat door open
```

**Event Types:**
```typescript
// Keystroke events (real-time typing)
'chat:keystroke' - Single character typed
'chat:keystroke-clear' - User cleared input (Escape)
'chat:keystroke-submit' - User pressed Enter

// Message events
'chat:message' - New message in channel
'chat:message-edit' - Message edited
'chat:message-delete' - Message deleted
'chat:thread-reply' - New reply in thread

// Channel events
'chat:channel-created' - New channel
'chat:channel-deleted' - Channel removed
'chat:channel-updated' - Topic/settings changed
'chat:user-joined' - User entered channel
'chat:user-left' - User left channel

// Reaction events
'chat:reaction-added' - Reaction added to message
'chat:reaction-removed' - Reaction removed

// Presence events
'chat:presence-update' - User status changed
'chat:activity-update' - User activity changed

// BBS events (system announcements)
'bbs:event' - System event (login, upload, etc.)
'bbs:announcement' - Sysop announcement
```

---

## Part 3: UI/UX Design - Neo-Blessed TUI

### 3.1 Screen Layout (80x24 Terminal)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ LiveChat v2.0 │ @username │ Node 1 │ [●] Online │ #general         [?] F1=Help │ ← Row 1: Top Bar
├──────────────┬──────────────────────────────────────────────────────────────────┤
│              │ #general - Welcome to the BBS! [23 users]                       │ ← Row 2: Channel Header
│  CHANNELS    ├──────────────────────────────────────────────────────────────────┤
│              │ --> Alice has logged in (Node 3)                                │ ← System Event
│  Public      │ [10:23] Sysop: Welcome everyone!                               │
│  # general   │ [10:24] Alice: Hey! Anyone here?                               │
│  # random    │ [10:24] Bob: Morning! Just uploaded a new game ☕               │
│  # help      │ [10:25] You: How do I upload files?                            │
│              │ [10:25] Sysop: Type FILES at main menu                         │
│  Private     │     ↳ Sysop: Then F U for upload                    [👍2 ❤️1] │ ← Thread + Reactions
│  # admins    │ [10:26] Alice: @You check the docs!                 [📌Pinned] │ ← Mention + Pin
│              │ <-- Charlie has logged off                                      │ ← System Event
│  DMs         │ [UPLOAD] Bob uploaded "game.lha" to Games                       │ ← File Event
│  @ Alice     │ [DOOR] Alice entered TradeWars 2002                            │ ← Door Event
│  @ Bob       │                                                                 │
│              ├──────────────────────────────────────────────────────────────────┤ ← Row 18
│  Groups      │ Alice: I think we should try th|                               │ ← Live Typing Preview
│  # team-a    │ Bob: That sounds gre|                                          │
├──────────────┼──────────────────────────────────────────────────────────────────┤ ← Row 21
│ [●]2 [○]3    │ > Hello everyone, I'm new here_                                │ ← Row 22: Your Input
├──────────────┴──────────────────────────────────────────────────────────────────┤
│ Tab:Switch │ ↑↓:Navigate │ Enter:Select │ /:Commands │ Esc:Menu │ PgUp/Dn:Scroll│ ← Row 23: Shortcuts
└─────────────────────────────────────────────────────────────────────────────────┘ ← Row 24
```

**Layout Zones:**

| Zone | Rows | Cols | Purpose |
|------|------|------|---------|
| Top Bar | 1 | 1-80 | User info, channel name, help |
| Channel List | 2-20 | 1-14 | Navigable sidebar with channels, DMs |
| Channel Header | 2 | 15-80 | Current channel name, topic, user count |
| Chat Log | 3-17 | 15-80 | Scrollable message history (15 lines) |
| Typing Preview | 18-20 | 15-80 | Real-time typing from other users (3 lines) |
| User Status | 21 | 1-14 | Online/away indicator summary |
| Input Box | 22 | 15-80 | User's current message composition |
| Status Bar | 23-24 | 1-80 | Keyboard shortcuts help |

### 3.2 Neo-Blessed Component Structure

```typescript
import blessed from 'neo-blessed';
import contrib from 'blessed-contrib';

export function createChatScreen(ctx: DoorContext): blessed.Widgets.Screen {
  const screen = blessed.screen({
    smartCSR: true,
    title: 'LiveChat v2.0',
    fullUnicode: true,
    dockBorders: true,
    autoPadding: true
  });

  // ===== TOP BAR (Row 1) =====
  const topBar = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: 1,
    content: formatTopBar(ctx.user),
    style: { fg: 'white', bg: 'blue', bold: true }
  });

  // ===== CHANNEL LIST (Left Sidebar) =====
  const channelList = blessed.list({
    parent: screen,
    top: 1,
    left: 0,
    width: 14,
    height: '100%-4',
    label: ' CHANNELS ',
    border: { type: 'line' },
    style: {
      fg: 'white',
      bg: 'black',
      border: { fg: 'cyan' },
      selected: { bg: 'blue', fg: 'white', bold: true },
      item: { fg: 'white' },
      label: { fg: 'cyan', bold: true }
    },
    keys: true,
    vi: true,
    scrollbar: { ch: '│', style: { inverse: true } }
  });

  // ===== CHANNEL HEADER (Row 2) =====
  const channelHeader = blessed.box({
    parent: screen,
    top: 1,
    left: 14,
    width: '100%-14',
    height: 1,
    content: ' #general - Welcome to the BBS! [23 users]',
    style: { fg: 'cyan', bg: 'black', bold: true }
  });

  // ===== CHAT LOG (Main Area) =====
  const chatLog = blessed.log({
    parent: screen,
    top: 2,
    left: 14,
    width: '100%-14',
    height: '100%-8', // Leave room for typing + input + status
    border: { type: 'line' },
    style: { fg: 'white', bg: 'black', border: { fg: 'cyan' } },
    scrollback: 1000,
    scrollbar: { ch: '│', style: { inverse: true } },
    tags: true, // Enable {color} tags
    alwaysScroll: true
  });

  // ===== TYPING PREVIEW (Real-time keystroke display) =====
  const typingPreview = blessed.box({
    parent: screen,
    bottom: 5,
    left: 14,
    width: '100%-14',
    height: 3,
    border: { type: 'line' },
    style: { fg: 'gray', bg: 'black', border: { fg: 'gray' } },
    tags: true,
    content: '' // Will show "Alice: typing here|" in real-time
  });

  // ===== USER STATUS (Below channel list) =====
  const userStatus = blessed.box({
    parent: screen,
    bottom: 3,
    left: 0,
    width: 14,
    height: 1,
    content: ' [●]2 [○]3',
    style: { fg: 'green', bg: 'black' }
  });

  // ===== INPUT BOX (Your message) =====
  const inputBox = blessed.textbox({
    parent: screen,
    bottom: 2,
    left: 14,
    width: '100%-14',
    height: 1,
    style: { fg: 'white', bg: 'black' },
    inputOnFocus: true
  });

  // ===== STATUS BAR (Bottom) =====
  const statusBar = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 2,
    content: ' Tab:Switch │ ↑↓:Navigate │ Enter:Select │ /:Commands │ Esc:Menu │ PgUp/Dn:Scroll',
    style: { fg: 'black', bg: 'cyan' }
  });

  return screen;
}
```

### 3.3 Real-Time Typing Preview Rendering

**Critical Feature: Show each character as it's typed by other users**

```typescript
// Track what each user is currently typing
const typingBuffers = new Map<number, { username: string; buffer: string; lastUpdate: Date }>();

// Receive keystroke from another user
socket.on('chat:keystroke', (data: { channelId: string; userId: number; char: string }) => {
  if (data.channelId !== currentChannel) return;

  const existing = typingBuffers.get(data.userId) || {
    username: getUsernameById(data.userId),
    buffer: '',
    lastUpdate: new Date()
  };

  if (data.char === 'BACKSPACE') {
    existing.buffer = existing.buffer.slice(0, -1);
  } else if (data.char === 'CLEAR') {
    existing.buffer = '';
  } else if (data.char === 'SUBMIT') {
    // Message will come via chat:message, clear preview
    typingBuffers.delete(data.userId);
  } else {
    existing.buffer += data.char;
  }

  existing.lastUpdate = new Date();
  typingBuffers.set(data.userId, existing);

  // Re-render typing preview area
  renderTypingPreview();
});

function renderTypingPreview(): void {
  const lines: string[] = [];
  const now = Date.now();

  // Filter out stale entries (no keystroke in 5 seconds)
  for (const [userId, entry] of typingBuffers.entries()) {
    if (now - entry.lastUpdate.getTime() > 5000) {
      typingBuffers.delete(userId);
      continue;
    }

    if (entry.buffer.length > 0) {
      const color = getUsernameColor(entry.username);
      // Show username in their color, then their typing with cursor
      lines.push(`{${color}-fg}${entry.username}:{/} ${entry.buffer}{gray-fg}|{/}`);
    }
  }

  // Limit to 3 lines (most recent typers)
  const displayLines = lines.slice(-3);

  typingPreview.setContent(displayLines.join('\n') || '{gray-fg}(No one typing){/}');
  screen.render();
}

// Clear stale typing indicators periodically
setInterval(() => {
  const now = Date.now();
  let changed = false;

  for (const [userId, entry] of typingBuffers.entries()) {
    if (now - entry.lastUpdate.getTime() > 5000) {
      typingBuffers.delete(userId);
      changed = true;
    }
  }

  if (changed) renderTypingPreview();
}, 1000);
```

### 3.4 Message Formatting

```typescript
// Format a chat message for display
function formatChatMessage(msg: ChatMessage): string {
  const time = formatTime(msg.created_at);
  const username = colorUsername(msg.username);
  let content = msg.message;

  // Parse markdown
  content = parseMarkdown(content);

  // Highlight mentions
  content = highlightMentions(content, currentUser.username);

  // Format reactions
  const reactions = msg.reactions?.length ? formatReactions(msg.reactions) : '';

  // Pin indicator
  const pinned = msg.pinned ? ' {cyan-fg}[📌]{/}' : '';

  // Thread indicator
  const thread = msg.reply_count > 0 ? ` {gray-fg}[${msg.reply_count} replies]{/}` : '';

  return `{gray-fg}[${time}]{/} ${username}: ${content}${reactions}${pinned}${thread}`;
}

// Format system event
function formatSystemEvent(event: BBSEvent): string {
  const time = formatTime(event.timestamp);
  let prefix = '';
  let color = 'gray';
  let message = '';

  switch (event.type) {
    case 'user_login':
      prefix = '-->';
      color = 'green';
      message = `${event.username} has logged in (Node ${event.nodeId})`;
      break;
    case 'user_logout':
      prefix = '<--';
      color = 'red';
      message = `${event.username} has logged off`;
      break;
    case 'upload_complete':
      prefix = '[UPLOAD]';
      color = 'cyan';
      message = `${event.username} uploaded "${event.details.filename}" to ${event.details.area}`;
      break;
    case 'download_start':
      prefix = '[DOWNLOAD]';
      color = 'yellow';
      message = `${event.username} is downloading "${event.details.filename}"`;
      break;
    case 'door_enter':
      prefix = '[DOOR]';
      color = 'magenta';
      message = `${event.username} entered ${event.details.doorName}`;
      break;
    case 'door_exit':
      prefix = '[DOOR]';
      color = 'magenta';
      message = `${event.username} left ${event.details.doorName}`;
      break;
    case 'new_message':
      prefix = '[MSG]';
      color = 'blue';
      message = `New message in "${event.details.conference}" by ${event.username}`;
      break;
    case 'system_announcement':
      prefix = '***';
      color = 'yellow';
      message = event.details.message;
      break;
    default:
      prefix = '[SYSTEM]';
      message = JSON.stringify(event.details);
  }

  return `{${color}-fg}${prefix} ${message}{/}`;
}

// Parse markdown formatting
function parseMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '{bold}$1{/bold}')
    .replace(/\*(.+?)\*/g, '{italic}$1{/italic}')
    .replace(/__(.+?)__/g, '{underline}$1{/underline}')
    .replace(/`(.+?)`/g, '{inverse} $1 {/inverse}')
    .replace(/```[\s\S]+?```/g, (match) => {
      return '{gray-bg}{white-fg}' + match.slice(3, -3) + '{/}';
    });
}

// Highlight @mentions
function highlightMentions(text: string, currentUsername: string): string {
  return text.replace(/@(\w+)/g, (match, username) => {
    if (username.toLowerCase() === currentUsername.toLowerCase()) {
      return `{yellow-bg}{black-fg}@${username}{/}`; // Highlight your mentions
    } else if (username === 'everyone' || username === 'here') {
      return `{red-fg}@${username}{/}`; // Special mentions
    } else {
      return `{cyan-fg}@${username}{/}`; // Other mentions
    }
  });
}

// Format reactions compactly
function formatReactions(reactions: Reaction[]): string {
  if (!reactions.length) return '';

  // Group by emoji
  const grouped = new Map<string, number>();
  for (const r of reactions) {
    grouped.set(r.emoji, (grouped.get(r.emoji) || 0) + 1);
  }

  const parts: string[] = [];
  for (const [emoji, count] of grouped.entries()) {
    parts.push(`{cyan-fg}[${emoji}${count > 1 ? count : ''}]{/}`);
  }

  return ' ' + parts.join(' ');
}

// Consistent username colors
function colorUsername(username: string): string {
  const colors = ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan'];
  const hash = username.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const color = colors[hash % colors.length];
  return `{${color}-fg}{bold}${username}{/}`;
}

function getUsernameColor(username: string): string {
  const colors = ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan'];
  const hash = username.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return colors[hash % colors.length];
}
```

---

## Part 4: Core Feature Implementation

### 4.1 Keystroke Transmission (THE CORE FEATURE)

**This is the heart of the chat - real-time character-by-character display**

```typescript
// ===== SENDER SIDE =====

// Input buffer for current user
let inputBuffer = '';
let lastKeystrokeTime = Date.now();

// Handle each keystroke
bbsSession.doorInputHandler = (data: string) => {
  const now = Date.now();

  // Check for special keys
  if (data === '\x1b[A' || data === '\x1b[B' || data === '\x1b[C' || data === '\x1b[D') {
    // Arrow keys - handled by channel list/chat navigation
    handleArrowKey(data);
    return;
  }

  if (data === '\x1b' || data === '\x03') {
    // Escape or Ctrl+C - open menu or cancel
    showChatMenu();
    return;
  }

  if (data === '\t') {
    // Tab - switch focus between channel list and input
    toggleFocus();
    return;
  }

  if (data === '\r' || data === '\n') {
    // Enter - send message
    if (inputBuffer.trim()) {
      // Check for slash command
      if (inputBuffer.startsWith('/')) {
        executeSlashCommand(inputBuffer);
      } else {
        sendMessage(currentChannel, inputBuffer);
      }

      // Notify others that we submitted
      socket.emit('chat:keystroke', {
        channelId: currentChannel,
        userId: session.user.id,
        char: 'SUBMIT'
      });
    }
    inputBuffer = '';
    renderInputBox();
    return;
  }

  if (data === '\x7f' || data === '\b') {
    // Backspace
    if (inputBuffer.length > 0) {
      inputBuffer = inputBuffer.slice(0, -1);

      // Transmit backspace to others
      socket.emit('chat:keystroke', {
        channelId: currentChannel,
        userId: session.user.id,
        char: 'BACKSPACE'
      });

      renderInputBox();
    }
    return;
  }

  // Printable character
  if (data.length === 1 && data >= ' ' && data <= '~') {
    inputBuffer += data;

    // Transmit character to others IMMEDIATELY
    socket.emit('chat:keystroke', {
      channelId: currentChannel,
      userId: session.user.id,
      char: data
    });

    renderInputBox();
    lastKeystrokeTime = now;
  }
};

function renderInputBox(): void {
  inputBox.setContent(`> ${inputBuffer}_`);
  screen.render();
}

// ===== RECEIVER SIDE =====

// Track typing buffers for all users
const typingBuffers = new Map<number, TypingBuffer>();

interface TypingBuffer {
  username: string;
  buffer: string;
  lastUpdate: number;
}

socket.on('chat:keystroke', (data: KeystrokeEvent) => {
  // Ignore our own keystrokes
  if (data.userId === session.user.id) return;

  // Ignore keystrokes from other channels
  if (data.channelId !== currentChannel) return;

  let entry = typingBuffers.get(data.userId);
  if (!entry) {
    entry = {
      username: getUsernameById(data.userId),
      buffer: '',
      lastUpdate: Date.now()
    };
    typingBuffers.set(data.userId, entry);
  }

  switch (data.char) {
    case 'BACKSPACE':
      entry.buffer = entry.buffer.slice(0, -1);
      break;
    case 'CLEAR':
      entry.buffer = '';
      break;
    case 'SUBMIT':
      // Clear - message will arrive via chat:message
      typingBuffers.delete(data.userId);
      break;
    default:
      // Add character to buffer
      entry.buffer += data.char;
      break;
  }

  entry.lastUpdate = Date.now();
  renderTypingPreview();
});

function renderTypingPreview(): void {
  const now = Date.now();
  const lines: string[] = [];

  for (const [userId, entry] of typingBuffers.entries()) {
    // Remove stale entries (no keystroke in 5 seconds)
    if (now - entry.lastUpdate > 5000) {
      typingBuffers.delete(userId);
      continue;
    }

    if (entry.buffer.length > 0) {
      const color = getUsernameColor(entry.username);
      lines.push(`{${color}-fg}${entry.username}:{/} ${entry.buffer}{gray-fg}|{/}`);
    }
  }

  // Show up to 3 most recent typers
  typingPreview.setContent(lines.slice(-3).join('\n'));
  screen.render();
}
```

### 4.2 BBS Event Integration

**Emit events from BBS handlers to the chat system**

```typescript
// ===== BBS Event Emitter Service =====

import { EventEmitter } from 'events';

class BBSEventBus extends EventEmitter {
  private io: SocketIO.Server;
  private db: Database;

  constructor(io: SocketIO.Server, db: Database) {
    super();
    this.io = io;
    this.db = db;
  }

  async emit(event: BBSEvent): Promise<void> {
    // Store in database for history
    await this.db.createBBSEvent(event);

    // Broadcast based on visibility
    switch (event.visibility) {
      case 'all':
        this.io.to('chat:active').emit('bbs:event', event);
        break;
      case 'channel':
        if (event.channelId) {
          this.io.to(`channel:${event.channelId}`).emit('bbs:event', event);
        }
        break;
      case 'user':
        if (event.userId) {
          this.io.to(`user:${event.userId}`).emit('bbs:event', event);
        }
        break;
    }
  }

  // Convenience methods
  async userLoggedIn(user: User, nodeId: number): Promise<void> {
    await this.emit({
      type: 'user_login',
      userId: user.id,
      username: user.username,
      nodeId,
      details: { location: user.location },
      visibility: 'all',
      timestamp: new Date()
    });
  }

  async userLoggedOut(user: User): Promise<void> {
    await this.emit({
      type: 'user_logout',
      userId: user.id,
      username: user.username,
      details: {},
      visibility: 'all',
      timestamp: new Date()
    });
  }

  async uploadStarted(user: User, filename: string, size: number): Promise<void> {
    await this.emit({
      type: 'upload_start',
      userId: user.id,
      username: user.username,
      details: { filename, size: formatFileSize(size) },
      visibility: 'all',
      timestamp: new Date()
    });
  }

  async uploadCompleted(user: User, filename: string, area: string): Promise<void> {
    await this.emit({
      type: 'upload_complete',
      userId: user.id,
      username: user.username,
      details: { filename, area },
      visibility: 'all',
      timestamp: new Date()
    });
  }

  async downloadStarted(user: User, filename: string): Promise<void> {
    await this.emit({
      type: 'download_start',
      userId: user.id,
      username: user.username,
      details: { filename },
      visibility: 'all',
      timestamp: new Date()
    });
  }

  async doorEntered(user: User, doorName: string): Promise<void> {
    await this.emit({
      type: 'door_enter',
      userId: user.id,
      username: user.username,
      details: { doorName },
      visibility: 'all',
      timestamp: new Date()
    });
  }

  async doorExited(user: User, doorName: string): Promise<void> {
    await this.emit({
      type: 'door_exit',
      userId: user.id,
      username: user.username,
      details: { doorName },
      visibility: 'all',
      timestamp: new Date()
    });
  }

  async newMessage(user: User, conference: string): Promise<void> {
    await this.emit({
      type: 'new_message',
      userId: user.id,
      username: user.username,
      details: { conference },
      visibility: 'all',
      timestamp: new Date()
    });
  }

  async systemAnnouncement(message: string): Promise<void> {
    await this.emit({
      type: 'system_announcement',
      details: { message },
      visibility: 'all',
      timestamp: new Date()
    });
  }
}

// ===== Integration Points =====

// In login handler:
await bbsEventBus.userLoggedIn(user, nodeId);

// In logout handler:
await bbsEventBus.userLoggedOut(user);

// In upload handler:
await bbsEventBus.uploadStarted(user, filename, size);
await bbsEventBus.uploadCompleted(user, filename, areaName);

// In download handler:
await bbsEventBus.downloadStarted(user, filename);

// In door handler:
await bbsEventBus.doorEntered(user, doorName);
// ... after door exits:
await bbsEventBus.doorExited(user, doorName);

// In message handler:
await bbsEventBus.newMessage(user, conferenceName);

// From sysop panel:
await bbsEventBus.systemAnnouncement("System restart in 5 minutes");
```

### 4.3 Channel Management

```typescript
// Create channel
async function createChannel(options: CreateChannelOptions): Promise<Channel> {
  const { name, type, topic, createdBy } = options;

  // Validate name
  if (!/^[a-z0-9-]+$/.test(name)) {
    throw new ChatError('Channel name must be lowercase alphanumeric with dashes');
  }

  // Check permissions
  if (type === 'private' && ctx.user.secLevel < 100) {
    throw new ChatError('Only admins can create private channels');
  }

  const channel = await db.createChannel({
    id: generateId(),
    name,
    display_name: name,
    type,
    topic,
    created_by: createdBy,
    category: type === 'private' ? 'Private' : 'Public'
  });

  // Creator is owner
  await db.addChannelMember(channel.id, createdBy, 'owner');

  // Broadcast channel creation
  io.emit('chat:channel-created', { channel });

  // Log system event
  chatLog.log(`{gray-fg}[SYSTEM] Channel #${name} created by ${ctx.user.username}{/}`);

  return channel;
}

// Delete channel
async function deleteChannel(channelId: string): Promise<void> {
  const channel = await db.getChannel(channelId);
  if (!channel) throw new ChatError('Channel not found');

  // Check permissions
  const member = await db.getChannelMember(channelId, ctx.user.id);
  const isOwner = member?.role === 'owner';
  const isAdmin = ctx.user.secLevel >= 200;

  if (!isOwner && !isAdmin) {
    throw new ChatError('Only channel owner or sysop can delete channel');
  }

  // Archive (soft delete)
  await db.updateChannel(channelId, { archived: true });

  // Notify all members
  io.to(`channel:${channelId}`).emit('chat:channel-deleted', { channelId });

  // Remove all from room
  const sockets = await io.in(`channel:${channelId}`).fetchSockets();
  for (const s of sockets) {
    s.leave(`channel:${channelId}`);
  }
}

// Join channel
async function joinChannel(channelId: string): Promise<void> {
  const channel = await db.getChannel(channelId);
  if (!channel) throw new ChatError('Channel not found');
  if (channel.archived) throw new ChatError('Channel has been archived');

  // Check access
  if (channel.type === 'private' || channel.invite_only) {
    const member = await db.getChannelMember(channelId, ctx.user.id);
    if (!member) {
      throw new ChatError('You are not a member of this channel');
    }
    if (member.banned) {
      throw new ChatError('You are banned from this channel');
    }
  }

  // Join Socket.IO room
  socket.join(`channel:${channelId}`);

  // Add to DB if not already member
  await db.upsertChannelMember(channelId, ctx.user.id, 'member');

  // Update session
  currentChannel = channelId;

  // Load recent messages
  const messages = await db.getChannelMessages(channelId, 50);

  // Clear and re-render chat
  chatLog.setContent('');
  for (const msg of messages) {
    if (msg.type === 'system') {
      chatLog.log(formatSystemEvent(msg));
    } else {
      chatLog.log(formatChatMessage(msg));
    }
  }

  // Update channel header
  channelHeader.setContent(` #${channel.name} - ${channel.topic || 'No topic'} [${await getChannelUserCount(channelId)} users]`);

  // Announce join
  io.to(`channel:${channelId}`).emit('chat:user-joined', {
    channelId,
    userId: ctx.user.id,
    username: ctx.user.username
  });

  screen.render();
}
```

### 4.4 Slash Commands

```typescript
const slashCommands = new Map<string, SlashCommand>([
  // ===== Channel Commands =====
  ['join', {
    name: 'join',
    description: 'Join a channel',
    usage: '/join #channel',
    handler: async (args) => {
      const name = args[0]?.replace('#', '');
      if (!name) throw new ChatError('Usage: /join #channel');
      const channel = await db.getChannelByName(name);
      if (!channel) throw new ChatError(`Channel #${name} not found`);
      await joinChannel(channel.id);
    }
  }],

  ['leave', {
    name: 'leave',
    description: 'Leave current channel',
    usage: '/leave',
    handler: async () => {
      await leaveChannel(currentChannel);
    }
  }],

  ['create', {
    name: 'create',
    description: 'Create a new channel',
    usage: '/create #name [topic]',
    handler: async (args) => {
      const name = args[0]?.replace('#', '');
      const topic = args.slice(1).join(' ') || '';
      if (!name) throw new ChatError('Usage: /create #name [topic]');
      await createChannel({ name, type: 'public', topic, createdBy: ctx.user.id });
      systemMessage(`Channel #${name} created!`);
    }
  }],

  ['delete', {
    name: 'delete',
    description: 'Delete a channel',
    usage: '/delete #channel',
    minSecLevel: 80,
    handler: async (args) => {
      const name = args[0]?.replace('#', '');
      if (!name) throw new ChatError('Usage: /delete #channel');
      const channel = await db.getChannelByName(name);
      if (!channel) throw new ChatError(`Channel #${name} not found`);
      await deleteChannel(channel.id);
      systemMessage(`Channel #${name} deleted`);
    }
  }],

  ['topic', {
    name: 'topic',
    description: 'Set channel topic',
    usage: '/topic <new topic>',
    handler: async (args) => {
      const topic = args.join(' ');
      await setChannelTopic(currentChannel, topic);
    }
  }],

  // ===== Messaging Commands =====
  ['msg', {
    name: 'msg',
    description: 'Send a DM',
    usage: '/msg @user message',
    handler: async (args) => {
      const username = args[0]?.replace('@', '');
      const message = args.slice(1).join(' ');
      if (!username || !message) throw new ChatError('Usage: /msg @user message');
      const user = await db.getUserByUsername(username);
      if (!user) throw new ChatError(`User ${username} not found`);
      const dm = await getOrCreateDM(user.id);
      await sendMessage(dm.id, message);
    }
  }],

  ['me', {
    name: 'me',
    description: 'Send an action message',
    usage: '/me does something',
    handler: async (args) => {
      const action = args.join(' ');
      if (!action) throw new ChatError('Usage: /me does something');
      await sendActionMessage(currentChannel, action);
    }
  }],

  ['reply', {
    name: 'reply',
    description: 'Reply to last message',
    usage: '/reply message',
    handler: async (args) => {
      const message = args.join(' ');
      if (!message) throw new ChatError('Usage: /reply message');
      const lastMsg = await db.getLastMessage(currentChannel);
      if (!lastMsg) throw new ChatError('No message to reply to');
      await replyToMessage(lastMsg.id, message);
    }
  }],

  // ===== User Commands =====
  ['who', {
    name: 'who',
    description: 'List users in channel',
    usage: '/who',
    handler: async () => {
      const members = await db.getChannelMembers(currentChannel);
      const online = members.filter(m => m.isOnline);
      chatLog.log(`{cyan-fg}=== Users in #${currentChannelName} (${online.length}/${members.length}) ==={/}`);
      for (const m of online) {
        const role = m.role !== 'member' ? ` {yellow-fg}[${m.role}]{/}` : '';
        chatLog.log(`  ${colorUsername(m.username)}${role}`);
      }
    }
  }],

  ['whois', {
    name: 'whois',
    description: 'Show user info',
    usage: '/whois @user',
    handler: async (args) => {
      const username = args[0]?.replace('@', '');
      if (!username) throw new ChatError('Usage: /whois @user');
      await showUserProfile(username);
    }
  }],

  ['away', {
    name: 'away',
    description: 'Set away status',
    usage: '/away [message]',
    handler: async (args) => {
      const message = args.join(' ') || 'Away';
      await setStatus('away', message);
      systemMessage(`You are now away: ${message}`);
    }
  }],

  ['back', {
    name: 'back',
    description: 'Return from away',
    usage: '/back',
    handler: async () => {
      await setStatus('online', '');
      systemMessage('You are now online');
    }
  }],

  // ===== Moderation Commands =====
  ['kick', {
    name: 'kick',
    description: 'Kick user from channel',
    usage: '/kick @user [reason]',
    minSecLevel: 80,
    handler: async (args) => {
      const username = args[0]?.replace('@', '');
      const reason = args.slice(1).join(' ') || 'No reason given';
      if (!username) throw new ChatError('Usage: /kick @user [reason]');
      await kickUser(currentChannel, username, reason);
    }
  }],

  ['ban', {
    name: 'ban',
    description: 'Ban user from channel',
    usage: '/ban @user [reason]',
    minSecLevel: 100,
    handler: async (args) => {
      const username = args[0]?.replace('@', '');
      const reason = args.slice(1).join(' ') || 'No reason given';
      if (!username) throw new ChatError('Usage: /ban @user [reason]');
      await banUser(currentChannel, username, reason);
    }
  }],

  ['unban', {
    name: 'unban',
    description: 'Unban user from channel',
    usage: '/unban @user',
    minSecLevel: 100,
    handler: async (args) => {
      const username = args[0]?.replace('@', '');
      if (!username) throw new ChatError('Usage: /unban @user');
      await unbanUser(currentChannel, username);
    }
  }],

  // ===== Event Preferences =====
  ['events', {
    name: 'events',
    description: 'Toggle BBS event notifications',
    usage: '/events [on|off|logins|files|doors]',
    handler: async (args) => {
      const option = args[0]?.toLowerCase();
      await toggleEventPreference(option);
    }
  }],

  // ===== Utility Commands =====
  ['search', {
    name: 'search',
    description: 'Search messages',
    usage: '/search query',
    handler: async (args) => {
      const query = args.join(' ');
      if (!query) throw new ChatError('Usage: /search query');
      await searchMessages(query);
    }
  }],

  ['pin', {
    name: 'pin',
    description: 'Pin a message',
    usage: '/pin [message-id]',
    minSecLevel: 80,
    handler: async (args) => {
      const msgId = args[0] || (await db.getLastMessage(currentChannel))?.id;
      if (!msgId) throw new ChatError('No message to pin');
      await pinMessage(currentChannel, msgId);
    }
  }],

  ['clear', {
    name: 'clear',
    description: 'Clear chat display',
    usage: '/clear',
    handler: async () => {
      chatLog.setContent('');
      screen.render();
    }
  }],

  ['help', {
    name: 'help',
    description: 'Show available commands',
    usage: '/help [command]',
    handler: async (args) => {
      if (args[0]) {
        const cmd = slashCommands.get(args[0].toLowerCase());
        if (!cmd) throw new ChatError(`Unknown command: ${args[0]}`);
        chatLog.log(`{cyan-fg}/${cmd.name}{/} - ${cmd.description}`);
        chatLog.log(`Usage: ${cmd.usage}`);
      } else {
        chatLog.log('{cyan-fg}=== Available Commands ==={/}');
        for (const [name, cmd] of slashCommands) {
          if (!cmd.minSecLevel || ctx.user.secLevel >= cmd.minSecLevel) {
            chatLog.log(`  /{bold}${name}{/bold} - ${cmd.description}`);
          }
        }
        chatLog.log('{gray-fg}Type /help <command> for details{/}');
      }
    }
  }]
]);

// Execute slash command
async function executeSlashCommand(input: string): Promise<void> {
  const parts = input.slice(1).split(/\s+/);
  const cmdName = parts[0].toLowerCase();
  const args = parts.slice(1);

  const cmd = slashCommands.get(cmdName);
  if (!cmd) {
    systemMessage(`Unknown command: /${cmdName}. Type /help for list.`, 'error');
    return;
  }

  if (cmd.minSecLevel && ctx.user.secLevel < cmd.minSecLevel) {
    systemMessage(`Permission denied. Required level: ${cmd.minSecLevel}`, 'error');
    return;
  }

  try {
    await cmd.handler(args);
  } catch (err) {
    systemMessage(err.message, 'error');
  }
}
```

---

## Part 5: Audio Feedback

```typescript
import { AudioEngine } from '@amiexpress/bbs-door-sdk';

const audio = new AudioEngine();

// Sound configuration
const sounds = {
  message: { note: 'C5', duration: 0.05 },
  mention: { notes: ['E5', 'G5', 'C6'], duration: 0.1 },
  join: { notes: ['C4', 'E4', 'G4'], duration: 0.15 },
  leave: { notes: ['G4', 'E4', 'C4'], duration: 0.15 },
  error: { note: 'C3', duration: 0.2 },
  notification: { note: 'A4', duration: 0.05 },
  typing: null // No sound for typing (too frequent)
};

// Play sound for event
function playSound(type: keyof typeof sounds): void {
  if (!userPrefs.notificationSound) return;

  const sound = sounds[type];
  if (!sound) return;

  if ('notes' in sound) {
    audio.playChord(sound.notes, sound.duration);
  } else if ('note' in sound) {
    audio.playNote(sound.note, sound.duration);
  }
}

// Event handlers
socket.on('chat:message', (data) => {
  // Check if it's a mention
  if (data.message.includes(`@${ctx.user.username}`)) {
    if (userPrefs.mentionSound) {
      playSound('mention');
    }
  } else {
    playSound('message');
  }
});

socket.on('chat:user-joined', () => playSound('join'));
socket.on('chat:user-left', () => playSound('leave'));
socket.on('bbs:event', () => playSound('notification'));
```

---

## Part 6: Implementation Plan

### 6.1 Development Phases

**Phase 1: Core Infrastructure (3-4 days)**
- [ ] Database schema and migrations
- [ ] Chat repository (CRUD for channels, messages)
- [ ] Socket.IO event infrastructure
- [ ] Basic channel join/leave
- [ ] **CRITICAL: Keystroke transmission system**

**Phase 2: Neo-Blessed UI (3-4 days)**
- [ ] Main screen layout (split pane)
- [ ] Channel list with navigation
- [ ] Scrollable chat log
- [ ] **CRITICAL: Real-time typing preview area**
- [ ] Input box with cursor
- [ ] Keyboard shortcuts

**Phase 3: BBS Event Integration (2-3 days)**
- [ ] BBSEventBus service
- [ ] Event emitters in BBS handlers
- [ ] Event preferences system
- [ ] Event formatting and display

**Phase 4: Core Features (3-4 days)**
- [ ] Slash commands (/join, /msg, /who, etc.)
- [ ] Reactions system
- [ ] Mentions and notifications
- [ ] Multi-user typing indicators
- [ ] User presence/status

**Phase 5: Advanced Features (3-4 days)**
- [ ] Message threading
- [ ] Pinned messages
- [ ] Full-text search
- [ ] File sharing
- [ ] Channel moderation

**Phase 6: Polish & Testing (2-3 days)**
- [ ] Audio feedback
- [ ] Performance optimization
- [ ] Multi-user testing
- [ ] Documentation
- [ ] Bug fixes

### 6.2 Directory Structure

```
doors/livechat-v2/
├── package.json
├── tsconfig.json
├── index.ts                    # Main entry (runDoor)
├── src/
│   ├── ui/
│   │   ├── screen.ts           # Neo-blessed screen setup
│   │   ├── components/
│   │   │   ├── top-bar.ts
│   │   │   ├── channel-list.ts
│   │   │   ├── chat-log.ts
│   │   │   ├── typing-preview.ts  # CRITICAL: Real-time typing display
│   │   │   ├── input-box.ts
│   │   │   └── status-bar.ts
│   │   └── modals/
│   │       ├── help.ts
│   │       ├── channel-create.ts
│   │       └── user-profile.ts
│   ├── core/
│   │   ├── keystroke-handler.ts   # CRITICAL: Character-by-character
│   │   ├── message-handler.ts
│   │   ├── channel-handler.ts
│   │   └── event-handler.ts       # BBS event processing
│   ├── commands/
│   │   ├── index.ts
│   │   ├── channel.ts
│   │   ├── messaging.ts
│   │   ├── moderation.ts
│   │   └── utility.ts
│   ├── services/
│   │   ├── bbs-event-bus.ts      # CRITICAL: BBS announcements
│   │   ├── chat.service.ts
│   │   ├── channel.service.ts
│   │   └── presence.service.ts
│   ├── database/
│   │   ├── repository.ts
│   │   ├── migrations.ts
│   │   └── models.ts
│   └── utils/
│       ├── formatting.ts
│       ├── colors.ts
│       └── audio.ts
└── Commands/BBSCmd/
    └── CHAT.info
```

---

## Part 7: Success Criteria

### Must Have (MVP)
- [ ] Real-time character-by-character typing display
- [ ] BBS system event announcements (logins, uploads, doors)
- [ ] Group chat with 3+ users
- [ ] Channels with # prefix
- [ ] Create/delete channels (users own, admins all)
- [ ] Basic slash commands (/join, /msg, /who, /help)
- [ ] Neo-blessed split-pane UI

### Should Have
- [ ] Reactions (emoji)
- [ ] Mentions (@user)
- [ ] User presence (online/away/dnd)
- [ ] Message history (scrollback)
- [ ] Audio feedback
- [ ] DMs (private 1-on-1)

### Nice to Have
- [ ] Message threading
- [ ] Pinned messages
- [ ] File sharing
- [ ] Full-text search
- [ ] Channel moderation (kick/ban)
- [ ] Custom emojis

### Performance
- [ ] Keystroke latency < 50ms
- [ ] Message delivery < 100ms
- [ ] Support 50+ concurrent users
- [ ] 100+ messages/second throughput

---

## Part 8: Final Notes

### Key Differentiators

1. **Real-Time Typing** - Unlike Discord/Slack which show "is typing...", we show ACTUAL characters appearing in real-time. This is the BBS magic that modern chats lost.

2. **BBS Activity Feed** - The chat is a living window into BBS activity. See who logs in, what they download, which doors they play. Makes the BBS feel alive even when you're just chatting.

3. **Retro Aesthetics** - Neo-blessed TUI provides that classic terminal look while supporting modern features. Unicode emojis in a terminal? Yes!

4. **Integrated Experience** - Not a separate app, but deeply woven into the BBS. Your chat follows you across the system.

### Remember

- **Keep current LIVECHAT** as reference until v2 is complete
- **Test with real users** early and often
- **Character-by-character is NON-NEGOTIABLE** - this is what makes BBS chat special
- **BBS events make the chat alive** - users should feel the pulse of the system
- **Performance matters** - keystrokes must be instant

---

**Version**: 2.0
**Date**: December 16, 2025
**Author**: Claude Code (Opus 4.5)

**Research Sources:**
- [Slack vs. Discord (Zapier)](https://zapier.com/blog/slack-vs-discord/)
- [Slack vs Discord Platform (UnSpot)](https://unspot.com/blog/slack-vs-discord/)
- [Slack vs Discord 2025 (RemoteWize)](https://remotewize.com/slack-vs-discord/)
- AmiExpress SDK v2.0 Comprehensive Guide
- TypeScript Door Development Guide
- Current LiveChat Implementation Analysis
