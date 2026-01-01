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
import {
  renderPicker,
  handlePickerInput,
  shouldOpenPicker,
  createPickerState,
  renderPickerClosed,
  handlePickerMouse,
  SmileyPickerState,
  getSelectedSmiley
} from '../utils/smiley-picker.util';
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
            // Real-time sysop keystroke transmission to BBS user
            // Restored: Live typing preview at line 23 (bottom of chat window)
            // This mimics the 'live' feel while keeping the user's input line (24) clean.
            const page = repository.getPageRequest(data.pageId);
            if (page) {
              const sysopHandle = chatSession.sysopHandle || 'Sysop';
              const buffer = (chatSession as any).sysopTypingBuffer || '';
      
              // Display typing preview at line 23 (bottom of scroll region)
              // Uses save/restore cursor to preserve BBS user's typing position at line 24
              const typingPreview =
                '\x1b7' + // Save BBS user's cursor position (they're typing at line 24)
                '\x1b[23;1H' + // Move to line 23
                '\x1b[2K' + // Clear line
                (buffer.length > 0
                  ? `\x1b[36m${sysopHandle}:\x1b[0m ${buffer}`
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

  // Store page ID in tempData immediately
  session.tempData = { ...session.tempData, pageId: pageRequest.id };
  
  // Set state to waiting
  session.subState = LoggedOnSubState.OPERATOR_CHAT_WAITING;

  // Display waiting message with animated dots
  const currentTime = new Date().toLocaleString();
  const bbsConfig = loadBBSConfig(bbsRoot);
  const sysopName = bbsConfig.sysop_name || 'the operator';

  socket.emit('ansi-output', `\r\n${currentTime}\r\n`);
  socket.emit('ansi-output', `\r\nPaging ${sysopName} (CTRL-C to Abort). .`);

  // Start animated dot sequence - 30 dots over 30 seconds
  let dotCount = 0;
  const maxDots = 30;
  
  // Register interval in map immediately (before async notifications)
  // This ensures acceptPage can find and stop it even if notifications take time
  const dotInterval = setInterval(() => {
    // Check if interval was stopped externally
    if (!activePagingIntervals.has(pageRequest.id)) {
      clearInterval(dotInterval);
      return;
    }

    // Check if session state changed
    if (session.tempData?.pageId !== pageRequest.id ||
        session.subState !== LoggedOnSubState.OPERATOR_CHAT_WAITING) {
      stopPagingDots(pageRequest.id);
      return;
    }

    // Check if page was accepted (e.g. by bot) but race condition missed stopPagingDots
    const currentPage = repository.getPageRequest(pageRequest.id);
    if (currentPage?.status === PageStatus.ACCEPTED) {
      stopPagingDots(pageRequest.id);
      return;
    }

    dotCount++;
    socket.emit('ansi-output', ' .');

    // After 30 dots, show final message and return to normal BBS operation
    if (dotCount >= maxDots) {
      stopPagingDots(pageRequest.id);

      const page = repository.getPageRequest(pageRequest.id);
      const currentSubState = session.subState as LoggedOnSubState;
      const chatAccepted = page?.status === PageStatus.ACCEPTED ||
                           currentSubState === LoggedOnSubState.OPERATOR_CHAT_ACTIVE;

      if (!chatAccepted) {
        socket.emit('ansi-output', '\r\n\r\nThe Sysop has been paged\r\n');
        socket.emit('ansi-output', 'You may continue using the system\r\n');
        socket.emit('ansi-output', `until ${sysopName} answers your request.\r\n\r\n`);

        if (session.subState === LoggedOnSubState.OPERATOR_CHAT_WAITING) {
          session.subState = LoggedOnSubState.DISPLAY_MENU;
        }
      }
    }
  }, 1000);

  activePagingIntervals.set(pageRequest.id, dotInterval);
  session.tempData = { ...session.tempData, dotIntervalId: dotInterval };

  console.log(`[Operator Chat] Page created: ${pageRequest.id} from ${session.user!.username}@Node${session.nodeId}`);

  // Send notifications asynchronously (don't block paging UI)
  sendPageNotifications(io, repository, pageRequest, config).catch(err => {
    console.error('[Operator Chat] Failed to send notifications:', err);
  });

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
 * Sets up linear chat with scroll region 1-23 (leaving line 24 for smiley button)
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

  // Load existing chat messages
  const existingMessages = repository.getChatMessages(pageId);
  console.log(`[Operator Chat] Loaded ${existingMessages.length} existing messages for page ${pageId}`);

  // Create chat session
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
    messages: existingMessages,
    isTyping: { user: false, sysop: false }
  };

  activeChatSessions.set(pageId, chatSession);

  // Send history to sysop
  if (existingMessages.length > 0) {
    const messagesWithTimestamps = existingMessages.map(msg => ({
      ...msg,
      timestamp: msg.timestamp.getTime()
    }));
    io.to(sysopSessionId).emit('operator:message-history', {
      pageId,
      messages: messagesWithTimestamps
    });
  }

  // Notify user - Linear Chat Setup matching AmiExpress
  // Scroll region 1-23 to keep line 24 for input
  const userSetupScreen =
    '\x1b%G' + // Select UTF-8
    '\x1b[2J\x1b[H' + // Clear Screen and Home Cursor (Clean Slate)
    '\x1b[?1000h\x1b[?1006h' + // Enable mouse reporting
    '\x1b[1;23r' + // Set scroll region 1-23
    '\r\n\r\nThis is ' + sysopHandle + ', How can I help you??\r\n\r\n' +
    '\x1b[24;1H'; // Move cursor to input line (24)

  const targetRoom = `user:${page.userId}`;
  io.to(targetRoom).emit('ansi-output', userSetupScreen);

  io.to(targetRoom).emit('operator:chat-accepted', {
    pageId,
    sysopHandle
  });

  // Update session state
  const userSession = userSessions.get(page.userId);
  if (userSession) {
    if (userSession.tempData?.pageId === pageId) {
      if (userSession.tempData?.dotIntervalId) {
        clearInterval(userSession.tempData.dotIntervalId);
        delete userSession.tempData.dotIntervalId;
      }
      userSession.subState = LoggedOnSubState.OPERATOR_CHAT_ACTIVE;
      userSession.inputBuffer = '';
    }
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

  io.emit('operator:page-accepted', { pageId, sysopHandle });
  console.log(`[Operator Chat] Page ${pageId} accepted by ${sysopHandle}`);
}

/**
 * Send chat message
 * Linear style: Just raw text with color codes, no timestamps
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
  if (!chatSession) return;

  // Create message
  const chatMessage: ChatMessage = {
    id: '',
    pageId,
    senderId,
    senderHandle,
    senderType,
    message,
    timestamp: new Date(),
    nodeId
  };

  const saved = repository.addChatMessage(chatMessage);
  chatSession.messages.push(saved);
  chatSession.lastActivity = new Date();

  // Clear typing buffers
  if (senderType === 'user') (chatSession as any).userTypingBuffer = '';
  if (senderType === 'sysop') (chatSession as any).sysopTypingBuffer = '';

  // If bot-controlled and message is from user, generate bot response
  console.log(`[Operator Chat] Checking bot response: isBotControlled=${(chatSession as any).isBotControlled}, senderType=${senderType}`);
  if ((chatSession as any).isBotControlled && senderType === 'user') {
    const page = repository.getPageRequest(pageId);
    if (page) {
      const context = {
        userHandle: page.userHandle,
        nodeId: page.nodeId,
        conferenceName: page.conferenceName,
        timeOnline: Math.floor((Date.now() - page.createdAt.getTime()) / 1000),
        messageHistory: (chatSession as any).botMessageHistory || []
      };

      // Add user message to history if it has content
      if (message.trim() !== '') {
        context.messageHistory.push({ role: 'user', content: message });
        (chatSession as any).botMessageHistory = context.messageHistory;
        console.log(`[Operator Chat] Added user message to history: "${message}"`);
      }

      // Trigger bot reply ONLY if user sent an empty message (Double Enter signal)
      if (message.trim() === '') {
        console.log(`[Operator Chat] User sent double-enter (empty message), triggering bot response...`);
        
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
          }, 500 + Math.random() * 500); // 0.5-1.0s delay
        }).catch(err => {
          console.error('[Operator Chat] Bot response error:', err);
        });
      }
    }
  }

  // Broadcast to both parties (convert timestamp to number for frontend)
  io.to(`page:${pageId}`).emit('operator:message', {
    ...saved,
    timestamp: saved.timestamp.getTime()
  });

  // Emit to User (Linear ANSI text)
  const page = repository.getPageRequest(pageId);
  if (page) {
    // AmiExpress Style: Color + Text + Newline
    const color = senderType === 'sysop' ? '36' : '33';
    
    // Word-wrap the message to fit within 79 columns (to avoid natural wrap at 80)
    const wrappedLines = wordWrapMessage(message, 79, 79);
    
    // Determine line ending:
    // GrumpyBot: Double Enter (\r\n\r\n) to signal turn end automatically
    // Humans: Single Enter (\r\n) - they will type double enter themselves
    const lineEnding = senderHandle === 'GrumpyBot' ? '\r\n\r\n' : '\r\n';
    
    let output = '';
    
    if (senderType === 'user') {
      // User sent: Clear input line, print message(s), reset cursor
      output = '\x1b[24;1H\x1b[2K'; // Clear input line
      
      for (const line of wrappedLines) {
        output += `\x1b[23;1H\x1b[${color}m${line}\x1b[0m${lineEnding}`;
      }
      
      output += '\x1b[24;1H'; // Move cursor to start of input
    } else {
      // Sysop sent: Preserve user input (save cursor), print message(s), restore cursor
      output = '\x1b7'; // Save cursor position
      
      for (const line of wrappedLines) {
        output += `\x1b[23;1H\x1b[${color}m${line}\x1b[0m${lineEnding}`;
      }
      
      output += '\x1b8'; // Restore cursor position
    }

    io.to(`user:${page.userId}`).emit('ansi-output', output);
  }
}

/**
 * End chat session
 * Resets scroll region and shows simple summary
 */
async function endChat(io: any, repository: OperatorChatRepository, pageId: string): Promise<void> {
  const chatSession = activeChatSessions.get(pageId);
  if (!chatSession) return;

  repository.updatePageStatus(pageId, PageStatus.ENDED);
  await logChatTranscript(repository, chatSession);

  // Simple End Message
  const endMessage =
    '\x1b[?25l' + // Hide cursor
    '\x1b[r' + // Reset scroll region
    '\x1b[?1000l\x1b[?1006l' + // Disable mouse
    '\r\n\r\nEnding Chat.\r\n' + // Exact text from express.e
    '\r\n' +
    '\x1b[32mPress any key to continue...\x1b[0m' +
    '\x1b[?25h';

  const page = repository.getPageRequest(pageId);
  if (page) {
    io.to(`user:${page.userId}`).emit('ansi-output', endMessage);
  }

  io.to(`page:${pageId}`).emit('operator:chat-ended', { pageId });
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
