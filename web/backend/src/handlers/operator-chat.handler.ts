/**
 * Operator Chat Handler
 *
 * Handles AmiExpress Page Sysop flow:
 * 1. User pages sysop
 * 2. Check availability/quiet hours/cooldown
 * 3. Send notifications (Socket.IO, Discord, Browser Push)
 * 4. Sysop accepts and chat begins
 * 5. Line-based chat with typing indicators
 * 6. Exit restores user state
 * 7. Transcript logged to SysLogs
 */

import { Socket } from 'socket.io';
import axios from 'axios';
import {
  PageRequest,
  PageStatus,
  ChatMessage,
  CreatePageRequest,
  PageResponse,
  SysopAvailability,
  ChatSession,
  OperatorChatConfig,
  DEFAULT_QUICK_REPLIES
} from '../types/operator-chat.types';
import { OperatorChatRepository } from '../database/operator-chat.repository';
import { BBSSession } from '../index';
import { LoggedOnSubState } from '../constants/bbs-states';
import { getGrumpySysopResponse, getGrumpyBotIntroMessage, simulateNaturalTyping } from './grumpy-sysop-bot.handler';
import { userSessions, socketToUser } from '../server/session-manager';
import { loadBBSConfig } from '../services/bbs-config-file.service';
import * as fs from 'fs';
import * as path from 'path';

// BBS root for config and log files
const bbsRoot = process.env.BBS_ROOT || path.join(__dirname, '../../../..');

// Active chat sessions (in-memory)
const activeChatSessions = new Map<string, ChatSession>();

// Track active paging dot intervals by pageId (for reliable cleanup)
const activePagingIntervals = new Map<string, NodeJS.Timeout>();

/**
 * Stop the paging dots animation for a page
 */
function stopPagingDots(pageId: string): void {
  const interval = activePagingIntervals.get(pageId);
  if (interval) {
    clearInterval(interval);
    activePagingIntervals.delete(pageId);
    console.log(`[Operator Chat] Stopped paging dots for page ${pageId}`);
  }
}

/**
 * Initialize operator chat handler
 */
export function initOperatorChatHandler(io: any, repository: OperatorChatRepository) {
  console.log('[Operator Chat] Handler initialized');

  // Listen for sysop status updates
  io.on('connection', (socket: Socket) => {
    const session = (socket as any).session as BBSSession;

    // Mark sysop sockets available on connect, defaulting status to AVAILABLE
    if (session?.user && session.user.secLevel >= 100) {
      // Join user-specific rooms AND sysops broadcast room
      socket.join(`user:${session.user.id}`);
      socket.join('sysops'); // Global sysops room for broadcasts
      repository.updateSysopStatus(session.user.id, SysopAvailability.AVAILABLE, 'Online');
      console.log(`[Operator Chat] Sysop ${session.user.username} (ID:${session.user.id}) connected, joined sysops room`);
    } else if (session?.user) {
      console.log(`[Operator Chat] Non-sysop user ${session.user.username} (secLevel:${session.user.secLevel}) connected`);
    } else {
      console.log(`[Operator Chat] Anonymous socket connected (no session)`);
    }

    socket.on('disconnect', () => {
      const sess = (socket as any).session as BBSSession;
      if (sess?.user && sess.user.secLevel >= 100) {
        repository.updateSysopStatus(sess.user.id, SysopAvailability.OFFLINE, 'Offline');
        console.log(`[Operator Chat] Sysop ${sess.user.username} disconnected`);
      }
    });

    socket.on('operator:set-status', async (data: { availability: SysopAvailability; statusMessage?: string }) => {
      if (!session?.user || session.user.secLevel < 100) {
        socket.emit('operator:error', { message: 'Unauthorized' });
        return;
      }

      repository.updateSysopStatus(session.user.id, data.availability, data.statusMessage);
      socket.emit('operator:status-updated', { availability: data.availability });

      console.log(`[Operator Chat] Sysop ${session.user.username} set status to ${data.availability}`);
    });

    socket.on('operator:get-pending-pages', async () => {
      if (!session?.user || session.user.secLevel < 100) {
        socket.emit('operator:error', { message: 'Unauthorized' });
        return;
      }

      const pending = repository.getPendingPages();
      // Convert Date objects to timestamps for frontend
      const pendingWithTimestamps = pending.map(page => ({
        ...page,
        createdAt: page.createdAt.getTime(),
        acceptedAt: page.acceptedAt?.getTime(),
        endedAt: page.endedAt?.getTime(),
        cooldownUntil: page.cooldownUntil?.getTime(),
        tokenExpiresAt: page.tokenExpiresAt?.getTime()
      }));
      socket.emit('operator:pending-pages', pendingWithTimestamps);
    });

    socket.on('operator:accept-page', async (data: { pageId: string }) => {
      if (!session?.user || session.user.secLevel < 100) {
        socket.emit('operator:error', { message: 'Unauthorized' });
        return;
      }

      await acceptPage(io, repository, data.pageId, session.user.id, session.user.username, socket.id);
    });

    socket.on('operator:send-message', async (data: { pageId: string; message: string }) => {
      if (!session?.user || session.user.secLevel < 100) {
        socket.emit('operator:error', { message: 'Unauthorized' });
        return;
      }

      await sendChatMessage(io, repository, data.pageId, session.user.id, session.user.username, 'sysop', data.message, session.nodeId || 0);
    });

    socket.on('operator:end-chat', async (data: { pageId: string }) => {
      if (!session?.user || session.user.secLevel < 100) {
        socket.emit('operator:error', { message: 'Unauthorized' });
        return;
      }

      await endChat(io, repository, data.pageId);
    });

    socket.on('operator:typing', (data: { pageId: string; isTyping: boolean }) => {
      const chatSession = activeChatSessions.get(data.pageId);
      if (chatSession) {
        chatSession.isTyping.sysop = data.isTyping;
        io.to(`page:${data.pageId}`).emit('operator:typing-status', {
          pageId: data.pageId,
          senderType: 'sysop',
          isTyping: data.isTyping
        });
      }
    });

    // Real-time sysop keystroke transmission to BBS user (like livechat char-by-char)
    socket.on('operator:keystroke', (data: { pageId: string; keystroke: string }) => {
      const chatSession = activeChatSessions.get(data.pageId);
      if (!chatSession) return;

      // Initialize sysop typing buffer if needed
      if (!(chatSession as any).sysopTypingBuffer) {
        (chatSession as any).sysopTypingBuffer = '';
      }

      // Update typing buffer based on keystroke
      if (data.keystroke === '\x7f' || data.keystroke === '\b' || data.keystroke === 'Backspace') {
        // Backspace - remove last character
        if ((chatSession as any).sysopTypingBuffer.length > 0) {
          (chatSession as any).sysopTypingBuffer = (chatSession as any).sysopTypingBuffer.slice(0, -1);
        }
      } else if (data.keystroke === '\r' || data.keystroke === '\n' || data.keystroke === 'Enter') {
        // Enter - clear buffer (message will be sent via operator:send-message)
        (chatSession as any).sysopTypingBuffer = '';
      } else if (data.keystroke.length === 1 && data.keystroke >= ' ' && data.keystroke <= '~') {
        // Printable character - add to buffer
        (chatSession as any).sysopTypingBuffer += data.keystroke;
      }

      // Send real-time typing preview to BBS user's terminal at line 22
      const page = repository.getPageRequest(data.pageId);
      if (page) {
        const sysopHandle = chatSession.sysopHandle || 'Sysop';
        const buffer = (chatSession as any).sysopTypingBuffer || '';

        // Display typing preview at line 22 (below scroll region, above separator)
        // Uses save/restore cursor to preserve BBS user's typing position at line 24
        const typingPreview =
          '\x1b7' + // Save BBS user's cursor position (they're typing at line 24)
          '\x1b[22;1H' + // Move to line 22 (typing preview line)
          '\x1b[2K' + // Clear ENTIRE line (not just from cursor)
          (buffer.length > 0
            ? `\x1b[36m${sysopHandle}:\x1b[0m ${buffer}\x1b[36m|\x1b[0m`
            : '') +
          '\x1b8'; // Restore BBS user's cursor position

        io.to(`user:${page.userId}`).emit('ansi-output', typingPreview);
      }

      // Update typing indicator
      chatSession.isTyping.sysop = (chatSession as any).sysopTypingBuffer.length > 0;
    });
  });

  // Start page timeout checker
  setInterval(() => {
    checkPageTimeouts(io, repository);
  }, 10000); // Check every 10 seconds
}

/**
 * Handle user page request (called from BBS command)
 */
export async function handlePageSysop(
  socket: Socket,
  session: BBSSession,
  io: any,
  repository: OperatorChatRepository
): Promise<PageResponse> {
  const config = repository.getConfig();

  // Debug logging
  console.log('[Operator Chat] Page request from user:', session.user?.username, 'secLevel:', session.user?.secLevel);
  console.log('[Operator Chat] Config allowedSecLevels:', config.allowedSecLevels, 'length:', config.allowedSecLevels?.length);

  // Check if feature is enabled
  if (!config.enabled) {
    return {
      success: false,
      message: '\x1b[31mOperator chat is currently disabled.\x1b[0m'
    };
  }

  // Check security level (empty array = all levels allowed, sysops always allowed)
  const userSecLevel = session.user?.secLevel || 0;
  const isSysop = userSecLevel >= 100;

  if (!isSysop && config.allowedSecLevels && config.allowedSecLevels.length > 0 && !config.allowedSecLevels.includes(userSecLevel)) {
    console.log('[Operator Chat] Permission denied - user secLevel:', userSecLevel, 'not in allowedSecLevels:', config.allowedSecLevels);
    return {
      success: false,
      message: '\x1b[31mYou do not have permission to page the sysop.\x1b[0m'
    };
  }

  // Check carrier requirement (skip for now - no hasCarrier property)
  // Note: In express.e, this checks if user has a modem carrier
  // For web/telnet/ssh, we'll allow all connections
  if (config.requireCarrier && session.connectionType === 'web') {
    return {
      success: false,
      message: '\x1b[31mOperator chat requires a real connection.\x1b[0m'
    };
  }

  // Check quiet hours
  if (isQuietHours(config)) {
    return {
      success: false,
      message: '\x1b[33mThe sysop is not available during quiet hours.\x1b[0m\r\nPlease try again later.'
    };
  }

  // Check cooldown
  const cooldownCheck = checkUserCooldown(repository, session.user!.id, config.pageCooldown);
  if (!cooldownCheck.allowed) {
    return {
      success: false,
      message: `\x1b[33mPlease wait ${cooldownCheck.remainingSeconds} seconds before paging again.\x1b[0m`,
      cooldownRemaining: cooldownCheck.remainingSeconds
    };
  }

  // Check max active pages
  const pendingPages = repository.getPendingPages().filter(p => p.userId === session.user!.id);
  if (pendingPages.length >= config.maxActivePages) {
    return {
      success: false,
      message: '\x1b[33mYou already have a pending page. Please wait for a response.\x1b[0m'
    };
  }

  // Check sysop availability - but don't block paging
  // Original express.e allowed users to page and wait, even if sysop didn't respond
  // Discord/push notifications are optional extras
  const availableSysops = await checkSysopAvailability(io, repository);
  if (availableSysops.length === 0) {
    console.log('[Operator Chat] No sysops online, page will be queued for notification');
  }

  // Create page request
  const pageData: CreatePageRequest = {
    userId: session.user!.id,
    userHandle: session.user!.username,
    nodeId: session.nodeId || 0,
    conferenceId: session.currentConf,
    conferenceName: `Conference ${session.currentConf}`, // TODO: Get actual name
    timeOnline: Math.floor((Date.now() - (session.connectionStart || Date.now())) / 1000),
    lastCommand: session.commandText || 'O'
  };

  const pageRequest = repository.createPageRequest(pageData);

  // Join user-specific rooms so targeted emits reach this socket
  try {
    socket.join(`page:${pageRequest.id}`);
    if (session.user?.id) {
      socket.join(`user:${session.user.id}`);
      // Also ensure the user session is mapped for direct lookup (critical for grumpy bot)
      if (!userSessions.has(session.user.id)) {
        userSessions.set(session.user.id, session);
        console.log(`[Operator Chat] Added user ${session.user.id} to userSessions map`);
      }
      // Also map socket to user for lookup
      socketToUser.set(socket.id, session.user.id);
      // Verify room membership
      const rooms = Array.from(socket.rooms || []);
      console.log(`[Operator Chat] User ${session.user.username} (socket ${socket.id}) joined rooms: ${rooms.join(', ')}`);
    }
  } catch (err) {
    console.error('[Operator Chat] Failed to join page/user rooms:', err);
  }

  // Set cooldown
  repository.setUserCooldown(session.user!.id, config.pageCooldown);

  // Send notifications
  await sendPageNotifications(io, repository, pageRequest, config);

  // Store page ID in tempData (but don't change subState yet - user can continue using BBS)
  // In express.e, user returns to normal operation after the paging animation
  session.tempData = { ...session.tempData, pageId: pageRequest.id };

  // Display waiting message with animated dots (match express.e exactly)
  // express.e: FOR i:=0 TO 19, each iteration: DisplayBeep, aePuts(' .'), Delay 50 ticks (~1 sec)
  const currentTime = new Date().toLocaleString();
  // Get sysop name from BBS config (cmds.sysopName in express.e)
  const bbsConfig = loadBBSConfig(bbsRoot);
  const sysopName = bbsConfig.sysop_name || 'the operator';

  socket.emit('ansi-output', `\r\n${currentTime}\r\n`);
  socket.emit('ansi-output', `\r\nPaging ${sysopName} (CTRL-C to Abort). .`);

  // Set state to waiting during animation (allows CTRL+C to abort)
  session.subState = LoggedOnSubState.OPERATOR_CHAT_WAITING;

  // Start animated dot sequence - 30 dots over 30 seconds
  let dotCount = 0;
  const maxDots = 30;
  const dotInterval = setInterval(() => {
    // Check if interval was stopped externally (via stopPagingDots)
    if (!activePagingIntervals.has(pageRequest.id)) {
      clearInterval(dotInterval);
      return;
    }

    // Check if session state changed (chat accepted or cancelled)
    // Stop dots if: pageId changed, pageId cleared, OR state is no longer WAITING
    // (covers both OPERATOR_CHAT_ACTIVE and returning to DISPLAY_MENU)
    if (session.tempData?.pageId !== pageRequest.id ||
        session.subState !== LoggedOnSubState.OPERATOR_CHAT_WAITING) {
      stopPagingDots(pageRequest.id);
      return;
    }

    dotCount++;
    socket.emit('ansi-output', ' .');

    // After 30 dots, show final message and return to normal BBS operation
    if (dotCount >= maxDots) {
      stopPagingDots(pageRequest.id);

      // Check if chat was already accepted (by bot or sysop) before resetting state
      const page = repository.getPageRequest(pageRequest.id);
      // Cast to avoid TS narrowing issue - session.subState can change between intervals
      const currentSubState = session.subState as LoggedOnSubState;
      const chatAccepted = page?.status === PageStatus.ACCEPTED ||
                           currentSubState === LoggedOnSubState.OPERATOR_CHAT_ACTIVE;

      if (!chatAccepted) {
        socket.emit('ansi-output', '\r\n\r\nThe Sysop has been paged\r\n');
        socket.emit('ansi-output', 'You may continue using the system\r\n');
        socket.emit('ansi-output', `until ${sysopName} answers your request.\r\n\r\n`);

        // Return to normal BBS operation (like express.e)
        // User keeps pageId in tempData so they can receive chat-accepted later
        if (session.subState === LoggedOnSubState.OPERATOR_CHAT_WAITING) {
          session.subState = LoggedOnSubState.DISPLAY_MENU;
        }
      }
      // If chat was accepted, don't show the message or change state - user is already chatting
    }
  }, 1000); // 1 second per dot (express.e uses 50 ticks = 1 second)

  // Register interval in map for reliable cleanup
  activePagingIntervals.set(pageRequest.id, dotInterval);

  // Store interval ID so it can be cleared if chat is accepted/cancelled
  session.tempData = { ...session.tempData, pageId: pageRequest.id, dotIntervalId: dotInterval };

  console.log(`[Operator Chat] Page created: ${pageRequest.id} from ${session.user!.username}@Node${session.nodeId}`);

  return {
    success: true,
    pageId: pageRequest.id,
    message: 'Page sent successfully',
    status: PageStatus.PENDING
  };
}

/**
 * Send page notifications to sysops
 */
async function sendPageNotifications(
  io: any,
  repository: OperatorChatRepository,
  page: PageRequest,
  config: OperatorChatConfig
): Promise<void> {
  const notificationUpdates: any = {};

  // 1. Socket.IO notification to all connected sysops
  try {
    const pageData = {
      id: page.id,
      pageId: page.id,
      userId: page.userId,
      userHandle: page.userHandle,
      nodeId: page.nodeId,
      conferenceId: page.conferenceId,
      conferenceName: page.conferenceName,
      timeOnline: page.timeOnline,
      lastCommand: page.lastCommand,
      status: page.status,
      createdAt: page.createdAt.getTime() // Convert Date to timestamp for frontend
    };

    // Emit to sysops room ONLY (not all connected sockets)
    io.to('sysops').emit('operator:page', pageData);
    notificationUpdates.socketIO = true;
    console.log(`[Operator Chat] Socket.IO notification sent to sysops room for page ${page.id}`, pageData);
  } catch (error) {
    console.error('[Operator Chat] Socket.IO notification failed:', error);
  }

  // 2. Discord webhook notification
  if (config.discordWebhook) {
    try {
      const timeOnlineStr = formatDuration(page.timeOnline);
      const authUrl = `${process.env.BASE_URL || 'http://localhost:3001'}/admin/operator-chat?token=${page.token}`;

      // Build content with optional @mention
      const mention = config.discordUserId ? `<@${config.discordUserId}> ` : '';
      const response = await axios.post(config.discordWebhook, {
        content: `${mention}[OP PAGE] **${page.userHandle}** @Node${page.nodeId} in ${page.conferenceName}`,
        embeds: [{
          title: 'Operator Page Request',
          color: 0x00AAFF,
          fields: [
            { name: 'User', value: page.userHandle, inline: true },
            { name: 'Node', value: `Node ${page.nodeId}`, inline: true },
            { name: 'Conference', value: page.conferenceName, inline: true },
            { name: 'Time Online', value: timeOnlineStr, inline: true },
            { name: 'Last Command', value: page.lastCommand, inline: true },
            { name: 'Timestamp', value: `<t:${Math.floor(page.createdAt.getTime() / 1000)}:R>`, inline: true },
            { name: 'Respond', value: `[Open Operator Chat](${authUrl})`, inline: false }
          ]
        }]
      });

      if (response.data?.id) {
        notificationUpdates.discord = true;
        notificationUpdates.discordMessageId = response.data.id;
        console.log(`[Operator Chat] Discord notification sent for page ${page.id}, message ID: ${response.data.id}`);
      }
    } catch (error) {
      console.error('[Operator Chat] Discord notification failed:', error);
    }
  }

  // 3. Browser push notifications
  try {
    const {
      isWebPushEnabled,
      sendPushNotifications,
      createPageNotificationPayload
    } = require('../utils/web-push.util');

    if (isWebPushEnabled()) {
      const subscriptions = repository.getAllPushSubscriptions();

      if (subscriptions.length > 0) {
        const authUrl = `${process.env.BASE_URL || 'http://localhost:3001'}/admin/operator-chat?token=${page.token}`;
        const payload = createPageNotificationPayload(
          page.userHandle,
          page.nodeId,
          page.conferenceName,
          page.id,
          authUrl
        );

        const results = await sendPushNotifications(
          subscriptions.map((s: any) => ({ endpoint: s.endpoint, keys: s.keys })),
          payload
        );

        // Remove failed subscriptions (expired/invalid)
        for (const result of results) {
          if (!result.success) {
            repository.removePushSubscription(result.subscription.endpoint);
          }
        }

        notificationUpdates.browserPush = results.some((r: any) => r.success);
        notificationUpdates.pushResults = results.map((r: any) => ({
          endpoint: r.subscription.endpoint.substring(0, 50) + '...',
          success: r.success
        }));

        console.log(`[Operator Chat] Push notifications sent: ${results.filter((r: any) => r.success).length}/${results.length} succeeded`);
      } else {
        console.log('[Operator Chat] No push subscriptions registered');
        notificationUpdates.browserPush = false;
        notificationUpdates.pushResults = [];
      }
    } else {
      notificationUpdates.browserPush = false;
      notificationUpdates.pushResults = [];
    }
  } catch (error) {
    console.error('[Operator Chat] Push notification failed:', error);
    notificationUpdates.browserPush = false;
    notificationUpdates.pushResults = [];
  }

  // Update notification status in database
  repository.updateNotificationStatus(page.id, notificationUpdates);
}

/**
 * Accept a page and start chat session
 * Sets up split-screen layout like livechat (scroll region 1-21, typing preview at 22, separator at 23, input at 24)
 */
async function acceptPage(
  io: any,
  repository: OperatorChatRepository,
  pageId: string,
  sysopId: string,
  sysopHandle: string,
  sysopSessionId: string
): Promise<void> {
  const page = repository.getPageRequest(pageId);
  if (!page || page.status !== PageStatus.PENDING) {
    console.error(`[Operator Chat] Cannot accept page ${pageId}: not found or not pending`);
    return;
  }

  // CRITICAL: Stop the paging dots animation IMMEDIATELY
  stopPagingDots(pageId);

  // Add sysop socket to page room for chat fan-out
  const sysopSocket = io.sockets?.sockets?.get(sysopSessionId);
  if (sysopSocket) {
    try {
      sysopSocket.join(`page:${pageId}`);
      sysopSocket.join(`user:${page.userId}`);
    } catch (err) {
      console.error(`[Operator Chat] Failed to join sysop socket to page room ${pageId}:`, err);
    }
  }

  // Update page status
  repository.updatePageStatus(pageId, PageStatus.ACCEPTED, sysopId, sysopHandle);

  // Load existing chat messages from database (messages sent before sysop accepted)
  const existingMessages = repository.getChatMessages(pageId);
  console.log(`[Operator Chat] Loaded ${existingMessages.length} existing messages for page ${pageId}`);

  // Create chat session with existing message history
  const chatSession: ChatSession = {
    pageId,
    userId: page.userId,
    userHandle: page.userHandle,
    userNodeId: page.nodeId,
    sysopId,
    sysopHandle,
    sysopSessionId,
    startedAt: new Date(),
    lastActivity: new Date(),
    messages: existingMessages, // Include existing messages
    isTyping: { user: false, sysop: false }
  };

  activeChatSessions.set(pageId, chatSession);

  // Send existing message history to sysop frontend
  if (existingMessages.length > 0) {
    const messagesWithTimestamps = existingMessages.map(msg => ({
      ...msg,
      timestamp: msg.timestamp.getTime() // Convert Date to number for frontend
    }));
    io.to(sysopSessionId).emit('operator:message-history', {
      pageId,
      messages: messagesWithTimestamps
    });
    console.log(`[Operator Chat] Sent ${existingMessages.length} message(s) to sysop ${sysopHandle}`);
  }

  // Notify user that sysop accepted with split-screen setup (like livechat)
  // Set up fixed chat layout: scroll region 1-21, typing preview at 22, separator at 23, input at 24
  const userSetupScreen =
    '\x1b%G' + // Select UTF-8 character set
    '\x1b[2J\x1b[H' + // Clear screen, home cursor
    '\x1b[1;21r' + // Set scroll region to lines 1-21 (messages area - allows scrolling)
    '\x1b[32m===============================================================\x1b[0m\r\n' +
    `\x1b[36m              OPERATOR CHAT WITH ${sysopHandle.toUpperCase()}\x1b[0m\r\n` +
    '\x1b[32m===============================================================\x1b[0m\r\n' +
    '\r\n' +
    'Type your messages and press ENTER to send.\r\n' +
    'Type \x1b[33m/END\x1b[0m to exit, \x1b[33mCtrl+E\x1b[0m for smileys, \x1b[33m/HELP\x1b[0m for commands.\r\n' +
    '\r\n' +
    '\x1b[23;1H' + // Move to line 23
    '\x1b[36m-----------------------------------------------------------------\x1b[0m' +
    '\x1b[24;1H'; // Move to line 24 for input

  // Debug: Check which sockets are in the target room
  const targetRoom = `user:${page.userId}`;
  const socketsInRoom = io.sockets.adapter.rooms.get(targetRoom);
  console.log(`[Operator Chat] Sending to room ${targetRoom}, sockets in room: ${socketsInRoom ? Array.from(socketsInRoom).join(', ') : 'NONE'}`);

  // Try room-based emit first
  console.log(`[Operator Chat] Sending split-screen setup to room ${targetRoom}`);
  io.to(targetRoom).emit('ansi-output', userSetupScreen);

  console.log(`[Operator Chat] Sending chat-accepted to room ${targetRoom}`);
  io.to(targetRoom).emit('operator:chat-accepted', {
    pageId,
    sysopHandle
  });

  // CRITICAL: Update user's session state from the session manager
  // BBS sessions are stored in userSessions map, NOT on socket.session
  const userSession = userSessions.get(page.userId);
  if (userSession) {
    console.log(`[Operator Chat] Found user session for userId ${page.userId}`);

    // CRITICAL: Update session state directly
    if (userSession.tempData?.pageId === pageId) {
      // Clear the dot animation interval if still running
      if (userSession.tempData?.dotIntervalId) {
        clearInterval(userSession.tempData.dotIntervalId);
        delete userSession.tempData.dotIntervalId;
      }

      userSession.subState = LoggedOnSubState.OPERATOR_CHAT_ACTIVE;
      userSession.inputBuffer = '';
      console.log(`[Operator Chat] Set user ${page.userHandle} session to OPERATOR_CHAT_ACTIVE`);
    } else {
      console.warn(`[Operator Chat] User session found but pageId mismatch: session has ${userSession.tempData?.pageId}, expected ${pageId}`);
    }
  } else {
    console.warn(`[Operator Chat] Could not find user session for userId ${page.userId}`);
  }

  // Notify sysop
  io.to(sysopSessionId).emit('operator:chat-started', {
    pageId,
    userHandle: page.userHandle,
    nodeId: page.nodeId,
    conferenceId: page.conferenceId,
    conferenceName: page.conferenceName,
    timeOnline: page.timeOnline,
    lastCommand: page.lastCommand
  });

  // Broadcast to other sysops that page was accepted
  io.emit('operator:page-accepted', { pageId, sysopHandle });

  console.log(`[Operator Chat] Page ${pageId} accepted by ${sysopHandle}`);
}

/**
 * Send chat message
 * Uses scroll region message insertion like livechat (messages appear in lines 1-21, input stays at line 24)
 */
async function sendChatMessage(
  io: any,
  repository: OperatorChatRepository,
  pageId: string,
  senderId: string,
  senderHandle: string,
  senderType: 'user' | 'sysop',
  message: string,
  nodeId: number
): Promise<void> {
  const chatSession = activeChatSessions.get(pageId);
  if (!chatSession) {
    console.error(`[Operator Chat] Chat session not found: ${pageId}`);
    return;
  }

  // Create message
  const chatMessage: ChatMessage = {
    id: '', // Will be set by repository
    pageId,
    senderId,
    senderHandle,
    senderType,
    message,
    timestamp: new Date(),
    nodeId
  };

  // Save to database
  const saved = repository.addChatMessage(chatMessage);

  // Add to session
  chatSession.messages.push(saved);
  chatSession.lastActivity = new Date();

  // Clear typing buffers when message is sent
  if (senderType === 'user') {
    (chatSession as any).userTypingBuffer = '';
  } else if (senderType === 'sysop') {
    (chatSession as any).sysopTypingBuffer = '';
  }

  // If bot-controlled and message is from user, generate bot response
  console.log(`[Operator Chat] Checking bot response: isBotControlled=${(chatSession as any).isBotControlled}, senderType=${senderType}`);
  if ((chatSession as any).isBotControlled && senderType === 'user') {
    console.log(`[Operator Chat] User message in bot session, generating response for: "${message}"`);

    // Build context
    const page = repository.getPageRequest(pageId);
    if (page) {
      const context = {
        userHandle: page.userHandle,
        nodeId: page.nodeId,
        conferenceName: page.conferenceName,
        timeOnline: Math.floor((Date.now() - page.createdAt.getTime()) / 1000),
        messageHistory: (chatSession as any).botMessageHistory || []
      };

      // Add user message to history
      context.messageHistory.push({ role: 'user', content: message });

      // Get bot response (async, don't wait)
      getGrumpySysopResponse(message, context).then(botResponse => {
        // Add bot message to history
        context.messageHistory.push({ role: 'bot', content: botResponse });
        (chatSession as any).botMessageHistory = context.messageHistory;

        // Send bot response with natural typing after short delay
        setTimeout(() => {
          simulateNaturalTyping(io, pageId, botResponse, () => {
            // After typing animation completes, save message to database
            sendChatMessage(io, repository, pageId, 'bot', 'GrumpyBot', 'sysop', botResponse, nodeId);
          });
        }, 1000 + Math.random() * 2000); // 1-3 second delay before starting to type
      }).catch(err => {
        console.error('[Operator Chat] Bot response error:', err);
      });
    }
  }

  // Broadcast to both parties (convert timestamp to number for frontend)
  io.to(`page:${pageId}`).emit('operator:message', {
    ...saved,
    timestamp: saved.timestamp.getTime()
  });

  // Send ANSI output to user's terminal using scroll region (like livechat)
  const page = repository.getPageRequest(pageId);
  if (page) {
    // Format timestamp like livechat
    const timestamp = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    // Color based on sender type (cyan for sysop, yellow for user)
    const nameColor = senderType === 'sysop' ? '36' : '33'; // cyan or yellow

    // Insert message into scroll region while keeping cursor at line 24
    // This matches the livechat pattern exactly
    // When USER sends a message, clear their input line (24) after
    // When SYSOP sends a message, preserve user's input line (they may be typing)
    const clearInputLine = senderType === 'user'
      ? '\x1b[24;1H\x1b[2K' // Move to line 24 and clear it (user just submitted)
      : '';

    // Word-wrap long messages to prevent overflow past scroll region
    // Terminal is 80 cols, prefix "HH:MM Handle: " is ~18 chars, leave margin
    const maxLineWidth = 78;
    const prefix = `\x1b[36m${timestamp}\x1b[0m \x1b[${nameColor}m${senderHandle}:\x1b[0m `;
    const prefixVisibleLen = timestamp.length + 1 + senderHandle.length + 2; // "HH:MM Handle: "
    const firstLineMaxChars = maxLineWidth - prefixVisibleLen;
    const continuationIndent = '       '; // 7 spaces to align with message text
    const continuationMaxChars = maxLineWidth - continuationIndent.length;

    // Word-wrap the message
    const wrappedLines = wordWrapMessage(message, firstLineMaxChars, continuationMaxChars);

    // Build ANSI output for each line
    let insertMessage =
      '\x1b7' + // Save cursor position
      '\x1b[1;21r' + // Reinforce scroll region (lines 1-21) to prevent full-screen scroll
      '\x1b[22;1H\x1b[2K'; // Move to line 22, clear ENTIRE line (typing preview)

    // Insert first line with timestamp and handle
    insertMessage +=
      '\x1b[21;1H' + // Move to line 21 (bottom of scroll region)
      '\x1b[S' + // Scroll Up (SU): Scroll the scroll region up by 1 line
      '\x1b[21;1H' + // Move to line 21 (now a blank line after scroll)
      prefix + wrappedLines[0]; // Write first line with prefix

    // Insert continuation lines (if any)
    for (let i = 1; i < wrappedLines.length; i++) {
      insertMessage +=
        '\x1b[21;1H' + // Move to line 21
        '\x1b[S' + // Scroll up
        '\x1b[21;1H' + // Move to line 21
        continuationIndent + wrappedLines[i]; // Write continuation line
    }

    insertMessage +=
      clearInputLine + // Clear user's input line ONLY when user sent the message
      '\x1b[24;1H'; // Move cursor back to line 24 for next input

    io.to(`user:${page.userId}`).emit('ansi-output', insertMessage);
  }

  console.log(`[Operator Chat] Message in page ${pageId} from ${senderHandle}: ${message.substring(0, 50)}...`);
}

/**
 * End chat session
 * Resets scroll region and shows chat summary (like livechat)
 */
async function endChat(io: any, repository: OperatorChatRepository, pageId: string): Promise<void> {
  const chatSession = activeChatSessions.get(pageId);
  if (!chatSession) {
    console.error(`[Operator Chat] Chat session not found: ${pageId}`);
    return;
  }

  // Update page status
  repository.updatePageStatus(pageId, PageStatus.ENDED);

  // Log transcript to SysLogs
  await logChatTranscript(repository, chatSession);

  // Calculate stats
  const messageCount = chatSession.messages.length;
  const duration = Math.floor((Date.now() - chatSession.startedAt.getTime()) / 60000);

  // Build end message with scroll region reset (like livechat)
  const page = repository.getPageRequest(pageId);
  const partnerName = chatSession.sysopHandle || 'Sysop';
  const endMessage =
    '\x1b[?25l' + // Hide cursor
    '\x1b[r' + // Reset scroll region to full screen
    '\x1b[2J\x1b[H' + // Clear entire screen and move cursor to home
    '\x1b[3J' + // Clear scrollback buffer
    '\r\n\x1b[32m===============================================================\x1b[0m\r\n' +
    '\x1b[36m                    OPERATOR CHAT ENDED\x1b[0m\r\n' +
    '\x1b[32m===============================================================\x1b[0m\r\n' +
    '\r\n' +
    `Chat with ${partnerName} has ended.\r\n` +
    `Duration: ${duration} minute(s)\r\n` +
    `Messages exchanged: ${messageCount}\r\n` +
    '\r\n' +
    '\x1b[32mPress any key to continue...\x1b[0m' +
    '\x1b[?25h'; // Show cursor again

  // Send to BBS user
  if (page) {
    io.to(`user:${page.userId}`).emit('ansi-output', endMessage);
  }

  // Notify both parties
  io.to(`page:${pageId}`).emit('operator:chat-ended', { pageId });

  // Remove from active sessions
  activeChatSessions.delete(pageId);

  console.log(`[Operator Chat] Chat session ${pageId} ended`);
}

/**
 * Log chat transcript to SysLogs
 */
async function logChatTranscript(repository: OperatorChatRepository, session: ChatSession): Promise<void> {
  const page = repository.getPageRequest(session.pageId);
  if (!page) return;

  const messages = repository.getChatMessages(session.pageId);
  const duration = Math.floor((new Date().getTime() - session.startedAt.getTime()) / 1000);

  const transcript = [
    `=== Operator Chat Transcript ===`,
    `Page ID: ${session.pageId}`,
    `User: ${session.userHandle} (${session.userId})`,
    `Node: ${session.userNodeId}`,
    `Sysop: ${session.sysopHandle} (${session.sysopId})`,
    `Started: ${session.startedAt.toISOString()}`,
    `Duration: ${formatDuration(duration)}`,
    `Messages: ${messages.length}`,
    ``,
    `--- Transcript ---`
  ];

  messages.forEach(msg => {
    const timestamp = msg.timestamp.toLocaleTimeString();
    transcript.push(`[${timestamp}] ${msg.senderHandle}: ${msg.message}`);
  });

  transcript.push(`--- End of Transcript ---`);

  // Write to SysLogs file
  try {
    const sysLogsPath = path.join(bbsRoot, 'SysLogs');
    const logEntry = `\n${transcript.join('\n')}\n`;
    fs.appendFileSync(sysLogsPath, logEntry, 'utf8');
    console.log(`[Operator Chat] Transcript written to SysLogs for page ${session.pageId}`);
  } catch (error) {
    console.error(`[Operator Chat] Failed to write to SysLogs:`, error);
  }
}

/**
 * Check page timeouts and activate grumpy bot if needed
 */
async function checkPageTimeouts(io: any, repository: OperatorChatRepository): Promise<void> {
  const config = repository.getConfig();
  const pending = repository.getPendingPages();
  const now = Date.now();

  // Debug: Log pending pages status
  if (pending.length > 0) {
    console.log(`[Operator Chat] Checking ${pending.length} pending pages, timeout=${config.pageTimeout}s`);
  }

  for (const page of pending) {
    const elapsed = now - page.createdAt.getTime();
    const timeoutMs = config.pageTimeout * 1000;
    console.log(`[Operator Chat] Page ${page.id}: elapsed=${Math.floor(elapsed/1000)}s, timeout=${config.pageTimeout}s, willTimeout=${elapsed > timeoutMs}`);

    if (elapsed > timeoutMs) {
      // Activate grumpy bot instead of timing out
      console.log(`[Operator Chat] Page ${page.id} timed out - activating grumpy bot`);

      // Get user's session to update subState directly
      // Use the centralized userSessions map for reliable lookup
      let userSession = userSessions.get(page.userId) || null;

      // Fallback: try socket room lookup if direct lookup failed
      if (!userSession) {
        console.log(`[Operator Chat] Direct session lookup failed for userId ${page.userId}, trying socket rooms`);
        const userSocketsFromRoom = Array.from(io.sockets.adapter.rooms.get(`user:${page.userId}`) || []);
        for (const socketId of userSocketsFromRoom) {
          const sock = io.sockets.sockets.get(socketId);
          if (sock && (sock as any).session) {
            userSession = (sock as any).session;
            break;
          }
        }
      }

      // Accept page as "GrumpyBot"
      await acceptPage(io, repository, page.id, 'bot', 'GrumpyBot', 'grumpy-bot-session');

      // CRITICAL: Set user's session state to OPERATOR_CHAT_ACTIVE
      // This ensures their input is handled as chat messages, not commands
      if (userSession) {
        // CRITICAL: Stop paging dots via module-level Map (reliable cleanup)
        // Note: acceptPage already calls stopPagingDots, but we do it again for safety
        stopPagingDots(page.id);

        // Also clear session reference as backup
        if (userSession.tempData?.dotIntervalId) {
          clearInterval(userSession.tempData.dotIntervalId);
          delete userSession.tempData.dotIntervalId;
        }

        userSession.subState = LoggedOnSubState.OPERATOR_CHAT_ACTIVE;
        userSession.inputBuffer = '';
        console.log(`[Operator Chat] Set user session subState to OPERATOR_CHAT_ACTIVE for bot chat, userId=${page.userId}`);
      } else {
        console.warn(`[Operator Chat] Could not find user session for page ${page.id}, userId=${page.userId}. Available userSessions: ${Array.from(userSessions.keys()).join(', ')}`);
      }

      // Mark session as bot-controlled
      const chatSession = activeChatSessions.get(page.id);
      if (chatSession) {
        (chatSession as any).isBotControlled = true;
        (chatSession as any).botMessageHistory = [];
        console.log(`[Operator Chat] Set isBotControlled=true for page ${page.id}`);
      } else {
        console.log(`[Operator Chat] WARNING: No chat session found to mark as bot-controlled for page ${page.id}`);
      }

      // Send intro message with natural typing simulation
      const introMsg = getGrumpyBotIntroMessage();
      await simulateNaturalTyping(io, page.id, introMsg, () => {
        // After typing animation completes, save message to database
        sendChatMessage(io, repository, page.id, 'bot', 'GrumpyBot', 'sysop', introMsg, page.nodeId);
      });

      console.log(`[Operator Chat] Grumpy bot activated for page ${page.id}`);
    }
  }
}

/**
 * Check if in quiet hours
 */
function isQuietHours(config: OperatorChatConfig): boolean {
  if (!config.quietHours.enabled) return false;

  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTime = currentHour * 60 + currentMinute;

  const startTime = config.quietHours.startHour * 60 + config.quietHours.startMinute;
  const endTime = config.quietHours.endHour * 60 + config.quietHours.endMinute;

  // Handle wrap-around (e.g., 22:00 to 08:00)
  if (startTime > endTime) {
    return currentTime >= startTime || currentTime < endTime;
  } else {
    return currentTime >= startTime && currentTime < endTime;
  }
}

/**
 * Check user cooldown
 */
function checkUserCooldown(
  repository: OperatorChatRepository,
  userId: string,
  cooldownSeconds: number
): { allowed: boolean; remainingSeconds?: number } {
  const cutoff = Date.now() - (cooldownSeconds * 1000);
  const recentPages = repository.getUserRecentPages(userId, cutoff);

  if (recentPages.length === 0) {
    return { allowed: true };
  }

  const mostRecent = recentPages[0];
  if (mostRecent.cooldownUntil && mostRecent.cooldownUntil.getTime() > Date.now()) {
    const remaining = Math.ceil((mostRecent.cooldownUntil.getTime() - Date.now()) / 1000);
    return { allowed: false, remainingSeconds: remaining };
  }

  return { allowed: true };
}

/**
 * Check sysop availability
 */
async function checkSysopAvailability(io: any, repository: OperatorChatRepository): Promise<string[]> {
  // Get all connected sockets
  const sockets = await io.fetchSockets();
  const availableSysops: string[] = [];

  sockets.forEach((socket: any) => {
    const session = socket.session as BBSSession;
    if (session?.user && session.user.secLevel >= 100) {
      const status = repository.getSysopStatus(session.user.id);
      if (status.availability === SysopAvailability.AVAILABLE) {
        availableSysops.push(session.user.id);
      }
    }
  });

  return availableSysops;
}

/**
 * Word-wrap a message to fit within terminal width
 * First line can be shorter (to account for timestamp + handle prefix)
 * Continuation lines use full width minus indent
 */
function wordWrapMessage(message: string, firstLineMax: number, continuationMax: number): string[] {
  const lines: string[] = [];
  let remaining = message;
  let isFirstLine = true;

  while (remaining.length > 0) {
    const maxChars = isFirstLine ? firstLineMax : continuationMax;

    if (remaining.length <= maxChars) {
      // Remaining text fits on one line
      lines.push(remaining);
      break;
    }

    // Find break point (prefer space, but force break if no space found)
    let breakPoint = remaining.lastIndexOf(' ', maxChars);
    if (breakPoint <= 0) {
      // No space found, force break at maxChars
      breakPoint = maxChars;
    }

    lines.push(remaining.substring(0, breakPoint));
    remaining = remaining.substring(breakPoint).trimStart(); // Remove leading space from next line
    isFirstLine = false;
  }

  // Ensure at least one line (empty message case)
  if (lines.length === 0) {
    lines.push('');
  }

  return lines;
}

/**
 * Format duration in human-readable format
 */
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

/**
 * Get active chat sessions
 */
export function getActiveChatSessions(): Map<string, ChatSession> {
  return activeChatSessions;
}

/**
 * Export quick replies
 */
export { DEFAULT_QUICK_REPLIES };

/**
 * Handle user chat message from BBS terminal
 * Called from command.handler.ts when user is in OPERATOR_CHAT_ACTIVE state
 */
export async function handleUserChatMessage(
  io: any,
  repository: OperatorChatRepository,
  session: BBSSession,
  message: string
): Promise<void> {
  const pageId = session.tempData?.pageId;
  if (!pageId) {
    console.error('[Operator Chat] No pageId in session tempData');
    return;
  }

  const chatSession = activeChatSessions.get(pageId);
  if (!chatSession) {
    console.error(`[Operator Chat] Chat session not found: ${pageId}`);
    return;
  }

  await sendChatMessage(
    io,
    repository,
    pageId,
    session.user!.id,
    session.user!.username,
    'user',
    message,
    session.nodeId || 0
  );
}

/**
 * Handle real-time keystroke transmission to sysop panel
 * Called from command.handler.ts for char-by-char typing like livechat
 */
export async function handleOperatorChatKeystroke(
  io: any,
  session: BBSSession,
  keystroke: string
): Promise<void> {
  const pageId = session.tempData?.pageId;
  if (!pageId) return;

  const chatSession = activeChatSessions.get(pageId);
  if (!chatSession) return;

  // Initialize user typing buffer if needed
  if (!(chatSession as any).userTypingBuffer) {
    (chatSession as any).userTypingBuffer = '';
  }

  // Update typing buffer based on keystroke
  if (keystroke === '\x7f' || keystroke === '\b') {
    // Backspace - remove last character
    if ((chatSession as any).userTypingBuffer.length > 0) {
      (chatSession as any).userTypingBuffer = (chatSession as any).userTypingBuffer.slice(0, -1);
    }
  } else if (keystroke === '\r' || keystroke === '\n') {
    // Enter - clear buffer (message was sent separately)
    (chatSession as any).userTypingBuffer = '';
  } else if (keystroke.length === 1 && keystroke >= ' ' && keystroke <= '~') {
    // Printable character - add to buffer
    (chatSession as any).userTypingBuffer += keystroke;
  }

  // Send real-time typing update to sysop panel
  io.to(`page:${pageId}`).emit('operator:user-typing', {
    pageId,
    buffer: (chatSession as any).userTypingBuffer,
    keystroke,
    timestamp: Date.now()
  });

  // Update typing indicator
  chatSession.isTyping.user = (chatSession as any).userTypingBuffer.length > 0;
  io.to(`page:${pageId}`).emit('operator:typing-status', {
    pageId,
    senderType: 'user',
    isTyping: chatSession.isTyping.user
  });
}

/**
 * Handle user quitting chat from BBS terminal
 * Called from command.handler.ts when user types /quit or similar
 */
export async function handleUserQuitChat(
  io: any,
  repository: OperatorChatRepository,
  session: BBSSession,
  socket: any
): Promise<void> {
  const pageId = session.tempData?.pageId;
  if (!pageId) {
    console.error('[Operator Chat] No pageId in session tempData');
    return;
  }

  await endChat(io, repository, pageId);

  // Reset session state
  session.subState = LoggedOnSubState.DISPLAY_MENU;
  delete session.tempData?.pageId;

  socket.emit('ansi-output', '\r\n\x1b[33mChat ended. Returning to menu.\x1b[0m\r\n');
}

/**
 * Handle user cancelling page request (before sysop accepts)
 */
export async function handleUserCancelPage(
  io: any,
  repository: OperatorChatRepository,
  session: BBSSession,
  socket: any
): Promise<void> {
  const pageId = session.tempData?.pageId;
  if (!pageId) {
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  // CRITICAL: Stop paging dots via module-level Map (reliable cleanup)
  stopPagingDots(pageId);

  // Also clear session reference as backup
  if (session.tempData?.dotIntervalId) {
    clearInterval(session.tempData.dotIntervalId);
    delete session.tempData.dotIntervalId;
  }

  // Update page status to cancelled
  repository.updatePageStatus(pageId, PageStatus.TIMEOUT);

  // Reset session state
  session.subState = LoggedOnSubState.DISPLAY_MENU;
  delete session.tempData?.pageId;

  // Show "Aborted!" like express.e does when user presses CTRL-C
  socket.emit('ansi-output', 'Aborted!\r\n\r\n');
  console.log(`[Operator Chat] User cancelled page ${pageId}`);
}

/**
 * Setup BBS-side listeners for operator chat events
 * Called when user socket connects to listen for chat acceptance/end
 */
export function setupOperatorChatListeners(socket: any, session: BBSSession): void {
  console.log(`[Operator Chat] Setting up listeners for socket ${socket.id}, user=${session.user?.username || 'anonymous'}`);

  // Listen for chat accepted (sysop accepted the page)
  // Note: Split-screen setup is sent from acceptPage, so we just update state here
  socket.on('operator:chat-accepted', (data: { pageId: string; sysopHandle: string }) => {
    console.log(`[Operator Chat] User ${session.user?.username} received chat-accepted for page ${data.pageId}, current pageId=${session.tempData?.pageId}`);

    if (session.tempData?.pageId === data.pageId) {
      // CRITICAL: Stop paging dots via module-level Map (reliable cleanup)
      stopPagingDots(data.pageId);

      // Also clear session reference as backup
      if (session.tempData?.dotIntervalId) {
        clearInterval(session.tempData.dotIntervalId);
        delete session.tempData.dotIntervalId;
      }

      session.subState = LoggedOnSubState.OPERATOR_CHAT_ACTIVE;
      // Initialize user's input buffer for echo at line 24
      session.inputBuffer = '';
    }
  });

  // Listen for chat ended (sysop or timeout ended the chat)
  socket.on('operator:chat-ended', (data: { pageId: string }) => {
    console.log(`[Operator Chat] User ${session.user?.username} received chat-ended for page ${data.pageId}`);

    if (session.tempData?.pageId === data.pageId) {
      // CRITICAL: Stop paging dots via module-level Map (reliable cleanup)
      stopPagingDots(data.pageId);

      // Also clear session reference as backup
      if (session.tempData?.dotIntervalId) {
        clearInterval(session.tempData.dotIntervalId);
        delete session.tempData.dotIntervalId;
      }

      session.subState = LoggedOnSubState.DISPLAY_MENU;
      delete session.tempData?.pageId;
      session.inputBuffer = '';
      // Note: Chat end message with scroll region reset is sent from endChat
    }
  });
}
