/**
 * Messaging Handler
 * Handles full message reading and writing functionality
 * 1:1 port from AmiExpress express.e message commands
 */

import { BBSSession, LoggedOnSubState } from '../index';
import { checkSecurity } from '../utils/acs.util';
import { ACSCode } from '../constants/acs-codes';
import { EnvStat } from '../constants/env-codes';
import { AnsiUtil } from '../utils/ansi.util';
import { ErrorHandler } from '../utils/error-handling.util';

// Dependencies (injected)
let _setEnvStat: any;
let _messages: any[] = [];
let _getMailStatFile: any;
let _loadMsgPointers: any;
let _validatePointers: any;
let _updateReadPointer: any;

/**
 * Dependency injection setter
 */
export function setMessagingDependencies(deps: {
  setEnvStat: any;
  messages: any[];
  getMailStatFile: any;
  loadMsgPointers: any;
  validatePointers: any;
  updateReadPointer: any;
}) {
  _setEnvStat = deps.setEnvStat;
  _messages = deps.messages;
  _getMailStatFile = deps.getMailStatFile;
  _loadMsgPointers = deps.loadMsgPointers;
  _validatePointers = deps.validatePointers;
  _updateReadPointer = deps.updateReadPointer;
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
  if (!checkSecurity(session, ACSCode.READ_MESSAGE)) {
    ErrorHandler.permissionDenied(socket, 'read messages', {
      nextState: LoggedOnSubState.DISPLAY_CONF_BULL
    });
    return;
  }

  // Set environment status - express.e:25520
  _setEnvStat(session, EnvStat.MAIL);

  console.log('[ENV] Mail');

  // Load message pointers - express.e:25523
  const mailStat = await _getMailStatFile(session.currentConf, session.currentMsgBase);
  const confBase = await _loadMsgPointers(session.user.id, session.currentConf, session.currentMsgBase);

  // Validate pointers against boundaries - express.e:5037-5049
  const validatedConfBase = _validatePointers(confBase, mailStat);
  session.lastMsgReadConf = validatedConfBase.lastMsgReadConf;
  session.lastNewReadConf = validatedConfBase.lastNewReadConf;

  // Get messages for current conference and message base - sorted by ID (message number)
  const currentMessages = _messages.filter((msg: any) =>
    msg.conferenceId === session.currentConf &&
    msg.messageBaseId === session.currentMsgBase &&
    (!msg.isPrivate || msg.toUser === session.user?.username || msg.author === session.user?.username)
  ).sort((a: any, b: any) => a.id - b.id); // Sort by message number

  if (currentMessages.length === 0) {
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.colorize('No messages in this area.', 'yellow'));
    socket.emit('ansi-output', '\r\n\r\n');
    socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    return;
  }

  // Initialize message reader state
  session.tempData = session.tempData || {};
  session.tempData.msgReaderMessages = currentMessages;
  session.tempData.msgReaderIndex = 0;
  session.tempData.msgReaderHighestRead = session.lastMsgReadConf;

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

  // Update current index
  session.tempData.msgReaderIndex = messageIndex;

  // Clear screen - express.e:8891
  socket.emit('ansi-output', '\x1b[2J\x1b[H');

  // Display message header - express.e:8898-8936
  const isNew = msg.id > session.lastNewReadConf;
  const newIndicator = isNew ? AnsiUtil.colorize('[NEW] ', 'yellow') : '';
  const privateIndicator = msg.isPrivate ? AnsiUtil.colorize('[PRIVATE] ', 'red') : '';
  const replyIndicator = msg.parentId ? AnsiUtil.colorize('[REPLY] ', 'magenta') : '';

  socket.emit('ansi-output', AnsiUtil.colorize(`Date   : `, 'green'));
  socket.emit('ansi-output', `${msg.timestamp.toLocaleString()}   `);
  socket.emit('ansi-output', AnsiUtil.colorize(`Number: `, 'green'));
  socket.emit('ansi-output', `${msg.id}\r\n`);

  socket.emit('ansi-output', AnsiUtil.colorize(`To     : `, 'green'));
  socket.emit('ansi-output', `${msg.isPrivate ? msg.toUser : 'ALL'}  `);
  socket.emit('ansi-output', AnsiUtil.colorize(`Recv'd: `, 'green'));
  socket.emit('ansi-output', `${msg.isPrivate ? 'No' : 'N/A'}\r\n`);

  socket.emit('ansi-output', AnsiUtil.colorize(`From   : `, 'green'));
  socket.emit('ansi-output', `${msg.author}   `);
  socket.emit('ansi-output', AnsiUtil.colorize(`Status: `, 'green'));
  socket.emit('ansi-output', `${msg.isPrivate ? 'Private Message' : 'Public Message'}\r\n`);

  socket.emit('ansi-output', AnsiUtil.colorize(`Subject: `, 'green'));
  socket.emit('ansi-output', `${newIndicator}${privateIndicator}${replyIndicator}${msg.subject}\r\n`);
  socket.emit('ansi-output', '\r\n');

  // Display message body - express.e:8965-8969
  socket.emit('ansi-output', `${msg.body}\r\n`);
  socket.emit('ansi-output', '\r\n');

  // Update highest read pointer
  if (msg.id > session.tempData.msgReaderHighestRead) {
    session.tempData.msgReaderHighestRead = msg.id;
  }

  // Display navigation prompt - express.e:11009-11036
  displayMessageNavigationPrompt(socket, session);
}

/**
 * Display message navigation prompt
 * From express.e:11000-11036
 */
function displayMessageNavigationPrompt(socket: any, session: BBSSession): void {
  const messages = session.tempData.msgReaderMessages;
  const currentIndex = session.tempData.msgReaderIndex;
  const currentMsg = messages[currentIndex];
  const nextMsgNum = currentIndex < messages.length - 1 ? messages[currentIndex + 1].id : 'End';

  // Display simple navigation menu - express.e:11009
  socket.emit('ansi-output', AnsiUtil.colorize('A', 'yellow'));
  socket.emit('ansi-output', AnsiUtil.colorize('>', 'green'));
  socket.emit('ansi-output', AnsiUtil.colorize('gain', 'cyan'));

  if (checkSecurity(session, ACSCode.DELETE_MESSAGE)) {
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.colorize('D', 'yellow'));
    socket.emit('ansi-output', AnsiUtil.colorize('>', 'green'));
    socket.emit('ansi-output', AnsiUtil.colorize('elete Message', 'cyan'));
  }

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.colorize('R', 'yellow'));
  socket.emit('ansi-output', AnsiUtil.colorize('>', 'green'));
  socket.emit('ansi-output', AnsiUtil.colorize('eply', 'cyan'));

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.colorize('L', 'yellow'));
  socket.emit('ansi-output', AnsiUtil.colorize('>', 'green'));
  socket.emit('ansi-output', AnsiUtil.colorize('ist', 'cyan'));

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.colorize('Q', 'yellow'));
  socket.emit('ansi-output', AnsiUtil.colorize('>', 'green'));
  socket.emit('ansi-output', AnsiUtil.colorize('uit', 'cyan'));

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.colorize('<CR>', 'green'));
  socket.emit('ansi-output', AnsiUtil.colorize('=', 'white'));
  socket.emit('ansi-output', AnsiUtil.colorize('Next ', 'yellow'));
  socket.emit('ansi-output', AnsiUtil.colorize('( ', 'green'));
  socket.emit('ansi-output', `${nextMsgNum}`);
  socket.emit('ansi-output', AnsiUtil.colorize(' )', 'green'));
  socket.emit('ansi-output', ' >: ');

  // Set state for input
  session.subState = 'MSG_READER_NAV';
}

/**
 * Handle message reader navigation input
 * From express.e:11040-11210
 */
export async function handleMessageReaderNav(socket: any, session: BBSSession, input: string): Promise<void> {
  const command = input.trim().toUpperCase();
  const messages = session.tempData.msgReaderMessages;
  const currentIndex = session.tempData.msgReaderIndex;

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
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.headerBox('Reply to Message'));
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.colorize('To: ', 'green'));
    socket.emit('ansi-output', `${msg.author}\r\n`);
    socket.emit('ansi-output', AnsiUtil.colorize('Re: ', 'green'));
    socket.emit('ansi-output', `${msg.subject}\r\n`);
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', 'Enter your reply (or press Enter to cancel):\r\n');
    socket.emit('ansi-output', AnsiUtil.colorize('Subject: ', 'green'));

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

  // D - Delete message - express.e:11119-11131
  if (command === 'D' && checkSecurity(session, ACSCode.DELETE_MESSAGE)) {
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.warningLine('Message deletion not yet implemented'));
    socket.emit('ansi-output', '\r\n');
    await displaySingleMessage(socket, session, currentIndex);
    return;
  }

  // Invalid command
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', 'No such command!!\r\n');
  await displaySingleMessage(socket, session, currentIndex);
}

/**
 * List all messages in current message base
 * From express.e:11197-11199 (calls listMSGs)
 */
async function listAllMessages(socket: any, session: BBSSession): Promise<void> {
  const messages = session.tempData.msgReaderMessages;

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.headerBox('Message List'));
  socket.emit('ansi-output', '\r\n');

  messages.forEach((msg: any, index: number) => {
    const isNew = msg.id > session.lastNewReadConf;
    const newIndicator = isNew ? AnsiUtil.colorize('[NEW] ', 'yellow') : '';
    const privateIndicator = msg.isPrivate ? AnsiUtil.colorize('[P] ', 'red') : '';

    socket.emit('ansi-output', `${String(msg.id).padStart(4)} `);
    socket.emit('ansi-output', `${msg.author.substring(0, 20).padEnd(20)} `);
    socket.emit('ansi-output', `${newIndicator}${privateIndicator}${msg.subject.substring(0, 40)}\r\n`);
  });

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());

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

  socket.emit('ansi-output', '\r\n');
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
  if (!checkSecurity(session, ACSCode.ENTER_MESSAGE)) {
    ErrorHandler.permissionDenied(socket, 'post messages', {
      nextState: LoggedOnSubState.DISPLAY_CONF_BULL
    });
    return;
  }

  // Set environment status - express.e:24862
  _setEnvStat(session, EnvStat.MAIL);

  console.log('[ENV] Mail');

  // Start private message posting workflow
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.headerBox('Post Private Message'));
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', `Conference: ${session.currentConfName}\r\n`);
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', 'Enter recipient username (or press Enter to abort):\r\n');
  socket.emit('ansi-output', AnsiUtil.colorize('To: ', 'green'));

  // Clear input buffer and set up for line-based input
  session.inputBuffer = '';
  session.tempData = { isPrivate: true };
  session.subState = LoggedOnSubState.POST_MESSAGE_SUBJECT;
}
