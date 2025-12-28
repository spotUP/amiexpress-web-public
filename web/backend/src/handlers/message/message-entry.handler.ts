/**
 * Message Entry Handler - Handles the E (Enter Message) command flow
 * 1:1 port from express.e:10749+ enterMSG()
 */

import { BBSSession } from '../../index';
import { AnsiUtil } from '../../utils/ansi.util';
import { LoggedOnSubState } from '../../constants/bbs-states';
import { ACSPermission } from '../../constants/acs-permissions';
import { checkSecurity } from '../../utils/security.util';
import { SysopDebugUtil, DebugSeverity } from '../../utils/sysop-debug.util';
import { writeMessageFile, formatMessageDate } from '../../utils/message-file.util';
import { config } from '../../config';


// Dependencies (injected from index.ts)
let _db: any;
let _callersLog: (userId: string | null, username: string, action: string, details?: string, nodeId?: number) => Promise<void>;

export function setMessageEntryDependencies(deps: {
  db: any;
  callersLog: typeof _callersLog;
}) {
  _db = deps.db;
  _callersLog = deps.callersLog;
}

/**
 * Handle recipient (To:) input - express.e:10771-10838
 */
export function handleMessageToInput(socket: any, session: BBSSession, input: string): void {
  const recipient = input.trim();

  // Blank = ALL (express.e:10793-10795)
  if (recipient === '') {
    session.tempData.messageEntry.toUser = 'ALL';
  } else {
    session.tempData.messageEntry.toUser = recipient;
  }

  socket.emit('ansi-output', '\r\n');
  promptForSubject(socket, session);
}

/**
 * Handle subject input - express.e:10839-10849
 */
export function handleMessageSubjectInput(socket: any, session: BBSSession, input: string): void {
  const subject = input.trim();

  // Blank = abort (express.e:10847-10849)
  if (subject === '') {
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.warningLine('Message entry aborted'));
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    session.tempData = undefined;
    return;
  }

  session.tempData.messageEntry.subject = subject;
  socket.emit('ansi-output', '\r\n');

  promptForPrivate(socket, session);
}

/**
 * Handle Private/Public input - express.e:10851-10864
 */
export function handleMessagePrivateInput(socket: any, session: BBSSession, input: string): void {
  const answer = input.trim().toUpperCase();

  // Y/YES = private, anything else = public
  session.tempData.messageEntry.isPrivate = (answer === 'Y' || answer === 'YES');

  socket.emit('ansi-output', '\r\n');
  promptForMessageBody(socket, session);
}

/**
 * Handle message body input - express.e:10898-10909 (edit function)
 */
export async function handleMessageBodyInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const line = input;

  // Empty line = end of message entry (express.e behavior)
  if (line.trim() === '') {
    await saveMessage(socket, session);
    return;
  }

  // Check for editor commands
  if (line.startsWith('/')) {
    const cmd = line.substring(1).toUpperCase();

    // /S = Save - express.e:10909 stat:=saveNewMSG()
    if (cmd === 'S' || cmd === 'SAVE') {
      await saveMessage(socket, session);
      return;
    }

    // /A = Abort
    if (cmd === 'A' || cmd === 'ABORT') {
      socket.emit('ansi-output', '\r\n');
      socket.emit('ansi-output', AnsiUtil.warningLine('Message entry aborted'));
      socket.emit('ansi-output', '\r\n');
      socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      session.tempData = undefined;
      return;
    }

    // /H = Help
    if (cmd === 'H' || cmd === 'HELP') {
      socket.emit('ansi-output', '\r\n');
      socket.emit('ansi-output', AnsiUtil.colorize('Editor Commands:', 'cyan') + '\r\n');
      socket.emit('ansi-output', `  ${AnsiUtil.colorize('/S', 'yellow')} - Save message\r\n`);
      socket.emit('ansi-output', `  ${AnsiUtil.colorize('/A', 'yellow')} - Abort message\r\n`);
      socket.emit('ansi-output', `  ${AnsiUtil.colorize('/C', 'yellow')} - Continue editing\r\n`);
      socket.emit('ansi-output', `  ${AnsiUtil.colorize('/D', 'yellow')} - Delete line\r\n`);
      socket.emit('ansi-output', `  ${AnsiUtil.colorize('/E', 'yellow')} - Edit line\r\n`);
      socket.emit('ansi-output', `  ${AnsiUtil.colorize('/F', 'yellow')} - Attach file\r\n`);
      socket.emit('ansi-output', `  ${AnsiUtil.colorize('/I', 'yellow')} - Insert line\r\n`);
      socket.emit('ansi-output', `  ${AnsiUtil.colorize('/L', 'yellow')} - List message\r\n`);
      socket.emit('ansi-output', `  ${AnsiUtil.colorize('/Q', 'yellow')} - Quote previous message\r\n`);
      socket.emit('ansi-output', `  ${AnsiUtil.colorize('/R', 'yellow')} - Replace text\r\n`);
      socket.emit('ansi-output', `  ${AnsiUtil.colorize('/U', 'yellow')} - Upload text file\r\n`);
      socket.emit('ansi-output', `  ${AnsiUtil.colorize('/X', 'yellow')} - Transfer files (save and send)\r\n`);
      socket.emit('ansi-output', `  ${AnsiUtil.colorize('/H', 'yellow')} - This help\r\n`);
      socket.emit('ansi-output', '\r\n');
      socket.emit('ansi-output', `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
      return;
    }

    // /C - Continue editing (express.e:10543-10550)
    if (cmd === 'C' || cmd === 'CONTINUE') {
      socket.emit('ansi-output', '\r\n');
      socket.emit('ansi-output', AnsiUtil.colorize('Continuing...', 'cyan') + '\r\n');
      socket.emit('ansi-output', '\r\n');
      // Display next line prompt
      socket.emit('ansi-output', `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
      return;
    }

    // /D - Delete line (express.e:10555-10607)
    if (cmd === 'D' || cmd === 'DELETE') {
      const messageData = session.tempData.messageEntry;
      if (messageData.body.length === 0) {
        socket.emit('ansi-output', '\r\n');
        socket.emit('ansi-output', AnsiUtil.errorLine('No lines to delete.'));
        socket.emit('ansi-output', '\r\n');
        socket.emit('ansi-output', `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
        return;
      }

      socket.emit('ansi-output', '\r\n');
      socket.emit('ansi-output', `${AnsiUtil.colorize('Line number to delete ', 'cyan')}${AnsiUtil.colorize('[', 'green')}${AnsiUtil.colorize('1', 'yellow')}${AnsiUtil.colorize('..', 'green')}${AnsiUtil.colorize(String(messageData.body.length), 'yellow')}${AnsiUtil.colorize(']', 'green')}${AnsiUtil.colorize('?', 'green')} `);
      session.subState = LoggedOnSubState.POST_MESSAGE_DELETE_LINE;
      return;
    }

    // /E - Edit line (express.e:10608-10630)
    if (cmd === 'E' || cmd === 'EDIT') {
      const messageData = session.tempData.messageEntry;
      if (messageData.body.length === 0) {
        socket.emit('ansi-output', '\r\n');
        socket.emit('ansi-output', AnsiUtil.errorLine('No lines to edit!'));
        socket.emit('ansi-output', '\r\n');
        socket.emit('ansi-output', `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
        return;
      }

      socket.emit('ansi-output', '\r\n');
      socket.emit('ansi-output', `${AnsiUtil.colorize('Line number to edit ', 'cyan')}${AnsiUtil.colorize('[', 'green')}${AnsiUtil.colorize('1', 'yellow')}${AnsiUtil.colorize('..', 'green')}${AnsiUtil.colorize(String(messageData.body.length), 'yellow')}${AnsiUtil.colorize(']', 'green')}${AnsiUtil.colorize('?', 'green')} `);
      session.subState = LoggedOnSubState.POST_MESSAGE_EDIT_LINE;
      return;
    }

    // /F - File Attach (express.e:10508-10556)
    if (cmd === 'F' || cmd === 'ATTACH') {
      // Check security and fileattach flag
      if (!checkSecurity(session.user!, ACSPermission.ATTACH_FILES)) {
        socket.emit('ansi-output', '\r\n');
        socket.emit('ansi-output', AnsiUtil.errorLine('You do not have access to attach files.'));
        socket.emit('ansi-output', '\r\n');
        socket.emit('ansi-output', `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
        return;
      }

      // Initialize attachedFiles array if not exists
      if (!session.tempData.messageEntry.attachedFiles) {
        session.tempData.messageEntry.attachedFiles = [];
      }

      socket.emit('ansi-output', '\r\n');
      socket.emit('ansi-output', AnsiUtil.colorize('Enter path/filename to attach ', 'cyan'));
      socket.emit('ansi-output', `${AnsiUtil.colorize('(', 'green')}${AnsiUtil.colorize('5 <DIR>', 'yellow')}${AnsiUtil.colorize(')', 'green')}=${AnsiUtil.colorize('DIR', 'yellow')}${AnsiUtil.colorize(')', 'green')}${AnsiUtil.colorize(':', 'cyan')} `);
      session.subState = LoggedOnSubState.POST_MESSAGE_ATTACH_FILE;
      return;
    }

    // /X - Transfer Files (express.e:10562-10566)
    if (cmd === 'X' || cmd === 'TRANSFER') {
      const messageData = session.tempData.messageEntry;

      // Check security based on private/public
      const hasAccess = (messageData.isPrivate && checkSecurity(session.user!, ACSPermission.PRI_MSGFILES)) ||
                        (!messageData.isPrivate && checkSecurity(session.user!, ACSPermission.PUB_MSGFILES));

      if (!hasAccess) {
        socket.emit('ansi-output', '\r\n');
        socket.emit('ansi-output', AnsiUtil.errorLine('You do not have access to transfer message files.'));
        socket.emit('ansi-output', '\r\n');
        socket.emit('ansi-output', `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
        return;
      }

      // Set flag to trigger file transfer after message save
      session.tempData.messageEntry.transferFiles = true;

      // Save the message and trigger transfer
      await saveMessage(socket, session);
      return;
    }

    // /L - List message (express.e:10631-10640)
    if (cmd === 'L' || cmd === 'LIST') {
      const messageData = session.tempData.messageEntry;
      socket.emit('ansi-output', '\r\n');
      messageData.body.forEach((bodyLine: string, index: number) => {
        const lineNum = (index + 1).toString().padStart(index >= 99 ? 3 : 2, ' ');
        socket.emit('ansi-output', `${lineNum}> ${bodyLine}\r\n`);
      });
      socket.emit('ansi-output', `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
      return;
    }

    // /Q - Quote Previous Message (express.e:10865-10946)
    if (cmd === 'Q' || cmd === 'QUOTE') {
      // Check if this is a reply (has parentId or replyTo)
      const messageData = session.tempData.messageEntry;

      // TODO: Load parent message if replying
      // For now, just inform user this requires message threading
      socket.emit('ansi-output', '\r\n');
      socket.emit('ansi-output', AnsiUtil.warningLine('Quote requires message threading (not yet implemented)'));
      socket.emit('ansi-output', '\r\n');
      socket.emit('ansi-output', `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
      return;
    }

    // /R - Replace Text
    if (cmd === 'R' || cmd === 'REPLACE') {
      const messageData = session.tempData.messageEntry;
      if (messageData.body.length === 0) {
        socket.emit('ansi-output', '\r\n');
        socket.emit('ansi-output', AnsiUtil.errorLine('No text to replace!'));
        socket.emit('ansi-output', '\r\n');
        socket.emit('ansi-output', `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
        return;
      }

      socket.emit('ansi-output', '\r\n');
      socket.emit('ansi-output', AnsiUtil.colorize('Search for: ', 'cyan'));
      session.subState = LoggedOnSubState.POST_MESSAGE_REPLACE_SEARCH;
      return;
    }

    // /I - Insert Line
    if (cmd === 'I' || cmd === 'INSERT') {
      const messageData = session.tempData.messageEntry;
      if (messageData.body.length === 0) {
        socket.emit('ansi-output', '\r\n');
        socket.emit('ansi-output', AnsiUtil.errorLine('No lines yet! Just type to add lines.'));
        socket.emit('ansi-output', '\r\n');
        socket.emit('ansi-output', `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
        return;
      }

      socket.emit('ansi-output', '\r\n');
      socket.emit('ansi-output', `${AnsiUtil.colorize('Insert before line ', 'cyan')}${AnsiUtil.colorize('[', 'green')}${AnsiUtil.colorize('1', 'yellow')}${AnsiUtil.colorize('..', 'green')}${AnsiUtil.colorize(String(messageData.body.length + 1), 'yellow')}${AnsiUtil.colorize(']', 'green')}${AnsiUtil.colorize('?', 'green')} `);
      session.subState = LoggedOnSubState.POST_MESSAGE_INSERT_LINE;
      return;
    }

    // /U - Upload Text File
    if (cmd === 'U' || cmd === 'UPLOAD') {
      socket.emit('ansi-output', '\r\n');
      socket.emit('ansi-output', AnsiUtil.warningLine('Text file upload requires file upload infrastructure (not yet implemented)'));
      socket.emit('ansi-output', '\r\n');
      socket.emit('ansi-output', `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
      return;
    }

    // Unknown command - treat as normal text
  }

  // Add line to message body
  session.tempData.messageEntry.body.push(line);
  session.tempData.messageEntry.currentLine++;

  // Limit to 200 lines (express.e typical limit)
  if (session.tempData.messageEntry.body.length >= 200) {
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.warningLine('Maximum message length reached (200 lines)'));
    socket.emit('ansi-output', '\r\n');
    await saveMessage(socket, session);
    return;
  }

  // Display next line prompt
  socket.emit('ansi-output', `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
}

/**
 * Save message to database - express.e:10909 saveNewMSG()
 */
async function saveMessage(socket: any, session: BBSSession): Promise<void> {
  const entry = session.tempData.messageEntry;

  // Validate message has content
  if (entry.body.length === 0) {
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.errorLine('Cannot save empty message'));
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    session.tempData = undefined;
    return;
  }

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.colorize('Saving...', 'cyan'));

  try {
    // Create message object
    const messageBody = entry.body.join('\n');
    const messageDate = new Date();

    const message = {
      subject: entry.subject,
      body: messageBody,
      author: session.user!.username,
      timestamp: messageDate,
      conferenceId: session.currentConf || 1,
      messageBaseId: session.currentMsgBase || 1,
      isPrivate: entry.isPrivate,
      toUser: entry.toUser,
      parentId: null,
      attachments: entry.attachedFiles || [],
      edited: false,
      editedBy: null,
      editedAt: null,
      transferFiles: entry.transferFiles || false
    };

    // CRITICAL: Write message to DISK (AmiExpress format)
    // Express.e:10694-10704 - Messages MUST be on disk for doors to read
    const msgNum = await writeMessageFile(
      session.currentConf || 1,
      session.currentMsgBase || 1,
      {
        from: session.user!.username,
        to: entry.toUser,
        subject: entry.subject,
        date: formatMessageDate(messageDate),
        body: messageBody
      },
      config.get('dataDir')
    );

    // Save to database (for web UI, search indexing)
    const messageId = await _db.createMessage(message);

    // Increment messagesPosted counter (express.e:10127)
    session.user!.messagesPosted = (session.user!.messagesPosted || 0) + 1;

    // DISK-BASED: Write updated user stats to user.data/keys/misc files
    // This ensures messagesPosted is persisted immediately (safer than waiting for logoff)
    if (session.user!.slotNumber) {
      try {
        const { userFileManager } = require('../../services/UserFileManager');
        userFileManager.updateUserDataFile(session.user!, session.user!.slotNumber);
        console.log(`[Message] Updated user ${session.user!.username} disk files (messagesPosted=${session.user!.messagesPosted}, slot=${session.user!.slotNumber})`);
      } catch (diskErr) {
        console.error('[Message] Error writing user disk files:', diskErr);
        // Continue anyway - database has the stats, can sync later
      }
    }

    // Log the action
    await _callersLog(
      session.user!.id,
      session.user!.username,
      'Posted message',
      `#${messageId}: "${entry.subject}" to ${entry.toUser}`
    );

    // Trigger webhook for new message
    console.log('[Message] About to trigger NEW_MESSAGE webhook');
    try {
      const { webhookService, WebhookTrigger } = await import('../../services/webhook.service');

      const conference = await _db.getConferenceById(session.currentConf);
      const messageBase = await _db.getMessageBaseById(session.currentMsgBase);

      console.log(`[Message] Calling webhook for message: subject="${entry.subject}", toUser="${entry.toUser}", isPrivate=${entry.isPrivate}`);
      await webhookService.sendWebhook(WebhookTrigger.NEW_MESSAGE, {
        username: session.user!.username,
        subject: entry.subject,
        conference: conference?.name || 'Unknown',
        messageBase: messageBase?.name || 'Unknown',
        toUser: entry.toUser,
        isPrivate: entry.isPrivate
      });
      console.log('[Message] Webhook call completed');

      // If message is to sysop, also trigger COMMENT_POSTED webhook
      if (entry.toUser.toLowerCase() === 'sysop') {
        await webhookService.sendWebhook(WebhookTrigger.COMMENT_POSTED, {
          username: session.user!.username,
          subject: entry.subject,
          conference: conference?.name || 'Unknown'
        });
      }
    } catch (error) {
      console.error('[Webhook] Error sending new message webhook:', error);
      SysopDebugUtil.debug(
        socket,
        session,
        'Message Posting',
        `Failed to send webhook for message posted to sysop`,
        {
          error: error instanceof Error ? error.message : String(error),
          subject: entry.subject,
          conferenceId: session.currentConf
        },
        DebugSeverity.WARNING
      );
    }

    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.successLine(`Message #${msgNum} posted successfully!`));
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());

  } catch (error) {
    console.error('[saveMessage] Error:', error);
    SysopDebugUtil.debug(
      socket,
      session,
      'Message Posting',
      `Failed to save message`,
      {
        error: error instanceof Error ? error.message : String(error),
        subject: entry.subject,
        toUser: entry.toUser,
        conferenceId: session.currentConf
      },
      DebugSeverity.CRITICAL
    );
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.errorLine('Failed to save message'));
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
  }

  session.subState = LoggedOnSubState.DISPLAY_MENU;
  session.tempData = undefined;
}

/**
 * Handle delete line number input - express.e:10555-10607
 */
export function handleMessageDeleteLineInput(socket: any, session: BBSSession, input: string): void {
  const lineNumber = parseInt(input.trim());
  const messageData = session.tempData.messageEntry;

  // Blank = abort
  if (input.trim() === '') {
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
    session.subState = LoggedOnSubState.POST_MESSAGE_BODY;
    return;
  }

  // Validate line number
  if (isNaN(lineNumber) || lineNumber < 1 || lineNumber > messageData.body.length) {
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.errorLine(`Line ${input} does not exist.`));
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', `${AnsiUtil.colorize('Line number to delete ', 'cyan')}${AnsiUtil.colorize('[', 'green')}${AnsiUtil.colorize('1', 'yellow')}${AnsiUtil.colorize('..', 'green')}${AnsiUtil.colorize(String(messageData.body.length), 'yellow')}${AnsiUtil.colorize(']', 'green')}${AnsiUtil.colorize('?', 'green')} `);
    return;
  }

  // Show the line and confirm deletion
  const lineIndex = lineNumber - 1;
  const lineNum = lineNumber.toString().padStart(lineNumber >= 100 ? 3 : 2, ' ');
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', `${lineNum}> ${messageData.body[lineIndex]}\r\n`);
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', `${AnsiUtil.colorize('Is this the correct line ', 'cyan')}${AnsiUtil.colorize('(', 'green')}${AnsiUtil.colorize('Y', 'yellow')}${AnsiUtil.colorize('/', 'green')}${AnsiUtil.colorize('N', 'yellow')}${AnsiUtil.colorize(')', 'green')}${AnsiUtil.colorize('?', 'green')} `);

  // Store the line number for confirmation
  session.tempData.messageEntry.pendingDeleteLine = lineIndex;
  session.subState = LoggedOnSubState.POST_MESSAGE_DELETE_CONFIRM;
}

/**
 * Handle delete confirmation - express.e:10555-10607
 */
export function handleMessageDeleteConfirm(socket: any, session: BBSSession, input: string): void {
  const answer = input.trim().toUpperCase();
  const messageData = session.tempData.messageEntry;
  const lineIndex = messageData.pendingDeleteLine;

  if (answer === 'Y' || answer === 'YES') {
    // Delete the line
    messageData.body.splice(lineIndex, 1);
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.successLine(`Deleted line ${lineIndex + 1}.`));
    socket.emit('ansi-output', '\r\n');
  } else {
    socket.emit('ansi-output', '\r\n');
  }

  // Return to message body input
  socket.emit('ansi-output', `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
  session.subState = LoggedOnSubState.POST_MESSAGE_BODY;
  delete messageData.pendingDeleteLine;
}

/**
 * Handle edit line number input - express.e:10608-10630
 */
export function handleMessageEditLineInput(socket: any, session: BBSSession, input: string): void {
  const lineNumber = parseInt(input.trim());
  const messageData = session.tempData.messageEntry;

  // Blank = abort
  if (input.trim() === '') {
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
    session.subState = LoggedOnSubState.POST_MESSAGE_BODY;
    return;
  }

  // Validate line number
  if (isNaN(lineNumber) || lineNumber < 1 || lineNumber > messageData.body.length) {
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.errorLine(`Line ${input} does not exist.`));
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', `${AnsiUtil.colorize('Line number to edit ', 'cyan')}${AnsiUtil.colorize('[', 'green')}${AnsiUtil.colorize('1', 'yellow')}${AnsiUtil.colorize('..', 'green')}${AnsiUtil.colorize(String(messageData.body.length), 'yellow')}${AnsiUtil.colorize(']', 'green')}${AnsiUtil.colorize('?', 'green')} `);
    return;
  }

  // Show the edit prompt with current line content
  const lineIndex = lineNumber - 1;
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.colorize('    Edit Line', 'cyan') + '\r\n');
  socket.emit('ansi-output', AnsiUtil.colorize('   (---------------------------------------------------------------------------)', 'cyan') + '\r\n');
  socket.emit('ansi-output', AnsiUtil.colorize('    ', 'cyan'));

  // Store the line index for editing
  messageData.pendingEditLine = lineIndex;
  session.subState = LoggedOnSubState.POST_MESSAGE_EDIT_LINE_CONTENT;
}

/**
 * Handle edit line content input - express.e:10608-10630
 */
export function handleMessageEditLineContent(socket: any, session: BBSSession, input: string): void {
  const messageData = session.tempData.messageEntry;
  const lineIndex = messageData.pendingEditLine;

  // Update the line
  messageData.body[lineIndex] = input;

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
  session.subState = LoggedOnSubState.POST_MESSAGE_BODY;
  delete messageData.pendingEditLine;
}

/**
 * Helper: Prompt for message subject - express.e:10839-10849
 */
function promptForSubject(socket: any, session: BBSSession): void {
  socket.emit('ansi-output', `${AnsiUtil.colorize('Subject:', 'cyan')} ${AnsiUtil.colorize('(', 'green')}${AnsiUtil.colorize('Blank', 'yellow')}${AnsiUtil.colorize(')', 'green')}=${AnsiUtil.colorize('abort', 'yellow')}${AnsiUtil.colorize('?', 'green')} `);
  session.subState = LoggedOnSubState.POST_MESSAGE_SUBJECT;
}

/**
 * Helper: Prompt for Private/Public - express.e:10851-10864
 */
function promptForPrivate(socket: any, session: BBSSession): void {
  const toUser = session.tempData.messageEntry.toUser.toUpperCase();

  // Messages to ALL/EALL cannot be private - express.e:10850
  if (toUser === 'ALL' || toUser === 'EALL') {
    session.tempData.messageEntry.isPrivate = false;
    promptForMessageBody(socket, session);
    return;
  }

  socket.emit('ansi-output', `         ${AnsiUtil.colorize('Private', 'cyan')} `);
  socket.emit('ansi-output', `${AnsiUtil.colorize('(', 'green')}${AnsiUtil.colorize('Y', 'yellow')}${AnsiUtil.colorize('/', 'green')}${AnsiUtil.colorize('N', 'yellow')}${AnsiUtil.colorize(')', 'green')}${AnsiUtil.colorize('?', 'green')} `);
  session.subState = LoggedOnSubState.POST_MESSAGE_PRIVATE;
}

/**
 * Handle file attachment input - express.e:10515-10556
 */
export async function handleMessageAttachFileInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const messageData = session.tempData.messageEntry;
  const attachedFile = input.trim();

  // Blank = continue without attaching
  if (attachedFile === '') {
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
    session.subState = LoggedOnSubState.POST_MESSAGE_BODY;
    return;
  }

  // Check for directory command (express.e:10518-10521)
  if (attachedFile.startsWith('5 ')) {
    const dirPath = attachedFile.substring(2).trim() || '.';
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.warningLine('Directory listing not yet implemented.'));
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.colorize('Enter path/filename to attach ', 'cyan'));
    socket.emit('ansi-output', `${AnsiUtil.colorize('(', 'green')}${AnsiUtil.colorize('5 <DIR>', 'yellow')}${AnsiUtil.colorize(')', 'green')}=${AnsiUtil.colorize('DIR', 'yellow')}${AnsiUtil.colorize(')', 'green')}${AnsiUtil.colorize(':', 'cyan')} `);
    return;
  }

  // Add file to attachedFiles array (express.e:10523-10524)
  if (!messageData.attachedFiles) {
    messageData.attachedFiles = [];
  }
  messageData.attachedFiles.push(attachedFile);

  // Ask if file should be deleted when message is deleted (express.e:10538-10549)
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', `${AnsiUtil.colorize('Delete file(s) when message is deleted ', 'cyan')}${AnsiUtil.colorize('(', 'green')}${AnsiUtil.colorize('Y', 'yellow')}${AnsiUtil.colorize('/', 'green')}${AnsiUtil.colorize('N', 'yellow')}${AnsiUtil.colorize(')', 'green')}${AnsiUtil.colorize('?', 'green')} `);
  session.subState = LoggedOnSubState.POST_MESSAGE_ATTACH_DELETE_CONFIRM;
}

/**
 * Handle file attachment delete confirmation - express.e:10538-10549
 */
export function handleMessageAttachDeleteConfirm(socket: any, session: BBSSession, input: string): void {
  const answer = input.trim().toUpperCase();
  const messageData = session.tempData.messageEntry;

  // Store delete flag at position 0 of attachedFiles array (express.e:10545-10549)
  if (answer === 'Y' || answer === 'YES') {
    messageData.attachedFiles.unshift('Y');
  } else {
    messageData.attachedFiles.unshift('N');
  }

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
  session.subState = LoggedOnSubState.POST_MESSAGE_BODY;
}

/**
 * Handle /R (Replace Text) - Search String Input
 */
export function handleMessageReplaceSearchInput(socket: any, session: BBSSession, input: string): void {
  const searchStr = input.trim();

  // Empty = cancel
  if (searchStr === '') {
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
    session.subState = LoggedOnSubState.POST_MESSAGE_BODY;
    return;
  }

  // Store search string for next step
  if (!session.tempData.messageEntry.replaceData) {
    session.tempData.messageEntry.replaceData = {};
  }
  session.tempData.messageEntry.replaceData.search = searchStr;

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.colorize('Replace with: ', 'cyan'));
  session.subState = LoggedOnSubState.POST_MESSAGE_REPLACE_WITH;
}

/**
 * Handle /R (Replace Text) - Replacement String Input
 */
export function handleMessageReplaceWithInput(socket: any, session: BBSSession, input: string): void {
  const replaceStr = input;  // Allow empty replacement
  const messageData = session.tempData.messageEntry;
  const searchStr = messageData.replaceData?.search || '';

  if (!searchStr) {
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.errorLine('No search string!'));
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
    session.subState = LoggedOnSubState.POST_MESSAGE_BODY;
    return;
  }

  // Perform replacement (case-sensitive, all occurrences)
  let replaceCount = 0;
  for (let i = 0; i < messageData.body.length; i++) {
    const oldLine = messageData.body[i];
    const newLine = oldLine.split(searchStr).join(replaceStr);
    if (oldLine !== newLine) {
      messageData.body[i] = newLine;
      replaceCount += (oldLine.split(searchStr).length - 1);
    }
  }

  socket.emit('ansi-output', '\r\n');
  if (replaceCount > 0) {
    socket.emit('ansi-output', AnsiUtil.colorize(`Replaced ${replaceCount} occurrence(s)`, 'green'));
  } else {
    socket.emit('ansi-output', AnsiUtil.warningLine('No matches found'));
  }
  socket.emit('ansi-output', '\r\n');

  // Clean up temp data
  delete messageData.replaceData;

  socket.emit('ansi-output', `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
  session.subState = LoggedOnSubState.POST_MESSAGE_BODY;
}

/**
 * Handle /I (Insert Line) - Line Number Input
 */
export function handleMessageInsertLineInput(socket: any, session: BBSSession, input: string): void {
  const lineNumStr = input.trim();
  const messageData = session.tempData.messageEntry;

  // Empty = cancel
  if (lineNumStr === '') {
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
    session.subState = LoggedOnSubState.POST_MESSAGE_BODY;
    return;
  }

  const lineNum = parseInt(lineNumStr, 10);

  // Validate line number
  if (isNaN(lineNum) || lineNum < 1 || lineNum > messageData.body.length + 1) {
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.errorLine(`Invalid line number! Must be 1..${messageData.body.length + 1}`));
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', `${AnsiUtil.colorize('Insert before line ', 'cyan')}${AnsiUtil.colorize('[', 'green')}${AnsiUtil.colorize('1', 'yellow')}${AnsiUtil.colorize('..', 'green')}${AnsiUtil.colorize(String(messageData.body.length + 1), 'yellow')}${AnsiUtil.colorize(']', 'green')}${AnsiUtil.colorize('?', 'green')} `);
    return;
  }

  // Store line number for next step
  if (!messageData.insertData) {
    messageData.insertData = {};
  }
  messageData.insertData.lineNum = lineNum;

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.colorize('Enter text: ', 'cyan'));
  session.subState = LoggedOnSubState.POST_MESSAGE_INSERT_TEXT;
}

/**
 * Handle /I (Insert Line) - Text Input
 */
export function handleMessageInsertTextInput(socket: any, session: BBSSession, input: string): void {
  const text = input;  // Allow empty line
  const messageData = session.tempData.messageEntry;
  const lineNum = messageData.insertData?.lineNum || 1;

  // Insert line at position (array index is lineNum - 1)
  messageData.body.splice(lineNum - 1, 0, text);

  // Update current line counter
  messageData.currentLine++;

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.colorize(`Line inserted at position ${lineNum}`, 'green'));
  socket.emit('ansi-output', '\r\n');

  // Clean up temp data
  delete messageData.insertData;

  socket.emit('ansi-output', `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
  session.subState = LoggedOnSubState.POST_MESSAGE_BODY;
}

/**
 * Helper: Prompt for message body - express.e:10898-10909
 */
function promptForMessageBody(socket: any, session: BBSSession): void {
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.colorize('Enter message (', 'cyan'));
  socket.emit('ansi-output', AnsiUtil.colorize('/S', 'yellow'));
  socket.emit('ansi-output', AnsiUtil.colorize(' to save, ', 'cyan'));
  socket.emit('ansi-output', AnsiUtil.colorize('/A', 'yellow'));
  socket.emit('ansi-output', AnsiUtil.colorize(' to abort, ', 'cyan'));
  socket.emit('ansi-output', AnsiUtil.colorize('/H', 'yellow'));
  socket.emit('ansi-output', AnsiUtil.colorize(' for help):', 'cyan'));
  socket.emit('ansi-output', '\r\n\r\n');

  session.tempData.messageEntry.body = [];
  session.tempData.messageEntry.currentLine = 1;

  socket.emit('ansi-output', `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
  session.subState = LoggedOnSubState.POST_MESSAGE_BODY;
}
