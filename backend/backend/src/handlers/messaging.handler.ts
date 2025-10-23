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
 * Original: express.e:25518-25531
 *
 * Full message reader with pointer tracking, new message indicators, and navigation.
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

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.headerBox('Message Reader'));
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', `Conference: ${session.currentConfName}\r\n`);
  socket.emit('ansi-output', '\r\n');

  // Get messages for current conference and message base - sorted by ID (message number)
  const currentMessages = _messages.filter((msg: any) =>
    msg.conferenceId === session.currentConf &&
    msg.messageBaseId === session.currentMsgBase &&
    (!msg.isPrivate || msg.toUser === session.user?.username || msg.author === session.user?.username)
  ).sort((a: any, b: any) => a.id - b.id); // Sort by message number

  if (currentMessages.length === 0) {
    socket.emit('ansi-output', AnsiUtil.colorize('No messages in this area.', 'yellow'));
    socket.emit('ansi-output', '\r\n');
  } else {
    // Count unread based on lastNewReadConf pointer (not lastLogin)
    const unreadCount = currentMessages.filter((msg: any) =>
      msg.id > session.lastNewReadConf
    ).length;

    socket.emit('ansi-output', AnsiUtil.colorize('Total messages: ', 'cyan'));
    socket.emit('ansi-output', `${currentMessages.length} `);
    if (unreadCount > 0) {
      socket.emit('ansi-output', AnsiUtil.colorize(`(${unreadCount} new)`, 'yellow'));
    }
    socket.emit('ansi-output', '\r\n\r\n');

    // Track highest message number viewed for pointer update
    let highestMsgRead = session.lastMsgReadConf;

    currentMessages.forEach((msg: any, index: number) => {
      // Mark message as [NEW] if > lastNewReadConf pointer
      const isNew = msg.id > session.lastNewReadConf;
      const newIndicator = isNew ? AnsiUtil.colorize('[NEW] ', 'yellow') : '';
      const privateIndicator = msg.isPrivate ? AnsiUtil.colorize('[PRIVATE] ', 'red') : '';
      const replyIndicator = msg.parentId ? AnsiUtil.colorize('[REPLY] ', 'magenta') : '';

      socket.emit('ansi-output', AnsiUtil.colorize(`Message ${index + 1} of ${currentMessages.length} (Msg #${msg.id})`, 'cyan'));
      socket.emit('ansi-output', '\r\n');
      socket.emit('ansi-output', `${newIndicator}${privateIndicator}${replyIndicator}${msg.subject}\r\n`);
      socket.emit('ansi-output', AnsiUtil.colorize('From: ', 'green'));
      socket.emit('ansi-output', `${msg.author}\r\n`);

      if (msg.isPrivate && msg.toUser) {
        socket.emit('ansi-output', AnsiUtil.colorize('To: ', 'green'));
        socket.emit('ansi-output', `${msg.toUser}\r\n`);
      }

      socket.emit('ansi-output', AnsiUtil.colorize('Date: ', 'green'));
      socket.emit('ansi-output', `${msg.timestamp.toLocaleString()}\r\n`);
      socket.emit('ansi-output', '\r\n');
      socket.emit('ansi-output', `${msg.body}\r\n`);
      socket.emit('ansi-output', '\r\n');

      if (msg.attachments && msg.attachments.length > 0) {
        socket.emit('ansi-output', AnsiUtil.colorize('Attachments: ', 'cyan'));
        socket.emit('ansi-output', `${msg.attachments.join(', ')}\r\n`);
        socket.emit('ansi-output', '\r\n');
      }

      socket.emit('ansi-output', AnsiUtil.colorize('-'.repeat(60), 'cyan'));
      socket.emit('ansi-output', '\r\n');

      // Update lastMsgReadConf to highest message viewed
      if (msg.id > highestMsgRead) {
        highestMsgRead = msg.id;
      }
    });

    // Update and save read pointer - express.e:11985+ readMSG logic
    if (highestMsgRead > session.lastMsgReadConf) {
      session.lastMsgReadConf = highestMsgRead;
      await _updateReadPointer(session.user.id, session.currentConf, session.currentMsgBase, highestMsgRead);
    }
  }

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());

  // Set menuPause=FALSE so menu doesn't display immediately (AmiExpress behavior)
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL; // Wait for key press
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
