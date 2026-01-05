/**
 * Messaging Handler
 * Handles full message reading and writing functionality
 * 1:1 port from AmiExpress express.e message commands
 */

import { BBSSession } from '../../index';
import { LoggedOnSubState } from '../../constants/bbs-states';
import { checkSecurity } from '../../utils/acs.util';
import { ACSPermission } from '../../constants/acs-permissions';
import { EnvStat } from '../../constants/env-codes';
import { AnsiUtil } from '../../utils/ansi.util';
import { ErrorHandler } from '../../utils/error-handling.util';
import { finalizeCommand } from '../../utils/command-response.util';
import { messageIndexManager } from '../../services/MessageIndexManager';
import { emitText, emitPrompt, emitLine, flushOutput } from '../../utils/output.util';
import { getAllMessageIds, readMessageFile } from '../../utils/message-file.util';
import { config } from '../../config';

// Dependencies (injected)
let _db: any;
let _callersLog: any;
let _setEnvStat: any;

// Helper functions for database operations
async function _deleteMessage(messageId: number): Promise<void> {
  await _db.deleteMessage(messageId);
}

async function _updateReadPointer(userId: number, confId: number, msgBaseId: number, lastRead: number): Promise<void> {
  await _db.updateReadPointer(userId, confId, msgBaseId, lastRead);
}

/**
 * Dependency injection setter
 */
export function setMessagingDependencies(deps: {
  db?: any;
  callersLog?: any;
  setEnvStat?: any;
  messages?: any;
  getMailStatFile?: any;
  loadMsgPointers?: any;
  validatePointers?: any;
  updateReadPointer?: any;
}) {
  if (deps.db) _db = deps.db;
  if (deps.callersLog) _callersLog = deps.callersLog;
  if (deps.setEnvStat) _setEnvStat = deps.setEnvStat;
  // Note: other deps (messages, getMailStatFile, etc.) not used yet but accepted for future use
}

/**
 * R Command: Read Messages (internalCommandR)
 * Original: express.e:25518-25531, 11000-11250
 *
 * Interactive message reader with one-at-a-time navigation.
 * Implements Phase 9 (ACS) and Phase 10 (Message Pointers) enhancements.
 */
export async function handleReadMessagesFullCommand(
  socket: any,
  session: BBSSession,
  params: string = ''
): Promise<void> {
  // Check security permission - express.e:25519
  if (!checkSecurity(session.user, ACSPermission.READ_MESSAGE)) {
    ErrorHandler.permissionDenied(socket, 'read messages', {
      nextState: LoggedOnSubState.DISPLAY_CONF_BULL
    });
    return;
  }

console.log('[ENV] Mail - Read');

  // Get messages from DISK (AmiExpress format)
  // Database is only for web UI/search, not for BBS message reading
  const confId = session.currentConf || 1;
  const msgBaseId = session.currentMsgBase || 1;
  const bbsDataPath = config.get('dataDir');
  const username = session.user?.username.toLowerCase();

  // Get all message IDs from disk
  const messageIds = await getAllMessageIds(confId, bbsDataPath);
  const messages: any[] = [];

  // Read each message from disk
  for (const msgNum of messageIds) {
    const message = await readMessageFile(confId, msgNum, bbsDataPath);
    if (!message) {
      continue; // Skip corrupted/missing files
    }

    // Filter by privacy: show public messages and private messages to/from this user
    if (!message.isPrivate) {
      // Public message - show to everyone
      messages.push({
        id: msgNum,
        msgNumber: msgNum,
        subject: message.subject,
        body: message.body,
        author: message.from,
        toUser: message.to,
        timestamp: new Date(message.date), // Parse DD-MMM-YY HH:MM:SS format
        isPrivate: false
      });
    } else if (username &&
               (message.to.toLowerCase() === username ||
                message.from.toLowerCase() === username)) {
      // Private message to or from this user
      messages.push({
        id: msgNum,
        msgNumber: msgNum,
        subject: message.subject,
        body: message.body,
        author: message.from,
        toUser: message.to,
        timestamp: new Date(message.date),
        isPrivate: true
      });
    }
  }

  if (messages.length === 0) {
    emitText(socket, '\r\n');
    emitText(socket, AnsiUtil.colorize('No messages in this area.', 'yellow'));
    emitText(socket, '\r\n\r\n');
    finalizeCommand(socket, session, 'No messages to read');
    return;
  }

  // Initialize message reader state
  session.tempData = session.tempData || {};
  session.tempData.msgReaderMessages = messages;
  session.tempData.msgReaderIndex = 0;
    session.tempData.msgReaderHighestRead = session.lastMsgReadConf || 0;

  // Display first message
  await displaySingleMessage(socket, session, 0);
}

/**
 * Display a single message with navigation options
 * From express.e:8880-8970 (displayMessage) and express.e:11000-11250 (message navigation)
 */
async function displaySingleMessage(socket: any, session: BBSSession, messageIndex: number): Promise<void> {
  const messages = session.tempData.msgReaderMessages;
  const msg = messages[messageIndex];
  const msgNumber = (msg as any).msgNumber || msg.id;

  // Update current index
  session.tempData.msgReaderIndex = messageIndex;
  if (!session.tempData.msgReaderHighestRead || msgNumber > session.tempData.msgReaderHighestRead) {
    session.tempData.msgReaderHighestRead = msgNumber;
  }

  // Clear screen - express.e:8891
  emitText(socket, '\x1b[2J\x1b[H');

  // Display message header - express.e:8898-8936
  const isNew = msgNumber > (session.lastNewReadConf || 0);
  const newIndicator = isNew ? AnsiUtil.colorize('[NEW] ', 'yellow') : '';
  const privateIndicator = msg.isPrivate ? AnsiUtil.colorize('[PRIVATE] ', 'red') : '';
  const replyIndicator = msg.parentId ? AnsiUtil.colorize('[REPLY] ', 'magenta') : '';

  emitText(socket, AnsiUtil.colorize(`Date   : `, 'green'));
  emitText(socket, `${msg.timestamp.toLocaleString()}   `);
  emitText(socket, AnsiUtil.colorize(`Number: `, 'green'));
  emitText(socket, `${msg.id}\r\n`);

  emitText(socket, AnsiUtil.colorize(`To     : `, 'green'));
  emitText(socket, `${msg.isPrivate ? msg.toUser : 'ALL'}  `);
  emitText(socket, AnsiUtil.colorize(`Recv'd: `, 'green'));
  emitText(socket, `${msg.isPrivate ? 'No' : 'N/A'}\r\n`);

  emitText(socket, AnsiUtil.colorize(`From   : `, 'green'));
  emitText(socket, `${msg.author}   `);
  emitText(socket, AnsiUtil.colorize(`Status: `, 'green'));
  emitText(socket, `${msg.isPrivate ? 'Private Message' : 'Public Message'}\r\n`);

  emitText(socket, AnsiUtil.colorize(`Subject: `, 'green'));
  emitText(socket, `${newIndicator}${privateIndicator}${replyIndicator}${msg.subject}\r\n`);
  emitText(socket, '\r\n');

  // Display message body - express.e:8965-8969
  emitText(socket, `${msg.body}\r\n`);
  emitText(socket, '\r\n');

  // Update highest read pointer
  if (msg.id > session.tempData.msgReaderHighestRead) {
    session.tempData.msgReaderHighestRead = msg.id;
  }

  // Display navigation prompt - express.e:11009-11036
  displayMessageNavigationPrompt(socket, session);
}

/**
 * Display short help menu (helplist=1)
 * From express.e:11009-11017
 */
function displayShortHelp(socket: any, session: BBSSession): void {
  const messages = session.tempData.msgReaderMessages;
  const currentIndex = session.tempData.msgReaderIndex;
  const nextMsgNum = currentIndex < messages.length - 1 ? messages[currentIndex + 1].id : 'End';

  emitText(socket, AnsiUtil.colorize('A', 'yellow'));
  emitText(socket, AnsiUtil.colorize('>', 'green'));
  emitText(socket, AnsiUtil.colorize('gain', 'cyan'));
  emitText(socket, '\r\n');

  if (checkSecurity(session.user, ACSPermission.DELETE_MESSAGE)) {
    emitText(socket, AnsiUtil.colorize('D', 'yellow'));
    emitText(socket, AnsiUtil.colorize('>', 'green'));
    emitText(socket, AnsiUtil.colorize('elete Message', 'cyan'));
    emitText(socket, '\r\n');
  }

  emitText(socket, AnsiUtil.colorize('F', 'yellow'));
  emitText(socket, AnsiUtil.colorize('>', 'green'));
  emitText(socket, AnsiUtil.colorize('orward', 'cyan'));
  emitText(socket, '\r\n');

  emitText(socket, AnsiUtil.colorize('R', 'yellow'));
  emitText(socket, AnsiUtil.colorize('>', 'green'));
  emitText(socket, AnsiUtil.colorize('eply', 'cyan'));
  emitText(socket, '\r\n');

  emitText(socket, AnsiUtil.colorize('L', 'yellow'));
  emitText(socket, AnsiUtil.colorize('>', 'green'));
  emitText(socket, AnsiUtil.colorize('ist', 'cyan'));
  emitText(socket, '\r\n');

  emitText(socket, AnsiUtil.colorize('Q', 'yellow'));
  emitText(socket, AnsiUtil.colorize('>', 'green'));
  emitText(socket, AnsiUtil.colorize('uit', 'cyan'));
  emitText(socket, '\r\n');

  emitText(socket, AnsiUtil.colorize('<CR>', 'green'));
  emitText(socket, AnsiUtil.colorize('=', 'white'));
  emitText(socket, AnsiUtil.colorize('Next ', 'yellow'));
  emitText(socket, AnsiUtil.colorize('( ', 'green'));
  emitText(socket, `${nextMsgNum}`);
  emitText(socket, AnsiUtil.colorize(' )', 'green'));
  emitText(socket, ' >: ');

  session.subState = LoggedOnSubState.MSG_READER_NAV;
}

/**
 * Display full help menu (helplist=2)
 * From express.e:11018-11045
 */
function displayFullHelp(socket: any, session: BBSSession): void {
  const messages = session.tempData.msgReaderMessages;
  const currentIndex = session.tempData.msgReaderIndex;
  const nextMsgNum = currentIndex < messages.length - 1 ? messages[currentIndex + 1].id : 'End';

  emitText(socket, AnsiUtil.colorize('A', 'yellow'));
  emitText(socket, AnsiUtil.colorize('>', 'green'));
  emitText(socket, AnsiUtil.colorize('gain', 'cyan'));
  emitText(socket, '\r\n');

  if (checkSecurity(session.user, ACSPermission.DELETE_MESSAGE)) {
    emitText(socket, AnsiUtil.colorize('D', 'yellow'));
    emitText(socket, AnsiUtil.colorize('>', 'green'));
    emitText(socket, AnsiUtil.colorize('elete Message', 'cyan'));
    emitText(socket, '\r\n');
  }

  emitText(socket, AnsiUtil.colorize('F', 'yellow'));
  emitText(socket, AnsiUtil.colorize('>', 'green'));
  emitText(socket, AnsiUtil.colorize('orward', 'cyan'));
  emitText(socket, '\r\n');

  emitText(socket, AnsiUtil.colorize('R', 'yellow'));
  emitText(socket, AnsiUtil.colorize('>', 'green'));
  emitText(socket, AnsiUtil.colorize('eply', 'cyan'));
  emitText(socket, '\r\n');

  emitText(socket, AnsiUtil.colorize('L', 'yellow'));
  emitText(socket, AnsiUtil.colorize('>', 'green'));
  emitText(socket, AnsiUtil.colorize('ist all messages', 'cyan'));
  emitText(socket, '\r\n');

  emitText(socket, AnsiUtil.colorize('NS', 'yellow'));
  emitText(socket, AnsiUtil.colorize('>', 'green'));
  emitText(socket, AnsiUtil.colorize(' Non-stop mode', 'cyan'));
  emitText(socket, '\r\n');

  emitText(socket, AnsiUtil.colorize('K', 'yellow'));
  emitText(socket, AnsiUtil.colorize('>', 'green'));
  emitText(socket, AnsiUtil.colorize('eep and quit', 'cyan'));
  emitText(socket, '\r\n');

  emitText(socket, AnsiUtil.colorize('Q', 'yellow'));
  emitText(socket, AnsiUtil.colorize('>', 'green'));
  emitText(socket, AnsiUtil.colorize('uit', 'cyan'));
  emitText(socket, '\r\n');

  emitText(socket, AnsiUtil.colorize('<CR>', 'green'));
  emitText(socket, AnsiUtil.colorize('=', 'white'));
  emitText(socket, AnsiUtil.colorize('Next ', 'yellow'));
  emitText(socket, AnsiUtil.colorize('( ', 'green'));
  emitText(socket, `${nextMsgNum}`);
  emitText(socket, AnsiUtil.colorize(' )', 'green'));
  emitText(socket, ' >: ');

  session.subState = LoggedOnSubState.MSG_READER_NAV;
}

/**
 * Display message navigation prompt
 * From express.e:10992-11036
 * Default is compact format (helplist=0), use ? for short help, ?? for full help
 */
function displayMessageNavigationPrompt(socket: any, session: BBSSession): void {
  const messages = session.tempData.msgReaderMessages;
  const currentIndex = session.tempData.msgReaderIndex;
  const currentMsg = messages[currentIndex];
  const nextMsgNum = currentIndex < messages.length - 1 ? messages[currentIndex + 1].id : 'End';

  // Like express.e:10993-11000 - Compact format (helplist=0) is the DEFAULT
  emitText(socket, '\r\n');
  emitText(socket, AnsiUtil.colorize('Msg. Options: ', 'green'));
  emitText(socket, AnsiUtil.colorize('A', 'yellow'));

  if (checkSecurity(session.user, ACSPermission.DELETE_MESSAGE)) {
    emitText(socket, AnsiUtil.colorize(',', 'cyan'));
    emitText(socket, AnsiUtil.colorize('D', 'yellow'));
  }

  // Always show F,R,L,Q
  emitText(socket, AnsiUtil.colorize(',', 'cyan'));
  emitText(socket, AnsiUtil.colorize('F', 'yellow'));
  emitText(socket, AnsiUtil.colorize(',', 'cyan'));
  emitText(socket, AnsiUtil.colorize('R', 'yellow'));
  emitText(socket, AnsiUtil.colorize(',', 'cyan'));
  emitText(socket, AnsiUtil.colorize('L', 'yellow'));
  emitText(socket, AnsiUtil.colorize(',', 'cyan'));
  emitText(socket, AnsiUtil.colorize('Q', 'yellow'));
  emitText(socket, AnsiUtil.colorize(',', 'cyan'));
  emitText(socket, AnsiUtil.colorize('?', 'yellow'));
  emitText(socket, AnsiUtil.colorize(',', 'cyan'));
  emitText(socket, AnsiUtil.colorize('??', 'yellow'));
  emitText(socket, AnsiUtil.colorize(',', 'cyan'));
  emitText(socket, AnsiUtil.colorize('<', 'green'));
  emitText(socket, AnsiUtil.colorize('CR', 'yellow'));
  emitText(socket, AnsiUtil.colorize('>', 'green'));
  emitText(socket, ' ');
  emitText(socket, AnsiUtil.colorize('( ', 'green'));
  emitText(socket, `${nextMsgNum}`);
  emitText(socket, AnsiUtil.colorize(' )', 'green'));
  emitText(socket, ' >: ');

  // Set state for input
  session.subState = LoggedOnSubState.MSG_READER_NAV;
}

/**
 * Handle message reader navigation input
 * From express.e:11040-11210
 */
export async function handleMessageReaderNav(socket: any, session: BBSSession, input: string): Promise<void> {
  const command = input.trim().toUpperCase();
  const messages = session.tempData.msgReaderMessages;
  const currentIndex = session.tempData.msgReaderIndex;

  // ? - Short help (helplist=1) - express.e:11054-11056
  if (command === '?') {
    displayShortHelp(socket, session);
    return;
  }

  // ?? - Full help (helplist=2) - express.e:11051-11053
  if (command === '??') {
    displayFullHelp(socket, session);
    return;
  }

  // CR/Enter - Next message - express.e:11062
  if (command === '' || command === 'N') {
    if (currentIndex < messages.length - 1) {
      await displaySingleMessage(socket, session, currentIndex + 1);
    } else {
      // End of messages - save pointer and exit - express.e:11985
      await saveMessagePointerAndExit(socket, session);
    }
    return;
  }

  // A - Again (redisplay) - express.e:11064-11069
  if (command === 'A') {
    await displaySingleMessage(socket, session, currentIndex);
    return;
  }

  // R - Reply - express.e:11201-11209
  if (command === 'R') {
    const msg = messages[currentIndex];
    // Start reply workflow
    emitText(socket, '\r\n');
    emitText(socket, AnsiUtil.headerBox('Reply to Message'));
    emitText(socket, '\r\n');
    emitText(socket, AnsiUtil.colorize('To: ', 'green'));
    emitText(socket, `${msg.author}\r\n`);
    emitText(socket, AnsiUtil.colorize('Re: ', 'green'));
    emitText(socket, `${msg.subject}\r\n`);
    emitText(socket, '\r\n');
    emitText(socket, 'Enter your reply (or press Enter to cancel):\r\n');
    emitText(socket, AnsiUtil.colorize('Subject: ', 'green'));

    session.inputBuffer = '';
    session.tempData.replyToMsg = msg;
    session.subState = LoggedOnSubState.POST_MESSAGE_SUBJECT;
    return;
  }

  // L - List messages - express.e:11197-11199
  if (command === 'L') {
    await listAllMessages(socket, session);
    return;
  }

  // Q - Quit - express.e:11194-11196
  if (command === 'Q') {
    await saveMessagePointerAndExit(socket, session);
    return;
  }

  // F - Forward message - express.e:11178-11191, forwardMSG:9807-9871
  if (command === 'F') {
    const msg = messages[currentIndex];
    // Check if user can forward this message:
    // - Public messages (not private)
    // - Private messages to you
    // - Messages to ALL
    if (!msg.isPrivate || msg.toUser === session.user.username || msg.toUser === 'ALL') {
      // Store original message for forwarding
      session.tempData.forwardOriginalMessage = msg;
      session.tempData.forwardOriginalIndex = currentIndex;
      session.tempData.forwardData = {
        originalToUser: msg.toUser,
        originalSubject: msg.subject,
        canDeleteOriginal: msg.toUser === session.user.username && checkSecurity(session.user, ACSPermission.DELETE_MESSAGE)
      };

      // Prompt for recipient (express.e:9816-9821)
      emitText(socket, '\r\n');
      emitText(socket, '                       [32m([33m------------------------------[32m)[0m\r\n');
      emitPrompt(socket, '     [36mTo[33m: [32m([33mEnter[32m)[0m=[32m\'[33mALL[32m\'[32m?[0m ');

      session.subState = LoggedOnSubState.FORWARD_MESSAGE_TO;
    } else {
      emitText(socket, '\r\n');
      emitText(socket, 'Not your message.\r\n');
      await displaySingleMessage(socket, session, currentIndex);
    }
    return;
  }

  // D - Delete message - express.e:11113-11121
  if (command === 'D' && checkSecurity(session.user, ACSPermission.DELETE_MESSAGE)) {
    const msg = messages[currentIndex];

    // Check if user can delete: public message OR message addressed to user
    // Like express.e: (privateFlag=0) OR (toName matches username)
    if (!msg.isPrivate || msg.toUser === session.user.username || msg.toUser === 'ALL') {
      // Delete the message
      await _deleteMessage(msg.id);

      emitText(socket, '\r\n');
      emitText(socket, AnsiUtil.successLine('Message deleted'));
      emitText(socket, '\r\n');

      // Remove from reader's message list
      messages.splice(currentIndex, 1);
      session.tempData.msgReaderMessages = messages;

      // If there are no more messages, exit
      if (messages.length === 0) {
        emitText(socket, 'No more messages.\r\n');
        await saveMessagePointerAndExit(socket, session);
        return;
      }

      // Display next message, or previous if we deleted the last one
      const nextIndex = currentIndex < messages.length ? currentIndex : currentIndex - 1;
      await displaySingleMessage(socket, session, nextIndex);
    } else {
      // Not your message
      emitText(socket, '\r\n');
      emitText(socket, 'Not your message.\r\n');
      await displaySingleMessage(socket, session, currentIndex);
    }
    return;
  }

  // Invalid command
  emitText(socket, '\r\n');
  emitText(socket, 'No such command!!\r\n');
  await displaySingleMessage(socket, session, currentIndex);
}

/**
 * List all messages in current message base
 * From express.e:11197-11199 (calls listMSGs)
 */
async function listAllMessages(socket: any, session: BBSSession): Promise<void> {
  const messages = session.tempData.msgReaderMessages;

  emitText(socket, '\r\n');
  emitText(socket, AnsiUtil.headerBox('Message List'));
  emitText(socket, '\r\n');

  messages.forEach((msg: any, index: number) => {
    const msgNumber = msg.msgNumber || msg.id;
    const isNew = msgNumber > (session.lastNewReadConf || 0);
    const newIndicator = isNew ? AnsiUtil.colorize('[NEW] ', 'yellow') : '';
    const privateIndicator = msg.isPrivate ? AnsiUtil.colorize('[P] ', 'red') : '';

    emitText(socket, `${String(msgNumber).padStart(4)} `);
    emitText(socket, `${msg.author.substring(0, 20).padEnd(20)} `);
    emitText(socket, `${newIndicator}${privateIndicator}${msg.subject.substring(0, 40)}\r\n`);
  });

  emitText(socket, '\r\n');
  emitPrompt(socket, AnsiUtil.pressKeyPrompt());

  // Return to current message
  const currentIndex = session.tempData.msgReaderIndex;
  await displaySingleMessage(socket, session, currentIndex);
}

/**
 * Save message pointer and exit reader
 */
async function saveMessagePointerAndExit(socket: any, session: BBSSession): Promise<void> {
  const highestRead = session.tempData.msgReaderHighestRead;

  // Update and save read pointer - express.e:11985
  if (highestRead > session.lastMsgReadConf) {
    session.lastMsgReadConf = highestRead;
    await _updateReadPointer(session.user.id, session.currentConf, session.currentMsgBase, highestRead);
  }

  // Clean up temp data
  delete session.tempData.msgReaderMessages;
  delete session.tempData.msgReaderIndex;
  delete session.tempData.msgReaderHighestRead;

  emitText(socket, '\r\n');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
}

/**
 * E Command: Enter Message (internalCommandE)
 * Original: express.e:24860-24872
 *
 * Initiates private message posting workflow.
 * Prompts for recipient, subject, and message body using line-based input.
 */
export function handleEnterMessageFullCommand(
  socket: any,
  session: BBSSession,
  params: string = ''
): void {
  // Check security permission - express.e:24861
  if (!checkSecurity(session.user, ACSPermission.ENTER_MESSAGE)) {
    ErrorHandler.permissionDenied(socket, 'post messages', {
      nextState: LoggedOnSubState.DISPLAY_CONF_BULL
    });
    return;
  }

  // Set environment status - express.e:24862
  _setEnvStat(session, EnvStat.MAIL);

console.log('[ENV] Mail');

  // Start private message posting workflow
  emitText(socket, '\r\n');
  emitText(socket, AnsiUtil.headerBox('Post Private Message'));
  emitText(socket, '\r\n');
  emitText(socket, `Conference: ${session.currentConfName}\r\n`);
  emitText(socket, '\r\n');
  emitText(socket, 'Enter recipient username (or press Enter to abort):\r\n');
  emitText(socket, AnsiUtil.colorize('To: ', 'green'));

  // Clear input buffer and set up for line-based input
  session.inputBuffer = '';
  session.tempData = { isPrivate: true, messageEntry: {} };
  // IMPORTANT: Set state to POST_MESSAGE_TO (recipient input), NOT POST_MESSAGE_SUBJECT
  session.subState = LoggedOnSubState.POST_MESSAGE_TO;
}
