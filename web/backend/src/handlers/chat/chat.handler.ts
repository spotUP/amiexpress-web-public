/**
 * Chat Handler - Sysop chat system
 *
 * Handles sysop paging, chat sessions, and chat message handling.
 * Based on express.e chat system (ccom() function and chat mode).
 *
 * Clean Architecture:
 * - Uses ChatSessionUseCase for business logic
 * - Dependency injection via tsyringe
 * - Handler focuses on presentation/routing only
 */

import { injectable } from 'tsyringe';
import type { BBSSession } from '../../index';
import { ChatSessionUseCase, ChatSession, ChatMessage } from '../../services/use-cases/chat-session.use-case';
import { LoggedOnSubState } from '../../constants/bbs-states';

import { ChatState } from '../../services/use-cases/chat-session.use-case';

// Dependencies that need to be injected externally (circular dependency workaround)
let executePagerDoor: (socket: any, session: BBSSession, chatSession: ChatSession) => boolean;
let displayMainMenu: (socket: any, session: BBSSession) => void;

// External injection functions (for circular dependency resolution)
export function setHelpers(helpers: {
  executePagerDoor: (socket: any, session: BBSSession, chatSession: ChatSession) => boolean;
  displayMainMenu: (socket: any, session: BBSSession) => void;
}) {
  executePagerDoor = helpers.executePagerDoor;
  displayMainMenu = helpers.displayMainMenu;
}

// Backward compatibility exports (deprecated)
export function setChatState(state: ChatState) {
  // No-op: State now managed by ChatSessionUseCase
  console.log('[DEPRECATED] setChatState called - state now managed by ChatSessionUseCase');
}

export function setConstants(constants: { LoggedOnSubState: any }) {
  // No-op: Constants imported directly
  console.log('[DEPRECATED] setConstants called - constants now imported directly');
}

@injectable()
export class ChatHandler {
  constructor(private chatSessionUseCase: ChatSessionUseCase) {
    console.log('[ChatHandler] Initialized with DI');
  }

  /**
   * Start sysop page - Initiates sysop paging (like ccom() in AmiExpress)
   */
  startSysopPage(socket: any, session: BBSSession): void {
    if (!session.user) return;

    console.log('Starting sysop page for user:', session.user.username);

    // Create chat session via use case
    const chatSession = this.chatSessionUseCase.createChatSession(
      session.user.id,
      session.user.username
    );

    // Log the page
    console.log(`Operator paged at ${new Date().toISOString()} by ${session.user.username}`);

    // Trigger webhook for sysop page
    this.sendPagerWebhook(session);

    // Display paging message
    socket.emit('ansi-output', '\r\n\x1b[32mF1 Toggles chat\r\n');

    // Try to execute pager door first
    if (!executePagerDoor || !executePagerDoor(socket, session, chatSession)) {
      // Fall back to internal pager
      this.displayInternalPager(socket, session, chatSession);
    }
  }

  /**
   * Display internal pager - Internal pager display (like the dots in ccom())
   */
  displayInternalPager(socket: any, session: BBSSession, chatSession: ChatSession): void {
    const displayTime = new Date().toLocaleTimeString();
    const sysopName = 'Sysop';

    socket.emit('ansi-output', `\r\n${displayTime}\r\n\r\nPaging ${sysopName} (CTRL-C to Abort). .`);

    // Start the paging dots animation - 30 dots over 30 seconds
    let dotCount = 0;
    const maxDots = 30;

    const dotInterval = setInterval(() => {
      socket.emit('ansi-output', ' .');

      dotCount++;
      if (dotCount >= maxDots) {
        clearInterval(dotInterval);
        this.completePaging(socket, session, chatSession);
      }
    }, 1000);

    // Store interval for cleanup
    session.pagingInterval = dotInterval;
  }

  /**
   * Complete paging - Complete the paging process
   */
  completePaging(socket: any, session: BBSSession, chatSession: ChatSession): void {
    // Clear any paging interval
    if (session.pagingInterval) {
      clearInterval(session.pagingInterval);
      delete session.pagingInterval;
    }

    socket.emit('ansi-output', '\r\n\r\nThe Sysop has been paged\r\n');
    socket.emit('ansi-output', 'You may continue using the system\r\n');
    socket.emit('ansi-output', 'until the sysop answers your request.\r\n\r\n');

    // Return to menu
    session.menuPause = true;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
  }

  /**
   * Accept chat - Sysop accepts chat (like F1 press handling)
   */
  acceptChat(socket: any, session: BBSSession, chatSession: ChatSession): void {
    if (!session.user) return;

    console.log('Sysop accepting chat for session:', chatSession.id);

    // Accept via use case
    const accepted = this.chatSessionUseCase.acceptChatSession(
      chatSession.id,
      session.user.id
    );

    if (!accepted) {
      socket.emit('ansi-output', '\r\n\x1b[31mError: Could not accept chat session\r\n');
      return;
    }

    // Display chat start messages
    socket.emit('ansi-output', '\r\n\x1b[32mChat session started!\r\n');
    socket.emit('ansi-output', 'Type your messages. Press F1 to exit chat.\r\n\r\n');

    // Enter chat mode
    this.enterChatMode(socket, session, accepted);
  }

  /**
   * Enter chat mode - Enter active chat mode (like chatFlag=TRUE in AmiExpress)
   */
  enterChatMode(socket: any, session: BBSSession, chatSession: ChatSession): void {
    session.inChat = true;
    session.chatSession = chatSession;

    socket.emit('ansi-output', '\x1b[36m[Chat Mode Active]\x1b[0m\r\n');
    socket.emit('ansi-output', 'You are now in chat with the user.\r\n');
    socket.emit('ansi-output', 'Press F1 to exit chat.\r\n\r\n');
  }

  /**
   * Exit chat - Exit chat mode (like F1 exit in AmiExpress)
   */
  exitChat(socket: any, session: BBSSession): void {
    const chatSession = session.chatSession as ChatSession;
    if (chatSession) {
      this.chatSessionUseCase.endChatSession(chatSession.id);
    }

    // Clear chat state
    delete session.inChat;
    delete session.chatSession;

    // Display exit message
    socket.emit('ansi-output', '\r\n\x1b[32mChat session ended.\r\n');

    // Return to normal operation
    session.menuPause = true;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
  }

  /**
   * Send chat message - Send message in chat (like chat input handling)
   */
  sendChatMessage(socket: any, session: BBSSession, message: string): void {
    if (!session.user) return;

    const chatSession = session.chatSession as ChatSession;
    if (!chatSession || chatSession.status !== 'active') {
      return;
    }

    const isSysop = session.user.secLevel === 255;

    // Add message via use case
    const chatMessage = this.chatSessionUseCase.addChatMessage(
      chatSession.id,
      session.user.id,
      session.user.username,
      message,
      isSysop
    );

    if (chatMessage) {
      // Format and display message
      const formatted = this.chatSessionUseCase.formatChatMessage(chatMessage);
      socket.emit('ansi-output', formatted);
    }
  }

  /**
   * Toggle sysop available - Toggle sysop availability (like F7 in AmiExpress)
   */
  toggleSysopAvailable(): boolean {
    return this.chatSessionUseCase.toggleSysopAvailable();
  }

  /**
   * Get chat status - Get current chat status for display
   */
  getChatStatus(): { available: boolean; pagingCount: number; activeCount: number } {
    return this.chatSessionUseCase.getChatStatus();
  }

  /**
   * Send pager webhook (async)
   */
  private async sendPagerWebhook(session: BBSSession): Promise<void> {
    try {
      const { webhookService, WebhookTrigger } = await import('../../services/webhook.service');

      await webhookService.sendWebhook(WebhookTrigger.SYSOP_PAGED, {
        username: session.user?.username || 'Unknown',
        userId: session.user?.id,
        message: 'Sysop page request via O command'
      });
    } catch (error) {
      console.error('[Webhook] Error sending sysop page webhook:', error);
    }
  }
}

// Export standalone functions for backward compatibility
// These will be removed once all call sites are updated to use DI

/**
 * Helper to safely resolve ChatHandler from DI container
 */
function resolveChatHandler(): ChatHandler {
  try {
    const { container } = require('../../container');
    return container.resolve(ChatHandler);
  } catch (error) {
    console.error('[ChatHandler] DI Resolution Error:', error);
    // Fallback: create instance manually if DI fails
    const { ChatSessionUseCase } = require('../../services/use-cases/chat-session.use-case');
    const useCase = new ChatSessionUseCase();
    return new ChatHandler(useCase);
  }
}

export function startSysopPage(socket: any, session: BBSSession): void {
  const handler = resolveChatHandler();
  handler.startSysopPage(socket, session);
}

export function displayInternalPager(socket: any, session: BBSSession, chatSession: ChatSession): void {
  const handler = resolveChatHandler();
  handler.displayInternalPager(socket, session, chatSession);
}

export function completePaging(socket: any, session: BBSSession, chatSession: ChatSession): void {
  const handler = resolveChatHandler();
  handler.completePaging(socket, session, chatSession);
}

export function acceptChat(socket: any, session: BBSSession, chatSession: ChatSession): void {
  const handler = resolveChatHandler();
  handler.acceptChat(socket, session, chatSession);
}

export function enterChatMode(socket: any, session: BBSSession, chatSession: ChatSession): void {
  const handler = resolveChatHandler();
  handler.enterChatMode(socket, session, chatSession);
}

export function exitChat(socket: any, session: BBSSession): void {
  const handler = resolveChatHandler();
  handler.exitChat(socket, session);
}

export function sendChatMessage(socket: any, session: BBSSession, message: string): void {
  const handler = resolveChatHandler();
  handler.sendChatMessage(socket, session, message);
}

export function toggleSysopAvailable(): void {
  const handler = resolveChatHandler();
  handler.toggleSysopAvailable();
}

export function getChatStatus(): { available: boolean; pagingCount: number; activeCount: number } {
  const handler = resolveChatHandler();
  return handler.getChatStatus();
}
