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
import { LoggedOnSubState } from '../constants/bbs-states';
import { AnsiUtil } from '../utils/ansi.util';
import { ErrorHandler } from '../utils/error-handling.util';

// Session type
interface BBSSession {
  user?: any;
  userId?: string;
  username?: string;
  state?: string;
  subState?: string;
  socketId?: string;
  currentRoomId?: string;
  currentRoomName?: string;
  previousState?: string;
  previousSubState?: string;
  [key: string]: any;
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
 * Broadcast a system message to all room members
 */
function broadcastRoomSystem(roomId: string, message: string, excludeSocketId?: string) {
  const socketRoom = 'room:' + roomId;
  const output = AnsiUtil.line(AnsiUtil.warning('*** ' + message + ' ***'));

  if (excludeSocketId) {
    io.to(socketRoom).except(excludeSocketId).emit('ansi-output', output);
  } else {
    io.to(socketRoom).emit('ansi-output', output);
  }
}

/**
 * Broadcast a chat message to all room members
 */
function broadcastRoomMessage(roomId: string, senderUsername: string, message: string, excludeSocketId?: string) {
  const socketRoom = 'room:' + roomId;
  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
  const output = AnsiUtil.line('[' + timestamp + '] ' + AnsiUtil.colorize(senderUsername, 'cyan') + ': ' + message);

  if (excludeSocketId) {
    io.to(socketRoom).except(excludeSocketId).emit('ansi-output', output);
  } else {
    io.to(socketRoom).emit('ansi-output', output);
  }
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
}) {
  try {
    console.log('📦 Room create request:', session.userId, data.roomName);

    // Validate user is logged in
    if (!session.userId || !session.username) {
      return ErrorHandler.sendError(socket, 'You must be logged in to create a room');
    }

    // Validate room name
    if (!data.roomName || data.roomName.trim().length === 0) {
      return ErrorHandler.invalidInput(socket, 'room name');
    }

    const roomName = sanitizeRoomName(data.roomName);
    if (roomName.length < 3) {
      return ErrorHandler.sendError(socket, 'Room name must be at least 3 characters');
    }

    if (roomName.length > 50) {
      return ErrorHandler.sendError(socket, 'Room name must be 50 characters or less');
    }

    // Check if room name already exists
    const existing = await db.getChatRoomByName(roomName);
    if (existing) {
      return ErrorHandler.sendError(socket, 'A room with that name already exists');
    }

    // Create room
    const roomId = generateRoomId();
    const isPublic = data.isPublic !== false; // Default to public
    const maxUsers = data.maxUsers || 50;

    await db.createChatRoom({
      roomId,
      roomName,
      topic: data.topic || '',
      createdBy: session.userId,
      createdByUsername: session.username,
      isPublic,
      maxUsers,
      isPersistent: true,
      password: data.password || null
    });

    console.log('✅ Room created:', roomId, roomName);

    // Send success message
    socket.emit('ansi-output', AnsiUtil.successLine('Room "' + roomName + '" created successfully!'));
    socket.emit('ansi-output', AnsiUtil.line('Room ID: ' + roomId));
    socket.emit('ansi-output', AnsiUtil.line('Use ROOM JOIN ' + roomName + ' to enter the room'));

    // Emit room created event
    socket.emit('room:created', {
      roomId,
      roomName,
      topic: data.topic || '',
      isPublic
    });

  } catch (error) {
    console.error('❌ Error creating room:', error);
    ErrorHandler.sendError(socket, 'Failed to create room. Please try again.');
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
    console.log('🚪 Room join request:', session.userId, data.roomId || data.roomName);

    // Validate user is logged in
    if (!session.userId || !session.username) {
      return ErrorHandler.sendError(socket, 'You must be logged in to join a room');
    }

    // Find room by ID or name
    let room;
    if (data.roomId) {
      room = await db.getChatRoom(data.roomId);
    } else if (data.roomName) {
      room = await db.getChatRoomByName(data.roomName);
    } else {
      return ErrorHandler.invalidInput(socket, 'room ID or room name');
    }

    if (!room) {
      return ErrorHandler.notFound(socket, 'room');
    }

    // Check if user is already in a room
    if (session.currentRoomId) {
      return ErrorHandler.sendError(socket, 'You must leave your current room first (use /LEAVE)');
    }

    // Check if room requires password
    if (room.password && room.password.length > 0) {
      if (!data.password || data.password !== room.password) {
        return ErrorHandler.sendError(socket, 'Incorrect room password');
      }
    }

    // Check if room is full
    const memberCount = await db.getRoomMemberCount(room.room_id);
    if (memberCount >= room.max_users) {
      return ErrorHandler.sendError(socket, 'Room is full (max ' + room.max_users + ' users)');
    }

    // Check if user is already in this room (shouldn't happen, but check anyway)
    const alreadyIn = await db.isUserInRoom(room.room_id, session.userId);
    if (alreadyIn) {
      return ErrorHandler.sendError(socket, 'You are already in this room');
    }

    // Join room in database
    await db.joinChatRoom(room.room_id, session.userId, session.username, socket.id, false);

    // Join Socket.io room
    socket.join('room:' + room.room_id);

    // Update session state
    session.currentRoomId = room.room_id;
    session.currentRoomName = room.room_name;
    session.previousState = session.state;
    session.previousSubState = session.subState;
    session.subState = LoggedOnSubState.CHAT_ROOM;

    console.log('✅ User joined room:', session.username, room.room_name);

    // Send room info to user
    socket.emit('ansi-output', AnsiUtil.clearScreen());
    socket.emit('ansi-output', AnsiUtil.headerBox('Chat Room: ' + room.room_name));

    if (room.topic && room.topic.length > 0) {
      socket.emit('ansi-output', AnsiUtil.line('Topic: ' + room.topic));
    }

    // Get room members
    const members = await db.getRoomMembers(room.room_id);
    socket.emit('ansi-output', AnsiUtil.line(''));
    socket.emit('ansi-output', AnsiUtil.line('Users in room (' + members.length + '):'));
    for (const member of members) {
      const modBadge = member.is_moderator ? ' [MOD]' : '';
      const muteBadge = member.is_muted ? ' [MUTED]' : '';
      socket.emit('ansi-output', AnsiUtil.line('  - ' + member.username + modBadge + muteBadge));
    }

    socket.emit('ansi-output', AnsiUtil.line(''));
    socket.emit('ansi-output', AnsiUtil.line('Commands: /LEAVE /WHO /HELP'));
    socket.emit('ansi-output', AnsiUtil.line('Type your message and press ENTER to chat'));
    socket.emit('ansi-output', AnsiUtil.line('─'.repeat(78)));

    // Get recent room history
    const history = await db.getChatRoomHistory(room.room_id, 10);
    if (history.length > 0) {
      socket.emit('ansi-output', AnsiUtil.line('Recent messages:'));
      for (const msg of history) {
        const timestamp = new Date(msg.created_at).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
        const msgLine = '[' + timestamp + '] ' + AnsiUtil.colorize(msg.sender_username, 'cyan') + ': ' + msg.message;
        socket.emit('ansi-output', AnsiUtil.line(msgLine));
      }
      socket.emit('ansi-output', AnsiUtil.line('─'.repeat(78)));
    }

    // Broadcast join to other room members
    broadcastRoomSystem(room.room_id, session.username + ' joined the room', socket.id);

    // Emit room joined event
    socket.emit('room:joined', {
      roomId: room.room_id,
      roomName: room.room_name,
      memberCount: members.length
    });

  } catch (error) {
    console.error('❌ Error joining room:', error);
    ErrorHandler.sendError(socket, 'Failed to join room. Please try again.');
  }
}

/**
 * Handle room leave request
 *
 * Socket.io event: 'room:leave'
 */
export async function handleRoomLeave(socket: Socket, session: BBSSession) {
  try {
    console.log('🚪 Room leave request:', session.userId, session.currentRoomName);

    // Validate user is in a room
    if (!session.currentRoomId) {
      return ErrorHandler.sendError(socket, 'You are not in a room');
    }

    const roomId = session.currentRoomId;
    const roomName = session.currentRoomName || 'the room';
    const username = session.username || 'User';

    // Leave room in database
    await db.leaveChatRoom(roomId, session.userId);

    // Leave Socket.io room
    socket.leave('room:' + roomId);

    // Broadcast leave to other room members (before clearing session)
    broadcastRoomSystem(roomId, username + ' left the room');

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
    socket.emit('ansi-output', AnsiUtil.successLine('You left ' + roomName));

    // Emit room left event
    socket.emit('room:left', { roomName });

  } catch (error) {
    console.error('❌ Error leaving room:', error);
    ErrorHandler.sendError(socket, 'Failed to leave room. Please try again.');
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
      return ErrorHandler.sendError(socket, 'You are not in a room');
    }

    // Validate message
    if (!data.message || data.message.trim().length === 0) {
      return; // Silently ignore empty messages
    }

    const message = sanitizeMessage(data.message.trim());

    if (message.length > 500) {
      return ErrorHandler.sendError(socket, 'Message too long (max 500 characters)');
    }

    // Check if user is muted
    const isMuted = await db.isUserMuted(session.currentRoomId, session.userId);
    if (isMuted) {
      return ErrorHandler.sendError(socket, 'You are muted in this room');
    }

    // Save message to database
    await db.saveChatRoomMessage({
      roomId: session.currentRoomId,
      senderId: session.userId,
      senderUsername: session.username,
      message,
      messageType: 'message'
    });

    // Broadcast message to all room members
    broadcastRoomMessage(session.currentRoomId!, session.username!, message);

    console.log('💬 Room message:', session.username, '→', session.currentRoomName, message.substring(0, 50));

  } catch (error) {
    console.error('❌ Error sending room message:', error);
    ErrorHandler.sendError(socket, 'Failed to send message. Please try again.');
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
    console.log('📋 Room list request:', session.userId);

    const onlyPublic = !data?.showPrivate;
    const rooms = await db.listChatRooms(onlyPublic);

    socket.emit('ansi-output', AnsiUtil.headerBox('Available Chat Rooms'));
    socket.emit('ansi-output', AnsiUtil.line(''));

    if (rooms.length === 0) {
      socket.emit('ansi-output', AnsiUtil.warning('No rooms available'));
      socket.emit('ansi-output', AnsiUtil.line('Use ROOM CREATE <name> to create a new room'));
      return;
    }

    for (const room of rooms) {
      const memberCount = await db.getRoomMemberCount(room.room_id);
      const status = memberCount >= room.max_users ? '[FULL]' : '[' + memberCount + '/' + room.max_users + ']';
      const privacy = room.is_public ? '' : '[PRIVATE]';
      const locked = room.password ? '[LOCKED]' : '';

      socket.emit('ansi-output', AnsiUtil.colorize(room.room_name, 'cyan') + ' ' + status + ' ' + privacy + ' ' + locked);

      if (room.topic && room.topic.length > 0) {
        socket.emit('ansi-output', AnsiUtil.line('  Topic: ' + room.topic));
      }

      socket.emit('ansi-output', AnsiUtil.line('  Created by: ' + room.created_by_username));
      socket.emit('ansi-output', AnsiUtil.line(''));
    }

    socket.emit('ansi-output', AnsiUtil.line('Use ROOM JOIN <name> to join a room'));

  } catch (error) {
    console.error('❌ Error listing rooms:', error);
    ErrorHandler.sendError(socket, 'Failed to list rooms. Please try again.');
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
    console.log('👢 Room kick request:', session.userId, data.targetUsername);

    // Validate user is in a room
    if (!session.currentRoomId) {
      return ErrorHandler.sendError(socket, 'You are not in a room');
    }

    // Check if user is moderator or room creator
    const isModerator = await db.isUserModerator(session.currentRoomId, session.userId);
    const room = await db.getChatRoom(session.currentRoomId);
    const isCreator = room && room.created_by === session.userId;

    if (!isModerator && !isCreator) {
      return ErrorHandler.permissionDenied(socket, 'kick users');
    }

    // Find target user
    const members = await db.getRoomMembers(session.currentRoomId);
    const target = members.find((m: any) => m.username.toLowerCase() === data.targetUsername.toLowerCase());

    if (!target) {
      return ErrorHandler.notFound(socket, 'user "' + data.targetUsername + '" in this room');
    }

    // Can't kick yourself
    if (target.user_id === session.userId) {
      return ErrorHandler.sendError(socket, 'You cannot kick yourself. Use /LEAVE instead.');
    }

    // Can't kick room creator
    if (target.user_id === room.created_by) {
      return ErrorHandler.sendError(socket, 'You cannot kick the room creator');
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
        targetSocket.emit('ansi-output', AnsiUtil.errorLine('You have been kicked from the room by ' + session.username));
        targetSocket.emit('room:kicked', {
          roomName: session.currentRoomName,
          kickedBy: session.username
        });
      }
    }

    // Broadcast kick to room
    broadcastRoomSystem(session.currentRoomId, target.username + ' was kicked by ' + session.username);

    console.log('✅ User kicked:', target.username, 'by', session.username);

  } catch (error) {
    console.error('❌ Error kicking user:', error);
    ErrorHandler.sendError(socket, 'Failed to kick user. Please try again.');
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
    console.log('🔇 Room mute request:', session.userId, data.targetUsername, data.mute);

    // Validate user is in a room
    if (!session.currentRoomId) {
      return ErrorHandler.sendError(socket, 'You are not in a room');
    }

    // Check if user is moderator or room creator
    const isModerator = await db.isUserModerator(session.currentRoomId, session.userId);
    const room = await db.getChatRoom(session.currentRoomId);
    const isCreator = room && room.created_by === session.userId;

    if (!isModerator && !isCreator) {
      return ErrorHandler.permissionDenied(socket, 'mute users');
    }

    // Find target user
    const members = await db.getRoomMembers(session.currentRoomId);
    const target = members.find((m: any) => m.username.toLowerCase() === data.targetUsername.toLowerCase());

    if (!target) {
      return ErrorHandler.notFound(socket, 'user "' + data.targetUsername + '" in this room');
    }

    // Can't mute yourself
    if (target.user_id === session.userId) {
      return ErrorHandler.sendError(socket, 'You cannot mute yourself');
    }

    // Can't mute room creator
    if (target.user_id === room.created_by) {
      return ErrorHandler.sendError(socket, 'You cannot mute the room creator');
    }

    // Update mute status
    await db.updateRoomMember(session.currentRoomId, target.user_id, { isMuted: data.mute });

    const action = data.mute ? 'muted' : 'unmuted';

    // Broadcast mute to room
    broadcastRoomSystem(session.currentRoomId, target.username + ' was ' + action + ' by ' + session.username);

    // Notify target user
    const targetSession = Array.from(sessions.entries()).find(
      ([_, sess]) => sess.userId === target.user_id
    );

    if (targetSession) {
      const [targetSocketId] = targetSession;
      const targetSocket = io.sockets.sockets.get(targetSocketId);

      if (targetSocket) {
        const msg = data.mute
          ? 'You have been muted by ' + session.username
          : 'You have been unmuted by ' + session.username;
        targetSocket.emit('ansi-output', AnsiUtil.warningLine(msg));
      }
    }

    console.log('✅ User ' + action + ':', target.username, 'by', session.username);

  } catch (error) {
    console.error('❌ Error muting user:', error);
    ErrorHandler.sendError(socket, 'Failed to mute user. Please try again.');
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

    console.log('🚪 Room disconnect cleanup:', session.username, session.currentRoomName);

    const roomId = session.currentRoomId;
    const username = session.username || 'User';

    // Leave room in database
    await db.leaveChatRoom(roomId, session.userId);

    // Broadcast disconnect to room
    broadcastRoomSystem(roomId, username + ' disconnected');

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
