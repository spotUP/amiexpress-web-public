# 🗨️ INTERNODE CHAT IMPLEMENTATION PLAN (Phase 1)

**Created:** 2025-10-16
**Status:** 📋 Planning Phase
**Target Completion:** Week 2-3
**Estimated Effort:** 4-6 days

---

## 📋 EXECUTIVE SUMMARY

This document outlines the implementation plan for real-time internode chat functionality in AmiExpress-Web BBS. Internode chat allows users logged into different nodes (connections) to engage in live, synchronous communication.

**Scope:**
- Phase 1: Basic 1:1 user-to-user chat
- Future Phase 2: Multi-user chat rooms
- Future Phase 3: Conference-based chat channels
- Future Phase 4: Cross-BBS chat (FTN-style)

**Dependencies:**
- ✅ Socket.io real-time infrastructure (existing)
- ✅ NodeManager for node tracking (existing)
- ✅ OLM system for messaging patterns (existing)
- ✅ User availability preferences (existing)

---

## 🎯 GOALS & REQUIREMENTS

### Primary Goals:
1. Enable real-time 1:1 chat between users on different nodes
2. Preserve existing BBS workflow (state machine)
3. Provide clear visual indicators for chat state
4. Support chat requests, acceptance/rejection, and termination
5. Maintain chat history for duration of session

### User Stories:
- **As a user**, I want to see who is online and available for chat
- **As a user**, I want to request a chat with another online user
- **As a user**, I want to accept or decline chat requests
- **As a user**, I want to send/receive messages in real-time during a chat
- **As a user**, I want to exit a chat and return to BBS
- **As a user**, I want to toggle my chat availability
- **As a sysop**, I want to monitor active chat sessions
- **As a sysop**, I want to join/interrupt chats if needed

### Non-Functional Requirements:
- Response time: < 100ms for message delivery
- No polling - push-based with Socket.io
- Graceful handling of disconnections
- No message loss during active chat
- Clear state transitions (BBS → Chat → BBS)

---

## 🏗️ TECHNICAL ARCHITECTURE

### High-Level Design:

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (xterm.js)                      │
│  - Display chat interface                                    │
│  - Send/receive chat messages                                │
│  - Show chat status (requesting, active, ended)              │
└─────────────────────────────────────────────────────────────┘
                              ↓ Socket.io
┌─────────────────────────────────────────────────────────────┐
│                  Backend (index.ts)                          │
│  - Chat request handlers                                     │
│  - Chat message routing                                      │
│  - State management (ChatState enum)                         │
│  - Socket.io rooms per chat session                          │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                Database (PostgreSQL)                         │
│  - chat_sessions table (session metadata)                    │
│  - chat_messages table (message history)                     │
│  - users.availableforchat (existing)                         │
└─────────────────────────────────────────────────────────────┘
```

### Chat Flow Diagram:

```
User A                    Server                      User B
  │                         │                           │
  │─── CHAT REQUEST ───────>│                           │
  │    "CHAT <username>"    │                           │
  │                         │─── CHAT INVITE ──────────>│
  │                         │   "User A wants to chat"  │
  │                         │                           │
  │                         │<─── CHAT ACCEPT ──────────│
  │<─── CHAT STARTED ───────│    or                     │
  │   "Chat with User B"    │    CHAT DECLINE           │
  │                         │                           │
  │─── CHAT MESSAGE ───────>│                           │
  │   "Hello!"              │─── CHAT MESSAGE ─────────>│
  │                         │   "Hello!"                │
  │                         │                           │
  │<─── CHAT MESSAGE ───────│<─── CHAT MESSAGE ─────────│
  │   "Hi there!"           │   "Hi there!"             │
  │                         │                           │
  │─── CHAT END ───────────>│                           │
  │                         │─── CHAT ENDED ───────────>│
  │<─── RETURN TO BBS ──────│                           │
  │                         │                           │
```

---

## 🗄️ DATABASE SCHEMA

### New Table: `chat_sessions`

```sql
CREATE TABLE IF NOT EXISTS chat_sessions (
  id SERIAL PRIMARY KEY,
  session_id TEXT UNIQUE NOT NULL,           -- UUID for this chat session
  initiator_id TEXT NOT NULL REFERENCES users(id),
  recipient_id TEXT NOT NULL REFERENCES users(id),
  initiator_username TEXT NOT NULL,
  recipient_username TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requesting',  -- requesting, active, ended, declined
  started_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMPTZ,
  initiator_socket TEXT NOT NULL,            -- Socket ID for real-time routing
  recipient_socket TEXT NOT NULL,
  message_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_chat_sessions_status ON chat_sessions(status);
CREATE INDEX idx_chat_sessions_users ON chat_sessions(initiator_id, recipient_id);
CREATE INDEX idx_chat_sessions_active ON chat_sessions(status, started_at) WHERE status = 'active';
```

### New Table: `chat_messages`

```sql
CREATE TABLE IF NOT EXISTS chat_messages (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id),
  sender_username TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_chat_messages_session ON chat_messages(session_id, created_at);
CREATE INDEX idx_chat_messages_sender ON chat_messages(sender_id);
```

### Existing Table Modifications:

**`users` table** (no changes needed - `availableforchat` already exists)

**Session modifications** (add chat state to BBSSession):
```typescript
interface BBSSession {
  // ... existing fields ...
  chatSessionId?: string;        // Current chat session ID (if in chat)
  chatWithUserId?: string;       // User ID of chat partner
  chatWithUsername?: string;     // Username of chat partner
  previousState?: BBSState;      // State to return to after chat
  previousSubState?: LoggedOnSubState;
}
```

---

## 🔧 BACKEND IMPLEMENTATION

### Phase 1A: Database Layer (`database.ts`)

**New Methods to Add:**

```typescript
// Chat session management
async createChatSession(
  initiatorId: string,
  initiatorUsername: string,
  initiatorSocket: string,
  recipientId: string,
  recipientUsername: string,
  recipientSocket: string
): Promise<string>; // Returns session_id (UUID)

async getChatSession(sessionId: string): Promise<ChatSession | null>;

async updateChatSessionStatus(
  sessionId: string,
  status: 'requesting' | 'active' | 'ended' | 'declined'
): Promise<void>;

async getChatSessionBySocketId(socketId: string): Promise<ChatSession | null>;

async endChatSession(sessionId: string): Promise<void>;

async getActiveChatSessions(): Promise<ChatSession[]>;

// Chat messages
async saveChatMessage(
  sessionId: string,
  senderId: string,
  senderUsername: string,
  message: string
): Promise<number>; // Returns message ID

async getChatHistory(sessionId: string, limit?: number): Promise<ChatMessage[]>;

async getChatMessageCount(sessionId: string): Promise<number>;

// User availability (extends existing)
async getAvailableUsersForChat(): Promise<Array<{
  id: string;
  username: string;
  realname: string;
  securityLevel: number;
  currentAction?: string;
}>>;
```

**TypeScript Interfaces:**

```typescript
interface ChatSession {
  id: number;
  session_id: string;
  initiator_id: string;
  recipient_id: string;
  initiator_username: string;
  recipient_username: string;
  status: 'requesting' | 'active' | 'ended' | 'declined';
  started_at: Date;
  ended_at?: Date;
  initiator_socket: string;
  recipient_socket: string;
  message_count: number;
  created_at: Date;
  updated_at: Date;
}

interface ChatMessage {
  id: number;
  session_id: string;
  sender_id: string;
  sender_username: string;
  message: string;
  created_at: Date;
}
```

### Phase 1B: Socket.io Event Handlers (`index.ts`)

**New Socket Events:**

```typescript
// Initiating chat
socket.on('chat:request', async (data: { targetUsername: string }) => {
  // 1. Validate current user is logged in and available
  // 2. Find target user by username
  // 3. Check target user is online and available
  // 4. Create chat session in database (status: 'requesting')
  // 5. Get target user's socket ID from sessions
  // 6. Emit 'chat:invite' to target socket
  // 7. Emit 'chat:request-sent' to initiator
});

// Responding to chat request
socket.on('chat:accept', async (data: { sessionId: string }) => {
  // 1. Get chat session from database
  // 2. Validate user is the recipient
  // 3. Update session status to 'active'
  // 4. Create Socket.io room: `chat:${sessionId}`
  // 5. Join both sockets to room
  // 6. Update BBSSession for both users (add chatSessionId, save previous state)
  // 7. Emit 'chat:started' to both users
  // 8. Send welcome messages
});

socket.on('chat:decline', async (data: { sessionId: string }) => {
  // 1. Get chat session
  // 2. Update status to 'declined'
  // 3. Emit 'chat:declined' to initiator
  // 4. Clean up session
});

// Sending messages
socket.on('chat:message', async (data: { message: string }) => {
  // 1. Get current chat session from BBSSession
  // 2. Validate user is in active chat
  // 3. Save message to database
  // 4. Emit to Socket.io room (both participants receive)
  // 5. Update message_count in session
});

// Ending chat
socket.on('chat:end', async () => {
  // 1. Get chat session
  // 2. Update status to 'ended'
  // 3. Restore previous BBSState for both users
  // 4. Leave Socket.io room
  // 5. Emit 'chat:ended' to both users
  // 6. Return both to previous BBS state
});

// Handle disconnection during chat
socket.on('disconnect', async () => {
  // Check if user was in active chat
  // If so, notify other user
  // End chat session gracefully
  // ... existing disconnect logic ...
});
```

### Phase 1C: BBS Command Integration (`index.ts`)

**New CHAT Command:**

```typescript
case 'CHAT': {
  // CHAT - Display chat menu
  // CHAT <username> - Request chat with user
  // CHAT WHO - List available users
  // CHAT TOGGLE - Toggle availability
  // CHAT END - End current chat
  // CHAT HISTORY - View recent chat sessions (future)

  if (!params) {
    // Display chat menu
    socket.emit('ansi-output', '\x1b[36m-= Internode Chat System =-\x1b[0m\r\n\r\n');
    socket.emit('ansi-output', 'Commands:\r\n');
    socket.emit('ansi-output', '  CHAT <username>  - Request chat with user\r\n');
    socket.emit('ansi-output', '  CHAT WHO         - List users available for chat\r\n');
    socket.emit('ansi-output', '  CHAT TOGGLE      - Toggle your chat availability\r\n');
    socket.emit('ansi-output', '  CHAT END         - End current chat session\r\n');
    socket.emit('ansi-output', '  CHAT HELP        - This help screen\r\n\r\n');

    // Show current status
    const user = session.user!;
    const status = user.availableforchat ? 'Available' : 'Not Available';
    socket.emit('ansi-output', `Your status: \x1b[33m${status}\x1b[0m\r\n`);

    // Show if currently in chat
    if (session.chatSessionId) {
      socket.emit('ansi-output', `\x1b[32mCurrently chatting with: ${session.chatWithUsername}\x1b[0m\r\n`);
    }
    return;
  }

  const subCommand = params.split(' ')[0].toUpperCase();
  const subParams = params.substring(subCommand.length).trim();

  switch (subCommand) {
    case 'WHO':
      // List available users (exclude self, show only online & available)
      break;

    case 'TOGGLE':
      // Toggle availableforchat field
      break;

    case 'END':
      // End current chat session
      break;

    default:
      // Treat as username - request chat
      socket.emit('chat:request', { targetUsername: params });
      break;
  }
  break;
}
```

### Phase 1D: Chat State Management

**BBSState Extension:**

Option 1: Add new main state
```typescript
enum BBSState {
  CONNECTED = 'CONNECTED',
  LOGGEDON = 'LOGGEDON',
  CHAT = 'CHAT',  // New state for active chat
  DISCONNECTED = 'DISCONNECTED'
}
```

Option 2: Add chat substate (preferred)
```typescript
enum LoggedOnSubState {
  // ... existing substates ...
  CHAT = 'CHAT'  // User in active chat session
}
```

**Recommendation**: Use Option 2 (substate) because:
- Chat is only available when logged on
- Easier to return to previous state
- Less disruption to existing state machine

**Input Handling During Chat:**

```typescript
// In handleCommand function
async function handleCommand(socket: any, session: BBSSession, data: string) {
  // Check if user is in chat mode
  if (session.subState === LoggedOnSubState.CHAT) {
    // Special handling for chat mode
    if (data.toUpperCase() === '/END' || data.toUpperCase() === '/EXIT') {
      // End chat session
      socket.emit('chat:end');
      return;
    }

    // Otherwise, treat as chat message
    socket.emit('chat:message', { message: data });
    return;
  }

  // ... normal command processing ...
}
```

---

## 🎨 USER INTERFACE

### Chat Request Flow:

**Initiator sees:**
```
> CHAT Alice

Requesting chat with Alice...
Waiting for response... (30 second timeout)
```

**Recipient sees:**
```
*** CHAT REQUEST ***
Bob wants to chat with you!

Type CHAT ACCEPT to accept
Type CHAT DECLINE to decline

(Request expires in 30 seconds)
```

### Active Chat Interface:

**Both users see:**
```
═══════════════════════════════════════════════════════════════
                  CHAT SESSION WITH [USERNAME]
═══════════════════════════════════════════════════════════════

Type your messages and press ENTER to send.
Type /END to exit chat.

───────────────────────────────────────────────────────────────
[12:34] Bob: Hello Alice!
[12:34] Alice: Hi Bob! How are you?
[12:35] Bob: Great! Just checking out this BBS.
───────────────────────────────────────────────────────────────
>
```

### Chat End:

**Both users see:**
```
═══════════════════════════════════════════════════════════════
               CHAT SESSION ENDED
═══════════════════════════════════════════════════════════════

Chat with [username] has ended.
Duration: 5 minutes
Messages exchanged: 47

Press ENTER to return to BBS...
```

---

## 🔒 SECURITY & VALIDATION

### Access Controls:
1. **Chat availability**: Only users with `availableforchat = true` can receive requests
2. **Security levels**: Optional - restrict chat to users within X levels
3. **Ignore list**: Future - allow users to block specific users
4. **Sysop override**: Sysop can join any chat (future)

### Input Validation:
```typescript
// Validate username exists and is online
if (!targetUser) {
  socket.emit('error', 'User not found or not online');
  return;
}

// Validate target is available
if (!targetUser.availableforchat) {
  socket.emit('error', 'User is not available for chat');
  return;
}

// Validate not already in chat
if (session.chatSessionId) {
  socket.emit('error', 'You are already in a chat session');
  return;
}

// Validate message length
if (message.length > 500) {
  socket.emit('error', 'Message too long (max 500 characters)');
  return;
}

// Sanitize message (prevent ANSI injection)
const sanitized = message.replace(/\x1b/g, '').trim();
```

### Rate Limiting:
```typescript
// Add to existing SocketRateLimiter
const chatRequestLimiter = new SocketRateLimiter(10, 5 * 60 * 1000); // 10 requests per 5 minutes
const chatMessageLimiter = new SocketRateLimiter(100, 60 * 1000);    // 100 messages per minute
```

### Timeouts:
- **Chat request timeout**: 30 seconds (auto-decline if no response)
- **Inactivity timeout**: 10 minutes (warn at 9 minutes)
- **Maximum chat duration**: 60 minutes (configurable)

---

## 📊 METRICS & LOGGING

### Metrics to Track:
- Total chat sessions initiated
- Chat acceptance rate
- Average chat duration
- Average messages per session
- Peak concurrent chats
- Chat requests by user

### Logging Events:
```typescript
console.log(`[CHAT] User ${initiator} requested chat with ${recipient}`);
console.log(`[CHAT] Session ${sessionId} started: ${initiator} <-> ${recipient}`);
console.log(`[CHAT] Session ${sessionId} ended after ${duration}ms, ${msgCount} messages`);
console.log(`[CHAT] Session ${sessionId} declined by ${recipient}`);
console.log(`[CHAT] Session ${sessionId} timeout - no response from ${recipient}`);
```

### Database Queries for Analytics:
```sql
-- Most active chatters
SELECT sender_username, COUNT(*) as message_count
FROM chat_messages
GROUP BY sender_username
ORDER BY message_count DESC
LIMIT 10;

-- Chat acceptance rate
SELECT
  COUNT(*) FILTER (WHERE status = 'active') as accepted,
  COUNT(*) FILTER (WHERE status = 'declined') as declined,
  COUNT(*) FILTER (WHERE status = 'requesting' AND
    started_at < NOW() - INTERVAL '30 seconds') as timeout
FROM chat_sessions;

-- Average chat duration
SELECT AVG(EXTRACT(EPOCH FROM (ended_at - started_at)))
FROM chat_sessions
WHERE status = 'ended' AND ended_at IS NOT NULL;
```

---

## 🧪 TESTING PLAN

### Unit Tests (backend/tests/chat.test.ts):

```typescript
describe('Chat Session Management', () => {
  test('Create chat session', async () => {
    const sessionId = await db.createChatSession(...);
    expect(sessionId).toBeTruthy();
  });

  test('Update chat session status', async () => {
    await db.updateChatSessionStatus(sessionId, 'active');
    const session = await db.getChatSession(sessionId);
    expect(session?.status).toBe('active');
  });

  test('Save and retrieve chat messages', async () => {
    await db.saveChatMessage(sessionId, userId, username, 'Hello');
    const messages = await db.getChatHistory(sessionId);
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toBe('Hello');
  });
});

describe('Chat Request Flow', () => {
  test('Request chat with online user', async () => {
    // Simulate socket event
    // Verify database record created
    // Verify target socket received invite
  });

  test('Request chat with offline user fails', async () => {
    // Should return error
  });

  test('Request chat with unavailable user fails', async () => {
    // User has availableforchat = false
    // Should return error
  });
});

describe('Chat Message Exchange', () => {
  test('Send message in active chat', async () => {
    // Both users should receive message
  });

  test('Send message outside chat fails', async () => {
    // User not in chat session
    // Should return error
  });
});
```

### Integration Tests:

```typescript
describe('End-to-End Chat Flow', () => {
  test('Full chat session', async () => {
    // 1. User A requests chat with User B
    // 2. User B accepts
    // 3. Both users exchange 5 messages
    // 4. User A ends chat
    // 5. Both users return to BBS
    // 6. Verify database records
  });

  test('Chat decline flow', async () => {
    // 1. User A requests chat
    // 2. User B declines
    // 3. Verify User A notified
    // 4. Verify session status = 'declined'
  });

  test('Chat timeout flow', async () => {
    // 1. User A requests chat
    // 2. Wait 31 seconds (no response)
    // 3. Verify auto-decline
    // 4. Verify User A notified
  });
});
```

### Manual Testing Checklist:

- [ ] Request chat with online available user → Accept → Chat → End
- [ ] Request chat with online unavailable user → Error message
- [ ] Request chat with offline user → Error message
- [ ] Request chat → Decline → Verify notification
- [ ] Request chat → No response → Verify 30s timeout
- [ ] Active chat: Send 50 messages rapidly → All delivered
- [ ] Active chat: User A disconnects → User B notified, chat ends
- [ ] Active chat: Type `/END` → Chat ends gracefully
- [ ] CHAT WHO command → See list of available users
- [ ] CHAT TOGGLE → Availability changes, reflected in WHO list
- [ ] Two users in chat → Sysop joins (future)

---

## 📅 IMPLEMENTATION TIMELINE

### Day 1: Database & Core Infrastructure (4-6 hours)
- [ ] Create `chat_sessions` table
- [ ] Create `chat_messages` table
- [ ] Add BBSSession chat fields
- [ ] Write database methods (createChatSession, saveChatMessage, etc.)
- [ ] Write unit tests for database layer
- [ ] Test migrations on development database

### Day 2: Socket.io Event Handlers (6-8 hours)
- [ ] Implement `chat:request` handler
- [ ] Implement `chat:accept` handler
- [ ] Implement `chat:decline` handler
- [ ] Implement `chat:message` handler
- [ ] Implement `chat:end` handler
- [ ] Add disconnect handling for active chats
- [ ] Write integration tests for event handlers

### Day 3: BBS Command Integration (4-6 hours)
- [ ] Add CHAT command to processBBSCommand
- [ ] Implement CHAT subcommands (WHO, TOGGLE, END)
- [ ] Add chat mode input handling in handleCommand
- [ ] Update menu displays to show CHAT command
- [ ] Test command routing and state transitions

### Day 4: User Interface & Messages (3-4 hours)
- [ ] Design chat interface ANSI layouts
- [ ] Implement chat request notifications
- [ ] Implement chat started/ended messages
- [ ] Add message formatting with timestamps
- [ ] Add typing indicators (future enhancement)

### Day 5: Security & Validation (3-4 hours)
- [ ] Add input validation for all handlers
- [ ] Implement rate limiting (chatRequestLimiter, chatMessageLimiter)
- [ ] Add timeout handlers (request timeout, inactivity timeout)
- [ ] Add ANSI sanitization for messages
- [ ] Test security controls

### Day 6: Testing & Documentation (4-6 hours)
- [ ] Run full test suite
- [ ] Manual testing checklist
- [ ] Fix bugs discovered during testing
- [ ] Write INTERNODE_CHAT_FEATURE.md documentation
- [ ] Update PROJECT_STATUS.md
- [ ] Update MASTER_PLAN.md

**Total Estimated Time:** 24-34 hours (3-4 days of focused work)

---

## 🚀 DEPLOYMENT STRATEGY

### Development Environment:
1. Create feature branch: `git checkout -b feature/internode-chat`
2. Implement Phase 1 (Days 1-6)
3. Test locally with multiple browser windows
4. Code review
5. Merge to main

### Staging Environment:
1. Deploy to staging server
2. Multi-user testing (recruit beta testers)
3. Monitor logs for errors
4. Performance testing (simulate 10+ concurrent chats)

### Production Deployment:
1. Database migration (automatic via migrations.ts)
2. Deploy backend updates
3. Deploy frontend updates (if needed)
4. Monitor first 24 hours closely
5. Announce feature to users

### Rollback Plan:
- Database migrations are non-destructive (only adding tables)
- Can disable CHAT command without code changes
- Redis sessions remain compatible

---

## 🔮 FUTURE ENHANCEMENTS (Phase 2+)

### Phase 2: Multi-User Chat Rooms (2-3 days)
- Create chat rooms by conference/topic
- Room join/leave mechanics
- Room moderation (kick, mute)
- Public vs. private rooms

### Phase 3: Advanced Features (3-4 days)
- File sharing during chat
- User typing indicators
- Message editing/deletion
- Chat history export
- Ignore/block users
- Away messages

### Phase 4: Cross-BBS Chat (5-7 days)
- FidoNet-style chat bridging
- Inter-BBS chat protocols
- Remote user display
- Message routing

---

## 📊 SUCCESS METRICS

### Phase 1 Acceptance Criteria:
- ✅ Two users can initiate and complete a chat session
- ✅ Chat requests can be accepted or declined
- ✅ Messages appear in real-time for both users
- ✅ Chat sessions end gracefully
- ✅ Disconnections handled properly
- ✅ No message loss during active chat
- ✅ CHAT WHO shows accurate online user list
- ✅ CHAT TOGGLE updates availability
- ✅ All tests pass (unit + integration)
- ✅ TypeScript compiles without errors
- ✅ No console errors during chat flow

### Key Performance Indicators (KPIs):
- **Message Latency**: < 100ms average
- **Chat Acceptance Rate**: > 50% (target: 70%+)
- **Average Session Duration**: 3-10 minutes
- **Concurrent Chats**: Support 20+ simultaneous chats
- **Error Rate**: < 1% of messages

---

## 🔗 RELATED DOCUMENTS

- [PROJECT_STATUS.md](./PROJECT_STATUS.md) - Overall project status
- [MASTER_PLAN.md](./MASTER_PLAN.md) - Master implementation plan
- [OLM_FEATURE.md](./OLM_FEATURE.md) - Online messaging documentation
- [backend/src/nodes.ts](./backend/src/nodes.ts) - NodeManager implementation
- [backend/DEPLOYMENT.md](./backend/DEPLOYMENT.md) - Deployment guide

---

## 📞 QUESTIONS & DECISIONS

### Open Questions:
1. **Should chat be limited by security level?**
   - Option A: Any user can chat with any user
   - Option B: Only users within ±10 security levels
   - **Recommendation**: Start with A, add B as config option later

2. **Should chat history persist across sessions?**
   - Option A: Keep forever (searchable archive)
   - Option B: Delete after chat ends
   - Option C: Keep for 7 days, then auto-delete
   - **Recommendation**: Option C (compromise - allows review, prevents bloat)

3. **Should sysop have special chat privileges?**
   - Option A: Sysop can join any active chat
   - Option B: Sysop can only chat 1:1 like everyone else
   - **Recommendation**: Option A (important for moderation)

4. **How to handle multiple chat requests to same user?**
   - Option A: Queue requests (first-come, first-served)
   - Option B: Show all pending requests, user picks
   - Option C: Reject new requests if one pending
   - **Recommendation**: Option C (simplest, prevents spam)

---

**Status Legend:**
- ✅ Complete
- 🚧 In Progress
- 📅 Planned
- ⚠️ Needs Discussion
- ❌ Blocked

---

*This implementation plan is a living document. Update as implementation progresses.*
*Created: 2025-10-16*
*Next Review: After Day 3 of implementation*
