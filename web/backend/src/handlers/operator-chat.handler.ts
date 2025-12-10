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
import { getGrumpySysopResponse, getGrumpyBotIntroMessage } from './grumpy-sysop-bot.handler';

// Active chat sessions (in-memory)
const activeChatSessions = new Map<string, ChatSession>();

/**
 * Initialize operator chat handler
 */
export function initOperatorChatHandler(io: any, repository: OperatorChatRepository) {
  console.log('[Operator Chat] Handler initialized');

  // Listen for sysop status updates
  io.on('connection', (socket: Socket) => {
    socket.on('operator:set-status', async (data: { availability: SysopAvailability; statusMessage?: string }) => {
      const session = (socket as any).session as BBSSession;
      if (!session?.user || session.user.secLevel < 100) {
        socket.emit('operator:error', { message: 'Unauthorized' });
        return;
      }

      repository.updateSysopStatus(session.user.id, data.availability, data.statusMessage);
      socket.emit('operator:status-updated', { availability: data.availability });

      console.log(`[Operator Chat] Sysop ${session.user.username} set status to ${data.availability}`);
    });

    socket.on('operator:get-pending-pages', async () => {
      const session = (socket as any).session as BBSSession;
      if (!session?.user || session.user.secLevel < 100) {
        socket.emit('operator:error', { message: 'Unauthorized' });
        return;
      }

      const pending = repository.getPendingPages();
      socket.emit('operator:pending-pages', pending);
    });

    socket.on('operator:accept-page', async (data: { pageId: string }) => {
      const session = (socket as any).session as BBSSession;
      if (!session?.user || session.user.secLevel < 100) {
        socket.emit('operator:error', { message: 'Unauthorized' });
        return;
      }

      await acceptPage(io, repository, data.pageId, session.user.id, session.user.username, socket.id);
    });

    socket.on('operator:send-message', async (data: { pageId: string; message: string }) => {
      const session = (socket as any).session as BBSSession;
      if (!session?.user || session.user.secLevel < 100) {
        socket.emit('operator:error', { message: 'Unauthorized' });
        return;
      }

      await sendChatMessage(io, repository, data.pageId, session.user.id, session.user.username, 'sysop', data.message, session.nodeId || 0);
    });

    socket.on('operator:end-chat', async (data: { pageId: string }) => {
      const session = (socket as any).session as BBSSession;
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

  // Check if feature is enabled
  if (!config.enabled) {
    return {
      success: false,
      message: '\x1b[31mOperator chat is currently disabled.\x1b[0m'
    };
  }

  // Check security level
  if (config.allowedSecLevels.length > 0 && !config.allowedSecLevels.includes(session.user?.secLevel || 0)) {
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

  // Check sysop availability (are any sysops online?)
  const availableSysops = await checkSysopAvailability(io, repository);
  if (availableSysops.length === 0) {
    return {
      success: false,
      message: '\x1b[33mNo sysops are currently available.\x1b[0m\r\nPlease try again later.'
    };
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

  // Set cooldown
  repository.setUserCooldown(session.user!.id, config.pageCooldown);

  // Send notifications
  await sendPageNotifications(io, repository, pageRequest, config);

  // Set user state to waiting for chat
  session.subState = LoggedOnSubState.OPERATOR_CHAT_WAITING;
  session.tempData = { ...session.tempData, pageId: pageRequest.id };

  // Display waiting message (match express.e exactly)
  const currentTime = new Date().toLocaleString();
  const sysopName = config.discordWebhook ? 'Sysop' : 'the operator'; // TODO: Get from config

  socket.emit('ansi-output', `\r\n${currentTime}\r\n`);
  socket.emit('ansi-output', `\r\nPaging ${sysopName} (CTRL-C to Abort). .`);

  // Note: express.e shows 20 dots with beeps over 20 seconds
  // We simplified to immediate notification with timeout
  socket.emit('ansi-output', '\r\n\r\nThe Sysop has been paged\r\n');
  socket.emit('ansi-output', 'You may continue using the system\r\n');
  socket.emit('ansi-output', `until ${sysopName} answers your request.\r\n\r\n`);

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
    io.emit('operator:page', {
      pageId: page.id,
      userId: page.userId,
      userHandle: page.userHandle,
      nodeId: page.nodeId,
      conferenceId: page.conferenceId,
      conferenceName: page.conferenceName,
      timeOnline: page.timeOnline,
      lastCommand: page.lastCommand,
      createdAt: page.createdAt
    });
    notificationUpdates.socketIO = true;
    console.log(`[Operator Chat] Socket.IO notification sent for page ${page.id}`);
  } catch (error) {
    console.error('[Operator Chat] Socket.IO notification failed:', error);
  }

  // 2. Discord webhook notification
  if (config.discordWebhook) {
    try {
      const timeOnlineStr = formatDuration(page.timeOnline);
      const authUrl = `${process.env.BASE_URL || 'http://localhost:3001'}/admin/operator-chat?token=${page.token}`;

      const response = await axios.post(config.discordWebhook, {
        content: `[OP PAGE] **${page.userHandle}** @Node${page.nodeId} in ${page.conferenceName}`,
        embeds: [{
          title: 'Operator Page Request',
          color: 0x00AAFF,
          fields: [
            { name: 'User', value: page.userHandle, inline: true },
            { name: 'Node', value: `Node ${page.nodeId}`, inline: true },
            { name: 'Conference', value: page.conferenceName, inline: true },
            { name: 'Time Online', value: timeOnlineStr, inline: true },
            { name: 'Last Command', value: page.lastCommand, inline: true },
            { name: 'Timestamp', value: `<t:${Math.floor(page.createdAt.getTime() / 1000)}:R>`, inline: true }
          ],
          footer: { text: 'Click the link below to respond' }
        }],
        components: [{
          type: 1,
          components: [{
            type: 2,
            style: 5, // Link button
            label: 'Open Operator Chat',
            url: authUrl
          }]
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

  // 3. Browser push notifications (placeholder - will implement with Service Worker)
  // TODO: Implement push notification fan-out to subscribed sysops
  notificationUpdates.browserPush = false;
  notificationUpdates.pushResults = [];

  // Update notification status in database
  repository.updateNotificationStatus(page.id, notificationUpdates);
}

/**
 * Accept a page and start chat session
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

  // Update page status
  repository.updatePageStatus(pageId, PageStatus.ACCEPTED, sysopId, sysopHandle);

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
    messages: [],
    isTyping: { user: false, sysop: false }
  };

  activeChatSessions.set(pageId, chatSession);

  // Notify user that sysop accepted
  io.to(`user:${page.userId}`).emit('operator:chat-accepted', {
    pageId,
    sysopHandle
  });

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

  // Send system message to both parties
  const systemMessage = `\x1b[32m*** Chat started with ${sysopHandle} ***\x1b[0m`;
  await sendChatMessage(io, repository, pageId, 'system', 'System', 'sysop', systemMessage, 0);
}

/**
 * Send chat message
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

  // If bot-controlled and message is from user, generate bot response
  if ((chatSession as any).isBotControlled && senderType === 'user') {
    console.log(`[Operator Chat] User message in bot session, generating response`);

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

        // Send bot response after short delay (more realistic)
        setTimeout(() => {
          sendChatMessage(io, repository, pageId, 'bot', 'GrumpyBot', 'sysop', botResponse, nodeId);
        }, 1000 + Math.random() * 2000); // 1-3 second delay
      }).catch(err => {
        console.error('[Operator Chat] Bot response error:', err);
      });
    }
  }

  // Broadcast to both parties
  io.to(`page:${pageId}`).emit('operator:message', saved);

  // Also send ANSI output to user's terminal
  const page = repository.getPageRequest(pageId);
  if (page) {
    const ansiMessage = senderType === 'sysop'
      ? `\x1b[36m[${senderHandle}]\x1b[0m ${message}\r\n`
      : `\x1b[33m[${senderHandle}]\x1b[0m ${message}\r\n`;

    io.to(`user:${page.userId}`).emit('ansi-output', ansiMessage);
  }

  console.log(`[Operator Chat] Message in page ${pageId} from ${senderHandle}: ${message.substring(0, 50)}...`);
}

/**
 * End chat session
 */
async function endChat(io: any, repository: OperatorChatRepository, pageId: string): Promise<void> {
  const chatSession = activeChatSessions.get(pageId);
  if (!chatSession) {
    console.error(`[Operator Chat] Chat session not found: ${pageId}`);
    return;
  }

  // Update page status
  repository.updatePageStatus(pageId, PageStatus.ENDED);

  // Send system message
  const systemMessage = `\x1b[32m*** Chat ended ***\x1b[0m`;
  await sendChatMessage(io, repository, pageId, 'system', 'System', 'sysop', systemMessage, 0);

  // Notify both parties
  io.to(`page:${pageId}`).emit('operator:chat-ended', { pageId });

  // Log transcript to SysLogs
  await logChatTranscript(repository, chatSession);

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

  // TODO: Write to SysLogs file
  console.log(`[Operator Chat] Transcript logged for page ${session.pageId}`);
}

/**
 * Check page timeouts and activate grumpy bot if needed
 */
async function checkPageTimeouts(io: any, repository: OperatorChatRepository): Promise<void> {
  const config = repository.getConfig();
  const pending = repository.getPendingPages();
  const now = Date.now();

  for (const page of pending) {
    const elapsed = now - page.createdAt.getTime();
    if (elapsed > config.pageTimeout * 1000) {
      // Activate grumpy bot instead of timing out
      console.log(`[Operator Chat] Page ${page.id} timed out - activating grumpy bot`);

      // Accept page as "GrumpyBot"
      await acceptPage(io, repository, page.id, 'bot', 'GrumpyBot', 'grumpy-bot-session');

      // Send intro message
      const introMsg = getGrumpyBotIntroMessage();
      await sendChatMessage(io, repository, page.id, 'bot', 'GrumpyBot', 'sysop', introMsg, page.nodeId);

      // Mark session as bot-controlled
      const chatSession = activeChatSessions.get(page.id);
      if (chatSession) {
        (chatSession as any).isBotControlled = true;
        (chatSession as any).botMessageHistory = [];
      }

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
