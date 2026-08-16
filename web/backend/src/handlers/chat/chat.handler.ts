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
import type { Socket } from 'socket.io';
import type { BBSSession } from '../../index';
import { ChatSessionUseCase, ChatSession, ChatMessage } from '../../services/use-cases/chat-session.use-case';
import { LoggedOnSubState } from '../../constants/bbs-states';

import { ChatState } from '../../services/use-cases/chat-session.use-case';
import { getSystemTime } from '../../utils/date-time.util';

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
   * Socket.io room shared by both parties of a chat session — used so
   * sendChatMessage() can broadcast to BOTH the sysop and the paged user
   * instead of only echoing to whichever socket called it.
   */
  private chatRoom(chatSessionId: string): string {
    return `chat:${chatSessionId}`;
  }

  /**
   * Resolve the LIVE socket + session for a user id other than the caller's
   * own (review fix, task 18): express.e's chat()/ccom() (express.e:5916-
   * 6126) share ONE process reading both the local console (sysop) and the
   * remote serial line (caller) — conPuts()/serPuts() write to both streams
   * from that single loop, so "entering chat" is inherently two-sided. This
   * web port runs the sysop and the paged user on two independent sockets,
   * so any action that expresses.e would apply to "the other side" (sysop
   * accepting, either side sending a line, either side exiting) has to be
   * applied to BOTH BBSSession/socket pairs explicitly. Returns null when
   * the counterpart isn't currently connected (e.g. they disconnected mid-
   * page) — callers must degrade gracefully, not throw.
   */
  private resolveCounterpartSocket(
    socket: any,
    userId?: string
  ): { socket: any; session: BBSSession } | null {
    if (!userId) return null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { userSessions, getSocketIdByUserId } = require('../../server/session-manager');
      const targetSession = userSessions.get(userId);
      const targetSocketId = getSocketIdByUserId(userId);
      const io = socket?.nsp?.server;
      const targetSocket = targetSocketId && io ? io.sockets?.sockets?.get(targetSocketId) : null;
      if (targetSession && targetSocket) {
        return { socket: targetSocket, session: targetSession };
      }
    } catch (err) {
console.warn('[ChatHandler] resolveCounterpartSocket failed:', (err as Error)?.message ?? err);
    }
    return null;
  }

  /**
   * Notify-only sysop page: chat session + callers-log semantics + webhook,
   * with NO terminal output and NO pager-door launch. Used by replacement
   * pager doors (FAME 5D_Page executes internal command "C" mid-door via
   * CF_InternalCmd) — the door renders its own paging UI, so launching
   * PowerPager or drawing the internal pager here would fight it.
   */
  notifySysopPage(session: BBSSession): boolean {
    if (!session?.user) {
console.log('[ChatHandler] notifySysopPage: no user on session — cannot page');
      return false;
    }
console.log('Sysop page (notify-only) for user:', session.user.username);
    // Failure-proof: the paging DOOR must never die because our chat
    // bookkeeping or webhook threw — the page attempt is what counts.
    try {
      const chatSession = this.chatSessionUseCase.createChatSession(session.user.id, session.user.username);
      // Task 18: record the page as "pending" on the session so
      // door.handler.ts can run the classic page-wait UX (dots animation /
      // sysop-answer / timeout) AFTER the door exits, without interrupting
      // it mid-run. Reuses this SAME chat session (via the id) instead of
      // creating a second one when the wait actually starts.
      session.sysopPagePending = true;
      session.sysopPageChatSessionId = chatSession.id;
    } catch (err) {
console.error('[ChatHandler] notifySysopPage: createChatSession failed:', (err as Error)?.message ?? err);
    }
    try {
      this.sendPagerWebhook(session);
    } catch (err) {
console.error('[ChatHandler] notifySysopPage: webhook failed:', (err as Error)?.message ?? err);
    }
    return true;
  }

  /**
   * Consume (clear) session.sysopPagePending / sysopPageChatSessionId and
   * return the associated ChatSession, WITHOUT starting the wait UI.
   *
   * Split out from runPendingSysopPageWait (review round 2, task 18):
   * door.handler.ts must clear this flag immediately after the door exits
   * and its output is flushed — BEFORE running the CHAIN/RETURNCOMMAND /
   * exitState-merge block that can throw. Consuming first means the flag
   * is already false by the time any of that risky code runs, so a crash
   * in it can no longer leave a stale sysopPagePending that would wrongly
   * fire the page-wait on the NEXT, unrelated door's exit.
   *
   * Return value distinguishes three cases: `undefined` — nothing was
   * pending (caller does nothing); `null` — a page WAS pending but its
   * chat session is already gone (caller should still treat it as
   * handled); a `ChatSession` — the page-wait should actually run.
   */
  consumePendingSysopPage(session: BBSSession): ChatSession | null | undefined {
    if (!session.sysopPagePending) return undefined;
    session.sysopPagePending = false;
    const chatSessionId = session.sysopPageChatSessionId;
    delete session.sysopPageChatSessionId;

    const chatSession = chatSessionId ? this.chatSessionUseCase.getChatSession(chatSessionId) : null;
    if (!chatSession) {
console.warn('[ChatHandler] consumePendingSysopPage: pending page had no matching chat session (already ended?) — skipping wait');
      return null;
    }
    return chatSession;
  }

  /**
   * Start the page-wait UI for an already-resolved chat session (see
   * consumePendingSysopPage). Drives the SAME ported
   * displayInternalPager()/completePaging() dots animation used by the
   * mid-door XIM chat-flag trigger — WITHOUT going through
   * startSysopPage()'s executePagerDoor branch, so this never recursively
   * launches the PowerPager door.
   */
  runSysopPageWait(socket: Socket, session: BBSSession, chatSession: ChatSession, onComplete?: () => void): void {
    this.displayInternalPager(socket, session, chatSession, onComplete);
  }

  /**
   * Convenience wrapper: consume + run in one call, for callers with no
   * risky work between the door exiting and the wait starting (e.g. tests).
   * door.handler.ts's executeAmigaDoor instead calls consumePendingSysopPage
   * immediately post-exit and runSysopPageWait later — see the comment
   * above consumePendingSysopPage for why.
   *
   * Returns false when nothing was pending, so callers can unconditionally
   * invoke this after every door exit.
   */
  runPendingSysopPageWait(socket: Socket, session: BBSSession, onComplete?: () => void): boolean {
    const chatSession = this.consumePendingSysopPage(session);
    if (chatSession === undefined) return false; // nothing was pending
    if (chatSession === null) {
      onComplete?.(); // was pending, but nothing left to wait on
      return true;
    }
    this.runSysopPageWait(socket, session, chatSession, onComplete);
    return true;
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
console.log(`Operator paged at ${getSystemTime().toISOString()} by ${session.user.username}`);

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
   *
   * express.e:20336-20372 (ccom()) drives an outer 20x/inner 50x tick loop
   * that on EVERY tick checks whether the sysop has answered (chatF) and
   * returns immediately if so; otherwise it prints a dot once per second
   * for a fixed window, then reports the page as unanswered. Mirrored here
   * as a 1-per-second interval that re-checks the chat session's status on
   * every tick before printing the next dot.
   *
   * onComplete (task 18) fires once the wait ends, by timeout OR by the
   * sysop answering — lets door.handler.ts resume its own post-door-exit
   * menu flow only once the wait is actually finished.
   */
  displayInternalPager(socket: any, session: BBSSession, chatSession: ChatSession, onComplete?: () => void): void {
    const displayTime = getSystemTime().toLocaleTimeString();
    const sysopName = 'Sysop';

    socket.emit('ansi-output', `\r\n${displayTime}\r\n\r\nPaging ${sysopName} (CTRL-C to Abort). .`);

    // Start the paging dots animation - 30 dots over 30 seconds
    let dotCount = 0;
    const maxDots = 30;

    const dotInterval = setInterval(() => {
      // express.e:20353-20360 — chatF check happens before anything else
      // on every tick, so an answer mid-wait ends it immediately instead
      // of waiting out the rest of the animation.
      const current = this.chatSessionUseCase.getChatSession(chatSession.id);
      if (current?.status === 'active') {
        clearInterval(dotInterval);
        this.completePaging(socket, session, chatSession, onComplete);
        return;
      }

      socket.emit('ansi-output', ' .');

      dotCount++;
      if (dotCount >= maxDots) {
        clearInterval(dotInterval);
        this.completePaging(socket, session, chatSession, onComplete);
      }
    }, 1000);

    // Store interval for cleanup
    session.pagingInterval = dotInterval;
  }

  /**
   * Complete paging - Complete the paging process
   */
  completePaging(socket: any, session: BBSSession, chatSession: ChatSession, onComplete?: () => void): void {
    // Clear any paging interval
    if (session.pagingInterval) {
      clearInterval(session.pagingInterval);
      delete session.pagingInterval;
    }

    // express.e:20357-20358 — IF(chatF=1) just prints a blank line and
    // returns; the "has been paged... until answers" message is only for
    // the unanswered (timeout/abort) case.
    const current = this.chatSessionUseCase.getChatSession(chatSession.id);
    if (current?.status === 'active') {
      socket.emit('ansi-output', '\r\n\r\n');
    } else {
      socket.emit('ansi-output', '\r\n\r\nThe Sysop has been paged\r\n');
      socket.emit('ansi-output', 'You may continue using the system\r\n');
      socket.emit('ansi-output', 'until the sysop answers your request.\r\n\r\n');
    }

    // Return to menu
    session.menuPause = true;
    session.subState = LoggedOnSubState.DISPLAY_MENU;

    onComplete?.();
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

    // Enter chat mode (sysop side)
    this.enterChatMode(socket, session, accepted);
    socket.join?.(this.chatRoom(accepted.id));

    // Review fix (task 18): the PAGED USER's own session must also enter
    // chat mode — previously only the sysop's session got inChat/chatSession
    // set here, so the user was left on the main menu with no chat UI and
    // their typed lines fell through to normal command processing. Reuses
    // the SAME enterChatMode() — no parallel chat mechanism.
    const counterpart = this.resolveCounterpartSocket(socket, accepted.userId);
    if (counterpart) {
      counterpart.socket.join?.(this.chatRoom(accepted.id));
      counterpart.socket.emit('ansi-output', `\r\n\x1b[32m${session.user.username} has answered your page!\r\n`);
      counterpart.socket.emit('ansi-output', 'Type your messages. Press F1 to exit chat.\r\n\r\n');
      this.enterChatMode(counterpart.socket, counterpart.session, accepted);
    } else {
console.warn(`[ChatHandler] acceptChat: paged user ${accepted.userId} has no live socket — they will not see the chat UI until they reconnect`);
    }
  }

  /**
   * Enter chat mode - Enter active chat mode (like chatFlag=TRUE in AmiExpress)
   */
  enterChatMode(socket: any, session: BBSSession, chatSession: ChatSession): void {
    session.inChat = true;
    session.chatSession = chatSession;
    // Review fix (round 3, task 18): this is the ONE place inChat gets
    // set — clearing here (not per call-site) covers every entry path
    // (sysop accepting, paged user wired in by acceptChat). Without this,
    // whatever the party had half-typed at the menu prompt before chat
    // started (READ_COMMAND only does a falsy-guard, not clear-on-entry —
    // command.handler.ts:3661-3663) silently prepends onto their first
    // chat line once socket-handlers.ts starts routing keystrokes into
    // this same session.inputBuffer for chat instead.
    session.inputBuffer = '';

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
      // Review fix (task 18): reset the OTHER party too. Whichever side
      // calls exitChat (sysop or paged user), the counterpart must not be
      // left stranded inChat=true with a now-ended chatSession — their
      // next line would silently vanish (sendChatMessage's addChatMessage
      // no-ops once the session is removed from activeSessions) and F1
      // would no longer work for them either.
      const counterpartUserId =
        session.user?.id === chatSession.sysopId ? chatSession.userId : chatSession.sysopId;
      const counterpart = this.resolveCounterpartSocket(socket, counterpartUserId);
      if (
        counterpart &&
        counterpart.session.inChat &&
        (counterpart.session.chatSession as ChatSession | undefined)?.id === chatSession.id
      ) {
        counterpart.socket.emit('ansi-output', '\r\n\x1b[32mChat session ended.\r\n');
        delete counterpart.session.inChat;
        delete counterpart.session.chatSession;
        // Review fix (round 3): same leak as below, for the party who
        // DIDN'T call exitChat — their own partially-typed chat line must
        // not resurface as a stray prefix on their next menu command.
        counterpart.session.inputBuffer = '';
        counterpart.session.menuPause = true;
        counterpart.session.subState = LoggedOnSubState.DISPLAY_MENU;
        counterpart.socket.leave?.(this.chatRoom(chatSession.id));
      }
      socket.leave?.(this.chatRoom(chatSession.id));
      this.chatSessionUseCase.endChatSession(chatSession.id);
    }

    // Clear chat state
    delete session.inChat;
    delete session.chatSession;
    // Review fix (round 3, task 18): this is the ONE place inChat gets
    // cleared for the calling party (F1 in socket-handlers.ts returns
    // immediately after calling exitChat, before ever reaching the
    // inChat-buffering branch that would otherwise flush/clear it on
    // Enter) — a mid-line F1 press left the partial chat text sitting in
    // session.inputBuffer, which then silently prefixed whatever command
    // the user typed next at the menu.
    session.inputBuffer = '';

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
      // Format and broadcast to BOTH parties (review fix, task 18):
      // express.e's chat() writes each line to both conPuts (local sysop
      // screen) and serPuts (remote caller line) from the single shared
      // process — express.e:5966-6028. Emitting only to the sender's own
      // socket left the other party seeing nothing at all. Falls back to a
      // sender-only echo when no Socket.IO server is reachable (e.g. a
      // bare mock socket in tests) so this never silently drops output.
      const formatted = this.chatSessionUseCase.formatChatMessage(chatMessage);
      const io = socket?.nsp?.server;
      if (io) {
        io.to(this.chatRoom(chatSession.id)).emit('ansi-output', formatted);
      } else {
        socket.emit('ansi-output', formatted);
      }
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
        gdprConsented: !!(session.user as any)?.gdprConsentAt,
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

export function notifySysopPage(session: BBSSession): boolean {
  const handler = resolveChatHandler();
  return handler.notifySysopPage(session);
}

export function runPendingSysopPageWait(socket: Socket, session: BBSSession, onComplete?: () => void): boolean {
  const handler = resolveChatHandler();
  return handler.runPendingSysopPageWait(socket, session, onComplete);
}

export function consumePendingSysopPage(session: BBSSession): ChatSession | null | undefined {
  const handler = resolveChatHandler();
  return handler.consumePendingSysopPage(session);
}

export function runSysopPageWait(socket: Socket, session: BBSSession, chatSession: ChatSession, onComplete?: () => void): void {
  const handler = resolveChatHandler();
  handler.runSysopPageWait(socket, session, chatSession, onComplete);
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
