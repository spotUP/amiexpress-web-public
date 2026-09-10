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
import { operatorChatUrl } from '../utils/admin-base-url.util';
import { LoggedOnSubState } from '../constants/bbs-states';
import {
  emitterForUserId,
  socketIoSocketFor,
} from '../server/session-emitter-registry';
import { getGrumpySysopResponse, getGrumpyBotIntroMessage, planNaturalTyping, type AIProviderConfig, DEFAULT_AI_CONFIG } from './grumpy-sysop-bot.handler';
import { buildBoardCard } from './sysop-ai/board-card';
import { resolvePersona, personaByHandle, promptFor } from './sysop-ai/personas';
import { retrieve, retrievedAsPrompt } from './sysop-ai/corpus';
import { gameCardFor } from './sysop-ai/external/games';
import { toolsFor, type ToolContext } from './sysop-ai/tools';
import { confirmPendingAdmin } from './sysop-ai/admin-tool';
import { TOOL_AI_BUDGET_MS } from './grumpy-sysop-bot.handler';

/**
 * The tools for this caller and what they run against (K3). `execute` is
 * how an action on the caller's session happens: the chat ends the way it
 * always does, then the board's own command runs as the caller - the tool
 * never re-implements a command. Injectable for tests.
 */
export type CommandExecutor = (session: BBSSession, command: string, params: string) => Promise<void>;
const defaultExecutor: CommandExecutor = async (session, command, params) => {
  const { processCommand } = require('./command.handler');
  const reach = emitterForUserId(session.user!.id, undefined);
  if (!reach) throw new Error('no emitter for the caller');
  await processCommand(reach.emitter, session, command, params);
};
let commandExecutor: CommandExecutor = defaultExecutor;
/** Test seam: what runs a board command for the caller. */
export function setCommandExecutor(fn: CommandExecutor | null): void {
  commandExecutor = fn ?? defaultExecutor;
}

function toolsForChat(io: any, repository: OperatorChatRepository, page: PageRequest, chatSession: ChatSession): { list: ReturnType<typeof toolsFor>; ctx: ToolContext } | undefined {
  const config = repository.getConfig();
  if (config.aiToolsEnabled === false) return undefined;
  const session = userSessions.get(String(page.userId));
  if (!session) return undefined;
  let db: ToolContext['db'];
  try {
    const { getDatabase } = require('./command-handler/dependency-injection');
    db = getDatabase();
  } catch { db = undefined; }
  const ctx: ToolContext = {
    io, session, page, chatSession, bbsRoot,
    execute: async (command, params) => {
      await endChat(io, repository, page.id);
      await commandExecutor(session, command, params);
    },
    db,
    caps: { grantTimeMinutesPerDay: Number(config.aiTimeGrantCapMinutes ?? 30) },
    sysopName: loadBBSConfig(bbsRoot).sysop_name || 'Sysop',
    rawgKey: config.rawgApiKey || process.env.RAWG_API_KEY || undefined,
  };
  return { list: toolsFor(session), ctx };
}

/** Run what the tools scheduled, once the reply has been typed. */
async function runAfters(context: { afters?: Array<() => Promise<void>> }, pageId: string): Promise<void> {
  for (const after of context.afters ?? []) {
    try { await after(); } catch (err) {
console.error(`[Operator Chat] Page ${pageId}: a scheduled action failed:`, err);
    }
  }
}

/** The board's own help on this message, for this caller - or nothing. */
function retrievedFor(message: string, chatSession: ChatSession): string | undefined {  try {
    const caller = userSessions.get(String(chatSession.userId));
    const chunks = retrieve(message, { bbsRoot, repoRoot: path.join(__dirname, '../../../..') }, caller?.user?.secLevel ?? 0, caller?.currentConf, 3);
    return retrievedAsPrompt(chunks);
  } catch (err) {
console.log(`[Operator Chat] retrieval skipped (${(err as Error).message})`);
    return undefined;
  }
}

/**
 * Prompt context for one message: the board's own retrieval plus a forced
 * RAWG card when the message looks like a game question (2026-09-10 - the
 * models answer games from weights and never call lookup_game, so the
 * stored key only works when it rides the prompt). Either half may be
 * absent; absent halves contribute nothing.
 */
async function retrievedWithGames(
  message: string,
  chatSession: ChatSession,
  repository: OperatorChatRepository
): Promise<string | undefined> {
  const card = await gameCardFor(
    message,
    repository.getConfig().rawgApiKey || process.env.RAWG_API_KEY || undefined
  );
  const parts = [retrievedFor(message, chatSession), card].filter((p): p is string => !!p);
  return parts.length ? parts.join('\n\n') : undefined;
}
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
import { userSessions, socketToUser, sessions } from '../server/session-manager';
import { loadBBSConfig } from '../services/bbs-config-file.service';
import { runExecuteOn } from '../services/batch-scheduler';
import { mailOnSysopPage } from '../services/mail-notification.service';
import * as fs from 'fs';
import * as path from 'path';
import { getSystemTime } from '../utils/date-time.util';
import { report } from '../achievements/reporter';

// BBS root for config and log files
// The board's data root: BBS_DATA_DIR in the container (/app/data/bbs),
// BBS_ROOT elsewhere, the repo tree in dev (which IS a board tree).
// BBS_ROOT alone resolved to /app in the container, where Commands/ and
// ConfConfig.info do not live - every disk read in chat (doors, conferences,
// bulletins, RAG corpus) came back empty there (live 2026-09-10).
const bbsRoot = process.env.BBS_DATA_DIR || process.env.BBS_ROOT || path.join(__dirname, '../../../..');

// Active chat sessions (in-memory)
import { activeChatSessions, deliverToCaller, deliverGreeting, chatResetColourBytes, chatCharBytes, chatBackspaceBytes, chatReturnBytes, callerTypedChar, callerBackspaced, callerPressedReturn, callerLineEntered, cancelSendHint, scheduleSendHint, cancelThinkingDots, wrapChatMessage, CHAT_COLOR_SYSOP, CHAT_COLOR_USER } from './operator-chat/chat-stream';
import { startThinkingDots } from './operator-chat/thinking-dots';
// The caller's half of the chat lives in ./operator-chat/chat-stream; these stay importable from here.
export { chatCharBytes, chatBackspaceBytes, chatReturnBytes, callerTypedChar, callerBackspaced, callerPressedReturn, callerLineEntered, cancelSendHint, scheduleSendHint, cancelThinkingDots, wrapChatMessage, CHAT_COLOR_SYSOP, CHAT_COLOR_USER };

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

      /*
       * AND EVERY CHAT ALREADY RUNNING.
       *
       * A message goes to `page:<id>`, and a sysop joins that room when they
       * TAKE a page - once, on that socket. Every reconnect since (a deploy,
       * a dropped websocket, a reopened tab) produced a socket in `sysops` and
       * in no page room at all, so the chat went silent while the board went
       * on writing to a room nobody was in. The sysop, mid-conversation with
       * the co-sysop: "he has only replied on my first message and its been
       * minutes waiting on the second" - both replies were in the log, and in
       * the database; the second was emitted into an empty room.
       */
      for (const [pageId] of activeChatSessions) {
        socket.join(`page:${pageId}`);
      }

      repository.updateSysopStatus(session.user.id, SysopAvailability.AVAILABLE, 'Online');
console.log(`[Operator Chat] Sysop ${session.user.username} (ID:${session.user.id}) connected, joined sysops room and ${activeChatSessions.size} chat room(s)`);
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

    socket.on('operator:get-active-chats', async () => {
      if (!session?.user || session.user.secLevel < 100) {
        socket.emit('operator:error', { message: 'Unauthorized' });
        return;
      }

      const botChats = Array.from(activeChatSessions.entries())
        .filter(([_, cs]) => (cs as any).isBotControlled)
        .map(([id, cs]) => ({
          pageId: id,
          userHandle: cs.userHandle,
          userNodeId: cs.userNodeId,
          startedAt: cs.startedAt.getTime(),
          lastActivity: cs.lastActivity.getTime(),
          messageCount: cs.messages.length,
        }));
      socket.emit('operator:active-chats', botChats);
    });

    socket.on('operator:accept-page', async (data: { pageId: string }) => {
      if (!session?.user || session.user.secLevel < 100) {
        socket.emit('operator:error', { message: 'Unauthorized' });
        return;
      }

      const target = repository.getPageRequest(data.pageId);
      const callerSession = target ? userSessions.get(String(target.userId)) : null;
      if (target && callerSession && !callerCanBeInterrupted(callerSession)) {
        // QUEUED, NOT REFUSED. A chat begun under a door is painted over and
        // typed into by nobody (see callerCanBeInterrupted), so the accept
        // waits for the caller to come back - the same one-second retry the
        // bot's own deferral uses. The sysop said yes once; the board
        // remembers it instead of asking them to watch the node.
        pendingSysopAccepts.set(data.pageId, {
          sysopId: session.user.id, sysopHandle: session.user.username,
          sysopSessionId: socket.id, at: Date.now(),
        });
console.log(`[Operator Chat] Page ${data.pageId}: ${session.user.username} accepted while ${target.userHandle} is inside a door (subState=${callerSession.subState}) - held until they are back at a prompt`);
        socket.emit('operator:accept-queued', {
          pageId: data.pageId, userHandle: target.userHandle,
          message: `${target.userHandle} is inside a door. The chat will open the moment they are back at a prompt.`,
        });
        return;
      }
      pendingSysopAccepts.delete(data.pageId);
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

      // The caller does not see the sysop's keystrokes. express.e sends a
      // word when it is finished (5966-5990), and so does operator:send-message;
      // a preview line needs a place on the screen this chat no longer has.
      
            // Update typing indicator
            chatSession.isTyping.sysop = (chatSession as any).sysopTypingBuffer.length > 0;
          });
        });
  // Start page timeout checker
  //
  // UNREF'D, AND STOPPABLE. A bare setInterval here is a handle nothing ever
  // clears: the server does not mind - it runs until the process ends - but a
  // test that initialises this handler leaves jest holding a timer that fires
  // every second for ever. `Jest did not exit one second after the test run
  // has completed` is that timer, and it is why the backend suite could only
  // be run with --forceExit and why a full run was killed twice at 25 minutes
  // rather than finishing (2026-09-07).
  //
  // unref() keeps the checker running for as long as anything else is running
  // and stops it being the reason the process stays alive. The handle is kept
  // as well, so a test - or a shutdown - can stop it outright.
  pageTimeoutChecker = setInterval(() => {
    checkPageTimeouts(io, repository);
  }, 1000); // Check every 1 second for tight bot takeover
  pageTimeoutChecker.unref?.();
}

/** The page-timeout interval, so it can be stopped. See initOperatorChatHandler. */
let pageTimeoutChecker: NodeJS.Timeout | null = null;

/**
 * Stop the page-timeout checker.
 *
 * For a test that initialised the handler, and for an orderly shutdown. Safe
 * to call when nothing is running.
 */
export function stopOperatorChatHandler(): void {
  if (pageTimeoutChecker) {
    clearInterval(pageTimeoutChecker);
    pageTimeoutChecker = null;
  }
  // AND THE CHATS THEMSELVES. A bot reply is typed by an `await sleep` loop
  // inside deliverToCaller - there is no timer handle to clear - and the only
  // thing that stops it is its own `live()` guard, which asks whether this
  // chat is still the one in `activeChatSessions`. Leaving the map populated
  // left a bot typing after the handler had been stopped, and because the
  // caller is looked up by user id, its characters landed in whatever session
  // registered that id NEXT. In the suites that is the following test's
  // output array, which is why a different test failed on every run of
  // grumpy-bot-types-live. Stopping the handler stops its chats.
  activeChatSessions.clear();
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

  // Get actual conference name — use the session's cached name first
  // (set by the menu system), fall back to database lookup.
  let conferenceName = session.currentConfName || 'Main';
  if (!session.currentConfName) {
    try {
      const { getDatabase } = require('./command-handler/dependency-injection');
      const db = getDatabase();
      const conferences = await db.getConferences();
      const currentConf = conferences.find((c: any) => c.id === session.currentConf);
      if (currentConf) {
        conferenceName = currentConf.name;
      }
    } catch (error) {
  console.error('[Operator Chat] Failed to get conference name:', error);
    }
  }

  // Create page request
  const pageData: CreatePageRequest = {
    userId: session.user!.id,
    userHandle: session.user!.username,
    nodeId: session.nodeId || 0,
    conferenceId: session.currentConf,
    conferenceName,
    timeOnline: Math.floor((Date.now() - (session.connectionStart || Date.now())) / 1000),
    lastCommand: session.commandText || 'O'
  };

  const pageRequest = repository.createPageRequest(pageData);

  // express.e:24196 - runExecuteOn('SYSOP_PAGE') called from sysopPaged()
  runExecuteOn('SYSOP_PAGE', session.nodeId || 1, {
    username: session.user!.username,
    location: session.user!.location
  }).catch((err) => console.error('[Operator Chat] EXECUTE_ON_SYSOP_PAGE failed:', err));

  // MAIL_ON_SYSOP_PAGE tooltype - express.e:24197-24201
  mailOnSysopPage(session.user!.username).catch((err) =>
console.error('[Operator Chat] MAIL_ON_SYSOP_PAGE failed:', err)
  );

  // Join user-specific rooms so targeted emits reach this socket
  try {
    socket.join(`page:${pageRequest.id}`);
    if (session.user?.id) {
      socket.join(`user:${session.user.id}`);
      // Also ensure the user session is mapped for direct lookup (critical for grumpy bot)
      if (!userSessions.has(String(session.user.id))) {
        userSessions.set(String(session.user.id), session);
console.log(`[Operator Chat] Added user ${session.user.id} to userSessions map`);
      }
      // Also map socket to user for lookup
      socketToUser.set(socket.id, String(session.user.id));
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
  const currentTime = getSystemTime().toLocaleString();
  const bbsConfig = loadBBSConfig(bbsRoot);
  const sysopName = bbsConfig.sysop_name || 'the operator';

  socket.emit('ansi-output', `\r\n${currentTime}\r\n`);
  socket.emit('ansi-output', `\r\nPaging ${sysopName} (CTRL-C to Abort). .`);

  // THE WAIT IS THE CONFIGURED TIMEOUT. express.e's ccom() pages for a fixed
  // 20 dots (express.e:20353) and then frees the caller, because a human
  // sysop's chat can begin any time later - it starts inside readChar, i.e.
  // wherever the board is reading the caller's keyboard, so it is always
  // seen and the keyboard always follows it. This port's stand-in sysop is
  // a TIMER, and a timer that fires 90 seconds after the caller was freed
  // lands wherever they went: inside a 68K door on 2026-09-07 19:15, where
  // the door painted over the intro and took every keystroke, and the page
  // sat "accepted by GrumpyBot" for ever - "neither the openrouter ai or the
  // grumpy sysop answers". So the caller waits at this prompt for the whole
  // pageTimeout the sysop set in the admin, one dot a second, and the bot
  // arrives while the keyboard is still here.
  let dotCount = 0;
  const maxDots = Math.max(1, Math.floor(config.pageTimeout));
  
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
    io.to('sysops').emit('operator:paging-dot');

    // The wait is over. The bot takes the page HERE, while the caller is
    // still at this prompt; only if it cannot (no live session to reach)
    // does the caller get express.e's "you may continue" and the menu.
    if (dotCount >= maxDots) {
      stopPagingDots(pageRequest.id);
      void (async () => {
        const page = repository.getPageRequest(pageRequest.id);
        const currentSubState = session.subState as LoggedOnSubState;
        const chatAccepted = page?.status === PageStatus.ACCEPTED ||
                             currentSubState === LoggedOnSubState.OPERATOR_CHAT_ACTIVE;
        if (chatAccepted) return;

        const taken = await activateGrumpyBot(io, repository, pageRequest.id, 'the paging wait ended');
        if (taken) return;

        socket.emit('ansi-output', '\r\n\r\nThe Sysop has been paged\r\n');
        socket.emit('ansi-output', 'You may continue using the system\r\n');
        socket.emit('ansi-output', `until ${sysopName} answers your request.\r\n\r\n`);

        if (session.subState === LoggedOnSubState.OPERATOR_CHAT_WAITING) {
          session.subState = LoggedOnSubState.DISPLAY_MENU;
        }
      })();
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
      const authUrl = operatorChatUrl(page.token);

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

  // 3a. Pushover notification
  if (config.pushoverAppToken && config.pushoverUserKey) {
    try {
      await axios.post('https://api.pushover.net/1/messages.json', {
        token: config.pushoverAppToken,
        user: config.pushoverUserKey,
        title: `Operator Page — ${page.userHandle}`,
        message: `${page.userHandle} on N${page.nodeId} in ${page.conferenceName} — ${page.lastCommand}`,
        sound: 'persistent',
        priority: 1,
        url: operatorChatUrl(),
        url_title: 'Open Operator Chat',
      }, { timeout: 5000 });
      notificationUpdates.pushover = true;
    } catch (error) {
console.error('[Operator Chat] Pushover notification failed:', error);
    }
  }

  // 3b. Gotify notification
  if (config.gotifyUrl && config.gotifyAppToken) {
    try {
      const gotifyUrl = config.gotifyUrl.replace(/\/+$/, '');
      await axios.post(`${gotifyUrl}/message`, {
        title: `Operator Page — ${page.userHandle}`,
        message: `${page.userHandle} on N${page.nodeId} in ${page.conferenceName}`,
        priority: 5,
      }, {
        headers: { 'X-Gotify-Key': config.gotifyAppToken },
        timeout: 5000,
      });
      notificationUpdates.gotify = true;
    } catch (error) {
console.error('[Operator Chat] Gotify notification failed:', error);
    }
  }

  // 3c. ntfy.sh notification
  if (config.ntfyTopic) {
    try {
      const ntfyBase = (config.ntfyUrl || 'https://ntfy.sh').replace(/\/+$/, '');
      await axios.post(`${ntfyBase}/${encodeURIComponent(config.ntfyTopic)}`, `${page.userHandle} on N${page.nodeId} in ${page.conferenceName}`, {
        headers: {
          'Title': `Operator Page — ${page.userHandle}`,
          'Priority': 'urgent',
          'Tags': 'bell',
          'Click': operatorChatUrl(),
        },
        timeout: 5000,
      });
      notificationUpdates.ntfy = true;
    } catch (error) {
console.error('[Operator Chat] ntfy.sh notification failed:', error);
    }
  }

  // 4. Browser push notifications
  try {
    const {
      isWebPushEnabled,
      sendPushNotifications,
      createPageNotificationPayload
    } = require('../utils/web-push.util');

    if (isWebPushEnabled()) {
      const subscriptions = repository.getAllPushSubscriptions();

      if (subscriptions.length > 0) {
        const authUrl = operatorChatUrl(page.token);
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
  if (!page) {
console.error(`[Operator Chat] Cannot accept page ${pageId}: not found`);
    return;
  }

  const isBotControlled = page.status === PageStatus.ACCEPTED && page.sysopId === 'bot';
  if (page.status !== PageStatus.PENDING && !isBotControlled) {
console.error(`[Operator Chat] Cannot accept page ${pageId}: status is ${page.status}, not pending`);
    return;
  }

  if (isBotControlled) {
console.log(`[Operator Chat] Sysop taking over bot-controlled page ${pageId}`);
    const chatSession = activeChatSessions.get(pageId);
    if (chatSession) {
      (chatSession as any).isBotControlled = false;
      (chatSession as any).botBusy = false;
      (chatSession as any).botMessageHistory = [];
    }
  }

  stopPagingDots(pageId);

  // Add sysop socket to page room for chat fan-out
  // TP-10: room membership needs a real socket.io socket, and this one is
  // the SYSOP's admin-app socket, addressed by socket id - so it goes
  // through the registry's socket accessor rather than a second reach into
  // the io namespace. The registry is the only module that holds that map.
  const sysopSocket = socketIoSocketFor(sysopSessionId, io);
  if (sysopSocket) {
    try {
      sysopSocket.join(`page:${pageId}`);
      sysopSocket.join(`user:${page.userId}`);
    } catch (err) {
console.error(`[Operator Chat] Failed to join sysop socket to page room ${pageId}:`, err);
    }
  }

  repository.updatePageStatus(pageId, PageStatus.ACCEPTED, sysopId, sysopHandle);

  const existingMessages = repository.getChatMessages(pageId);

  const chatSession: ChatSession = {
    pageId,
    userId: page.userId,
    userHandle: page.userHandle,
    userNodeId: page.nodeId,
    sysopId,
    sysopHandle,
    sysopSessionId,
    startedAt: getSystemTime(),
    lastActivity: getSystemTime(),
    messages: existingMessages,
    isTyping: { user: false, sysop: false }
  };

  activeChatSessions.set(pageId, chatSession);
  // Achievements (SP2): the caller got their chat. Non-throwing.
  { const callerSession = userSessions.get(String(page.userId)); if (callerSession) report(callerSession as any, 'social.chat'); }

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

  const targetRoom = `user:${page.userId}`;
  const reach = emitterForUserId(page.userId, io);
  const callerNow = userSessions.get(String(page.userId));

  // THE CALLER IS IN THE CHAT BEFORE A WORD OF IT IS TYPED. All of this sat
  // under the greeting while that was one synchronous emit - a microsecond of
  // daylight. The greeting types now, seconds of it, and for every one of them
  // the caller was still in the subState they paged from: keys to the menu (a
  // command could start UNDER the greeting on the "you may continue using the
  // system" path), and chatOfSession, which reads tempData.pageId, found no
  // chat to type into or /quit. The greeting is the first thing the chat says,
  // not the thing it waits for; the caller's keys are MEANT to interleave with
  // it onto express's one shared line (chat-stream.ts:266-268).
  io.to(targetRoom).emit('operator:chat-accepted', { pageId, sysopHandle });

  // THE SESSION IS RE-LINKED FROM THE PAGE ROW, not trusted to still carry the
  // link. `tempData.pageId` was where the page lived, and `tempData` is
  // scratch that twelve command paths wipe (`session.tempData = undefined`):
  // a caller who ran one menu command between paging and the accept had no
  // link left, this block did nothing, the chat screen appeared and every
  // keystroke still went to the menu. The row says who the page belongs to;
  // the session is theirs; the link is written again here.
  if (!callerNow) {
console.log(`[Operator Chat] Page ${pageId}: no session for user ${page.userId} to switch into the chat - keystrokes will not reach it`);
  } else {
    if (callerNow.tempData?.pageId !== pageId) {
console.log(`[Operator Chat] Page ${pageId}: re-linking session of ${page.userHandle} (tempData.pageId was ${callerNow.tempData?.pageId ?? 'unset'} - the caller moved on since paging)`);
    }
    if (callerNow.tempData?.dotIntervalId) {
      clearInterval(callerNow.tempData.dotIntervalId);
      delete callerNow.tempData.dotIntervalId;
    }
    callerNow.tempData = { ...(callerNow.tempData || {}), pageId };
    callerNow.subState = LoggedOnSubState.OPERATOR_CHAT_ACTIVE;
    callerNow.inputBuffer = '';
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

  // express.e chat() 5885-5915: a blank line, the StartChat screen or
  // "This is <sysop>, How can I help you??", then the sysop's colour. The
  // chat continues in the stream the caller was already in.
  if (!reach) {
console.log(`[Operator Chat] Page ${pageId} (${page.userHandle}@Node${page.nodeId}): accepted by ${sysopHandle} but NO EMITTER reaches user ${page.userId} - ${userSessions.has(String(page.userId)) ? 'session is known but its socket is gone' : 'no session in userSessions'}. The chat screen went nowhere.`);
  } else {
    reach.emitter.emit('ansi-output', '\r\n');
    let shown = false;
    if (callerNow) {
      try {
        const { displayScreen } = require('./screen.handler');
        shown = Boolean(await displayScreen(reach.emitter, callerNow, 'StartChat', false, true));
      } catch (err) {
console.log(`[Operator Chat] Page ${pageId}: StartChat screen not shown (${(err as Error).message}); using the built-in line`);
      }
    }
    // express.e:6085-6087 prints cmds.sysopName, in whatever colour is
    // current; the sysop colour comes after (6092-6094), and here it comes
    // with the first character the sysop sends, as the line model does it -
    // which is why the greeting is typed through the stream and not emitted
    // whole. A human sysop's opening is the same board line, said the same way.
    const startName = sysopId === 'bot' ? sysopHandle : (loadBBSConfig(bbsRoot).sysop_name || sysopHandle);
    // A bot persona greets in its own voice right after this (its persona
    // greeting), so the board's generic greeting would double up: human
    // sysops keep the express.e line, bots skip straight to the hint.
    if (!shown && sysopId !== 'bot') {
      await deliverGreeting(io, chatSession, page, startName, aiConfigFrom(repository.getConfig()).botTypingSpeed);
    }
    // WHAT EXPRESS NEVER SAID. chat() tells the caller nothing: it ends on
    // CTRL-C if they hold ACS_BREAK_CHAT (express.e:6118) or when the SYSOP
    // presses F1, BBSHelp.txt has no chat section, and a board that wanted to
    // explain put it in Node<n>/StartChat.txt - which this board does not
    // ship. A caller was told by the sysop, or not at all.
    //
    // That silence does not survive the port: the co-sysop answers the page,
    // so nobody is there to end the chat for the caller, and a message has
    // to be handed over deliberately. One line says both, once, after the
    // greeting - and a sysop who writes a StartChat screen replaces the
    // greeting entirely and can say it their own way. CTRL-C is not gated on
    // ACS_BREAK_CHAT here: a caller who cannot leave a chat nobody else is
    // in would be trapped. The board is not the sysop, so its colour reset
    // goes through the line model, or the next line types with no colour.
    if (sysopId === 'bot') reach.emitter.emit('ansi-output', `${chatResetColourBytes(chatSession)}(type, then press return twice to send. /quit or CTRL-C leaves the chat.)\r\n\r\n`);
  }

console.log(`[Operator Chat] Page ${pageId} accepted by ${sysopHandle}`);
}

/** What POST /api/nodes/:nodeId/chat (SV_CHAT) reports back to the admin. */
export interface SysopChatResult {
  success: boolean;
  ended?: boolean;
  queued?: boolean;
  pageId?: string;
  message: string;
}

/**
 * SV_CHAT, the SYSOP-INITIATED direction - api/node-control-routes.ts:239-245
 * used to 501 here.
 *
 * ACP.e:1005-1013 (`register()`/`sendMessage()`) is the message port ACP uses
 * to send every SV_* command - SV_CHAT included - to a node's express.e
 * process; it is generic across all of them, which is why it names no chat
 * behaviour itself. The chat behaviour is in express.e, the node process ACP
 * is talking to:
 *   - express.e:1411-1412 - the node only acts on SV_CHAT at all
 *     `IF logonType<>LOGON_TYPE_LOGGED_OFF` - nobody logged on is a no-op.
 *   - express.e:7845-7862 - `chatF:=1; chatFlag:=Not(chatFlag)` - SV_CHAT is
 *     a TOGGLE of the node's one chat flag, not a one-shot open. Turning ON
 *     runs tranChat() or chat() (already ported: acceptPage() below plus
 *     chat-stream.ts); turning OFF just stops - chat()'s own loop returns.
 *
 * This calls the SAME machinery the caller-initiated P (page sysop) command
 * uses - acceptPage(), endChat(), activeChatSessions, pendingSysopAccepts -
 * not a parallel chat. The only difference is how the PageRequest is made:
 * a caller's P command creates one PENDING and waits for a sysop to accept
 * it; here there is no page to wait for, so one is created and accepted (or
 * queued) in the same call.
 *
 * TOGGLE OFF is by NODE, not by sysop: express.e has one console and one
 * chatFlag per node, so a second SV_CHAT for a node that already has a live
 * chat ends it, whichever sysop opened it.
 *
 * QUEUEING (caller inside a door): reuses `pendingSysopAccepts`, the exact
 * map `operator:accept-page` fills when a human sysop accepts a caller's page
 * while they are inside a door (see callerCanBeInterrupted's doc comment,
 * below) - `checkPageTimeouts` already drains it once the caller is back at a
 * prompt, and `activateGrumpyBot` already refuses to take a page this map
 * holds. No new polling was written for this.
 *
 * UNIMPLEMENTED, and why: on the real Amiga, chat() runs INSIDE readChar, so
 * a local F1 or an incoming SV_CHAT is always seen the instant it is set -
 * AmigaDOS console I/O has no concept of a door owning the whole keyboard the
 * way this port's DoorInputManager does, so express.e has no queueing
 * behaviour for "caller is busy" to port. The queue used here is this port's
 * own invention (already shipped for the caller-initiated side), reused
 * rather than duplicated.
 */
export async function initiateSysopChat(
  io: any,
  repository: OperatorChatRepository,
  nodeId: number,
  sysopId: string,
  sysopHandle: string,
  sysopSessionId: string
): Promise<SysopChatResult> {
  // TOGGLE OFF: chatFlag:=Not(chatFlag), express.e:7852.
  for (const [pageId, cs] of activeChatSessions) {
    if (cs.userNodeId === nodeId && !(cs as any).ended) {
      await endChat(io, repository, pageId);
      return { success: true, ended: true, pageId, message: `Chat with node ${nodeId} ended` };
    }
  }

  const callerSession = sessions.get(String(nodeId));
  // express.e:1411-1412 - SV_CHAT only sets servercmd (and so only ever
  // reaches the toggle above) `IF logonType<>LOGON_TYPE_LOGGED_OFF`.
  if (!callerSession || !callerSession.user) {
    return { success: false, message: `Node ${nodeId} has no caller logged on` };
  }

  const pageData: CreatePageRequest = {
    userId: callerSession.user.id,
    userHandle: callerSession.user.username,
    nodeId,
    conferenceId: callerSession.currentConf ?? 0,
    conferenceName: callerSession.currentConfName || 'Main',
    timeOnline: Math.floor((Date.now() - (callerSession.connectionStart || Date.now())) / 1000),
    lastCommand: callerSession.commandText || 'SV_CHAT'
  };
  const pageRequest = repository.createPageRequest(pageData);

  if (!callerCanBeInterrupted(callerSession)) {
    pendingSysopAccepts.set(pageRequest.id, { sysopId, sysopHandle, sysopSessionId, at: Date.now() });
    return {
      success: true,
      queued: true,
      pageId: pageRequest.id,
      message: `${callerSession.user.username} is inside a door; chat will open when they return to a prompt`
    };
  }

  await acceptPage(io, repository, pageRequest.id, sysopId, sysopHandle, sysopSessionId);
  return {
    success: true,
    pageId: pageRequest.id,
    message: `Chat started with ${callerSession.user.username} on node ${nodeId}`
  };
}

/**
 * Send bot message with natural typing simulation to the Amiga user.
 * Admin Socket.IO clients get the full message immediately.
 * Uses sendChatMessage for the actual delivery (scroll region + cursor
 * handling) and only does the typing preview on line 23 as a visual effect.
 */
async function sendBotMessageWithTyping(
  io: any,
  repository: OperatorChatRepository,
  pageId: string,
  message: string,
  nodeId: number,
  page: any,
  aiConfig?: AIProviderConfig
): Promise<void> {
  const chatSession = activeChatSessions.get(pageId);
  if (!chatSession) return;

  const thinkTime = aiConfig?.botThinkTime ?? 1000;

  // Save to DB + emit to admin socket immediately
  // The sender is the persona that took the page (s.2: pinned by handle), not the
  // config's aiSysopName - a Random roll would otherwise record `Kevin` for every line.
  const personaHandle = (page as any)?.sysopHandle || (chatSession as any)?.personaHandle || aiConfig?.botName || botName(repository);
  const saved = repository.addChatMessage({
    pageId,
    senderId: 'bot',
    senderHandle: String(personaHandle).slice(0, 30),
    senderType: 'sysop',
    message,
    timestamp: getSystemTime(),
    nodeId
  });
  chatSession.messages.push(saved);
  chatSession.lastActivity = getSystemTime();

  io.to(`page:${pageId}`).emit('operator:message', {
    ...saved,
    timestamp: saved.timestamp.getTime()
  });

  if (thinkTime > 0) await new Promise<void>((r) => setTimeout(r, thinkTime));
  // THE DOTS COME OFF HERE, and not a moment earlier. Stopping them when the
  // model returned left the caller watching a dead line for the whole of
  // `thinkTime` above - a second by default, more on a board that raised it -
  // which is the exact silence the dots exist to fill. Before deliverToCaller
  // and never inside it: the erase counts backspaces against what the window
  // wrote, and a character of the reply typed first would be eaten by them.
  // A chat with no window open has no canceller registered, so this is a
  // no-op for the intro, the queued reply and the admin verdict.
  cancelThinkingDots(chatSession);
  await deliverToCaller(io, chatSession, page, message, {
    typingSpeed: aiConfig?.botTypingSpeed,
    typoProbability: aiConfig?.botTypoProbability,
  });
}


/** The AI co-sysop's handle on the board - the admin's, default Kevin. */
function botName(repository: OperatorChatRepository): string {
  try { return (repository.getConfig().aiSysopName || 'Kevin').slice(0, 30); } catch { return 'Kevin'; }
}

function extraPersonas(repository: OperatorChatRepository): any[] {
  try { return repository.listPersonas(); } catch { return []; }
}

function personaForPage(page: PageRequest, repository: OperatorChatRepository): any {
  const caller = userSessions.get(String(page.userId))?.user?.aiPersona ?? '';
  const boardDefault = (repository.getConfig().aiPersona ?? '') as string;
  const extra = extraPersonas(repository);
  return resolvePersona({ callerChoice: caller, boardDefault, extra });
}

function personaFromHandle(handle: string, repository: OperatorChatRepository): any | null {
  if (!handle) return null;
  const p = personaByHandle(handle);
  if (p) return p;
  try {
    const stored = repository.getPersonaByHandle(handle);
    if (stored) return stored as any;
  } catch { /* no DB */ }
  return null;
}

/** The bot's engine and typing settings, from the board's operator-chat config. */
function aiConfigFrom(config: OperatorChatConfig, persona?: any): AIProviderConfig {
  // A persona's prompt WITH voice rules (s.2, s.9); a hand-written aiSystemPrompt
  // keeps winning and overrides that persona's prompt but keeps its handle/fallback.
  const personaPrompt = persona ? promptFor(persona) : undefined;
  const systemPrompt = (config.aiSystemPrompt || '').trim() !== '' ? config.aiSystemPrompt : (personaPrompt ?? undefined);
  const botNameFromPersona = persona?.handle ? String(persona.handle).slice(0, 30) : undefined;
  return {
    botName: botNameFromPersona ?? (config.aiSysopName || 'Kevin').slice(0, 30),
    sysopName: loadBBSConfig(bbsRoot).sysop_name || 'the sysop',
    budgetMs: config.aiToolsEnabled === false ? undefined : TOOL_AI_BUDGET_MS,
    provider: config.aiEnabled ? config.aiProvider : 'rule-based',
    modelName: config.aiModelName,
    temperature: config.aiTemperature,
    systemPrompt,
    groqApiKey: config.groqApiKey,
    geminiApiKey: config.geminiApiKey,
    openRouterApiKey: config.openRouterApiKey,
    zenApiKey: (config as any).zenApiKey,
    goApiKey: (config as any).goApiKey,
    cerebrasApiKey: (config as any).cerebrasApiKey,
    botTypingSpeed: config.botTypingSpeed,
    botTypoProbability: config.botTypoProbability,
    botThinkTime: config.botThinkTime,
  };
}

function aiConfigForPage(page: PageRequest, repository: OperatorChatRepository): AIProviderConfig {
  const persona = personaForPage(page, repository);
  return aiConfigFrom(repository.getConfig(), persona);
}

function aiConfigForHandle(handle: string, repository: OperatorChatRepository): AIProviderConfig {
  const p = personaFromHandle(handle, repository);
  return aiConfigFrom(repository.getConfig(), p ?? undefined);
}

/**
 * Process bot message queue — respond to messages that arrived while bot was typing
 */
async function processBotQueue(
  io: any,
  repository: OperatorChatRepository,
  pageId: string,
  chatSession: any
): Promise<void> {
  const session = activeChatSessions.get(pageId);
  if (!session) return;

  const queue = chatSession.botQueue || [];
  chatSession.botQueue = [];
  if (queue.length === 0) return;

  // Take the last message (most recent — skip accumulated intermediate messages)
  const lastMsg = queue[queue.length - 1]!;
  const page = repository.getPageRequest(pageId);
  if (!page) return;

  const context = {
    userHandle: page.userHandle,
    nodeId: page.nodeId,
    conferenceName: page.conferenceName,
    timeOnline: Math.floor((Date.now() - page.createdAt.getTime()) / 1000),
    messageHistory: chatSession.botMessageHistory || [],
    boardCard: chatSession.boardCard as string | undefined,
    retrieved: await retrievedWithGames(lastMsg, chatSession, repository),
    tools: toolsForChat(io, repository, page, chatSession),
    afters: [] as Array<() => Promise<void>>,
  };
  context.messageHistory.push({ role: 'user', content: lastMsg });
  chatSession.botMessageHistory = context.messageHistory;

  chatSession.botBusy = true;
  const pageForPersona = repository.getPageRequest(pageId);
  const aiConfig = pageForPersona ? aiConfigForHandle(pageForPersona.sysopHandle || (chatSession as any).personaHandle || '', repository) : aiConfigFrom(repository.getConfig());

      getGrumpySysopResponse(lastMsg, context, aiConfig).then(async botResponse => {
    context.messageHistory.push({ role: 'bot', content: botResponse });
    chatSession.botMessageHistory = context.messageHistory;
    await sendBotMessageWithTyping(io, repository, pageId, botResponse, page.nodeId, page, aiConfig);
    chatSession.botBusy = false;
    await runAfters(context, pageId);
    // Recurse — process any more queued messages
    processBotQueue(io, repository, pageId, chatSession);
  }).catch(err => {
console.error('[Operator Chat] Bot queue response error:', err);
    chatSession.botBusy = false;
  });
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
    timestamp: getSystemTime(),
    nodeId
  };

  const saved = repository.addChatMessage(chatMessage);
  chatSession.messages.push(saved);
  chatSession.lastActivity = getSystemTime();

  // Clear typing buffers
  if (senderType === 'user') (chatSession as any).userTypingBuffer = '';
  if (senderType === 'sysop') (chatSession as any).sysopTypingBuffer = '';

  // If bot-controlled and the user just sent a non-empty line, trigger a bot
  // reply. express.e:5966-6028 chat() is char-echo + line-flush on Enter —
  // there is no "double enter" signal. Previously this required an empty
  // message before responding, which is non-obvious; users typed a question
  // and waited indefinitely.
  if ((chatSession as any).isBotControlled && senderType === 'user' && message.trim() !== '' && (chatSession as any).pendingAdmin) {
    // K3c: a held admin call is settled by THIS line - `yes` runs it,
    // anything else cancels it - and the co-sysop reports, without the model.
    const heldPage = repository.getPageRequest(pageId);
    const tools = heldPage ? toolsForChat(io, repository, heldPage, chatSession) : undefined;
    if (heldPage && tools) {
      const verdict = await confirmPendingAdmin(tools.ctx, message);
      if (verdict) {
        const aiConfig = heldPage ? aiConfigForHandle(heldPage.sysopHandle || '', repository) : aiConfigFrom(repository.getConfig());
        (chatSession as any).botBusy = true;
        try {
          (chatSession as any).botMessageHistory = [...((chatSession as any).botMessageHistory || []), { role: 'user', content: message }, { role: 'bot', content: verdict }];
          await sendBotMessageWithTyping(io, repository, pageId, verdict, nodeId, heldPage, aiConfig);
        } finally {
          (chatSession as any).botBusy = false;
        }
        io.to(`page:${pageId}`).emit('operator:message', { ...saved, timestamp: saved.timestamp.getTime() });
        return;
      }
    }
  }
  if ((chatSession as any).isBotControlled && senderType === 'user' && message.trim() !== '') {
    // Skip if bot is already typing
    if ((chatSession as any).botBusy) {
console.log('[Operator Chat] Bot busy, queuing message');
      if (!(chatSession as any).botQueue) (chatSession as any).botQueue = [];
      (chatSession as any).botQueue.push(message);
      return;
    }

    (chatSession as any).botBusy = true;
    const page = repository.getPageRequest(pageId);
    if (page) {
      const context = {
        userHandle: page.userHandle,
        nodeId: page.nodeId,
        conferenceName: page.conferenceName,
        timeOnline: Math.floor((Date.now() - page.createdAt.getTime()) / 1000),
        messageHistory: (chatSession as any).botMessageHistory || [],
        boardCard: (chatSession as any).boardCard as string | undefined,
        retrieved: await retrievedWithGames(message, chatSession as any, repository),
        tools: toolsForChat(io, repository, page, chatSession),
        afters: [] as Array<() => Promise<void>>,
      };
      context.messageHistory.push({ role: 'user', content: message });
      (chatSession as any).botMessageHistory = context.messageHistory;

      const aiConfig = page ? aiConfigForHandle(page.sysopHandle || (chatSession as any).personaHandle || '', repository) : aiConfigFrom(repository.getConfig());

      // THE CALLER IS WATCHING A DEAD LINE WHILE THE MODEL THINKS - several
      // seconds of it, and a real sysop would have typed something. Dots
      // start only if the wait runs long (thinking-dots.ts); they are rubbed
      // out in sendBotMessageWithTyping, immediately before the first
      // character of the reply, so the whole wait is covered. The handle
      // below is only for the error path, where nothing is ever typed.
      // `botBusy` above keeps this to one window at a time per chat: the next
      // model call for this chat is only started from inside the `.then`,
      // after the reply has been delivered.
      const dotReach = emitterForUserId(page.userId, io);
      const stopDots = dotReach
        ? startThinkingDots((bytes) => dotReach.emitter.emit('ansi-output', bytes), chatSession, pageId)
        : () => undefined;

      getGrumpySysopResponse(message, context, aiConfig).then(async botResponse => {
        // No stop here: the window stays open across the record, the admin
        // emit and the think sleep, because from the caller's side all of
        // that is still waiting. sendBotMessageWithTyping ends it.
        context.messageHistory.push({ role: 'bot', content: botResponse });
        (chatSession as any).botMessageHistory = context.messageHistory;
        await sendBotMessageWithTyping(io, repository, pageId, botResponse, nodeId, page, aiConfig);
        (chatSession as any).botBusy = false;
        await runAfters(context, pageId);

        // Process any queued messages
        processBotQueue(io, repository, pageId, chatSession as any);
      }).catch(err => {
        // A model that throws must not leave its dots standing on the line.
        stopDots();
console.error('[Operator Chat] Bot response error:', err);
        (chatSession as any).botBusy = false;
      });
    }
  }

  // Broadcast to both parties (convert timestamp to number for frontend)
  io.to(`page:${pageId}`).emit('operator:message', {
    ...saved,
    timestamp: saved.timestamp.getTime()
  });

  // Emit to User (Linear ANSI text) — queue when bot is typing, flush after bot done
  const page = repository.getPageRequest(pageId);
  if (!page) return;
  if (senderType === 'user') {
    // The caller's line is already on their screen - they typed it there,
    // and the return that ended it went out from the chat branch. Nothing
    // to deliver; the record above is what this was for.
    return;
  }
  // A human sysop's line reaches the caller word by word, at once.
  await deliverToCaller(io, chatSession, page, message, null);
}


/**
 * End chat session
 * Resets scroll region and shows simple summary
 */
async function endChat(io: any, repository: OperatorChatRepository, pageId: string): Promise<void> {
  const chatSession = activeChatSessions.get(pageId);
  if (!chatSession) return;

  // BEFORE the chat is marked ended, so the backspaces still reach the caller:
  // `stop()` erases nothing into a chat `chatIsLive` has already written off.
  // CTRL-C (command.handler, express.e:6118) and /quit both land here, and
  // both used to leave a row of dots sitting above "Ending Chat.".
  cancelThinkingDots(chatSession);

  repository.updatePageStatus(pageId, PageStatus.ENDED);
  await logChatTranscript(repository, chatSession);

  const page = repository.getPageRequest(pageId);
  io.to(`page:${pageId}`).emit('operator:chat-ended', { pageId });
  (chatSession as any).ended = true;
  activeChatSessions.delete(pageId);
console.log(`[Operator Chat] Chat session ${pageId} ended`);
  if (!page) return;

  // THE ONE WAY OUT OF A CHAT, whoever ended it. This used to print "Ending
  // Chat." and a "Press any key" it armed with menuPause, and the caller's
  // own /quit then printed "Chat ended. Returning to menu." after it - with
  // the scroll region still set and the transcript still on the screen, the
  // two notices landed on top of the chat and the caller sat there
  // (2026-09-07 22:59, screenshot: "leave me hanging like this"). Now: the
  // terminal is put back the way the chat found it, the screen is cleared,
  // one line says the chat is over, and the caller is taken to the prompt
  // directly - no pause in between, nothing to press.
  const userSession = userSessions.get(String(page.userId));
  if (userSession) {
    cancelSendHint(userSession);
    delete (userSession as BBSSession & { chatPendingLines?: string[] }).chatPendingLines;
    userSession.subState = LoggedOnSubState.READ_COMMAND;
    userSession.menuPause = false;
    userSession.inputBuffer = '';
    delete userSession.tempData?.pageId;
  }
  const reach = emitterForUserId(page.userId, io);
  if (!reach) {
console.log(`[Operator Chat] Page ${pageId}: chat ended but no emitter reaches user ${page.userId}`);
    return;
  }
  // Whatever was still being typed to the caller finishes first.
  try { await ((chatSession as any).delivery ?? Promise.resolve()); } catch { /* logged where it happened */ }
  // express.e:6049-6062: attributes off, the EndChat screen or "Ending Chat.".
  reach.emitter.emit('ansi-output', '\x1b[0m');
  let shown = false;
  if (userSession) {
    try {
      const { displayScreen } = require('./screen.handler');
      shown = Boolean(await displayScreen(reach.emitter, userSession, 'EndChat', false, true));
    } catch (err) {
console.log(`[Operator Chat] Page ${pageId}: EndChat screen not shown (${(err as Error).message}); using the built-in line`);
    }
  }
  reach.emitter.emit('ansi-output', (shown ? '' : '\r\n\r\nEnding Chat.') + '\r\n');
  // chat() returns into the input loop; the caller is back at the prompt.
  if (userSession) {
    try {
      const { displayMenuPrompt } = require('./command-handler/menu');
      displayMenuPrompt(reach.emitter, userSession);
    } catch (err) {
console.error(`[Operator Chat] Page ${pageId}: could not draw the prompt after the chat:`, err);
    }
  }
}

/**
 * Log chat transcript to SysLogs
 */
async function logChatTranscript(repository: OperatorChatRepository, session: ChatSession): Promise<void> {
  const page = repository.getPageRequest(session.pageId);
  if (!page) return;

  const messages = repository.getChatMessages(session.pageId);
  const duration = Math.floor((getSystemTime().getTime() - session.startedAt.getTime()) / 1000);

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

  // A sysop's accept that was waiting for the caller to leave a door: theirs
  // first, and the bot does not take a page a human has claimed.
  for (const [pageId, queued] of pendingSysopAccepts) {
    const page = repository.getPageRequest(pageId);
    if (!page || page.status !== PageStatus.PENDING || now - queued.at > QUEUED_ACCEPT_TTL_MS) {
      pendingSysopAccepts.delete(pageId);
      if (page?.status === PageStatus.PENDING) {
console.log(`[Operator Chat] Page ${pageId}: ${queued.sysopHandle}'s queued accept lapsed after ${Math.round(QUEUED_ACCEPT_TTL_MS / 60000)} minutes`);
      }
      continue;
    }
    const callerSession = userSessions.get(String(page.userId));
    if (!callerSession || !callerCanBeInterrupted(callerSession)) continue;
    pendingSysopAccepts.delete(pageId);
console.log(`[Operator Chat] Page ${pageId}: ${page.userHandle} is back at a prompt - opening ${queued.sysopHandle}'s chat`);
    await acceptPage(io, repository, pageId, queued.sysopId, queued.sysopHandle, queued.sysopSessionId);
  }

  for (const page of pending) {
    const elapsed = now - page.createdAt.getTime();
    const timeoutMs = config.pageTimeout * 1000;
console.log(`[Operator Chat] Page ${page.id}: elapsed=${Math.floor(elapsed/1000)}s, timeout=${config.pageTimeout}s, willTimeout=${elapsed > timeoutMs}`);

    if (elapsed > timeoutMs) {
      // The normal path is the paging prompt's own end-of-wait (handlePageSysop);
      // this is the retry for a page that outlived it - the caller left the
      // prompt for a door, or the process that ran the prompt restarted.
      await activateGrumpyBot(io, repository, page.id, `${Math.floor(elapsed / 1000)}s pending`);
    }
  }
}

/**
 * Can a chat begin on this caller RIGHT NOW?
 *
 * express.e answers this structurally: a chat starts inside readChar, so it
 * can only ever begin where the board is reading the caller's keyboard. Here a
 * door owns the keyboard (`doorInputHandler`, socket-handlers.ts routes every
 * keystroke to it) and the screen; a chat begun underneath it is painted over
 * and never typed into. So the takeover waits for the door to give the caller
 * back, and `checkPageTimeouts` retries every second until it has.
 */
function callerCanBeInterrupted(session: BBSSession | null | undefined): boolean {
  if (!session) return false;
  if (session.doorInputHandler) return false;
  if ((session as any).inDoorManager) return false;
  return session.subState !== LoggedOnSubState.DOOR_RUNNING;
}

/**
 * A sysop said yes while the caller was inside a door: the accept waits here
 * until they are back at a prompt. Kept in memory - a restart drops it, and
 * the caller's page is still pending for the bot or for another accept.
 */
interface QueuedAccept { sysopId: string; sysopHandle: string; sysopSessionId: string; at: number }
const pendingSysopAccepts = new Map<string, QueuedAccept>();
/** How long a queued accept waits for a caller to leave a door before it lapses. */
const QUEUED_ACCEPT_TTL_MS = 15 * 60 * 1000;

/** Pages whose takeover was logged as deferred, so the retry does not log once a second. */
const deferredTakeovers = new Set<string>();
/** Pages whose takeover is in progress, so the prompt's end and the retry cannot both accept. */
const takeoversInFlight = new Set<string>();

/**
 * GrumpyBot takes a pending page - if the caller can be reached and interrupted.
 *
 * Returns true when the bot now holds the page. Returns false, and says why in
 * the log, when it does not: the caller is inside a door (the retry will come
 * back), or has no live session at all.
 */
async function activateGrumpyBot(
  io: any,
  repository: OperatorChatRepository,
  pageId: string,
  reason: string
): Promise<boolean> {
  const page = repository.getPageRequest(pageId);
  if (!page || page.status !== PageStatus.PENDING) return page?.sysopId === 'bot';
  if (takeoversInFlight.has(pageId)) return false;
  // A human said yes and is waiting for this caller to leave a door; the
  // co-sysop does not take the page out from under them.
  if (pendingSysopAccepts.has(pageId)) return false;

  // The caller's session, by user id; the socket room is the fallback for a
  // session the map has lost.
  let userSession = userSessions.get(String(page.userId)) || null;
  if (!userSession) {
    const userSocketsFromRoom = Array.from(io.sockets?.adapter?.rooms?.get(`user:${page.userId}`) || []);
    for (const socketId of userSocketsFromRoom as string[]) {
      // TP-10: the one module that holds the io namespace's socket map.
      const sock = socketIoSocketFor(socketId, io);
      if (sock && (sock as any).session) {
        userSession = (sock as any).session;
        break;
      }
    }
  }

  if (!userSession) {
    if (!deferredTakeovers.has(pageId)) {
      deferredTakeovers.add(pageId);
console.log(`[Operator Chat] Page ${pageId} (${page.userHandle}@Node${page.nodeId}): GrumpyBot cannot take it - no live session for user ${page.userId}. Retrying every second.`);
    }
    return false;
  }
  if (!callerCanBeInterrupted(userSession)) {
    if (!deferredTakeovers.has(pageId)) {
      deferredTakeovers.add(pageId);
console.log(`[Operator Chat] Page ${pageId} (${page.userHandle}@Node${page.nodeId}): GrumpyBot deferred - caller is inside a door (subState=${userSession.subState}, doorInputHandler=${Boolean(userSession.doorInputHandler)}). Retrying every second until they are back.`);
    }
    return false;
  }

  takeoversInFlight.add(pageId);
  try {
    if (deferredTakeovers.delete(pageId)) {
console.log(`[Operator Chat] Page ${pageId}: caller is back at a prompt (subState=${userSession.subState}); GrumpyBot takes it now.`);
    }
console.log(`[Operator Chat] Page ${pageId}: ${reason} - GrumpyBot takes it`);

    // WHO ANSWERS THIS PAGE: the caller's choice -> board default -> Kevin, rolled once and pinned by handle (s.2).
    const persona = personaForPage(page, repository);
    await acceptPage(io, repository, pageId, 'bot', persona.handle, 'grumpy-bot-session');

    const chatSession = activeChatSessions.get(pageId);
    if (!chatSession) {
console.log(`[Operator Chat] WARNING: No chat session found to mark as bot-controlled for page ${pageId}`);
    }

    // Notify admin pages about the bot-controlled chat so the sysop can take over
    io.emit('operator:bot-activated', {
      pageId,
      userHandle: page.userHandle,
      userNodeId: page.nodeId,
      startedAt: Date.now(),
    });

    // The opening line is the bot's first MESSAGE: saved, shown to the admin,
    // typed to the caller, and in the bot's own memory of the conversation -
    // not a caption in the layout. It goes out through the same path as
    // every reply, with the caller's lines queued behind it meanwhile.
    if (chatSession) {
      // The board card: what this board is and who this caller is, read
      // from the board once now, carried on the chat, in every prompt.
      try {
        (chatSession as any).boardCard = await buildBoardCard(userSession);
      } catch (err) {
console.log(`[Operator Chat] Page ${pageId}: no board card (${(err as Error).message})`);
      }
      const intro = getGrumpyBotIntroMessage(persona.handle);
      (chatSession as any).isBotControlled = true;
      (chatSession as any).botMessageHistory = [{ role: 'bot', content: intro }];
      (chatSession as any).botBusy = true;
      (chatSession as any).personaHandle = persona.handle;
      const accepted = repository.getPageRequest(pageId) ?? page;
      void sendBotMessageWithTyping(io, repository, pageId, intro, accepted.nodeId, accepted, aiConfigFrom(repository.getConfig(), persona))
        .catch((err) => console.error(`[Operator Chat] Page ${pageId}: the bot's opening line failed:`, err))
        .finally(() => {
          (chatSession as any).botBusy = false;
          processBotQueue(io, repository, pageId, chatSession as any);
        });
    }
    return repository.getPageRequest(pageId)?.sysopId === 'bot';
  } finally {
    takeoversInFlight.delete(pageId);
  }
}

/**
 * Check if in quiet hours
 */
function isQuietHours(config: OperatorChatConfig): boolean {
  if (!config.quietHours.enabled) return false;

  const now = getSystemTime();
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

  let chatSession: ChatSession | null | undefined = activeChatSessions.get(pageId);
  if (!chatSession) {
    // activeChatSessions is memory, and the board restarts on every deploy
    // - eight times on the night of 2026-09-06. A page the bot had taken
    // is still `accepted` by `bot` in the DB, but its session was gone, so
    // every line the caller typed after the restart hit this branch and
    // vanished: "neither the openrouter ai or the grumpy sysop answers".
    // The row has everything the session needs; rebuild it here.
    chatSession = reviveBotChat(repository, pageId);
    if (!chatSession) {
console.error(`[Operator Chat] Chat session not found: ${pageId}`);
      return;
    }
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
 * A bot-held chat, rebuilt from its DB row after the process that held it
 * in memory has gone. Returns null for anything that is not a live bot
 * chat - a human sysop's chat cannot be revived, because the human's
 * socket is what made it one.
 */
function reviveBotChat(repository: OperatorChatRepository, pageId: string): ChatSession | null {
  const page = repository.getPageRequest(pageId);
  if (!page || page.status !== PageStatus.ACCEPTED || page.sysopId !== 'bot') return null;

  const chatSession: ChatSession = {
    pageId,
    userId: page.userId,
    userHandle: page.userHandle,
    userNodeId: page.nodeId,
    sysopId: 'bot',
    sysopHandle: page.sysopHandle || botName(repository),
    sysopSessionId: 'grumpy-bot-session',
    startedAt: page.acceptedAt ? new Date(page.acceptedAt) : getSystemTime(),
    lastActivity: getSystemTime(),
    messages: repository.getChatMessages(pageId),
    isTyping: { user: false, sysop: false }
  };
  (chatSession as any).isBotControlled = true;
  (chatSession as any).botMessageHistory = [];
  (chatSession as any).personaHandle = chatSession.sysopHandle;
  activeChatSessions.set(pageId, chatSession);
  const revivedCaller = userSessions.get(String(page.userId));
  if (revivedCaller) {
    void buildBoardCard(revivedCaller).then((card) => { (chatSession as any).boardCard = card; }).catch(() => undefined);
  }
console.log(`[Operator Chat] Revived bot chat ${pageId} from its DB row after a restart`);
  return chatSession;
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

  // endChat clears the screen, says the chat is over and takes the caller to
  // the prompt; a second notice here landed on top of it.
  await endChat(io, repository, pageId);
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
  pendingSysopAccepts.delete(pageId);

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
