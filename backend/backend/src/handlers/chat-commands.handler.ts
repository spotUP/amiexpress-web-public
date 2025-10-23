/**
 * Chat Commands Handler
 * Handles CHAT command and subcommands for internode chat
 *
 * Based on INTERNODE_CHAT_DAY3_COMPLETE.md documentation
 */

import { Socket } from 'socket.io';
import { LoggedOnSubState } from '../constants/bbs-states';

// Session type
interface BBSSession {
  user?: any;
  subState?: string;
  socketId?: string;
  [key: string]: any;
}

// Dependencies (injected)
let db: any;
let sessions: Map<string, BBSSession>;
let io: any;
let handleChatRequest: any;

export function setChatCommandsDependencies(deps: {
  db: any;
  sessions: Map<string, BBSSession>;
  io: any;
  handleChatRequest: any;
}) {
  db = deps.db;
  sessions = deps.sessions;
  io = deps.io;
  handleChatRequest = deps.handleChatRequest;
}

/**
 * Main CHAT command handler
 * Handles all CHAT subcommands
 */
export async function handleChatCommand(socket: Socket, session: BBSSession, params: string = '') {
  const parts = params.trim().split(/\s+/);
  const subcommand = parts[0]?.toUpperCase() || '';

  // CHAT (no params) or CHAT HELP - Show menu
  if (!subcommand || subcommand === 'HELP') {
    await showChatMenu(socket, session);
    return;
  }

  // CHAT WHO - List online users
  if (subcommand === 'WHO') {
    await showOnlineUsers(socket, session);
    return;
  }

  // CHAT TOGGLE - Toggle chat availability
  if (subcommand === 'TOGGLE') {
    await toggleChatAvailability(socket, session);
    return;
  }

  // CHAT END - Info about ending chat
  if (subcommand === 'END') {
    showEndChatInfo(socket, session);
    return;
  }

  // CHAT <username> - Request chat with user
  await requestChat(socket, session, subcommand);
}

/**
 * Show CHAT menu
 */
async function showChatMenu(socket: Socket, session: BBSSession) {
  let output = '\r\n';
  output += '\x1b[36m' + '═'.repeat(63) + '\x1b[0m\r\n';
  output += '\x1b[36m                      INTERNODE CHAT\x1b[0m\r\n';
  output += '\x1b[36m' + '═'.repeat(63) + '\x1b[0m\r\n';
  output += '\r\n';
  output += '\x1b[32mAvailable Commands:\x1b[0m\r\n';
  output += '\r\n';
  output += '  \x1b[33mCHAT <username>\x1b[0m     - Request chat with user\r\n';
  output += '  \x1b[33mCHAT WHO\x1b[0m            - List users available for chat\r\n';
  output += '  \x1b[33mCHAT TOGGLE\x1b[0m         - Toggle your chat availability\r\n';
  output += '  \x1b[33mCHAT END\x1b[0m            - Info about ending chat\r\n';
  output += '  \x1b[33mCHAT HELP\x1b[0m           - Show this help\r\n';
  output += '\r\n';

  // Show current availability status
  const isAvailable = session.user?.availableForChat || false;
  output += '\x1b[32mCurrent Status:\x1b[0m\r\n';
  if (isAvailable) {
    output += '  You are \x1b[32mAVAILABLE\x1b[0m for chat\r\n';
  } else {
    output += '  You are \x1b[31mNOT AVAILABLE\x1b[0m for chat\r\n';
    output += '  Use \x1b[33mCHAT TOGGLE\x1b[0m to become available\r\n';
  }

  // Show current chat status
  if (session.subState === LoggedOnSubState.CHAT) {
    output += '  Currently in chat with \x1b[36m' + session.chatWithUsername + '\x1b[0m\r\n';
    output += '  Type \x1b[33m/END\x1b[0m to exit chat\r\n';
  }

  output += '\r\n';
  output += '\x1b[36m' + '═'.repeat(63) + '\x1b[0m\r\n';
  output += '\r\n';
  output += '\x1b[32mPress any key to continue...\x1b[0m';

  socket.emit('ansi-output', output);
  session.subState = LoggedOnSubState.DISPLAY_MENU;
}

/**
 * Show online users (CHAT WHO)
 */
async function showOnlineUsers(socket: Socket, session: BBSSession) {
  let output = '\r\n';
  output += '\x1b[36m' + '═'.repeat(63) + '\x1b[0m\r\n';
  output += '\x1b[36m                     ONLINE USERS\x1b[0m\r\n';
  output += '\x1b[36m' + '═'.repeat(63) + '\x1b[0m\r\n';
  output += '\r\n';

  // Header
  output += '\x1b[33m';
  output += 'Username          Real Name                Status\r\n';
  output += '================  =======================  ====================\r\n';
  output += '\x1b[0m';

  // Get all online users except current user
  let userCount = 0;
  for (const [socketId, sess] of Array.from(sessions.entries())) {
    if (sess.user && sess.user.id !== session.user?.id) {
      const username = sess.user.username.padEnd(16, ' ').substring(0, 16);
      const realname = (sess.user.realname || 'Unknown').padEnd(23, ' ').substring(0, 23);

      let status = '';
      if (sess.subState === LoggedOnSubState.CHAT) {
        status = '\x1b[33mIn Chat\x1b[0m';
      } else if (sess.user.availableForChat) {
        status = '\x1b[32mAvailable\x1b[0m';
      } else {
        status = '\x1b[31mNot Available\x1b[0m';
      }

      output += username + '  ' + realname + '  ' + status + '\r\n';
      userCount++;
    }
  }

  if (userCount === 0) {
    output += '\x1b[33mNo other users are currently online.\x1b[0m\r\n';
  }

  output += '\r\n';
  output += '\x1b[32mTotal: ' + userCount + ' user(s) online\x1b[0m\r\n';
  output += '\r\n';
  output += '\x1b[36m' + '═'.repeat(63) + '\x1b[0m\r\n';
  output += '\r\n';
  output += '\x1b[32mPress any key to continue...\x1b[0m';

  socket.emit('ansi-output', output);
  session.subState = LoggedOnSubState.DISPLAY_MENU;
}

/**
 * Toggle chat availability (CHAT TOGGLE)
 */
async function toggleChatAvailability(socket: Socket, session: BBSSession) {
  try {
    // Toggle availability
    const newStatus = !session.user?.availableForChat;

    // Update in database
    await db.query(
      'UPDATE users SET available_for_chat = $1 WHERE id = $2',
      [newStatus, session.user!.id]
    );

    // Update session
    if (session.user) {
      session.user.availableForChat = newStatus;
    }

    // Show confirmation
    let output = '\r\n';
    output += '\x1b[36m' + '═'.repeat(63) + '\x1b[0m\r\n';
    output += '\x1b[36m                  CHAT AVAILABILITY TOGGLED\x1b[0m\r\n';
    output += '\x1b[36m' + '═'.repeat(63) + '\x1b[0m\r\n';
    output += '\r\n';

    if (newStatus) {
      output += '\x1b[32mYour chat status is now: AVAILABLE\x1b[0m\r\n';
      output += '\r\n';
      output += 'Other users can now request to chat with you.\r\n';
    } else {
      output += '\x1b[31mYour chat status is now: NOT AVAILABLE\x1b[0m\r\n';
      output += '\r\n';
      output += 'Other users cannot request to chat with you.\r\n';
    }

    output += '\r\n';
    output += '\x1b[36m' + '═'.repeat(63) + '\x1b[0m\r\n';
    output += '\r\n';
    output += '\x1b[32mPress any key to continue...\x1b[0m';

    socket.emit('ansi-output', output);
    session.subState = LoggedOnSubState.DISPLAY_MENU;

  } catch (error) {
    console.error('[CHAT] Error toggling availability:', error);
    socket.emit('ansi-output', '\r\n\x1b[31mError toggling chat availability.\x1b[0m\r\n');
    session.subState = LoggedOnSubState.DISPLAY_MENU;
  }
}

/**
 * Show info about ending chat (CHAT END)
 */
function showEndChatInfo(socket: Socket, session: BBSSession) {
  let output = '\r\n';

  if (session.subState === LoggedOnSubState.CHAT) {
    output += '\x1b[33mYou are currently in a chat session.\x1b[0m\r\n';
    output += '\r\n';
    output += 'To end the chat, type: \x1b[32m/END\x1b[0m or \x1b[32m/EXIT\x1b[0m\r\n';
  } else {
    output += '\x1b[33mYou are not currently in a chat session.\x1b[0m\r\n';
    output += '\r\n';
    output += 'To start a chat, use: \x1b[32mCHAT <username>\x1b[0m\r\n';
  }

  output += '\r\n';
  output += '\x1b[32mPress any key to continue...\x1b[0m';

  socket.emit('ansi-output', output);
  session.subState = LoggedOnSubState.DISPLAY_MENU;
}

/**
 * Request chat with user (CHAT <username>)
 */
async function requestChat(socket: Socket, session: BBSSession, targetUsername: string) {
  try {
    // Show requesting message
    socket.emit('ansi-output',
      '\r\n' +
      '\x1b[36mRequesting chat with ' + targetUsername + '...\x1b[0m\r\n' +
      '\x1b[33mWaiting for response (30 second timeout)...\x1b[0m\r\n' +
      '\r\n'
    );

    // Call the Socket.io chat request handler
    await handleChatRequest(socket, session, { targetUsername });

    // Return to menu (user can continue using BBS while waiting)
    session.subState = LoggedOnSubState.DISPLAY_MENU;

  } catch (error) {
    console.error('[CHAT] Error requesting chat:', error);
    socket.emit('ansi-output', '\r\n\x1b[31mError requesting chat.\x1b[0m\r\n');
    session.subState = LoggedOnSubState.DISPLAY_MENU;
  }
}
