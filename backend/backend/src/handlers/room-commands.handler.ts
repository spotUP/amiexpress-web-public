/**
 * Room Commands Handler
 *
 * Handles the BBS ROOM command and its subcommands.
 * Provides text-based interface for group chat room operations.
 *
 * Commands:
 * - ROOM               - Show room menu
 * - ROOM CREATE <name> - Create a new room
 * - ROOM JOIN <name>   - Join a room
 * - ROOM LEAVE         - Leave current room
 * - ROOM LIST          - List available rooms
 * - ROOM WHO           - List users in current room
 * - ROOM KICK <user>   - Kick a user (moderator only)
 * - ROOM MUTE <user>   - Mute a user (moderator only)
 * - ROOM UNMUTE <user> - Unmute a user (moderator only)
 * - ROOM TOPIC <text>  - Set room topic (moderator only)
 */

import { Socket } from 'socket.io';
import { LoggedOnSubState } from '../constants/bbs-states';
import { AnsiUtil } from '../utils/ansi.util';
import { ErrorHandler } from '../utils/error-handling.util';
import { ParamsUtil } from '../utils/params.util';

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
let handleRoomCreate: any;
let handleRoomJoin: any;
let handleRoomLeave: any;
let handleRoomList: any;
let handleRoomKick: any;
let handleRoomMute: any;

export function setRoomCommandsDependencies(deps: {
  db: any;
  sessions: Map<string, BBSSession>;
  io: any;
  handleRoomCreate: any;
  handleRoomJoin: any;
  handleRoomLeave: any;
  handleRoomList: any;
  handleRoomKick: any;
  handleRoomMute: any;
}) {
  db = deps.db;
  sessions = deps.sessions;
  io = deps.io;
  handleRoomCreate = deps.handleRoomCreate;
  handleRoomJoin = deps.handleRoomJoin;
  handleRoomLeave = deps.handleRoomLeave;
  handleRoomList = deps.handleRoomList;
  handleRoomKick = deps.handleRoomKick;
  handleRoomMute = deps.handleRoomMute;
}

/**
 * Main ROOM command handler
 *
 * Routes to appropriate subcommand or shows menu
 */
export async function handleRoomCommand(socket: Socket, session: BBSSession, params: string = '') {
  try {
    const trimmedParams = params.trim();

    // If no params, show menu
    if (!trimmedParams || trimmedParams.length === 0) {
      return await showRoomMenu(socket, session);
    }

    // Parse command and parameters
    const parts = trimmedParams.split(/\s+/);
    const subcommand = parts[0].toUpperCase();
    const args = parts.slice(1).join(' ');

    // Route to appropriate handler
    switch (subcommand) {
      case 'CREATE':
        return await createRoom(socket, session, args);

      case 'JOIN':
        return await joinRoom(socket, session, args);

      case 'LEAVE':
        return await leaveRoom(socket, session);

      case 'LIST':
        return await listRooms(socket, session);

      case 'WHO':
        return await whoInRoom(socket, session);

      case 'KICK':
        return await kickUser(socket, session, args);

      case 'MUTE':
        return await muteUser(socket, session, args);

      case 'UNMUTE':
        return await unmuteUser(socket, session, args);

      case 'TOPIC':
        return await setRoomTopic(socket, session, args);

      case 'HELP':
        return await showRoomMenu(socket, session);

      default:
        socket.emit('ansi-output', AnsiUtil.errorLine('Unknown ROOM command: ' + subcommand));
        socket.emit('ansi-output', AnsiUtil.line('Use ROOM HELP to see available commands'));
        return;
    }

  } catch (error) {
    console.error('Error in ROOM command:', error);
    ErrorHandler.sendError(socket, 'Error processing ROOM command. Please try again.');
  }
}

/**
 * Show room menu / help
 */
async function showRoomMenu(socket: Socket, session: BBSSession) {
  let output = '';

  output += AnsiUtil.clearScreen();
  output += AnsiUtil.headerBox('Chat Room Commands');
  output += AnsiUtil.line('');

  output += AnsiUtil.colorize('Basic Commands:', 'cyan') + '\r\n';
  output += '  ROOM CREATE <name>    - Create a new chat room\r\n';
  output += '  ROOM JOIN <name>      - Join a chat room\r\n';
  output += '  ROOM LEAVE            - Leave current room\r\n';
  output += '  ROOM LIST             - List all available rooms\r\n';
  output += '  ROOM WHO              - Show users in current room\r\n';
  output += '\r\n';

  output += AnsiUtil.colorize('Moderator Commands:', 'cyan') + '\r\n';
  output += '  ROOM KICK <user>      - Kick a user from the room\r\n';
  output += '  ROOM MUTE <user>      - Mute a user in the room\r\n';
  output += '  ROOM UNMUTE <user>    - Unmute a user in the room\r\n';
  output += '  ROOM TOPIC <text>     - Set the room topic\r\n';
  output += '\r\n';

  output += AnsiUtil.colorize('While in a room:', 'cyan') + '\r\n';
  output += '  /LEAVE                - Leave the room\r\n';
  output += '  /WHO                  - Show room members\r\n';
  output += '  /HELP                 - Show room help\r\n';
  output += '  Type message + ENTER  - Send message to room\r\n';
  output += '\r\n';

  if (session.currentRoomId) {
    output += AnsiUtil.success('You are currently in room: ' + (session.currentRoomName || 'Unknown')) + '\r\n';
  } else {
    output += AnsiUtil.warning('You are not currently in a room') + '\r\n';
  }

  socket.emit('ansi-output', output);
  socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
}

/**
 * Create a new room
 * ROOM CREATE <name> [PRIVATE] [PASSWORD=<pass>] [TOPIC=<topic>]
 */
async function createRoom(socket: Socket, session: BBSSession, args: string) {
  if (!args || args.trim().length === 0) {
    socket.emit('ansi-output', AnsiUtil.errorLine('Usage: ROOM CREATE <name> [PRIVATE] [PASSWORD=<pass>] [TOPIC=<topic>]'));
    return;
  }

  // Parse arguments
  const params = ParamsUtil.parse(args);

  // Room name is everything before first flag
  let roomName = '';
  for (const param of params) {
    if (param.startsWith('PASSWORD=') || param.startsWith('TOPIC=') || param === 'PRIVATE') {
      break;
    }
    roomName += (roomName.length > 0 ? ' ' : '') + param;
  }

  if (!roomName || roomName.trim().length === 0) {
    socket.emit('ansi-output', AnsiUtil.errorLine('Room name is required'));
    return;
  }

  // Check for PRIVATE flag
  const isPublic = !ParamsUtil.hasFlag(params, 'PRIVATE');

  // Extract password if provided
  let password: string | undefined;
  for (const param of params) {
    if (param.startsWith('PASSWORD=')) {
      password = param.substring(9);
      break;
    }
  }

  // Extract topic if provided
  let topic: string | undefined;
  for (const param of params) {
    if (param.startsWith('TOPIC=')) {
      topic = param.substring(6);
      break;
    }
  }

  // Call Socket.io handler
  await handleRoomCreate(socket, session, {
    roomName: roomName.trim(),
    isPublic,
    password,
    topic
  });
}

/**
 * Join a room
 * ROOM JOIN <name> [PASSWORD=<pass>]
 */
async function joinRoom(socket: Socket, session: BBSSession, args: string) {
  if (!args || args.trim().length === 0) {
    socket.emit('ansi-output', AnsiUtil.errorLine('Usage: ROOM JOIN <name> [PASSWORD=<pass>]'));
    return;
  }

  // Parse arguments
  const params = ParamsUtil.parse(args);

  // Room name is everything before PASSWORD=
  let roomName = '';
  for (const param of params) {
    if (param.startsWith('PASSWORD=')) {
      break;
    }
    roomName += (roomName.length > 0 ? ' ' : '') + param;
  }

  if (!roomName || roomName.trim().length === 0) {
    socket.emit('ansi-output', AnsiUtil.errorLine('Room name is required'));
    return;
  }

  // Extract password if provided
  let password: string | undefined;
  for (const param of params) {
    if (param.startsWith('PASSWORD=')) {
      password = param.substring(9);
      break;
    }
  }

  // Call Socket.io handler
  await handleRoomJoin(socket, session, {
    roomName: roomName.trim(),
    password
  });
}

/**
 * Leave current room
 */
async function leaveRoom(socket: Socket, session: BBSSession) {
  if (!session.currentRoomId) {
    socket.emit('ansi-output', AnsiUtil.errorLine('You are not in a room'));
    return;
  }

  await handleRoomLeave(socket, session);
}

/**
 * List all available rooms
 */
async function listRooms(socket: Socket, session: BBSSession) {
  await handleRoomList(socket, session, { showPrivate: false });
}

/**
 * Show who is in current room
 */
async function whoInRoom(socket: Socket, session: BBSSession) {
  try {
    if (!session.currentRoomId) {
      socket.emit('ansi-output', AnsiUtil.errorLine('You are not in a room'));
      return;
    }

    const room = await db.getChatRoom(session.currentRoomId);
    const members = await db.getRoomMembers(session.currentRoomId);

    socket.emit('ansi-output', AnsiUtil.headerBox('Users in ' + (room?.room_name || 'Room')));
    socket.emit('ansi-output', AnsiUtil.line(''));

    if (members.length === 0) {
      socket.emit('ansi-output', AnsiUtil.warning('No users in room (this should not happen!)'));
      return;
    }

    socket.emit('ansi-output', AnsiUtil.line('Total users: ' + members.length + ' / ' + (room?.max_users || 50)));
    socket.emit('ansi-output', AnsiUtil.line(''));

    // Header
    let header = '';
    header += AnsiUtil.colorize('Username', 'cyan') + '                ';
    header += AnsiUtil.colorize('Status', 'cyan') + '          ';
    header += AnsiUtil.colorize('Joined', 'cyan');
    socket.emit('ansi-output', header + '\r\n');
    socket.emit('ansi-output', AnsiUtil.line('─'.repeat(70)));

    // List members
    for (const member of members) {
      const username = member.username.padEnd(20, ' ');
      let status = '';

      if (member.is_moderator) {
        status += '[MOD] ';
      }
      if (member.is_muted) {
        status += '[MUTED] ';
      }
      if (!status) {
        status = 'Active ';
      }

      status = status.padEnd(15, ' ');

      const joinedAt = new Date(member.joined_at).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      socket.emit('ansi-output', AnsiUtil.line(username + status + joinedAt));
    }

    socket.emit('ansi-output', AnsiUtil.line(''));

  } catch (error) {
    console.error('Error in WHO command:', error);
    ErrorHandler.sendError(socket, 'Error listing room members');
  }
}

/**
 * Kick a user from the room (moderator only)
 */
async function kickUser(socket: Socket, session: BBSSession, targetUsername: string) {
  if (!targetUsername || targetUsername.trim().length === 0) {
    socket.emit('ansi-output', AnsiUtil.errorLine('Usage: ROOM KICK <username>'));
    return;
  }

  if (!session.currentRoomId) {
    socket.emit('ansi-output', AnsiUtil.errorLine('You must be in a room to kick users'));
    return;
  }

  await handleRoomKick(socket, session, {
    targetUsername: targetUsername.trim()
  });
}

/**
 * Mute a user in the room (moderator only)
 */
async function muteUser(socket: Socket, session: BBSSession, targetUsername: string) {
  if (!targetUsername || targetUsername.trim().length === 0) {
    socket.emit('ansi-output', AnsiUtil.errorLine('Usage: ROOM MUTE <username>'));
    return;
  }

  if (!session.currentRoomId) {
    socket.emit('ansi-output', AnsiUtil.errorLine('You must be in a room to mute users'));
    return;
  }

  await handleRoomMute(socket, session, {
    targetUsername: targetUsername.trim(),
    mute: true
  });
}

/**
 * Unmute a user in the room (moderator only)
 */
async function unmuteUser(socket: Socket, session: BBSSession, targetUsername: string) {
  if (!targetUsername || targetUsername.trim().length === 0) {
    socket.emit('ansi-output', AnsiUtil.errorLine('Usage: ROOM UNMUTE <username>'));
    return;
  }

  if (!session.currentRoomId) {
    socket.emit('ansi-output', AnsiUtil.errorLine('You must be in a room to unmute users'));
    return;
  }

  await handleRoomMute(socket, session, {
    targetUsername: targetUsername.trim(),
    mute: false
  });
}

/**
 * Set room topic (moderator only)
 */
async function setRoomTopic(socket: Socket, session: BBSSession, topic: string) {
  try {
    if (!topic || topic.trim().length === 0) {
      socket.emit('ansi-output', AnsiUtil.errorLine('Usage: ROOM TOPIC <topic text>'));
      return;
    }

    if (!session.currentRoomId) {
      socket.emit('ansi-output', AnsiUtil.errorLine('You must be in a room to set topic'));
      return;
    }

    // Check if user is moderator or room creator
    const isModerator = await db.isUserModerator(session.currentRoomId, session.userId);
    const room = await db.getChatRoom(session.currentRoomId);
    const isCreator = room && room.created_by === session.userId;

    if (!isModerator && !isCreator) {
      return ErrorHandler.permissionDenied(socket, 'set room topic');
    }

    // Update topic in database
    await db.updateChatRoom(session.currentRoomId, { topic: topic.trim() });

    // Broadcast topic change to room
    const socketRoom = 'room:' + session.currentRoomId;
    const msg = AnsiUtil.line(AnsiUtil.warning('*** Topic changed by ' + session.username + ': ' + topic.trim() + ' ***'));
    io.to(socketRoom).emit('ansi-output', msg);

    console.log('✅ Room topic updated:', session.currentRoomName, topic.trim());

  } catch (error) {
    console.error('Error setting room topic:', error);
    ErrorHandler.sendError(socket, 'Error setting room topic');
  }
}
