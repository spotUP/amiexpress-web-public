/**
 * Group Chat Handler
 *
 * Handles Socket.io events for multi-user chat rooms.
 * This is a modern enhancement beyond the original AmiExpress BBS.
 *
 * Features:
 * - Public and private chat rooms
 * - Room moderators with kick/mute powers
 * - Persistent room history
 * - Room topics and settings
 */

import { Socket } from 'socket.io';
import { LoggedOnSubState } from '../../constants/bbs-states';
import { AnsiUtil } from '../../utils/ansi.util';
import { ErrorHandler } from '../../utils/error-handling.util';
import { getSystemTime } from '../../utils/date-time.util';

import type { BBSSession } from '../../index';
// Session type

/**
 * Whether a door currently owns this session's terminal.
 *
 * These handlers paint an ANSI chat room - clear screen, header box, message
 * lines - straight at the user. That is right when the BBS itself is running
 * the chat, and wrong when the LiveChat door is: the door draws its own UI on
 * the same terminal, and both ended up on screen at once (reported live
 * 2026-08-25 with a paste showing the two layouts stacked). The room work
 * itself - joining, broadcasting to everyone else, history - still has to
 * happen; only this session's terminal output is suppressed, because the door
 * renders that itself from its own room events.
 */
function doorOwnsTerminal(session: BBSSession): boolean {
  return Boolean(
    (session as any).clientDoorActive
    || (session as any).currentDoorName
    || (session as any).doorInputHandler
  );
}

/** Terminal output for this session, suppressed while a door owns the screen. */
function emitToTerminal(socket: Socket, session: BBSSession, data: string): void {
  if (doorOwnsTerminal(session)) return;
  emitToTerminal(socket, session, data);
}

// Dependencies (injected via setter)
let db: any;
let sessions: Map<string, BBSSession>;
let io: any;

export function setGroupChatDependencies(deps: {
  db: any;
  sessions: Map<string, BBSSession>;
  io: any;
}) {
  db = deps.db;
  sessions = deps.sessions;
  io = deps.io;
}

/**
 * Generate a unique room ID
 */
function generateRoomId(): string {
  return 'room_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * Sanitize room name (alphanumeric, spaces, hyphens, underscores only)
 */
function sanitizeRoomName(name: string): string {
  return name.replace(/[^a-zA-Z0-9 _-]/g, '').trim();
}

/**
 * Sanitize message (remove ANSI escape codes for security)
 */
function sanitizeMessage(message: string): string {
  return message.replace(/\x1b/g, '');
}

/**
 * Send room error to client (shows as dialog in LiveChat UI)
 */
function sendRoomError(socket: Socket, message: string): void {
  socket.emit('room:error', { error: message });
}

/**
 * Paint a line into every room member's terminal, EXCEPT those whose screen
 * a door is driving.
 *
 * Room broadcasts went out with io.to(room), which reaches everyone -
 * including anyone sitting in the LiveChat door, whose UI then had chat
 * lines painted across it. Those clients already receive the structured
 * chat:message event and render it themselves.
 */
function broadcastAnsiToRoom(roomId: string, output: string, excludeSocketId?: string): void {
  const socketRoom = 'room:' + roomId;
  const members: Set<string> | undefined = io?.sockets?.adapter?.rooms?.get(socketRoom);

  if (!members) {
    // No adapter (tests, or a transport without rooms): fall back to the
    // broad emit rather than dropping the message entirely.
    if (excludeSocketId) {
      io.to(socketRoom).except(excludeSocketId).emit('ansi-output', output);
    } else {
      io.to(socketRoom).emit('ansi-output', output);
    }
    return;
  }

  for (const socketId of members) {
    if (excludeSocketId && socketId === excludeSocketId) continue;

    const memberSession = sessions.get(socketId);
    if (memberSession && doorOwnsTerminal(memberSession)) continue;

    io.to(socketId).emit('ansi-output', output);
  }
}

/**
 * Broadcast a system message to all room members
 */
function broadcastRoomSystem(roomId: string, message: string, excludeSocketId?: string) {
  const output = AnsiUtil.warning('*** ' + message + ' ***') + '\r\n';
  broadcastAnsiToRoom(roomId, output, excludeSocketId);
}

/**
 * Broadcast a chat message to all room members
 */
function broadcastRoomMessage(roomId: string, senderUsername: string, message: string, excludeSocketId?: string, senderId?: number | string) {
console.log('📡 [BROADCAST] Starting broadcast:', {
    roomId,
    senderUsername,
    messageLength: message.length,
    excludeSocketId,
    senderId,
    ioAvailable: !!io
  });

  const socketRoom = 'room:' + roomId;
  const timestamp = getSystemTime().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
  const output = '[' + timestamp + '] ' + AnsiUtil.colorize(senderUsername, 'cyan') + ': ' + message + '\r\n';

console.log('📡 [BROADCAST] Emitting to socket room:', socketRoom);

  // Raw ANSI for plain terminal clients only - a door renders the
  // structured chat:message event below itself.
  broadcastAnsiToRoom(roomId, output, excludeSocketId);

  // Also emit structured chat:message event for advanced clients (LiveChat door)
  // This allows UI-based chat clients to parse and display messages properly
  const structuredMessage = {
    id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    channelId: roomId,
    userId: String(senderId || '0'),
    username: senderUsername,
    content: message,
    type: 'message',
    createdAt: getSystemTime(),
  };

  if (excludeSocketId) {
    io.to(socketRoom).except(excludeSocketId).emit('chat:message', structuredMessage);
console.log('📡 [BROADCAST] Sent chat:message (excluding:', excludeSocketId + ')');
  } else {
    io.to(socketRoom).emit('chat:message', structuredMessage);
console.log('📡 [BROADCAST] Sent chat:message to all in room');
  }

console.log('📡 [BROADCAST] Broadcast complete');
}

/**
 * Handle room creation request
 *
 * Socket.io event: 'room:create'
 * Data: { roomName: string, topic?: string, isPublic?: boolean, password?: string, maxUsers?: number }
 */
export async function handleRoomCreate(socket: Socket, session: BBSSession, data: {
  roomName: string;
  topic?: string;
  isPublic?: boolean;
  password?: string;
  maxUsers?: number;
  isInviteOnly?: boolean;
  isModerated?: boolean;
  motd?: string | null;
}) {
  try {
console.log('📦 Room create request:', session.user?.id, data.roomName);

    // Validate user is logged in
    if (!session.user?.id || !session.user?.username) {
      return sendRoomError(socket, 'You must be logged in to create a room');
    }

    // Validate room name
    if (!data.roomName || data.roomName.trim().length === 0) {
      return sendRoomError(socket, 'Invalid room name');
    }

    const roomName = sanitizeRoomName(data.roomName);
    if (roomName.length < 3) {
      return sendRoomError(socket, 'Room name must be at least 3 characters');
    }

    if (roomName.length > 50) {
      return sendRoomError(socket, 'Room name must be 50 characters or less');
    }

    // Check if room name already exists
    const existing = await db.getChatRoomByName(roomName);
    if (existing) {
      return sendRoomError(socket, 'A room with that name already exists');
    }

    // Create room
    const roomId = generateRoomId();
    const isPublic = data.isPublic !== false; // Default to public
    const maxUsers = data.maxUsers || 50;

    await db.createChatRoom({
      roomId,
      roomName,
      topic: data.topic || '',
      createdBy: session.user?.id,
      createdByUsername: session.user?.username,
      isPublic,
      maxUsers,
      isPersistent: true,
      password: data.password || null,
      isInviteOnly: data.isInviteOnly === true,
      isModerated: data.isModerated === true,
      motd: data.motd || null,
    });

console.log('✅ Room created:', roomId, roomName);

    // Auto-promote creator to moderator for private/invite-only rooms so they can
    // /invite and /motd in their own room without a separate /op step.
    // Public-room creators rely on the existing flow (handleRoomJoin adds them as
    // a regular member when they next /join).
    if (data.isInviteOnly === true) {
      await db.joinChatRoom(roomId, session.user?.id, session.user?.username, socket.id, true /*isModerator*/);
    }

    // Send success message
    emitToTerminal(socket, session, AnsiUtil.successLine('Room "' + roomName + '" created successfully!'));
    emitToTerminal(socket, session, AnsiUtil.line('Room ID: ' + roomId));
    emitToTerminal(socket, session, AnsiUtil.line('Use ROOM JOIN ' + roomName + ' to enter the room'));

    // Emit room created event
    socket.emit('room:created', {
      roomId,
      roomName,
      topic: data.topic || '',
      isPublic
    });

  } catch (error) {
console.error('❌ Error creating room:', error);
    sendRoomError(socket, 'Failed to create room. Please try again.');
  }
}

/**
 * Handle room join request
 *
 * Socket.io event: 'room:join'
 * Data: { roomId?: string, roomName?: string, password?: string }
 */
export async function handleRoomJoin(socket: Socket, session: BBSSession, data: {
  roomId?: string;
  roomName?: string;
  password?: string;
}) {
  try {
console.log('🚪 Room join request:', session.user?.id, data.roomId || data.roomName);

    // Validate user is logged in
    if (!session.user?.id || !session.user?.username) {
      return sendRoomError(socket, 'You must be logged in to join a room');
    }

    // Find room by ID or name
    let room;
    if (data.roomId) {
      room = await db.getChatRoom(data.roomId);
    } else if (data.roomName) {
      room = await db.getChatRoomByName(data.roomName);

      // Auto-create room if it doesn't exist
      if (!room) {
        const sanitizedName = sanitizeRoomName(data.roomName);
        if (!sanitizedName) {
          return sendRoomError(socket, 'Invalid room name');
        }

        console.log(`[Room Auto-Create] Creating new room: ${sanitizedName}`);
        const roomId = generateRoomId();
        await db.createChatRoom({
          roomId: roomId,
          roomName: sanitizedName,
          topic: `Auto-created room: ${sanitizedName}`,
          createdBy: session.user.id,
          createdByUsername: session.user.username,
          isPublic: true,
          maxUsers: 100,
          isPersistent: true,
          password: null
        });

        room = await db.getChatRoom(roomId);
        console.log(`[Room Auto-Create] Created room ${sanitizedName} with ID ${roomId}`);
      }
    } else {
      return sendRoomError(socket, 'Invalid room ID or room name');
    }

    if (!room) {
      return sendRoomError(socket, 'Room not found');
    }

    // Check if user is already in a room
    if (session.currentRoomId) {
      if (session.currentRoomId === room.room_id) {
        const members = await db.getRoomMembers(room.room_id);
        socket.join('room:' + room.room_id);
        socket.emit('room:joined', {
          roomId: room.room_id,
          roomName: room.room_name,
          memberCount: members.length,
          members: members.map((m: any) => ({
            user_id: m.user_id,
            username: m.username,
            is_moderator: m.is_moderator,
            is_muted: m.is_muted
          }))
        });
        return;
      }
      const stillMember = await db.isUserInRoom(session.currentRoomId, session.user?.id);
      if (!stillMember) {
        session.currentRoomId = undefined;
        session.currentRoomName = undefined;
        session.previousState = undefined;
        session.previousSubState = undefined;
      } else {
        return sendRoomError(socket, 'You must leave your current room first (use /LEAVE)');
      }
    }

    // Check if room requires password
    if (room.password && room.password.length > 0) {
      if (!data.password || data.password !== room.password) {
        return sendRoomError(socket, 'Incorrect room password');
      }
    }

    // Check invite-only ACL
    // Existing members bypass invite check (revocation post-join is a kick/ban concern).
    if (room.is_invite_only) {
      const isMember = await db.isUserInRoom(room.room_id, session.user?.id);
      const hasInvite = await db.hasInvite(room.room_id, session.user?.id);
      const isOwner = room.created_by === session.user?.id;
      if (!isMember && !hasInvite && !isOwner) {
        return sendRoomError(socket, 'This room is invite-only. Ask a member to /INVITE you.');
      }
    }

    // Check if room is full
    const memberCount = await db.getRoomMemberCount(room.room_id);
    if (memberCount >= room.max_users) {
      return sendRoomError(socket, 'Room is full (max ' + room.max_users + ' users)');
    }

    // Check if user is already in this room (stale sessions can leave entries behind)
    const alreadyIn = await db.isUserInRoom(room.room_id, session.user?.id);
    if (alreadyIn) {
console.log('ℹ️ User already in room, rejoining:', session.user?.username, room.room_name);
    }

    // Join room in database
    await db.joinChatRoom(room.room_id, session.user?.id, session.user?.username, socket.id, false);

    // Consume invite if this was an invite-only room (no-op when no invite row exists)
    if (room.is_invite_only) {
      await db.revokeInvite(room.room_id, session.user?.id);
    }

    // Join Socket.io room
    socket.join('room:' + room.room_id);

    // Update session state
    session.currentRoomId = room.room_id;
    session.currentRoomName = room.room_name;
    // Only take over the session's input state when the BBS is the thing
    // showing the chat. A door has its own input handling, and leaving it
    // used to drop the user into CHAT_ROOM state with no chat on screen.
    if (!doorOwnsTerminal(session)) {
      session.previousState = session.state;
      session.previousSubState = session.subState;
      session.subState = LoggedOnSubState.CHAT_ROOM;
    }

console.log('✅ User joined room:', session.user?.username, room.room_name);

    // Send room info to user
    emitToTerminal(socket, session, AnsiUtil.clearScreen());
    emitToTerminal(socket, session, AnsiUtil.headerBox('Chat Room: ' + room.room_name));

    if (room.topic && room.topic.length > 0) {
      emitToTerminal(socket, session, AnsiUtil.line('Topic: ' + room.topic));
    }

    if (room.motd && room.motd.length > 0) {
      emitToTerminal(socket, session, AnsiUtil.line('MOTD: ' + room.motd));
    }

    // Get room members
    const members = await db.getRoomMembers(room.room_id);
    emitToTerminal(socket, session, AnsiUtil.line(''));
    emitToTerminal(socket, session, AnsiUtil.line('Users in room (' + members.length + '):'));
    for (const member of members) {
      const modBadge = member.is_moderator ? ' [MOD]' : '';
      const muteBadge = member.is_muted ? ' [MUTED]' : '';
      emitToTerminal(socket, session, AnsiUtil.line('  - ' + member.username + modBadge + muteBadge));
    }

    emitToTerminal(socket, session, AnsiUtil.line(''));
    emitToTerminal(socket, session, AnsiUtil.line('Commands: /LEAVE /WHO /HELP'));
    emitToTerminal(socket, session, AnsiUtil.line('Type your message and press ENTER to chat'));
    emitToTerminal(socket, session, AnsiUtil.line('─'.repeat(78)));

    // Get recent room history
    const history = await db.getChatRoomHistory(room.room_id, 10);
    if (history.length > 0) {
      emitToTerminal(socket, session, AnsiUtil.line('Recent messages:'));
      for (const msg of history) {
        const timestamp = new Date(msg.created_at).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
        const msgLine = '[' + timestamp + '] ' + AnsiUtil.colorize(msg.sender_username, 'cyan') + ': ' + msg.message;
        emitToTerminal(socket, session, AnsiUtil.line(msgLine));
      }
      emitToTerminal(socket, session, AnsiUtil.line('─'.repeat(78)));
    }

    // Broadcast join to other room members
    broadcastRoomSystem(room.room_id, session.user?.username + ' joined the room', socket.id);
    io.to('room:' + room.room_id).except(socket.id).emit('room:user-joined', {
      userId: session.user?.id,
      username: session.user?.username
    });

    // CRITICAL: Broadcast room:user-joined event to all room members for SDK doors
    const socketRoom = 'room:' + room.room_id;
    io.to(socketRoom).emit('room:user-joined', {
      userId: session.user?.id,
      username: session.user?.username
    });
console.log('📢 Broadcast room:user-joined:', session.user?.username, 'to room:', socketRoom);

    // Emit room joined event to this user (include members list for LiveChat)
    const roomJoinedData = {
      roomId: room.room_id,
      roomName: room.room_name,
      memberCount: members.length,
      topic: room.topic || null,
      motd: room.motd || null,
      members: members.map((m: any) => ({
        user_id: m.user_id,
        username: m.username,
        is_moderator: m.is_moderator,
        is_muted: m.is_muted
      }))
    };
console.log('📤 [LiveChat DEBUG] Sending room:joined to', session.user?.username, ':', JSON.stringify(roomJoinedData));
    socket.emit('room:joined', roomJoinedData);

  } catch (error) {
console.error('❌ Error joining room:', error);
    sendRoomError(socket, 'Failed to join room. Please try again.');
  }
}

/**
 * Handle room leave request
 *
 * Socket.io event: 'room:leave'
 */
export async function handleRoomLeave(socket: Socket, session: BBSSession) {
  try {
console.log('🚪 Room leave request:', session.user?.id, session.currentRoomName);

    // Validate user is in a room
    if (!session.currentRoomId) {
      return sendRoomError(socket, 'You are not in a room');
    }

    const roomId = session.currentRoomId;
    const roomName = session.currentRoomName || 'the room';
    const username = session.user?.username || 'User';

    // Leave room in database
    await db.leaveChatRoom(roomId, session.user?.id);

    // Leave Socket.io room
    socket.leave('room:' + roomId);

    // Broadcast leave to other room members (before clearing session)
    broadcastRoomSystem(roomId, username + ' left the room');
    io.to('room:' + roomId).emit('room:user-left', {
      userId: session.user?.id,
      username: session.user?.username
    });

    // CRITICAL: Broadcast room:user-left event to all room members for SDK doors
    const socketRoom = 'room:' + roomId;
    io.to(socketRoom).emit('room:user-left', {
      userId: session.user?.id,
      username: username
    });
console.log('📢 Broadcast room:user-left:', username, 'to room:', socketRoom);

    // Restore previous state
    if (session.previousState && session.previousSubState) {
      session.state = session.previousState;
      session.subState = session.previousSubState;
    } else {
      session.subState = LoggedOnSubState.DISPLAY_MENU;
    }

    // Clear room info from session
    session.currentRoomId = undefined;
    session.currentRoomName = undefined;
    session.previousState = undefined;
    session.previousSubState = undefined;

console.log('✅ User left room:', username, roomName);

    // Send confirmation to user
    emitToTerminal(socket, session, AnsiUtil.successLine('You left ' + roomName));

    // Emit room left event
    socket.emit('room:left', { roomName });

  } catch (error) {
console.error('❌ Error leaving room:', error);
    sendRoomError(socket, 'Failed to leave room. Please try again.');
  }
}

/**
 * Handle room message
 *
 * Socket.io event: 'room:message'
 * Data: { message: string }
 */
export async function handleRoomMessage(socket: Socket, session: BBSSession, data: { message: string }) {
  try {
    // Validate user is in a room
    if (!session.currentRoomId) {
      return sendRoomError(socket, 'You are not in a room');
    }

    // Validate message
    if (!data.message || data.message.trim().length === 0) {
      return; // Silently ignore empty messages
    }

    const message = sanitizeMessage(data.message.trim());

    if (message.length > 500) {
      return sendRoomError(socket, 'Message too long (max 500 characters)');
    }

    // Check if user is muted
    const isMuted = await db.isUserMuted(session.currentRoomId, session.user?.id);
    if (isMuted) {
      return sendRoomError(socket, 'You are muted in this room');
    }

    // +m (moderated): only moderators or voiced users can send
    const room = await db.getChatRoom(session.currentRoomId);
    if (room?.is_moderated) {
      const isMod = await db.isUserModerator(session.currentRoomId, String(session.user?.id));
      const isVoiced = await db.isUserVoiced(session.currentRoomId, String(session.user?.id));
      if (!isMod && !isVoiced) {
        return sendRoomError(socket, 'Room is moderated (+m); you need voice (+v) or op (+o) to speak');
      }
    }

    // Save message to database
    await db.saveChatRoomMessage({
      roomId: session.currentRoomId,
      senderId: session.user?.id,
      senderUsername: session.user?.username,
      message,
      messageType: 'message'
    });

    // Broadcast message to all room members EXCEPT sender (they already see their own message)
    broadcastRoomMessage(session.currentRoomId!, session.user?.username!, message, socket.id, parseInt(session.user?.id || '0', 10));

console.log('💬 Room message:', session.user?.username, '→', session.currentRoomName, message.substring(0, 50));

  } catch (error) {
console.error('❌ Error sending room message:', error);
    sendRoomError(socket, 'Failed to send message. Please try again.');
  }
}

/**
 * Handle room list request
 *
 * Socket.io event: 'room:list'
 * Data: { showPrivate?: boolean }
 */
export async function handleRoomList(socket: Socket, session: BBSSession, data?: { showPrivate?: boolean }) {
  try {
console.log('📋 Room list request:', session.user?.id);

    const onlyPublic = !data?.showPrivate;
    const rooms = await db.listChatRooms(onlyPublic);

    // CRITICAL: Emit structured room:list event for SDK doors like LiveChat
    socket.emit('room:list', { rooms });
console.log('📋 Sent room:list event with', rooms.length, 'rooms');

    // Also send ANSI output for terminal display
    emitToTerminal(socket, session, AnsiUtil.headerBox('Available Chat Rooms'));
    emitToTerminal(socket, session, AnsiUtil.line(''));

    if (rooms.length === 0) {
      emitToTerminal(socket, session, AnsiUtil.warning('No rooms available'));
      emitToTerminal(socket, session, AnsiUtil.line('Use ROOM CREATE <name> to create a new room'));
      return;
    }

    for (const room of rooms) {
      const memberCount = await db.getRoomMemberCount(room.room_id);
      const status = memberCount >= room.max_users ? '[FULL]' : '[' + memberCount + '/' + room.max_users + ']';
      const privacy = room.is_public ? '' : '[PRIVATE]';
      const locked = room.password ? '[LOCKED]' : '';

      emitToTerminal(socket, session, AnsiUtil.colorize(room.room_name, 'cyan') + ' ' + status + ' ' + privacy + ' ' + locked);

      if (room.topic && room.topic.length > 0) {
        emitToTerminal(socket, session, AnsiUtil.line('  Topic: ' + room.topic));
      }

      emitToTerminal(socket, session, AnsiUtil.line('  Created by: ' + room.created_by_username));
      emitToTerminal(socket, session, AnsiUtil.line(''));
    }

    emitToTerminal(socket, session, AnsiUtil.line('Use ROOM JOIN <name> to join a room'));

  } catch (error) {
console.error('❌ Error listing rooms:', error);
    sendRoomError(socket, 'Failed to list rooms. Please try again.');
  }
}

/**
 * Handle room kick request (moderator only)
 *
 * Socket.io event: 'room:kick'
 * Data: { targetUsername: string }
 */
export async function handleRoomKick(socket: Socket, session: BBSSession, data: { targetUsername: string }) {
  try {
console.log('👢 Room kick request:', session.user?.id, data.targetUsername);

    // Validate user is in a room
    if (!session.currentRoomId) {
      return sendRoomError(socket, 'You are not in a room');
    }

    // Check if user is moderator or room creator
    const isModerator = await db.isUserModerator(session.currentRoomId, session.user?.id);
    const room = await db.getChatRoom(session.currentRoomId);
    const isCreator = room && room.created_by === session.user?.id;

    if (!isModerator && !isCreator) {
      return sendRoomError(socket, 'You do not have permission to kick users');
    }

    // Find target user
    const members = await db.getRoomMembers(session.currentRoomId);
    const target = members.find((m: any) => m.username.toLowerCase() === data.targetUsername.toLowerCase());

    if (!target) {
      return sendRoomError(socket, 'User "' + data.targetUsername + '" not found in this room');
    }

    // Can't kick yourself
    if (target.user_id === session.user?.id) {
      return sendRoomError(socket, 'You cannot kick yourself. Use /LEAVE instead.');
    }

    // Can't kick room creator
    if (target.user_id === room.created_by) {
      return sendRoomError(socket, 'You cannot kick the room creator');
    }

    // Remove from room
    await db.leaveChatRoom(session.currentRoomId, target.user_id);

    // Find target's socket and force them to leave
    const targetSession = Array.from(sessions.entries()).find(
      ([_, sess]) => sess.userId === target.user_id
    );

    if (targetSession) {
      const [targetSocketId, targetSess] = targetSession;
      const targetSocket = io.sockets.sockets.get(targetSocketId);

      if (targetSocket) {
        // Leave Socket.io room
        targetSocket.leave('room:' + session.currentRoomId);

        // Restore previous state
        if (targetSess.previousState && targetSess.previousSubState) {
          targetSess.state = targetSess.previousState;
          targetSess.subState = targetSess.previousSubState;
        } else {
          targetSess.subState = LoggedOnSubState.DISPLAY_MENU;
        }

        // Clear room info
        targetSess.currentRoomId = undefined;
        targetSess.currentRoomName = undefined;
        targetSess.previousState = undefined;
        targetSess.previousSubState = undefined;

        // Notify kicked user
        targetSocket.emit('ansi-output', AnsiUtil.errorLine('You have been kicked from the room by ' + session.user?.username));
        targetSocket.emit('room:kicked', {
          roomName: session.currentRoomName,
          kickedBy: session.user?.username
        });
      }
    }

    // Broadcast kick to room
    broadcastRoomSystem(session.currentRoomId, target.username + ' was kicked by ' + session.user?.username);

console.log('✅ User kicked:', target.username, 'by', session.user?.username);

  } catch (error) {
console.error('❌ Error kicking user:', error);
    sendRoomError(socket, 'Failed to kick user. Please try again.');
  }
}

/**
 * Handle room mute request (moderator only)
 *
 * Socket.io event: 'room:mute'
 * Data: { targetUsername: string, mute: boolean }
 */
export async function handleRoomMute(socket: Socket, session: BBSSession, data: { targetUsername: string; mute: boolean }) {
  try {
console.log('🔇 Room mute request:', session.user?.id, data.targetUsername, data.mute);

    // Validate user is in a room
    if (!session.currentRoomId) {
      return sendRoomError(socket, 'You are not in a room');
    }

    // Check if user is moderator or room creator
    const isModerator = await db.isUserModerator(session.currentRoomId, session.user?.id);
    const room = await db.getChatRoom(session.currentRoomId);
    const isCreator = room && room.created_by === session.user?.id;

    if (!isModerator && !isCreator) {
      return sendRoomError(socket, 'You do not have permission to mute users');
    }

    // Find target user
    const members = await db.getRoomMembers(session.currentRoomId);
    const target = members.find((m: any) => m.username.toLowerCase() === data.targetUsername.toLowerCase());

    if (!target) {
      return sendRoomError(socket, 'User "' + data.targetUsername + '" not found in this room');
    }

    // Can't mute yourself
    if (target.user_id === session.user?.id) {
      return sendRoomError(socket, 'You cannot mute yourself');
    }

    // Can't mute room creator
    if (target.user_id === room.created_by) {
      return sendRoomError(socket, 'You cannot mute the room creator');
    }

    // Update mute status
    await db.updateRoomMember(session.currentRoomId, target.user_id, { isMuted: data.mute });

    const action = data.mute ? 'muted' : 'unmuted';

    // Broadcast mute to room
    broadcastRoomSystem(session.currentRoomId, target.username + ' was ' + action + ' by ' + session.user?.username);

    // Notify target user
    const targetSession = Array.from(sessions.entries()).find(
      ([_, sess]) => sess.userId === target.user_id
    );

    if (targetSession) {
      const [targetSocketId] = targetSession;
      const targetSocket = io.sockets.sockets.get(targetSocketId);

      if (targetSocket) {
        const msg = data.mute
          ? 'You have been muted by ' + session.user?.username
          : 'You have been unmuted by ' + session.user?.username;
        targetSocket.emit('ansi-output', AnsiUtil.warningLine(msg));
      }
    }

console.log('✅ User ' + action + ':', target.username, 'by', session.user?.username);

  } catch (error) {
console.error('❌ Error muting user:', error);
    sendRoomError(socket, 'Failed to mute user. Please try again.');
  }
}

/**
 * Handle room disconnect (cleanup)
 * Called when a user disconnects while in a room
 */
export async function handleRoomDisconnect(socket: Socket, session: BBSSession) {
  try {
    if (!session.currentRoomId) {
      return; // Not in a room, nothing to do
    }

console.log('🚪 Room disconnect cleanup:', session.user?.username, session.currentRoomName);

    const roomId = session.currentRoomId;
    const username = session.user?.username || 'User';

    // Leave room in database
    await db.leaveChatRoom(roomId, session.user?.id);

    // Broadcast disconnect to room
    broadcastRoomSystem(roomId, username + ' disconnected');
    io.to('room:' + roomId).emit('room:user-left', {
      userId: session.user?.id,
      username: session.user?.username
    });

  } catch (error) {
console.error('❌ Error in room disconnect:', error);
  }
}

/**
 * Add isUserMuted helper to database methods (call from here if not in db)
 */
async function isUserMuted(roomId: string, userId: string): Promise<boolean> {
  try {
    // Check if db has this method
    if (typeof db.isUserMuted === 'function') {
      return await db.isUserMuted(roomId, userId);
    }

    // Fallback: query directly
    const members = await db.getRoomMembers(roomId);
    const member = members.find((m: any) => m.user_id === userId);
    return member ? member.is_muted : false;
  } catch (error) {
console.error('Error checking mute status:', error);
    return false;
  }
}

// Export all handlers
export {
  generateRoomId,
  sanitizeRoomName,
  sanitizeMessage,
  broadcastRoomSystem,
  broadcastRoomMessage
};
