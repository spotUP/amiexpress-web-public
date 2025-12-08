# AmiExpress Multinode & Chat System - Design Document

**Date:** October 17, 2025
**Source:** AmiExpress E v5.6.0 Source Code Analysis
**Status:** 1:1 Port Specification

---

## OVERVIEW

This document specifies the exact implementation of AmiExpress's multinode system and chat features based on analysis of the original Amiga E source code.

---

## MULTINODE SYSTEM

### Source Analysis

**Files:**
- `axcommon.e` (lines 572-603) - Data structures
- `express.e` (multiple references) - Node management

**Key Data Structures (from axcommon.e:572-603):**

```e
EXPORT OBJECT nodeInfo
  handle[31]:ARRAY OF CHAR        /* Username on this node */
  netSocket:LONG                   /* Network socket handle */
  chatColor:LONG                   /* Chat color setting */
  offHook:LONG                     /* Node off-hook status */
  private:LONG                     /* Private mode flag */
  stats[MAX_NODES]:ARRAY OF semiNodestat  /* Stats for all nodes */
  t: LONG                          /* Task pointer */
  s: PTR TO singlePort             /* Port information */
  taskSignal:LONG                  /* Task signal mask */
ENDOBJECT

EXPORT OBJECT multiPort
  semi:ss                          /* Semaphore */
  list: mlh                        /* Message list header */
  myNode[MAX_NODES]:ARRAY OF nodeInfo  /* Array of nodes */
  semiName[20]:ARRAY OF CHAR       /* Semaphore name */
ENDOBJECT

EXPORT OBJECT singlePort
  semi: ss                         /* Semaphore */
  list: mlh                        /* Message list header */
  multiCom: LONG                   /* Multi-node communication flag */
  semiName[20]:ARRAY OF CHAR       /* Semaphore name */
  status:LONG                      /* Node status */
  handle[31]:ARRAY OF CHAR         /* Username */
  location[31]:ARRAY OF CHAR       /* User location */
  misc1[100]:ARRAY OF CHAR         /* Misc data 1 */
  misc2[100]:ARRAY OF CHAR         /* Misc data 2 */
  baud[10]:ARRAY OF CHAR           /* Baud rate */
ENDOBJECT
```

**Node Management:**
- Global `masterNode` of type `multiPort`
- Array of nodes: `masterNode.myNode[node]`
- Maximum nodes: `MAX_NODES` (typically 4-8)
- Inter-process communication via Amiga message ports
- Shared memory with semaphore protection

### TypeScript Implementation

```typescript
// Node information for each BBS node
interface NodeInfo {
  nodeId: number;
  handle: string;              // Username (31 chars max)
  netSocket: string;           // Socket ID
  chatColor: number;           // ANSI color code for chat
  offHook: boolean;            // Node off-hook status
  private: boolean;            // Private mode
  stats: NodeStats[];          // Stats for all nodes
  taskSignal: number;          // Signal flags
  status: NodeStatus;          // Current status
  location: string;            // User location (31 chars)
  misc1: string;               // Misc data (100 chars)
  misc2: string;               // Misc data (100 chars)
  baud: string;                // Connection speed (10 chars)
}

// Node status values
enum NodeStatus {
  AVAILABLE = 0,
  BUSY = 1,
  OFFLINE = 2,
  MAINTENANCE = 3
}

// Multi-node port manager
class MultiNodeManager {
  private nodes: Map<number, NodeInfo>;
  private maxNodes: number = 8;
  private semaphore: AsyncLock;  // For thread-safe access

  constructor() {
    this.nodes = new Map();
    this.initialize();
  }

  // Initialize node array
  private initialize(): void {
    for (let i = 1; i <= this.maxNodes; i++) {
      this.nodes.set(i, {
        nodeId: i,
        handle: '',
        netSocket: '',
        chatColor: 32, // Green default
        offHook: false,
        private: false,
        stats: [],
        taskSignal: 0,
        status: NodeStatus.AVAILABLE,
        location: '',
        misc1: '',
        misc2: '',
        baud: ''
      });
    }
  }

  // Get available node
  getAvailableNode(): number | null {
    for (const [id, node] of this.nodes) {
      if (node.status === NodeStatus.AVAILABLE) {
        return id;
      }
    }
    return null;
  }

  // Assign user to node
  assignNode(nodeId: number, username: string, socket: string): boolean {
    const node = this.nodes.get(nodeId);
    if (!node || node.status !== NodeStatus.AVAILABLE) {
      return false;
    }

    node.handle = username.substring(0, 30);
    node.netSocket = socket;
    node.status = NodeStatus.BUSY;
    return true;
  }

  // Release node
  releaseNode(nodeId: number): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.handle = '';
      node.netSocket = '';
      node.status = NodeStatus.AVAILABLE;
      node.offHook = false;
      node.private = false;
    }
  }

  // Get node info
  getNodeInfo(nodeId: number): NodeInfo | null {
    return this.nodes.get(nodeId) || null;
  }

  // Get all nodes
  getAllNodes(): NodeInfo[] {
    return Array.from(this.nodes.values());
  }

  // Get online users (all busy nodes)
  getOnlineUsers(): NodeInfo[] {
    return Array.from(this.nodes.values())
      .filter(n => n.status === NodeStatus.BUSY && n.handle);
  }
}
```

---

## CHAT SYSTEM

### Source Analysis

**Files:**
- `express.e` (lines 5854-6244) - Chat implementation

**Chat Functions:**

1. **`chat()` (line 6067)** - Regular sysop-to-user chat
2. **`tranChat()` (line 5854)** - Translation-enabled chat
3. **`sendChatFlag()` (line 13519)** - Send chat availability status
4. **`statChatFlag()` (line 13600)** - Update status bar

**Key Variables:**
- `chatFlag` - Chat is active (0=off, 1=on)
- `pagedFlag` - User is paging sysop
- `sysopAvail` - Sysop available for chat
- `chatConFlag` - Console (sysop) input enabled
- `chatSerFlag` - Serial (user) input enabled
- `chatColor` - ANSI color for chat text

**Chat Flow:**

1. User presses 'P' to page sysop
2. `pagedFlag` set to 1
3. Status bar shows paging indicator (*)
4. If sysop available (`sysopAvail=1`):
   - Display `StartChat.txt` or screen-specific version
   - Enter `chat()` or `tranChat()` function
5. Chat loop:
   - Read character from user
   - Echo to sysop console
   - Read character from sysop
   - Echo to user
   - Handle backspace, enter, ctrl+C
   - Word-wrap at column 78
   - ANSI color codes for sysop/user distinction
6. Chat ends:
   - Display `EndChat.txt`
   - Run CHATOUT command
   - Reset `chatFlag` and `pagedFlag`

**Chat Colors (from express.e:5913, 6093):**
- `LVL_CHAT_COLOR_SYSOP` - Sysop text color
- `LVL_CHAT_COLOR_USER` - User text color

### TypeScript Implementation

```typescript
// Chat message
interface ChatMessage {
  senderId: string;
  senderName: string;
  isSysop: boolean;
  message: string;
  timestamp: Date;
  color: number;  // ANSI color code
}

// Chat session
interface ChatSession {
  sessionId: string;
  userId: string;
  username: string;
  nodeId: number;
  startTime: Date;
  endTime?: Date;
  status: 'paging' | 'active' | 'ended';
  messages: ChatMessage[];
  pageCount: number;
  sysopName?: string;
  sysopAvailable: boolean;
}

// Chat manager
class ChatManager {
  private activeSessions: Map<string, ChatSession>;
  private sysopAvailable: boolean = true;
  private chatColorSysop: number = 32; // Green
  private chatColorUser: number = 36;  // Cyan

  constructor() {
    this.activeSessions = new Map();
  }

  // User pages sysop
  pageRequest(userId: string, username: string, nodeId: number, socket: SocketIO.Socket): ChatSession {
    const session: ChatSession = {
      sessionId: `chat-${Date.now()}-${userId}`,
      userId,
      username,
      nodeId,
      startTime: new Date(),
      status: 'paging',
      messages: [],
      pageCount: 1,
      sysopAvailable: this.sysopAvailable
    };

    this.activeSessions.set(session.sessionId, session);

    // Notify sysop of page request
    this.notifySysop(session);

    // Send paging message to user
    socket.emit('ansi-output', '\x1b[33mPaging sysop... Please wait.\x1b[0m\r\n');

    return session;
  }

  // Sysop answers page
  answerPage(sessionId: string, sysopName: string): boolean {
    const session = this.activeSessions.get(sessionId);
    if (!session || session.status !== 'paging') {
      return false;
    }

    session.status = 'active';
    session.sysopName = sysopName;

    // Display StartChat screen
    this.displayStartChat(session);

    return true;
  }

  // Send chat message
  sendMessage(sessionId: string, senderId: string, message: string, isSysop: boolean): void {
    const session = this.activeSessions.get(sessionId);
    if (!session || session.status !== 'active') {
      return;
    }

    const chatMsg: ChatMessage = {
      senderId,
      senderName: isSysop ? session.sysopName! : session.username,
      isSysop,
      message,
      timestamp: new Date(),
      color: isSysop ? this.chatColorSysop : this.chatColorUser
    };

    session.messages.push(chatMsg);

    // Broadcast message
    this.broadcastMessage(session, chatMsg);
  }

  // End chat session
  endChat(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    session.endTime = new Date();
    session.status = 'ended';

    // Display EndChat screen
    this.displayEndChat(session);

    // Run CHATOUT command hook
    this.runChatOutCommand(session);

    this.activeSessions.delete(sessionId);
  }

  // Display StartChat file
  private displayStartChat(session: ChatSession): void {
    // Look for Node#/StartChat.{screenType} or Node#/StartChat.txt
    const file = `Node${session.nodeId}/StartChat.txt`;
    // Display file or default message
    // "This is {sysopName}, How can I help you??"
  }

  // Display EndChat file
  private displayEndChat(session: ChatSession): void {
    // Look for Node#/EndChat.{screenType} or Node#/EndChat.txt
    const file = `Node${session.nodeId}/EndChat.txt`;
    // Display file or default: "Ending Chat."
  }

  // Broadcast message to both parties
  private broadcastMessage(session: ChatSession, msg: ChatMessage): void {
    const formatted = this.formatChatMessage(msg);

    // Send to user socket
    // Send to sysop socket
  }

  // Format chat message with ANSI colors
  private formatChatMessage(msg: ChatMessage): string {
    return `\x1b[${msg.color}m${msg.senderName}: ${msg.message}\x1b[0m\r\n`;
  }

  // Notify sysop of page
  private notifySysop(session: ChatSession): void {
    // Send notification to sysop console/window
    // Update status bar with paging indicator (*)
  }

  // Run CHATOUT command
  private runChatOutCommand(session: ChatSession): void {
    // Execute external command/AREXX script
    // Hook for logging, notifications, etc.
  }

  // Set sysop availability
  setSysopAvailable(available: boolean): void {
    this.sysopAvailable = available;
    // Update all nodes via sendChatFlag()
  }

  // Get active sessions
  getActiveSessions(): ChatSession[] {
    return Array.from(this.activeSessions.values());
  }
}
```

---

## MULTI-USER CHAT ROOMS

**Note:** The original AmiExpress does NOT have multi-user chat rooms. It only has:
1. **Sysop Chat** - One-on-one between user and sysop
2. **User-to-User Chat** - Direct chat between two users (via node-to-node)

For modern web implementation, we can extend this to add chat rooms while maintaining compatibility.

### Extended Chat Room Implementation

```typescript
// Chat room
interface ChatRoom {
  roomId: string;
  name: string;
  topic: string;
  created: Date;
  createdBy: string;
  isPublic: boolean;
  maxUsers: number;
  currentUsers: string[];  // User IDs
  messages: ChatMessage[];
  moderators: string[];    // User IDs with mod powers
  minSecurityLevel: number; // Minimum sec level to join
}

// Chat room manager
class ChatRoomManager {
  private rooms: Map<string, ChatRoom>;
  private userRooms: Map<string, string>;  // userId -> roomId

  constructor() {
    this.rooms = new Map();
    this.userRooms = new Map();

    // Create default lobby room
    this.createRoom('lobby', 'Lobby', 'General chat', 'system', true, 50, 0);
  }

  // Create chat room
  createRoom(id: string, name: string, topic: string, creator: string, isPublic: boolean, maxUsers: number, minLevel: number): ChatRoom {
    const room: ChatRoom = {
      roomId: id,
      name,
      topic,
      created: new Date(),
      createdBy: creator,
      isPublic,
      maxUsers,
      currentUsers: [],
      messages: [],
      moderators: [creator],
      minSecurityLevel: minLevel
    };

    this.rooms.set(id, room);
    return room;
  }

  // Join chat room
  joinRoom(roomId: string, userId: string, username: string, secLevel: number): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    // Check permissions
    if (secLevel < room.minSecurityLevel) return false;
    if (room.currentUsers.length >= room.maxUsers) return false;

    // Leave current room if in one
    const currentRoom = this.userRooms.get(userId);
    if (currentRoom) {
      this.leaveRoom(currentRoom, userId);
    }

    room.currentUsers.push(userId);
    this.userRooms.set(userId, roomId);

    // Broadcast join message
    this.broadcastToRoom(room, {
      senderId: 'system',
      senderName: 'System',
      isSysop: false,
      message: `${username} has joined the room`,
      timestamp: new Date(),
      color: 33
    });

    return true;
  }

  // Leave chat room
  leaveRoom(roomId: string, userId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const index = room.currentUsers.indexOf(userId);
    if (index > -1) {
      room.currentUsers.splice(index, 1);
    }

    this.userRooms.delete(userId);
  }

  // Send message to room
  sendToRoom(roomId: string, senderId: string, senderName: string, message: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const chatMsg: ChatMessage = {
      senderId,
      senderName,
      isSysop: false,
      message,
      timestamp: new Date(),
      color: 36
    };

    room.messages.push(chatMsg);

    // Keep last 100 messages
    if (room.messages.length > 100) {
      room.messages = room.messages.slice(-100);
    }

    this.broadcastToRoom(room, chatMsg);
  }

  // Broadcast to all users in room
  private broadcastToRoom(room: ChatRoom, message: ChatMessage): void {
    // Send to all user sockets in room.currentUsers
  }

  // List public rooms
  listRooms(userSecLevel: number): ChatRoom[] {
    return Array.from(this.rooms.values())
      .filter(r => r.isPublic && userSecLevel >= r.minSecurityLevel);
  }

  // Get room info
  getRoom(roomId: string): ChatRoom | null {
    return this.rooms.get(roomId) || null;
  }
}
```

---

## INTEGRATION POINTS

### Socket.IO Events

```typescript
// Client -> Server
socket.on('page-sysop', (data) => {
  // User pages sysop for chat
  chatManager.pageRequest(userId, username, nodeId, socket);
});

socket.on('answer-page', (sessionId) => {
  // Sysop answers page
  chatManager.answerPage(sessionId, sysopName);
});

socket.on('chat-message', (data) => {
  // Send chat message
  chatManager.sendMessage(data.sessionId, userId, data.message, isSysop);
});

socket.on('end-chat', (sessionId) => {
  // End chat session
  chatManager.endChat(sessionId);
});

socket.on('join-room', (roomId) => {
  // Join chat room
  chatRoomManager.joinRoom(roomId, userId, username, secLevel);
});

socket.on('leave-room', (roomId) => {
  // Leave chat room
  chatRoomManager.leaveRoom(roomId, userId);
});

socket.on('room-message', (data) => {
  // Send message to room
  chatRoomManager.sendToRoom(data.roomId, userId, username, data.message);
});

// Server -> Client
socket.emit('page-notification', { username, nodeId });  // To sysop
socket.emit('chat-started', { sessionId, sysopName });   // To user
socket.emit('chat-message', { sender, message, color }); // To both
socket.emit('chat-ended', { sessionId });                // To both
socket.emit('room-message', { sender, message, color }); // To all in room
socket.emit('user-joined', { username, roomId });        // To all in room
socket.emit('user-left', { username, roomId });          // To all in room
```

### Database Schema

```sql
-- Chat sessions (for logging)
CREATE TABLE chat_sessions (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  node_id INTEGER,
  sysop_name TEXT,
  start_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  end_time TIMESTAMPTZ,
  status TEXT,  -- 'paging', 'active', 'ended'
  message_count INTEGER DEFAULT 0
);

-- Chat messages (for logging)
CREATE TABLE chat_messages (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  is_sysop BOOLEAN DEFAULT FALSE,
  message TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Chat rooms (extended feature)
CREATE TABLE chat_rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  topic TEXT,
  created TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT NOT NULL,
  is_public BOOLEAN DEFAULT TRUE,
  max_users INTEGER DEFAULT 50,
  min_security_level INTEGER DEFAULT 0
);

-- Room membership (current users)
CREATE TABLE chat_room_users (
  room_id TEXT NOT NULL REFERENCES chat_rooms(id),
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  joined TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (room_id, user_id)
);

-- Room messages (for history)
CREATE TABLE chat_room_messages (
  id SERIAL PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES chat_rooms(id),
  sender_id TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  message TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
```

---

## IMPLEMENTATION NOTES

1. **Maintain Compatibility:**
   - Preserve original sysop chat behavior
   - Use same file naming (StartChat.txt, EndChat.txt)
   - Same ANSI color system
   - Same command hooks (CHATIN, CHATOUT)

2. **Extend for Web:**
   - Add multi-user chat rooms
   - Real-time WebSocket communication
   - Persistent chat history
   - Room moderation features

3. **Security:**
   - Security level checks
   - Rate limiting on messages
   - Flood protection
   - Moderator commands

4. **Performance:**
   - Limit message history
   - Clean up old sessions
   - Efficient broadcast to room members
   - Connection pooling

---

**Status:** Ready for implementation
**Next Step:** Implement TypeScript classes based on this spec

