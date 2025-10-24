/**
 * Internode Chat Handler
 * Real-time user-to-user chat system
 *
 * Based on INTERNODE_CHAT_COMPLETE.md documentation
 * Implements Socket.io event handlers for real-time messaging
 */

import { Socket } from 'socket.io';
import { LoggedOnSubState, BBSState } from '../constants/bbs-states';

// Session type
interface BBSSession {
  user?: any;
  state?: string;
  subState?: string;
  socketId?: string;
  chatSessionId?: string;
  chatWithUserId?: string;
  chatWithUsername?: string;
  previousState?: string;
  previousSubState?: string;
  partnerTypingBuffer?: string; // Buffer showing what the chat partner is currently typing
  typingBlinkTimer?: NodeJS.Timeout; // Timer for blinking cursor when idle
  lastTypingTime?: number; // Last time a keystroke was received
  [key: string]: any;
}

// Dependencies (injected)
let db: any;
let sessions: Map<string, BBSSession>;
let io: any;

export function setInternodeChatDependencies(deps: {
  db: any;
  sessions: Map<string, BBSSession>;
  io: any;
}) {
  db = deps.db;
  sessions = deps.sessions;
  io = deps.io;
}

/**
 * Convert ANSI color code to hex color for cursor OSC sequence
 */
function ansiColorToHex(ansiCode: number): string {
  const colorMap: { [key: number]: string } = {
    31: 'ff0000', // Red
    32: '00ff00', // Green
    33: 'ffff00', // Yellow
    34: '0000ff', // Blue
    35: 'ff00ff', // Magenta
    36: '00ffff'  // Cyan
  };
  return colorMap[ansiCode] || 'ff0000'; // Default to red
}

/**
 * Calculate username color hash (same logic used for message display)
 */
function getUsernameColor(username: string): number {
  const usernameColors = [31, 32, 33, 34, 35, 36];
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return usernameColors[Math.abs(hash) % usernameColors.length];
}

/**
 * Handle chat:request - User requests chat with another user
 * Based on INTERNODE_CHAT_DAY2_COMPLETE.md lines 47-131
 */
export async function handleChatRequest(socket: Socket, session: BBSSession, data: { targetUsername: string }) {
  try {
    const { targetUsername } = data;
    console.log('🔥 [CHAT] handleChatRequest called, targetUsername:', targetUsername);

    // Validation 1: Check if user is logged in
    if (!session.user) {
      console.log('❌ [CHAT] Validation failed: User not logged in');
      socket.emit('chat:error', 'You must be logged in to use chat');
      return;
    }
    console.log('✅ [CHAT] Validation 1 passed: User logged in');

    // Validation 2: Check if initiator is available for chat
    console.log('🔍 [CHAT] Checking availableForChat:', session.user.availableForChat);
    if (!session.user.availableForChat) {
      console.log('❌ [CHAT] Validation failed: User not available for chat');
      socket.emit('chat:error', 'You must toggle your chat availability first (CHAT TOGGLE)');
      return;
    }
    console.log('✅ [CHAT] Validation 2 passed: User available for chat');

    // Validation 3: Check if initiator is already in chat
    if (session.subState === LoggedOnSubState.CHAT) {
      console.log('❌ [CHAT] Validation failed: User already in chat');
      socket.emit('chat:error', 'You are already in a chat session');
      return;
    }
    console.log('✅ [CHAT] Validation 3 passed: User not in chat');

    // Validation 4: Find target user in database
    console.log('🔍 [CHAT] Looking up target user:', targetUsername);
    const targetUser = await db.getUserByUsernameForOLM(targetUsername);
    if (!targetUser) {
      console.log('❌ [CHAT] Validation failed: Target user not found');
      socket.emit('chat:error', `User "${targetUsername}" not found`);
      return;
    }
    console.log('✅ [CHAT] Validation 4 passed: Target user found:', targetUser.username);

    // Validation 5: Cannot chat with self
    if (targetUser.id === session.user.id) {
      console.log('❌ [CHAT] Validation failed: Self-chat attempt');
      socket.emit('chat:error', 'You cannot chat with yourself');
      return;
    }
    console.log('✅ [CHAT] Validation 5 passed: Not chatting with self');

    // Validation 6: Check if target is online
    console.log('🔍 [CHAT] Looking for target session, total sessions:', sessions.size);
    let targetSession: BBSSession | null = null;
    let targetSocketId: string | null = null;
    for (const [socketId, sess] of Array.from(sessions.entries())) {
      console.log(`  Checking session: user=${sess.user?.username}, id=${sess.user?.id}, socketId=${socketId}, sess.socketId=${sess.socketId}`);
      if (sess.user?.id === targetUser.id) {
        targetSession = sess;
        targetSocketId = socketId; // Use the Map key (actual socket ID)
        console.log('  ✅ FOUND target session!');
        console.log('  Target socketId from map:', socketId);
        console.log('  Target session.socketId:', sess.socketId);
        break;
      }
    }

    if (!targetSession) {
      console.log('❌ [CHAT] Validation failed: Target not online');
      socket.emit('chat:error', `${targetUsername} is not currently online`);
      return;
    }
    console.log('✅ [CHAT] Validation 6 passed: Target is online');

    // Validation 7: Check if target is available for chat
    console.log('🔍 [CHAT] Target availableForChat:', targetUser.availableForChat);
    if (!targetUser.availableForChat) {
      console.log('❌ [CHAT] Validation failed: Target not available');
      socket.emit('chat:error', `${targetUsername} is not available for chat`);
      return;
    }
    console.log('✅ [CHAT] Validation 7 passed: Target available for chat');

    // Validation 8: Check if target is already in chat
    console.log('🔍 [CHAT] Target subState:', targetSession.subState);
    if (targetSession.subState === LoggedOnSubState.CHAT) {
      console.log('❌ [CHAT] Validation failed: Target in another chat');
      socket.emit('chat:error', `${targetUsername} is currently in another chat`);
      return;
    }
    console.log('✅ [CHAT] Validation 8 passed: Target not in chat');

    // Create chat session in database
    console.log('📝 [CHAT] Creating chat session in database...');
    console.log('  initiatorSocket:', socket.id);
    console.log('  recipientSocket (from map):', targetSocketId);
    console.log('  recipientSocket (from session):', targetSession.socketId);

    const sessionId = await db.createChatSession(
      session.user.id,           // initiatorId
      session.user.username,     // initiatorUsername
      socket.id,                 // initiatorSocket
      targetUser.id,             // recipientId
      targetUser.username,       // recipientUsername
      targetSocketId!            // recipientSocket - Use Map key, not session.socketId
    );
    console.log('✅ [CHAT] Chat session created:', sessionId);

    // Send confirmation to initiator in terminal
    console.log('📤 [CHAT] Sending confirmation to initiator...');
    socket.emit('ansi-output',
      '\r\n\x1b[32m✓ Chat request sent to ' + targetUsername + '\x1b[0m\r\n' +
      '\x1b[33mWaiting for response (30 seconds)...\x1b[0m\r\n'
    );

    // Also emit Socket.io event
    socket.emit('chat:request-sent', {
      sessionId,
      to: targetUsername
    });
    console.log('✅ [CHAT] Confirmation displayed in initiator terminal');

    // Send invite to target user via terminal output
    console.log('📤 [CHAT] Sending invite to target:', targetSocketId);

    // Display invitation in recipient's terminal with Y/n prompt
    io.to(targetSocketId!).emit('ansi-output',
      '\r\n\r\n' +
      '\x1b[36m' + session.user.username + '\x1b[0m wants to chat with you, accept (Y/n)? '
    );

    // Set recipient's session state to LIVECHAT_INVITATION_RESPONSE
    // and store the sessionId for handling Y/n response
    const recipientSessions = Array.from(sessions.entries());
    for (const [sid, sess] of recipientSessions) {
      if (sess.user?.id === targetSession.user.id) {
        sess.subState = LoggedOnSubState.LIVECHAT_INVITATION_RESPONSE;
        sess.pendingChatSessionId = sessionId;
        break;
      }
    }

    // Also emit Socket.io event for future frontend enhancements
    io.to(targetSocketId!).emit('chat:invite', {
      sessionId,
      from: session.user.username,
      fromId: session.user.id
    });
    console.log('✅ [CHAT] Invite displayed in target terminal');

    // Set 30-second timeout
    setTimeout(async () => {
      const chatSession = await db.getChatSession(sessionId);
      if (chatSession && chatSession.status === 'requesting') {
        // Timeout - cancel invite
        await db.updateChatSessionStatus(sessionId, 'timeout');

        // Notify initiator via terminal
        socket.emit('ansi-output',
          '\r\n\x1b[31m✗ Chat request timed out\x1b[0m\r\n' +
          `${targetUsername} did not respond within 30 seconds.\r\n`
        );
        socket.emit('chat:timeout', {
          username: targetUsername
        });

        // Notify recipient via terminal (cancel invite)
        io.to(targetSocketId!).emit('ansi-output',
          '\r\n\x1b[33m✗ Chat request from ' + session.user.username + ' has expired.\x1b[0m\r\n'
        );
        io.to(targetSocketId!).emit('chat:invite-cancelled', {
          from: session.user.username
        });
      }
    }, 30000);

  } catch (error) {
    console.error('[INTERNODE CHAT] Error handling chat request:', error);
    socket.emit('chat:error', 'Failed to send chat request');
  }
}

/**
 * Handle chat:accept - User accepts incoming chat request
 * Based on INTERNODE_CHAT_DAY2_COMPLETE.md lines 133-218
 */
export async function handleChatAccept(socket: Socket, session: BBSSession, data: { sessionId: string }) {
  try {
    console.log('🚀 [handleChatAccept] ENTRY POINT - Function called');
    console.log('   socket.id:', socket.id);
    console.log('   session.user?.id:', session.user?.id);
    console.log('   data:', data);

    const { sessionId } = data;
    console.log('   sessionId extracted:', sessionId);

    // Get chat session from database
    console.log('   Calling db.getChatSession...');
    const chatSession = await db.getChatSession(sessionId);
    console.log('   chatSession result:', chatSession);

    if (!chatSession) {
      console.log('❌ [handleChatAccept] Chat session not found in DB');
      socket.emit('chat:error', 'Chat session not found');
      return;
    }

    // Validate recipient
    console.log('   Validating recipient...', chatSession.recipientId, 'vs', session.user?.id);
    if (chatSession.recipientId !== session.user?.id) {
      console.log('❌ [handleChatAccept] User is not the recipient');
      socket.emit('chat:error', 'You are not the recipient of this chat');
      return;
    }

    // Validate status
    console.log('   Validating status:', chatSession.status);
    if (chatSession.status !== 'requesting') {
      console.log('❌ [handleChatAccept] Chat status is not requesting:', chatSession.status);
      socket.emit('chat:error', 'Chat request is no longer valid');
      return;
    }

    console.log('✅ [handleChatAccept] All validations passed, continuing...');

    // Update session status to active
    await db.updateChatSessionStatus(sessionId, 'active');

    // Get initiator session from Map (capture socket ID from Map key)
    let initiatorSession: BBSSession | null = null;
    let initiatorSocketId: string | null = null;
    for (const [socketId, sess] of Array.from(sessions.entries())) {
      if (sess.user?.id === chatSession.initiatorId) {
        initiatorSession = sess;
        initiatorSocketId = socketId; // CRITICAL: Use Map key as socket ID
        break;
      }
    }

    if (!initiatorSession || !initiatorSocketId) {
      socket.emit('chat:error', 'Initiator is no longer online');
      await db.updateChatSessionStatus(sessionId, 'ended');
      return;
    }

    // Get recipient session from Map (CRITICAL: we need the actual session object from the Map, not the passed-in copy)
    let recipientSession: BBSSession | null = null;
    let recipientSocketId: string | null = null;
    for (const [socketId, sess] of Array.from(sessions.entries())) {
      if (sess.user?.id === chatSession.recipientId) {
        recipientSession = sess;
        recipientSocketId = socketId; // CRITICAL: Use Map key as socket ID
        console.log('✅ [CHAT ACCEPT] Found recipient session in Map');
        break;
      }
    }

    if (!recipientSession) {
      socket.emit('chat:error', 'Recipient session not found in Map');
      await db.updateChatSessionStatus(sessionId, 'ended');
      return;
    }

    // Create Socket.io room for this chat
    const roomName = `chat:${sessionId}`;
    console.log('🏠 [CHAT ACCEPT] Creating Socket.io room:', roomName);
    console.log('🏠 [CHAT ACCEPT] Recipient socket:', recipientSocketId);
    console.log('🏠 [CHAT ACCEPT] Initiator socket:', initiatorSocketId);

    socket.join(roomName);
    console.log('✅ [CHAT ACCEPT] Recipient joined room');

    const initiatorSocket = io.sockets.sockets.get(initiatorSocketId!);
    if (initiatorSocket) {
      initiatorSocket.join(roomName);
      console.log('✅ [CHAT ACCEPT] Initiator joined room');
    } else {
      console.log('❌ [CHAT ACCEPT] Could not find initiator socket!');
    }

    // Verify room membership
    const roomMembers = Array.from(io.sockets.adapter.rooms.get(roomName) || []);
    console.log('🏠 [CHAT ACCEPT] Room members:', roomMembers);
    console.log('🏠 [CHAT ACCEPT] Expected 2 members, got:', roomMembers.length);

    // Save previous states for both users (using the actual sessions from the Map)
    initiatorSession.previousState = initiatorSession.state;
    initiatorSession.previousSubState = initiatorSession.subState;
    initiatorSession.chatSessionId = sessionId;
    initiatorSession.chatWithUserId = recipientSession.user?.id;
    initiatorSession.chatWithUsername = recipientSession.user?.username;

    recipientSession.previousState = recipientSession.state;
    recipientSession.previousSubState = recipientSession.subState;
    recipientSession.chatSessionId = sessionId;
    recipientSession.chatWithUserId = chatSession.initiatorId;
    recipientSession.chatWithUsername = chatSession.initiatorUsername;

    // Set both users to CHAT substate (CRITICAL: modifying the actual session objects from the Map)
    initiatorSession.subState = LoggedOnSubState.CHAT;
    recipientSession.subState = LoggedOnSubState.CHAT;
    console.log('✅ [CHAT ACCEPT] Both users set to CHAT substate');
    console.log('   Initiator subState:', initiatorSession.subState);
    console.log('   Recipient subState:', recipientSession.subState);

    // Notify both users that chat has started
    console.log('📤 [CHAT ACCEPT] Emitting chat:started to room:', roomName);
    io.to(roomName).emit('chat:started', {
      sessionId,
      withUsername: recipientSession.user?.username,
      withUserId: recipientSession.user?.id
    });

    // Set up fixed chat layout for initiator
    // Clear screen, set scroll region (lines 1-21), typing preview at 22, separator at 23, input at 24
    // Also set cursor color to initiator's username color
    const initiatorColor = getUsernameColor(initiatorSession.user!.username);
    const initiatorCursorHex = ansiColorToHex(initiatorColor);
    const setupScreen =
      '\x1b[2J\x1b[H' + // Clear screen, home cursor
      '\x1b[1;21r' + // Set scroll region to lines 1-21 (messages area - allows scrolling)
      `\x1b]12;#${initiatorCursorHex}\x07` + // Set cursor color to user's chat color (OSC 12)
      '\x1b[32m═══════════════════════════════════════════════════════════════\x1b[0m\r\n' +
      `\x1b[36m                CHAT SESSION WITH ${recipientSession.user?.username.toUpperCase()}\x1b[0m\r\n` +
      '\x1b[32m═══════════════════════════════════════════════════════════════\x1b[0m\r\n' +
      '\r\n' +
      'Type your messages and press ENTER to send. Type /END to exit.\r\n' +
      '\r\n' +
      '\x1b[23;1H' + // Move to line 23
      '\x1b[36m─────────────────────────────────────────────────────────────────\x1b[0m' +
      '\x1b[24;1H'; // Move to line 24 for input

    io.to(initiatorSocketId!).emit('ansi-output', setupScreen);

    // Set up fixed chat layout for recipient
    // Also set cursor color to recipient's username color
    const recipientColor = getUsernameColor(recipientSession.user!.username);
    const recipientCursorHex = ansiColorToHex(recipientColor);
    const setupScreenRecipient =
      '\x1b[2J\x1b[H' + // Clear screen, home cursor
      '\x1b[1;21r' + // Set scroll region to lines 1-21 (messages area - allows scrolling)
      `\x1b]12;#${recipientCursorHex}\x07` + // Set cursor color to user's chat color (OSC 12)
      '\x1b[32m═══════════════════════════════════════════════════════════════\x1b[0m\r\n' +
      `\x1b[36m                CHAT SESSION WITH ${chatSession.initiatorUsername.toUpperCase()}\x1b[0m\r\n` +
      '\x1b[32m═══════════════════════════════════════════════════════════════\x1b[0m\r\n' +
      '\r\n' +
      'Type your messages and press ENTER to send. Type /END to exit.\r\n' +
      '\r\n' +
      '\x1b[23;1H' + // Move to line 23
      '\x1b[36m─────────────────────────────────────────────────────────────────\x1b[0m' +
      '\x1b[24;1H'; // Move to line 24 for input

    socket.emit('ansi-output', setupScreenRecipient);

  } catch (error) {
    console.error('[INTERNODE CHAT] Error accepting chat:', error);
    socket.emit('chat:error', 'Failed to accept chat');
  }
}

/**
 * Handle chat:decline - User declines incoming chat request
 * Based on INTERNODE_CHAT_DAY2_COMPLETE.md lines 220-258
 */
export async function handleChatDecline(socket: Socket, session: BBSSession, data: { sessionId: string }) {
  try {
    const { sessionId } = data;

    // Get chat session from database
    const chatSession = await db.getChatSession(sessionId);
    if (!chatSession) {
      socket.emit('chat:error', 'Chat session not found');
      return;
    }

    // Validate recipient
    if (chatSession.recipientId !== session.user?.id) {
      socket.emit('chat:error', 'You are not the recipient of this chat');
      return;
    }

    // Update session status to declined
    await db.updateChatSessionStatus(sessionId, 'declined');

    // Notify initiator via terminal
    io.to(chatSession.initiatorSocket).emit('ansi-output',
      '\r\n\x1b[31m✗ Chat request declined\x1b[0m\r\n' +
      `${chatSession.recipientUsername} has declined your chat request.\r\n`
    );
    io.to(chatSession.initiatorSocket).emit('chat:declined', {
      username: chatSession.recipientUsername
    });

    // Confirm to decliner via terminal
    socket.emit('ansi-output',
      '\r\n\x1b[32m✓ Chat request declined\x1b[0m\r\n' +
      `You declined the chat request from ${chatSession.initiatorUsername}.\r\n`
    );

  } catch (error) {
    console.error('[INTERNODE CHAT] Error declining chat:', error);
    socket.emit('chat:error', 'Failed to decline chat');
  }
}

/**
 * Handle real-time keystroke transmission - transmit each character immediately to partner
 * Displays partner's typing in the scroll region (line 22) instead of input line (line 24)
 */
export async function handleChatKeystroke(socket: Socket, session: BBBSession, data: { keystroke: string }) {
  try {
    const { keystroke } = data;

    if (!session.chatSessionId) {
      return;
    }

    // Get chat session
    const chatSession = await db.getChatSession(session.chatSessionId);
    if (!chatSession || chatSession.status !== 'active') {
      return;
    }

    // Get partner's user ID and username
    const partnerId = session.user!.id === chatSession.initiatorId
      ? chatSession.recipientId
      : chatSession.initiatorId;
    const partnerUsername = session.user!.id === chatSession.initiatorId
      ? chatSession.recipientUsername
      : chatSession.initiatorUsername;

    // Find partner's socket and session
    let partnerSocketId: string | null = null;
    let partnerSession: BBBSession | null = null;
    for (const [socketId, sess] of Array.from(sessions.entries())) {
      if (sess.user?.id === partnerId) {
        partnerSocketId = socketId;
        partnerSession = sess;
        break;
      }
    }

    if (!partnerSocketId || !partnerSession) {
      return; // Partner not online
    }

    // Initialize partner's typing buffer if needed
    if (!partnerSession.partnerTypingBuffer) {
      partnerSession.partnerTypingBuffer = '';
    }

    // Update partner's typing buffer based on keystroke
    if (keystroke === '\x7f') {
      // Backspace - remove last character from buffer
      if (partnerSession.partnerTypingBuffer.length > 0) {
        partnerSession.partnerTypingBuffer = partnerSession.partnerTypingBuffer.slice(0, -1);
      }
    } else if (keystroke.length === 1 && keystroke >= ' ' && keystroke <= '~') {
      // Printable character - add to buffer
      partnerSession.partnerTypingBuffer += keystroke;
    }

    // Get sender's username color (same logic as message display)
    const usernameColors = [31, 32, 33, 34, 35, 36];
    let hash = 0;
    for (let i = 0; i < session.user!.username.length; i++) {
      hash = session.user!.username.charCodeAt(i) + ((hash << 5) - hash);
    }
    const userColor = usernameColors[Math.abs(hash) % usernameColors.length];

    // Display typing preview at line 22 (below scroll region)
    // Show solid cursor while typing, blink when idle
    const now = Date.now();
    const isTyping = (now - (partnerSession.lastTypingTime || 0)) < 500; // Less than 500ms since last keystroke = actively typing
    partnerSession.lastTypingTime = now;

    // Clear existing blink timer
    if (partnerSession.typingBlinkTimer) {
      clearInterval(partnerSession.typingBlinkTimer);
      partnerSession.typingBlinkTimer = undefined;
    }

    // Show solid cursor while typing
    const typingPreview =
      '\x1b[22;1H' + // Move to line 22
      '\x1b[K' + // Clear line
      (partnerSession.partnerTypingBuffer.length > 0
        ? `\x1b[90m\x1b[${userColor}m${session.user!.username}:\x1b[0m ${partnerSession.partnerTypingBuffer}\x1b[${userColor}m█\x1b[0m`
        : '') +
      '\x1b[24;1H'; // Move cursor back to input line

    // Send typing preview to partner
    io.to(partnerSocketId).emit('ansi-output', typingPreview);

    // Start blink timer after 500ms of no typing
    if (partnerSession.partnerTypingBuffer.length > 0) {
      partnerSession.typingBlinkTimer = setInterval(() => {
        const timeSinceLastTyping = Date.now() - (partnerSession.lastTypingTime || 0);
        if (timeSinceLastTyping >= 500 && partnerSession.partnerTypingBuffer && partnerSession.partnerTypingBuffer.length > 0) {
          // Idle - send blinking cursor
          const showCursor = Math.floor(Date.now() / 530) % 2 === 0;
          const blinkPreview =
            '\x1b[22;1H' +
            '\x1b[K' +
            `\x1b[90m\x1b[${userColor}m${session.user!.username}:\x1b[0m ${partnerSession.partnerTypingBuffer}${showCursor ? `\x1b[${userColor}m█\x1b[0m` : ' '}` +
            '\x1b[24;1H';
          io.to(partnerSocketId).emit('ansi-output', blinkPreview);
        } else if (partnerSession.typingBlinkTimer) {
          // Typing again or buffer cleared - stop blinking
          clearInterval(partnerSession.typingBlinkTimer);
          partnerSession.typingBlinkTimer = undefined;
        }
      }, 530); // Blink at 530ms intervals to match xterm cursor
    }

  } catch (error) {
    console.error('❌ [CHAT KEYSTROKE] Error:', error);
  }
}

/**
 * Handle chat:message - User sends message during active chat
 * Based on INTERNODE_CHAT_DAY2_COMPLETE.md lines 260-316
 */
export async function handleChatMessage(socket: Socket, session: BBSSession, data: { message: string }) {
  try {
    const { message } = data;
    console.log('💬 [CHAT MESSAGE] Received message:', { message, from: session.user?.username, subState: session.subState });

    // Validation 1: Check if in chat mode
    if (session.subState !== LoggedOnSubState.CHAT) {
      console.log('❌ [CHAT MESSAGE] Validation failed: Not in chat mode. Current subState:', session.subState);
      socket.emit('chat:error', 'You are not in a chat session');
      return;
    }
    console.log('✅ [CHAT MESSAGE] Validation 1 passed: User in CHAT mode');

    // Validation 2: Check if chat session exists
    if (!session.chatSessionId) {
      console.log('❌ [CHAT MESSAGE] Validation failed: No chatSessionId');
      socket.emit('chat:error', 'No active chat session');
      return;
    }
    console.log('✅ [CHAT MESSAGE] Validation 2 passed: chatSessionId exists:', session.chatSessionId);

    // Validation 3: Get chat session from database
    const chatSession = await db.getChatSession(session.chatSessionId);
    console.log('🔍 [CHAT MESSAGE] Database chat session:', chatSession);
    if (!chatSession || chatSession.status !== 'active') {
      console.log('❌ [CHAT MESSAGE] Validation failed: Chat session not active');
      socket.emit('chat:error', 'Chat session is not active');
      return;
    }
    console.log('✅ [CHAT MESSAGE] Validation 3 passed: Chat session is active');

    // Validation 4: Message length
    if (message.length > 500) {
      console.log('❌ [CHAT MESSAGE] Validation failed: Message too long');
      socket.emit('chat:error', 'Message too long (max 500 characters)');
      return;
    }

    if (message.trim().length === 0) {
      console.log('⚠️  [CHAT MESSAGE] Empty message, ignoring');
      return; // Ignore empty messages
    }
    console.log('✅ [CHAT MESSAGE] Validation 4 passed: Message length OK');

    // Sanitize message (remove ANSI escape codes)
    const sanitized = message.replace(/\x1b/g, '');
    console.log('🧹 [CHAT MESSAGE] Sanitized message:', sanitized);

    // Save message to database
    console.log('💾 [CHAT MESSAGE] Saving to database...');
    await db.saveChatMessage(
      session.chatSessionId!,
      session.user!.id,
      session.user!.username,
      sanitized
    );
    console.log('✅ [CHAT MESSAGE] Message saved to database');

    // Clear typing buffers and timers for both users (message is being finalized)
    // Find both users' sessions and clear their partnerTypingBuffer and blink timers
    for (const [socketId, sess] of Array.from(sessions.entries())) {
      if (sess.user?.id === chatSession.initiatorId || sess.user?.id === chatSession.recipientId) {
        sess.partnerTypingBuffer = '';
        if (sess.typingBlinkTimer) {
          clearInterval(sess.typingBlinkTimer);
          sess.typingBlinkTimer = undefined;
        }
      }
    }

    // Broadcast message to room (both users)
    const roomName = `chat:${session.chatSessionId}`;
    const timestamp = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    console.log('📤 [CHAT MESSAGE] Broadcasting to room:', roomName);
    console.log('📤 [CHAT MESSAGE] Room members:', Array.from(io.sockets.adapter.rooms.get(roomName) || []));

    io.to(roomName).emit('chat:message-received', {
      sessionId: session.chatSessionId,
      from: session.user!.username,
      fromId: session.user!.id,
      message: sanitized,
      timestamp
    });
    console.log('✅ [CHAT MESSAGE] Emitted chat:message-received event');

    // Assign color based on username (hash username to get consistent color)
    const usernameColors = [31, 32, 33, 34, 35, 36]; // Red, Green, Yellow, Blue, Magenta, Cyan
    let hash = 0;
    for (let i = 0; i < session.user!.username.length; i++) {
      hash = session.user!.username.charCodeAt(i) + ((hash << 5) - hash);
    }
    const userColor = usernameColors[Math.abs(hash) % usernameColors.length];

    // Insert message into scroll region while keeping cursor at line 24
    // Clear typing preview (line 22), scroll message at line 21, restore cursor to line 24
    // Format: cyan timestamp user-color username: message
    const insertMessage =
      '\x1b[22;1H' + // Move to line 22 (typing preview line)
      '\x1b[K' + // Clear typing preview (removes cursor from there)
      '\x1b[21;1H' + // Move to line 21 (bottom of scroll region)
      `\r\n\x1b[36m${timestamp}\x1b[0m \x1b[${userColor}m${session.user!.username}:\x1b[0m ${sanitized}` + // Newline scrolls region up, message appears at line 21
      '\x1b[24;1H' + // Move cursor back to line 24 (input line)
      '\r\x1b[K'; // Clear input line for next message

    io.to(roomName).emit('ansi-output', insertMessage);
    console.log('✅ [CHAT MESSAGE] Emitted message in scroll region:', insertMessage.substring(0, 50) + '...');

  } catch (error) {
    console.error('❌ [CHAT MESSAGE] Error sending message:', error);
    socket.emit('chat:error', 'Failed to send message');
  }
}

/**
 * Handle chat:end - User ends active chat session
 * Based on INTERNODE_CHAT_DAY2_COMPLETE.md lines 318-382
 */
export async function handleChatEnd(socket: Socket, session: BBSSession) {
  try {
    // Validation 1: Check if in chat mode
    if (session.subState !== LoggedOnSubState.CHAT) {
      socket.emit('chat:error', 'You are not in a chat session');
      return;
    }

    // Validation 2: Check if chat session exists
    if (!session.chatSessionId) {
      socket.emit('chat:error', 'No active chat session');
      return;
    }

    const sessionId = session.chatSessionId;

    // Get chat session from database
    const chatSession = await db.getChatSession(sessionId);
    if (!chatSession) {
      // Session doesn't exist, just clean up local state
      await cleanupChatSession(socket, session);
      return;
    }

    // End session in database
    await db.endChatSession(sessionId);

    // Get statistics
    const messageCount = await db.getChatMessageCount(sessionId);
    const duration = Math.floor((Date.now() - new Date(chatSession.startedAt).getTime()) / 60000);

    // Get partner session
    const partnerId = session.user!.id === chatSession.initiatorId
      ? chatSession.recipientId
      : chatSession.initiatorId;

    let partnerSession: BBSSession | null = null;
    for (const [socketId, sess] of Array.from(sessions.entries())) {
      if (sess.user?.id === partnerId) {
        partnerSession = sess;
        break;
      }
    }

    const roomName = `chat:${sessionId}`;

    // Notify both users
    io.to(roomName).emit('chat:ended', {
      sessionId,
      messageCount,
      duration
    });

    // Reset scroll region, cursor color, and send end message to both users
    io.to(roomName).emit('ansi-output',
      '\x1b[r' + // Reset scroll region to full screen
      '\x1b]12;#ff0000\x07' + // Reset cursor color to red (OSC 12)
      '\x1b[2J\x1b[H' + // Clear screen and home cursor
      '\r\n\x1b[32m═══════════════════════════════════════════════════════════════\x1b[0m\r\n' +
      '\x1b[36m                     CHAT SESSION ENDED\x1b[0m\r\n' +
      '\x1b[32m═══════════════════════════════════════════════════════════════\x1b[0m\r\n' +
      '\r\n' +
      `Chat with ${session.chatWithUsername} has ended.\r\n` +
      `Duration: ${duration} minute(s)\r\n` +
      `Messages exchanged: ${messageCount}\r\n` +
      '\r\n'
    );

    // Clean up both users
    await cleanupChatSession(socket, session);
    if (partnerSession) {
      const partnerSocket = io.sockets.sockets.get(partnerSession.socketId!);
      if (partnerSocket) {
        await cleanupChatSession(partnerSocket, partnerSession);
      }
    }

    // Leave Socket.io room
    socket.leave(roomName);
    if (partnerSession?.socketId) {
      io.sockets.sockets.get(partnerSession.socketId)?.leave(roomName);
    }

  } catch (error) {
    console.error('[INTERNODE CHAT] Error ending chat:', error);
    socket.emit('chat:error', 'Failed to end chat');
  }
}

/**
 * Handle chat disconnect - User disconnects during active chat
 * Based on INTERNODE_CHAT_DAY2_COMPLETE.md lines 384-436
 */
export async function handleChatDisconnect(socket: Socket, session: BBSSession) {
  try {
    if (session.subState !== LoggedOnSubState.CHAT || !session.chatSessionId) {
      return; // Not in chat, nothing to clean up
    }

    const sessionId = session.chatSessionId;

    // Get chat session
    const chatSession = await db.getChatSession(sessionId);
    if (!chatSession) {
      return;
    }

    // End session in database
    await db.endChatSession(sessionId);

    // Get partner
    const partnerId = session.user!.id === chatSession.initiatorId
      ? chatSession.recipientId
      : chatSession.initiatorId;

    const partnerUsername = session.user!.id === chatSession.initiatorId
      ? chatSession.recipientUsername
      : chatSession.initiatorUsername;

    // Find partner session
    let partnerSession: BBSSession | null = null;
    for (const [socketId, sess] of Array.from(sessions.entries())) {
      if (sess.user?.id === partnerId) {
        partnerSession = sess;
        break;
      }
    }

    if (partnerSession) {
      // Notify partner
      io.to(partnerSession.socketId!).emit('chat:partner-disconnected', {
        username: session.user!.username
      });

      io.to(partnerSession.socketId!).emit('ansi-output',
        '\x1b]12;#ff0000\x07' + // Reset cursor color to red
        `\r\n\x1b[33m${session.user!.username} has disconnected. Chat ended.\x1b[0m\r\n`
      );

      // Clean up partner session
      const partnerSocket = io.sockets.sockets.get(partnerSession.socketId!);
      if (partnerSocket) {
        await cleanupChatSession(partnerSocket, partnerSession);
      }
    }

    // Leave room
    const roomName = `chat:${sessionId}`;
    socket.leave(roomName);

  } catch (error) {
    console.error('[INTERNODE CHAT] Error handling chat disconnect:', error);
  }
}

/**
 * Cleanup chat session - Restore user to previous state
 */
async function cleanupChatSession(socket: Socket, session: BBSSession) {
  // Restore previous state
  if (session.previousSubState) {
    session.subState = session.previousSubState;
  } else {
    session.subState = LoggedOnSubState.DISPLAY_MENU;
  }

  // Clear chat fields
  delete session.chatSessionId;
  delete session.chatWithUserId;
  delete session.chatWithUsername;
  delete session.previousState;
  delete session.previousSubState;

  // Clear input buffer, typing buffer, and blink timer
  session.inputBuffer = '';
  session.partnerTypingBuffer = '';
  if (session.typingBlinkTimer) {
    clearInterval(session.typingBlinkTimer);
    delete session.typingBlinkTimer;
  }
  delete session.lastTypingTime;

  // Return to menu (handled by main command loop)
  socket.emit('ansi-output', '\r\n');
}
