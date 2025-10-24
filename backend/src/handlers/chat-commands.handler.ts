/**
 * LiveChat Commands Handler
 * Handles LIVECHAT command and subcommands for modern real-time internode chat
 *
 * Note: This is a modern enhancement, not part of original AmiExpress
 * Original AmiExpress used OLM (async messaging) and O (sysop paging)
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
let handleChatAcceptFn: any;
let handleChatDeclineFn: any;

export function setChatCommandsDependencies(deps: {
  db: any;
  sessions: Map<string, BBSSession>;
  io: any;
  handleChatRequest: any;
  handleChatAccept: any;
  handleChatDecline: any;
}) {
  db = deps.db;
  sessions = deps.sessions;
  io = deps.io;
  handleChatRequest = deps.handleChatRequest;
  handleChatAcceptFn = deps.handleChatAccept;
  handleChatDeclineFn = deps.handleChatDecline;
}

/**
 * Main LIVECHAT command handler
 * Handles all LIVECHAT subcommands
 */
export async function handleLiveChatCommand(socket: Socket, session: BBSSession, params: string = '') {
  console.log('💬 [LIVECHAT] handleLiveChatCommand called with params:', params);
  const parts = params.trim().split(/\s+/);
  const subcommand = parts[0]?.toUpperCase() || '';
  console.log('💬 [LIVECHAT] subcommand:', subcommand);

  // LIVECHAT (no params) or LIVECHAT HELP - Show menu
  if (!subcommand || subcommand === 'HELP') {
    await showChatMenu(socket, session);
    return;
  }

  // LIVECHAT WHO - List online users
  if (subcommand === 'WHO') {
    await showOnlineUsers(socket, session);
    return;
  }

  // LIVECHAT TOGGLE - Toggle chat availability
  if (subcommand === 'TOGGLE') {
    await toggleChatAvailability(socket, session);
    return;
  }

  // LIVECHAT END - Info about ending chat
  if (subcommand === 'END') {
    showEndChatInfo(socket, session);
    return;
  }

  // LIVECHAT ACCEPT - Accept pending chat invitation
  if (subcommand === 'ACCEPT') {
    await acceptChatInvitation(socket, session);
    return;
  }

  // LIVECHAT DECLINE - Decline pending chat invitation
  if (subcommand === 'DECLINE') {
    await declineChatInvitation(socket, session);
    return;
  }

  // CHAT <username> - Request chat with user
  await requestChat(socket, session, subcommand);
}

/**
 * Show LIVECHAT user selection (arrow key navigation)
 */
async function showChatMenu(socket: Socket, session: BBSSession) {
  // Collect all online users except current user
  const onlineUsers: any[] = [];
  for (const [socketId, sess] of Array.from(sessions.entries())) {
    if (sess.user && sess.user.id !== session.user?.id) {
      onlineUsers.push({
        socketId,
        username: sess.user.username,
        realname: sess.user.realname || 'Unknown',
        status: sess.subState === LoggedOnSubState.CHAT ? 'In Chat' :
                (sess.user.availableForChat ? 'Available' : 'Not Available'),
        availableForChat: sess.user.availableForChat,
        inChat: sess.subState === LoggedOnSubState.CHAT
      });
    }
  }

  if (onlineUsers.length === 0) {
    let output = '\r\n';
    output += '\x1b[36m' + '═'.repeat(63) + '\x1b[0m\r\n';
    output += '\x1b[36m                    SELECT USER TO CHAT\x1b[0m\r\n';
    output += '\x1b[36m' + '═'.repeat(63) + '\x1b[0m\r\n';
    output += '\r\n';
    output += '\x1b[33mNo other users are currently online.\x1b[0m\r\n';
    output += '\r\n';
    output += '\x1b[36m' + '═'.repeat(63) + '\x1b[0m\r\n';
    output += '\r\n';
    output += '\x1b[32mPress any key to continue...\x1b[0m';
    socket.emit('ansi-output', output);
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  // Store user list and initialize selection
  session.livechatUserList = onlineUsers;
  session.livechatSelectedIndex = session.livechatSelectedIndex || 0;

  // Display the list with arrow key navigation
  renderChatUserList(socket, session);
  session.subState = LoggedOnSubState.LIVECHAT_SELECT_USER;
}

/**
 * Render the chat user list with current selection highlighted
 */
function renderChatUserList(socket: Socket, session: BBSSession) {
  const onlineUsers = session.livechatUserList || [];
  const selectedIndex = session.livechatSelectedIndex || 0;

  let output = '\x1b[2J\x1b[H'; // Clear screen and move cursor to home
  output += '\r\n';
  output += '\x1b[36m' + '═'.repeat(63) + '\x1b[0m\r\n';
  output += '\x1b[36m                    SELECT USER TO CHAT\x1b[0m\r\n';
  output += '\x1b[36m' + '═'.repeat(63) + '\x1b[0m\r\n';
  output += '\r\n';

  // Display list with arrow key navigation
  output += '\x1b[33mUsername          Real Name                Status\x1b[0m\r\n';
  output += '\x1b[33m' + '─'.repeat(63) + '\x1b[0m\r\n';

  onlineUsers.forEach((user: any, index: number) => {
    const username = user.username.padEnd(16, ' ').substring(0, 16);
    const realname = user.realname.padEnd(23, ' ').substring(0, 23);

    let statusColor = '';
    let statusText = '';
    if (user.inChat) {
      statusColor = '\x1b[33m';
      statusText = 'In Chat';
    } else if (user.availableForChat) {
      statusColor = '\x1b[32m';
      statusText = 'Available';
    } else {
      statusColor = '\x1b[31m';
      statusText = 'Not Available';
    }

    // Highlight selected row with blue background (44 = blue bg, 37 = white text)
    if (index === selectedIndex) {
      output += '\x1b[44m\x1b[37m> ' + username + realname + '  ' + statusText.padEnd(18) + '\x1b[0m\r\n';
    } else {
      output += '  ' + username + realname + '  ' + statusColor + statusText + '\x1b[0m\r\n';
    }
  });

  output += '\r\n';
  output += '\x1b[36m' + '═'.repeat(63) + '\x1b[0m\r\n';
  output += '\r\n';
  output += '\x1b[32m↑/↓ to select, ENTER to chat, Q to quit\x1b[0m';

  socket.emit('ansi-output', output);
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

    // Update in database (use quoted identifier for camelCase column)
    await db.query(
      'UPDATE users SET "availableForChat" = $1 WHERE id = $2',
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

/**
 * Accept pending chat invitation (CHAT ACCEPT)
 */
async function acceptChatInvitation(socket: Socket, session: BBSSession) {
  try {
    console.log('🎯 [CHAT ACCEPT] Starting...');
    console.log('  User ID:', session.user?.id);
    console.log('  Username:', session.user?.username);

    // Find pending invitation for this user
    const pendingInvite = await db.getPendingChatInvitationForUser(session.user.id);
    console.log('  Pending invite found:', pendingInvite);

    if (!pendingInvite) {
      console.log('❌ [CHAT ACCEPT] No pending invitation found');
      socket.emit('ansi-output',
        '\r\n\x1b[31m✗ No pending chat invitations\x1b[0m\r\n' +
        'You do not have any pending chat requests.\r\n'
      );
      return;
    }

    console.log('✅ [CHAT ACCEPT] Found invitation, sessionId:', pendingInvite.sessionId);
    console.log('  subState BEFORE handleChatAcceptFn:', session.subState);
    console.log('  Calling handleChatAcceptFn...');

    // Call the Socket.io accept handler
    await handleChatAcceptFn(socket, session, { sessionId: pendingInvite.sessionId });

    console.log('✅ [CHAT ACCEPT] handleChatAcceptFn completed');
    console.log('  subState AFTER handleChatAcceptFn:', session.subState);
    console.log('  Expected:', LoggedOnSubState.CHAT);

  } catch (error) {
    console.error('❌ [CHAT ACCEPT] Error accepting chat:', error);
    socket.emit('ansi-output', '\r\n\x1b[31mError accepting chat invitation.\x1b[0m\r\n');
  }
}

/**
 * Decline pending chat invitation (CHAT DECLINE)
 */
async function declineChatInvitation(socket: Socket, session: BBSSession) {
  try {
    // Find pending invitation for this user
    const pendingInvite = await db.getPendingChatInvitationForUser(session.user.id);

    if (!pendingInvite) {
      socket.emit('ansi-output',
        '\r\n\x1b[31m✗ No pending chat invitations\x1b[0m\r\n' +
        'You do not have any pending chat requests.\r\n'
      );
      return;
    }

    // Call the Socket.io decline handler
    await handleChatDeclineFn(socket, session, { sessionId: pendingInvite.sessionId });

  } catch (error) {
    console.error('[CHAT] Error declining chat:', error);
    socket.emit('ansi-output', '\r\n\x1b[31mError declining chat invitation.\x1b[0m\r\n');
  }
}

/**
 * Show LIVECHAT help menu
 */
export async function showLiveChatHelp(socket: Socket, session: BBSSession) {
  let output = '\r\n';
  output += '\x1b[36m' + '═'.repeat(63) + '\x1b[0m\r\n';
  output += '\x1b[36m                      LIVECHAT HELP\x1b[0m\r\n';
  output += '\x1b[36m' + '═'.repeat(63) + '\x1b[0m\r\n';
  output += '\r\n';
  output += '\x1b[32mAvailable Commands:\x1b[0m\r\n';
  output += '\r\n';
  output += '  \x1b[33mLIVECHAT\x1b[0m                - Select user from numbered list\r\n';
  output += '  \x1b[33mLIVECHAT <username>\x1b[0m     - Request chat with specific user\r\n';
  output += '  \x1b[33mLIVECHAT WHO\x1b[0m            - List users available for chat\r\n';
  output += '  \x1b[33mLIVECHAT TOGGLE\x1b[0m         - Toggle your chat availability\r\n';
  output += '  \x1b[33mLIVECHAT END\x1b[0m            - Info about ending chat\r\n';
  output += '  \x1b[33mLIVECHAT HELP\x1b[0m           - Show this help\r\n';
  output += '\r\n';

  // Show current availability status
  const isAvailable = session.user?.availableForChat || false;
  output += '\x1b[32mCurrent Status:\x1b[0m\r\n';
  if (isAvailable) {
    output += '  You are \x1b[32mAVAILABLE\x1b[0m for chat\r\n';
  } else {
    output += '  You are \x1b[31mNOT AVAILABLE\x1b[0m for chat\r\n';
    output += '  Use \x1b[33mLIVECHAT TOGGLE\x1b[0m to become available\r\n';
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
 * Handle user selection with arrow keys
 * Called from command.handler.ts when in LIVECHAT_SELECT_USER state
 */
export async function handleLiveChatSelection(socket: Socket, session: BBSSession, input: string) {
  const userList = session.livechatUserList || [];
  if (userList.length === 0) {
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  // Initialize selection index if not set
  if (session.livechatSelectedIndex === undefined) {
    session.livechatSelectedIndex = 0;
  }

  const trimmedInput = input.trim().toUpperCase();

  // Handle arrow keys for navigation
  if (input === '\x1b[A') {
    // Up arrow - move selection up
    session.livechatSelectedIndex--;
    if (session.livechatSelectedIndex < 0) {
      session.livechatSelectedIndex = userList.length - 1; // Wrap to bottom
    }
    renderChatUserList(socket, session);
    return;
  } else if (input === '\x1b[B') {
    // Down arrow - move selection down
    session.livechatSelectedIndex++;
    if (session.livechatSelectedIndex >= userList.length) {
      session.livechatSelectedIndex = 0; // Wrap to top
    }
    renderChatUserList(socket, session);
    return;
  }

  // Q to quit
  if (trimmedInput === 'Q') {
    socket.emit('ansi-output', '\x1b[2J\x1b[H\r\n\x1b[33mLiveChat cancelled.\x1b[0m\r\n');
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    delete session.livechatUserList;
    delete session.livechatSelectedIndex;
    return;
  }

  // Enter to select current user
  if (input === '\r' || input === '\n') {
    const selectedUser = userList[session.livechatSelectedIndex];
    delete session.livechatUserList;
    delete session.livechatSelectedIndex;

    // Clear screen and request chat with selected user
    socket.emit('ansi-output', '\x1b[2J\x1b[H');
    await requestChat(socket, session, selectedUser.username);
    return;
  }

  // Ignore other input (no need to show errors for arrow key navigation)
}

/**
 * Handle Y/n invitation response
 * Called from command.handler.ts when in LIVECHAT_INVITATION_RESPONSE state
 */
export async function handleLiveChatInvitationResponse(socket: Socket, session: BBSSession, input: string) {
  const trimmedInput = input.trim().toUpperCase();
  const sessionId = session.pendingChatSessionId;

  // Clear pending state
  delete session.pendingChatSessionId;

  if (!sessionId) {
    socket.emit('ansi-output', '\r\n\x1b[31mNo pending chat invitation.\x1b[0m\r\n');
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  // Default to Y (yes) if empty or starts with Y
  const isAccept = trimmedInput === '' || trimmedInput.startsWith('Y');

  if (isAccept) {
    // Accept the invitation
    console.log('💬 [LIVECHAT] User accepted via Y/n prompt');
    await handleChatAcceptFn(socket, session, { sessionId });
  } else {
    // Decline the invitation
    console.log('💬 [LIVECHAT] User declined via Y/n prompt');
    await handleChatDeclineFn(socket, session, { sessionId });
    session.subState = LoggedOnSubState.DISPLAY_MENU;
  }
}
