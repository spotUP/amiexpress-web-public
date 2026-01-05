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
import { runExecuteOn } from '../../services/batch-scheduler';
import { emitText, emitPrompt, emitLine, flushOutput } from '../../utils/output.util';
import { mailOnSysopComment } from '../../services/mail-notification.service';
import * as amigafs from '../../utils/amigafs';
import * as path from 'path';


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

  emitText(socket, '\r\n');
  promptForSubject(socket, session);
}

/**
 * Handle subject input - express.e:10839-10849
 */
export function handleMessageSubjectInput(socket: any, session: BBSSession, input: string): void {
  const subject = input.trim();

  // Blank = abort (express.e:10847-10849)
  if (subject === '') {
    emitText(socket, '\r\n');
    emitText(socket, AnsiUtil.warningLine('Message entry aborted'));
    emitText(socket, '\r\n');
    emitPrompt(socket, AnsiUtil.pressKeyPrompt());
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    session.tempData = undefined;
    return;
  }

  session.tempData.messageEntry.subject = subject;
  emitText(socket, '\r\n');

  promptForPrivate(socket, session);
}

/**
 * Handle Private/Public input - express.e:10851-10864
 */
export function handleMessagePrivateInput(socket: any, session: BBSSession, input: string): void {
  const answer = input.trim().toUpperCase();

  // Y/YES = private, anything else = public
  session.tempData.messageEntry.isPrivate = (answer === 'Y' || answer === 'YES');

  emitText(socket, '\r\n');
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
      emitText(socket, '\r\n');
      emitText(socket, AnsiUtil.warningLine('Message entry aborted'));
      emitText(socket, '\r\n');
      emitPrompt(socket, AnsiUtil.pressKeyPrompt());
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      session.tempData = undefined;
      return;
    }

    // /H = Help
    if (cmd === 'H' || cmd === 'HELP') {
      emitText(socket, '\r\n');
      emitText(socket, AnsiUtil.colorize('Editor Commands:', 'cyan') + '\r\n');
      emitText(socket, `  ${AnsiUtil.colorize('/S', 'yellow')} - Save message\r\n`);
      emitText(socket, `  ${AnsiUtil.colorize('/A', 'yellow')} - Abort message\r\n`);
      emitText(socket, `  ${AnsiUtil.colorize('/C', 'yellow')} - Continue editing\r\n`);
      emitText(socket, `  ${AnsiUtil.colorize('/D', 'yellow')} - Delete line\r\n`);
      emitText(socket, `  ${AnsiUtil.colorize('/E', 'yellow')} - Edit line\r\n`);
      emitText(socket, `  ${AnsiUtil.colorize('/F', 'yellow')} - Attach file\r\n`);
      emitText(socket, `  ${AnsiUtil.colorize('/I', 'yellow')} - Insert line\r\n`);
      emitText(socket, `  ${AnsiUtil.colorize('/L', 'yellow')} - List message\r\n`);
      emitText(socket, `  ${AnsiUtil.colorize('/Q', 'yellow')} - Quote previous message\r\n`);
      emitText(socket, `  ${AnsiUtil.colorize('/R', 'yellow')} - Replace text\r\n`);
      emitText(socket, `  ${AnsiUtil.colorize('/U', 'yellow')} - Upload text file\r\n`);
      emitText(socket, `  ${AnsiUtil.colorize('/X', 'yellow')} - Transfer files (save and send)\r\n`);
      emitText(socket, `  ${AnsiUtil.colorize('/H', 'yellow')} - This help\r\n`);
      emitText(socket, '\r\n');
      emitText(socket, `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
      return;
    }

    // /C - Continue editing (express.e:10543-10550)
    if (cmd === 'C' || cmd === 'CONTINUE') {
      emitText(socket, '\r\n');
      emitText(socket, AnsiUtil.colorize('Continuing...', 'cyan') + '\r\n');
      emitText(socket, '\r\n');
      // Display next line prompt
      emitText(socket, `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
      return;
    }

    // /D - Delete line (express.e:10555-10607)
    if (cmd === 'D' || cmd === 'DELETE') {
      const messageData = session.tempData.messageEntry;
      if (messageData.body.length === 0) {
        emitText(socket, '\r\n');
        emitText(socket, AnsiUtil.errorLine('No lines to delete.'));
        emitText(socket, '\r\n');
        emitText(socket, `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
        return;
      }

      emitText(socket, '\r\n');
      emitText(socket, `${AnsiUtil.colorize('Line number to delete ', 'cyan')}${AnsiUtil.colorize('[', 'green')}${AnsiUtil.colorize('1', 'yellow')}${AnsiUtil.colorize('..', 'green')}${AnsiUtil.colorize(String(messageData.body.length), 'yellow')}${AnsiUtil.colorize(']', 'green')}${AnsiUtil.colorize('?', 'green')} `);
      session.subState = LoggedOnSubState.POST_MESSAGE_DELETE_LINE;
      return;
    }

    // /E - Edit line (express.e:10608-10630)
    if (cmd === 'E' || cmd === 'EDIT') {
      const messageData = session.tempData.messageEntry;
      if (messageData.body.length === 0) {
        emitText(socket, '\r\n');
        emitText(socket, AnsiUtil.errorLine('No lines to edit!'));
        emitText(socket, '\r\n');
        emitText(socket, `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
        return;
      }

      emitText(socket, '\r\n');
      emitText(socket, `${AnsiUtil.colorize('Line number to edit ', 'cyan')}${AnsiUtil.colorize('[', 'green')}${AnsiUtil.colorize('1', 'yellow')}${AnsiUtil.colorize('..', 'green')}${AnsiUtil.colorize(String(messageData.body.length), 'yellow')}${AnsiUtil.colorize(']', 'green')}${AnsiUtil.colorize('?', 'green')} `);
      session.subState = LoggedOnSubState.POST_MESSAGE_EDIT_LINE;
      return;
    }

    // /F - File Attach (express.e:10508-10556)
    if (cmd === 'F' || cmd === 'ATTACH') {
      // Check security and fileattach flag
      if (!checkSecurity(session.user!, ACSPermission.ATTACH_FILES)) {
        emitText(socket, '\r\n');
        emitText(socket, AnsiUtil.errorLine('You do not have access to attach files.'));
        emitText(socket, '\r\n');
        emitText(socket, `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
        return;
      }

      // Initialize attachedFiles array if not exists
      if (!session.tempData.messageEntry.attachedFiles) {
        session.tempData.messageEntry.attachedFiles = [];
      }

      emitText(socket, '\r\n');
      emitText(socket, AnsiUtil.colorize('Enter path/filename to attach ', 'cyan'));
      emitText(socket, `${AnsiUtil.colorize('(', 'green')}${AnsiUtil.colorize('5 <DIR>', 'yellow')}${AnsiUtil.colorize(')', 'green')}=${AnsiUtil.colorize('DIR', 'yellow')}${AnsiUtil.colorize(')', 'green')}${AnsiUtil.colorize(':', 'cyan')} `);
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
        emitText(socket, '\r\n');
        emitText(socket, AnsiUtil.errorLine('You do not have access to transfer message files.'));
        emitText(socket, '\r\n');
        emitText(socket, `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
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
      emitText(socket, '\r\n');
      messageData.body.forEach((bodyLine: string, index: number) => {
        const lineNum = (index + 1).toString().padStart(index >= 99 ? 3 : 2, ' ');
        emitText(socket, `${lineNum}> ${bodyLine}\r\n`);
      });
      emitText(socket, `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
      return;
    }

    // /Q - Quote Previous Message (express.e:10865-10946)
    if (cmd === 'Q' || cmd === 'QUOTE') {
      const messageData = session.tempData.messageEntry;

      // Check if this is a reply (express.e:10878 - replyFlag=1)
      if (!messageData.parentId) {
        emitText(socket, '\r\n');
        emitText(socket, AnsiUtil.errorLine('Quote only works when replying to a message'));
        emitText(socket, AnsiUtil.warningLine('Use "R" command to reply to a message first'));
        emitText(socket, '\r\n');
        emitText(socket, `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
        return;
      }

      // Load the parent message (express.e:10888)
      _db.getMessage(messageData.parentId)
        .then((parentMessage: any) => {
          if (!parentMessage) {
            emitText(socket, '\r\n');
            emitText(socket, AnsiUtil.errorLine('Cannot load parent message'));
            emitText(socket, '\r\n');
            emitText(socket, `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
            return;
          }

          // Split message body into lines
          const parentLines = parentMessage.body.split('\n');

          // Display parent message with line numbers (express.e:10892-10900)
          emitText(socket, '\r\n');
          emitText(socket, AnsiUtil.colorize('Quote in Reply', 'cyan'));
          emitText(socket, '\r\n\r\n');

          parentLines.forEach((line: string, index: number) => {
            const lineNum = (index + 1).toString().padStart(index >= 99 ? 3 : 2, ' ');
            emitText(socket, `${lineNum}> ${line}\r\n`);
          });

          // Prompt for line range (express.e:10902)
          emitText(socket, '\r\n');
          emitText(socket, AnsiUtil.colorize(' Enter Startline,Endline or (*=ALL, A=Abort): ', 'yellow'));

          // Store parent message info for quote processing
          session.tempData.quoteData = {
            parentMessage: parentMessage,
            parentLines: parentLines,
            totalLines: parentLines.length
          };

          session.subState = LoggedOnSubState.POST_MESSAGE_QUOTE_RANGE;
        })
        .catch((error: Error) => {
console.error('[MSG] Error loading parent message for quote:', error);
          emitText(socket, '\r\n');
          emitText(socket, AnsiUtil.errorLine('Error loading parent message'));
          emitText(socket, '\r\n');
          emitText(socket, `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
        });
      return;
    }

    // /R - Replace Text
    if (cmd === 'R' || cmd === 'REPLACE') {
      const messageData = session.tempData.messageEntry;
      if (messageData.body.length === 0) {
        emitText(socket, '\r\n');
        emitText(socket, AnsiUtil.errorLine('No text to replace!'));
        emitText(socket, '\r\n');
        emitText(socket, `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
        return;
      }

      emitText(socket, '\r\n');
      emitText(socket, AnsiUtil.colorize('Search for: ', 'cyan'));
      session.subState = LoggedOnSubState.POST_MESSAGE_REPLACE_SEARCH;
      return;
    }

    // /I - Insert Line
    if (cmd === 'I' || cmd === 'INSERT') {
      const messageData = session.tempData.messageEntry;
      if (messageData.body.length === 0) {
        emitText(socket, '\r\n');
        emitText(socket, AnsiUtil.errorLine('No lines yet! Just type to add lines.'));
        emitText(socket, '\r\n');
        emitText(socket, `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
        return;
      }

      emitText(socket, '\r\n');
      emitText(socket, `${AnsiUtil.colorize('Insert before line ', 'cyan')}${AnsiUtil.colorize('[', 'green')}${AnsiUtil.colorize('1', 'yellow')}${AnsiUtil.colorize('..', 'green')}${AnsiUtil.colorize(String(messageData.body.length + 1), 'yellow')}${AnsiUtil.colorize(']', 'green')}${AnsiUtil.colorize('?', 'green')} `);
      session.subState = LoggedOnSubState.POST_MESSAGE_INSERT_LINE;
      return;
    }

    // /U - Upload Text File
    // Web extension: Import text file from disk into message body
    if (cmd === 'U' || cmd === 'UPLOAD') {
      emitText(socket, '\r\n');
      emitText(socket, `${AnsiUtil.colorize('Enter path/filename to import ', 'cyan')}${AnsiUtil.colorize('(', 'green')}${AnsiUtil.colorize('5 <DIR>', 'yellow')}${AnsiUtil.colorize(')', 'green')}=${AnsiUtil.colorize('DIR', 'yellow')}${AnsiUtil.colorize(')', 'green')}${AnsiUtil.colorize(':', 'cyan')} `);
      session.subState = LoggedOnSubState.POST_MESSAGE_UPLOAD_FILE;
      return;
    }

    // Unknown command - treat as normal text
  }

  // Add line to message body
  session.tempData.messageEntry.body.push(line);
  session.tempData.messageEntry.currentLine++;

  // Limit to 200 lines (express.e typical limit)
  if (session.tempData.messageEntry.body.length >= 200) {
    emitText(socket, '\r\n');
    emitText(socket, AnsiUtil.warningLine('Maximum message length reached (200 lines)'));
    emitText(socket, '\r\n');
    await saveMessage(socket, session);
    return;
  }

  // Display next line prompt
  emitText(socket, `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
}

/**
 * Save message to database - express.e:10909 saveNewMSG()
 */
async function saveMessage(socket: any, session: BBSSession): Promise<void> {
  const entry = session.tempData.messageEntry;

  // Validate message has content
  if (entry.body.length === 0) {
    emitText(socket, '\r\n');
    emitText(socket, AnsiUtil.errorLine('Cannot save empty message'));
    emitText(socket, '\r\n');
    emitPrompt(socket, AnsiUtil.pressKeyPrompt());
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    session.tempData = undefined;
    return;
  }

  emitText(socket, '\r\n');
  emitText(socket, AnsiUtil.colorize('Saving...', 'cyan'));

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
      // express.e:6704 - runExecuteOn('SYSOP_COMMENT') called from doCommentNotify()
      if (entry.toUser.toLowerCase() === 'sysop') {
        await webhookService.sendWebhook(WebhookTrigger.COMMENT_POSTED, {
          username: session.user!.username,
          subject: entry.subject,
          conference: conference?.name || 'Unknown'
        });

        // EXECUTE_ON_SYSOP_COMMENT tooltype
        await runExecuteOn('SYSOP_COMMENT', session.nodeId || 1, {
          username: session.user!.username,
          location: session.user!.location || ''
        });

        // MAIL_ON_SYSOP_COMMENT tooltype - express.e:6705-6709
        await mailOnSysopComment(
          session.user!.username,
          entry.subject,
          entry.lines.join('\n')
        );
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

    emitText(socket, '\r\n');
    emitText(socket, AnsiUtil.successLine(`Message #${msgNum} posted successfully!`));
    emitText(socket, '\r\n');
    emitPrompt(socket, AnsiUtil.pressKeyPrompt());

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
    emitText(socket, '\r\n');
    emitText(socket, AnsiUtil.errorLine('Failed to save message'));
    emitText(socket, '\r\n');
    emitPrompt(socket, AnsiUtil.pressKeyPrompt());
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
    emitText(socket, '\r\n');
    emitText(socket, `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
    session.subState = LoggedOnSubState.POST_MESSAGE_BODY;
    return;
  }

  // Validate line number
  if (isNaN(lineNumber) || lineNumber < 1 || lineNumber > messageData.body.length) {
    emitText(socket, '\r\n');
    emitText(socket, AnsiUtil.errorLine(`Line ${input} does not exist.`));
    emitText(socket, '\r\n');
    emitText(socket, `${AnsiUtil.colorize('Line number to delete ', 'cyan')}${AnsiUtil.colorize('[', 'green')}${AnsiUtil.colorize('1', 'yellow')}${AnsiUtil.colorize('..', 'green')}${AnsiUtil.colorize(String(messageData.body.length), 'yellow')}${AnsiUtil.colorize(']', 'green')}${AnsiUtil.colorize('?', 'green')} `);
    return;
  }

  // Show the line and confirm deletion
  const lineIndex = lineNumber - 1;
  const lineNum = lineNumber.toString().padStart(lineNumber >= 100 ? 3 : 2, ' ');
  emitText(socket, '\r\n');
  emitText(socket, `${lineNum}> ${messageData.body[lineIndex]}\r\n`);
  emitText(socket, '\r\n');
  emitText(socket, `${AnsiUtil.colorize('Is this the correct line ', 'cyan')}${AnsiUtil.colorize('(', 'green')}${AnsiUtil.colorize('Y', 'yellow')}${AnsiUtil.colorize('/', 'green')}${AnsiUtil.colorize('N', 'yellow')}${AnsiUtil.colorize(')', 'green')}${AnsiUtil.colorize('?', 'green')} `);

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
    emitText(socket, '\r\n');
    emitText(socket, AnsiUtil.successLine(`Deleted line ${lineIndex + 1}.`));
    emitText(socket, '\r\n');
  } else {
    emitText(socket, '\r\n');
  }

  // Return to message body input
  emitText(socket, `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
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
    emitText(socket, '\r\n');
    emitText(socket, `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
    session.subState = LoggedOnSubState.POST_MESSAGE_BODY;
    return;
  }

  // Validate line number
  if (isNaN(lineNumber) || lineNumber < 1 || lineNumber > messageData.body.length) {
    emitText(socket, '\r\n');
    emitText(socket, AnsiUtil.errorLine(`Line ${input} does not exist.`));
    emitText(socket, '\r\n');
    emitText(socket, `${AnsiUtil.colorize('Line number to edit ', 'cyan')}${AnsiUtil.colorize('[', 'green')}${AnsiUtil.colorize('1', 'yellow')}${AnsiUtil.colorize('..', 'green')}${AnsiUtil.colorize(String(messageData.body.length), 'yellow')}${AnsiUtil.colorize(']', 'green')}${AnsiUtil.colorize('?', 'green')} `);
    return;
  }

  // Show the edit prompt with current line content
  const lineIndex = lineNumber - 1;
  emitText(socket, '\r\n');
  emitText(socket, AnsiUtil.colorize('    Edit Line', 'cyan') + '\r\n');
  emitText(socket, AnsiUtil.colorize('   (---------------------------------------------------------------------------)', 'cyan') + '\r\n');
  emitText(socket, AnsiUtil.colorize('    ', 'cyan'));

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

  emitText(socket, '\r\n');
  emitText(socket, `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
  session.subState = LoggedOnSubState.POST_MESSAGE_BODY;
  delete messageData.pendingEditLine;
}

/**
 * Helper: Prompt for message subject - express.e:10839-10849
 */
function promptForSubject(socket: any, session: BBSSession): void {
  emitText(socket, `${AnsiUtil.colorize('Subject:', 'cyan')} ${AnsiUtil.colorize('(', 'green')}${AnsiUtil.colorize('Blank', 'yellow')}${AnsiUtil.colorize(')', 'green')}=${AnsiUtil.colorize('abort', 'yellow')}${AnsiUtil.colorize('?', 'green')} `);
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

  emitText(socket, `         ${AnsiUtil.colorize('Private', 'cyan')} `);
  emitText(socket, `${AnsiUtil.colorize('(', 'green')}${AnsiUtil.colorize('Y', 'yellow')}${AnsiUtil.colorize('/', 'green')}${AnsiUtil.colorize('N', 'yellow')}${AnsiUtil.colorize(')', 'green')}${AnsiUtil.colorize('?', 'green')} `);
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
    emitText(socket, '\r\n');
    emitText(socket, `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
    session.subState = LoggedOnSubState.POST_MESSAGE_BODY;
    return;
  }

  // Check for directory command (express.e:10518-10521)
  if (attachedFile.startsWith('5 ')) {
    const dirPath = attachedFile.substring(2).trim() || '.';
    await displayDirectoryListing(socket, session, dirPath);
    emitText(socket, '\r\n');
    emitText(socket, AnsiUtil.colorize('Enter path/filename to attach ', 'cyan'));
    emitText(socket, `${AnsiUtil.colorize('(', 'green')}${AnsiUtil.colorize('5 <DIR>', 'yellow')}${AnsiUtil.colorize(')', 'green')}=${AnsiUtil.colorize('DIR', 'yellow')}${AnsiUtil.colorize(')', 'green')}${AnsiUtil.colorize(':', 'cyan')} `);
    return;
  }

  // Add file to attachedFiles array (express.e:10523-10524)
  if (!messageData.attachedFiles) {
    messageData.attachedFiles = [];
  }
  messageData.attachedFiles.push(attachedFile);

  // Ask if file should be deleted when message is deleted (express.e:10538-10549)
  emitText(socket, '\r\n');
  emitText(socket, `${AnsiUtil.colorize('Delete file(s) when message is deleted ', 'cyan')}${AnsiUtil.colorize('(', 'green')}${AnsiUtil.colorize('Y', 'yellow')}${AnsiUtil.colorize('/', 'green')}${AnsiUtil.colorize('N', 'yellow')}${AnsiUtil.colorize(')', 'green')}${AnsiUtil.colorize('?', 'green')} `);
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

  emitText(socket, '\r\n');
  emitText(socket, `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
  session.subState = LoggedOnSubState.POST_MESSAGE_BODY;
}

/**
 * Handle /R (Replace Text) - Search String Input
 */
export function handleMessageReplaceSearchInput(socket: any, session: BBSSession, input: string): void {
  const searchStr = input.trim();

  // Empty = cancel
  if (searchStr === '') {
    emitText(socket, '\r\n');
    emitText(socket, `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
    session.subState = LoggedOnSubState.POST_MESSAGE_BODY;
    return;
  }

  // Store search string for next step
  if (!session.tempData.messageEntry.replaceData) {
    session.tempData.messageEntry.replaceData = {};
  }
  session.tempData.messageEntry.replaceData.search = searchStr;

  emitText(socket, '\r\n');
  emitText(socket, AnsiUtil.colorize('Replace with: ', 'cyan'));
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
    emitText(socket, '\r\n');
    emitText(socket, AnsiUtil.errorLine('No search string!'));
    emitText(socket, '\r\n');
    emitText(socket, `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
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

  emitText(socket, '\r\n');
  if (replaceCount > 0) {
    emitText(socket, AnsiUtil.colorize(`Replaced ${replaceCount} occurrence(s)`, 'green'));
  } else {
    emitText(socket, AnsiUtil.warningLine('No matches found'));
  }
  emitText(socket, '\r\n');

  // Clean up temp data
  delete messageData.replaceData;

  emitText(socket, `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
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
    emitText(socket, '\r\n');
    emitText(socket, `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
    session.subState = LoggedOnSubState.POST_MESSAGE_BODY;
    return;
  }

  const lineNum = parseInt(lineNumStr, 10);

  // Validate line number
  if (isNaN(lineNum) || lineNum < 1 || lineNum > messageData.body.length + 1) {
    emitText(socket, '\r\n');
    emitText(socket, AnsiUtil.errorLine(`Invalid line number! Must be 1..${messageData.body.length + 1}`));
    emitText(socket, '\r\n');
    emitText(socket, `${AnsiUtil.colorize('Insert before line ', 'cyan')}${AnsiUtil.colorize('[', 'green')}${AnsiUtil.colorize('1', 'yellow')}${AnsiUtil.colorize('..', 'green')}${AnsiUtil.colorize(String(messageData.body.length + 1), 'yellow')}${AnsiUtil.colorize(']', 'green')}${AnsiUtil.colorize('?', 'green')} `);
    return;
  }

  // Store line number for next step
  if (!messageData.insertData) {
    messageData.insertData = {};
  }
  messageData.insertData.lineNum = lineNum;

  emitText(socket, '\r\n');
  emitText(socket, AnsiUtil.colorize('Enter text: ', 'cyan'));
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

  emitText(socket, '\r\n');
  emitText(socket, AnsiUtil.colorize(`Line inserted at position ${lineNum}`, 'green'));
  emitText(socket, '\r\n');

  // Clean up temp data
  delete messageData.insertData;

  emitText(socket, `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
  session.subState = LoggedOnSubState.POST_MESSAGE_BODY;
}

/**
 * Handle /Q (Quote) - Line Range Input
 * express.e:10902-10944
 */
export function handleQuoteRangeInput(socket: any, session: BBSSession, input: string): void {
  const range = input.trim().toUpperCase();
  const quoteData = session.tempData.quoteData;
  const messageData = session.tempData.messageEntry;

  if (!quoteData) {
    emitText(socket, '\r\n');
    emitText(socket, AnsiUtil.errorLine('Quote data not found'));
    emitText(socket, '\r\n');
    emitText(socket, `${AnsiUtil.colorize(String(messageData.currentLine).padStart(3), 'yellow')}> `);
    session.subState = LoggedOnSubState.POST_MESSAGE_BODY;
    return;
  }

  // Handle abort (express.e:10909-10913)
  if (range === 'A' || range === 'ABORT') {
    emitText(socket, '\r\n');
    emitText(socket, AnsiUtil.warningLine('Quote aborted'));
    emitText(socket, '\r\n');
    delete session.tempData.quoteData;
    emitText(socket, `${AnsiUtil.colorize(String(messageData.currentLine).padStart(3), 'yellow')}> `);
    session.subState = LoggedOnSubState.POST_MESSAGE_BODY;
    return;
  }

  let startLine = 1;
  let endLine = quoteData.totalLines;

  // Handle * for all lines (express.e:10916-10918)
  if (range === '*') {
    startLine = 1;
    endLine = quoteData.totalLines;
  } else {
    // Parse "start,end" format (express.e:10920-10927)
    const parts = range.split(',');
    if (parts.length === 2) {
      startLine = parseInt(parts[0], 10);
      endLine = parseInt(parts[1], 10);
    } else {
      emitText(socket, '\r\n');
      emitText(socket, AnsiUtil.errorLine('Invalid range format. Use: start,end or * for all'));
      emitText(socket, '\r\n');
      emitText(socket, AnsiUtil.colorize(' Enter Startline,Endline or (*=ALL, A=Abort): ', 'yellow'));
      return;
    }
  }

  // Validate range (express.e:10927)
  if (isNaN(startLine) || isNaN(endLine) ||
      startLine < 1 || startLine > quoteData.totalLines ||
      endLine < 1 || endLine > quoteData.totalLines ||
      startLine > endLine) {
    emitText(socket, '\r\n');
    emitText(socket, AnsiUtil.errorLine(`Invalid range. Must be 1-${quoteData.totalLines}`));
    emitText(socket, '\r\n');
    emitText(socket, AnsiUtil.colorize(' Enter Startline,Endline or (*=ALL, A=Abort): ', 'yellow'));
    return;
  }

  // Insert quoted lines (express.e:10931-10944)
  const quotedLines: string[] = [];

  // Add separator line with author and date (express.e:10936-10939)
  const parentMsg = quoteData.parentMessage;
  const msgDate = new Date(parentMsg.createdAt || parentMsg.created_at).toLocaleString();
  const separator = ` -----[ ${parentMsg.fromUser} ]--[ ${msgDate} ]----------------------------------------------------------------------`.substring(0, 70);
  quotedLines.push(separator);
  quotedLines.push(' ');

  // Copy selected lines (express.e:10931-10935)
  for (let i = startLine - 1; i < endLine; i++) {
    quotedLines.push(quoteData.parentLines[i]);
  }

  quotedLines.push('');

  // Insert at current position in message body
  const currentIndex = messageData.currentLine - 1;
  messageData.body.splice(currentIndex, 0, ...quotedLines);
  messageData.currentLine += quotedLines.length;

  emitText(socket, '\r\n');
  emitText(socket, AnsiUtil.colorize(`Quoted ${endLine - startLine + 1} lines`, 'green'));
  emitText(socket, '\r\n');

  // Clean up
  delete session.tempData.quoteData;

  emitText(socket, `${AnsiUtil.colorize(String(messageData.currentLine).padStart(3), 'yellow')}> `);
  session.subState = LoggedOnSubState.POST_MESSAGE_BODY;
}

/**
 * Helper: Prompt for message body - express.e:10898-10909
 */
function promptForMessageBody(socket: any, session: BBSSession): void {
  emitText(socket, '\r\n');
  emitText(socket, AnsiUtil.colorize('Enter message (', 'cyan'));
  emitText(socket, AnsiUtil.colorize('/S', 'yellow'));
  emitText(socket, AnsiUtil.colorize(' to save, ', 'cyan'));
  emitText(socket, AnsiUtil.colorize('/A', 'yellow'));
  emitText(socket, AnsiUtil.colorize(' to abort, ', 'cyan'));
  emitText(socket, AnsiUtil.colorize('/H', 'yellow'));
  emitText(socket, AnsiUtil.colorize(' for help):', 'cyan'));
  emitText(socket, '\r\n\r\n');

  session.tempData.messageEntry.body = [];
  session.tempData.messageEntry.currentLine = 1;

  emitText(socket, `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
  session.subState = LoggedOnSubState.POST_MESSAGE_BODY;
}

/**
 * Forward message handlers (express.e forwardMSG:9807-9871)
 */

/**
 * Handle recipient input for message forwarding (express.e:9817-9821)
 */
export async function handleForwardMessageToInput(socket: any, session: BBSSession, input: string): Promise<void> {
  // Default to 'ALL' if empty (express.e:9817)
  const recipient = input || 'ALL';

  // Validate recipient name
  const user = await _db.getUserByUsername(recipient.toUpperCase());
  if (!user && recipient.toUpperCase() !== 'ALL') {
    emitText(socket, '\r\nUser not found.\r\n');
    emitPrompt(socket, '     [36mTo[33m: [32m([33mEnter[32m)[0m=[32m\'[33mALL[32m\'[32m?[0m ');
    return; // Stay in same state
  }

  // Store recipient
  session.tempData.forwardData.toUser = recipient.toUpperCase();
  emitText(socket, '\r\n');

  // Prompt for subject (express.e:9825-9830)
  emitText(socket, `[36mSubject[33m: [32m([33mBlank[32m)[0m=[33mabort[32m?[0m `);
  session.subState = LoggedOnSubState.FORWARD_MESSAGE_SUBJECT;
}

/**
 * Handle subject input for message forwarding (express.e:9826-9835)
 */
export async function handleForwardMessageSubjectInput(socket: any, session: BBSSession, input: string): Promise<void> {
  // If subject is blank, abort (express.e:9832-9835)
  if (!input) {
    emitText(socket, '\r\n');
    // Return to message reader
    const messages = session.tempData.msgReaderMessages || [];
    const currentIndex = session.tempData.forwardOriginalIndex || 0;
    session.subState = LoggedOnSubState.MSG_READER_NAV;

    // Re-display the message
    const { displaySingleMessage } = require('./messaging.handler');
    await displaySingleMessage(socket, session, currentIndex);
    return;
  }

  // Store subject
  session.tempData.forwardData.subject = input;

  // Prompt for privacy (express.e:9837-9851)
  emitText(socket, '         [36mPrivate ');
  session.subState = LoggedOnSubState.FORWARD_MESSAGE_PRIVATE;
}

/**
 * Handle privacy choice for message forwarding (express.e:9837-9851)
 */
export async function handleForwardMessagePrivateInput(socket: any, session: BBSSession, input: string): Promise<void> {
  let isPrivate = false;

  // Handle Y/N input (express.e yesNo function)
  if (input === 'Y') {
    isPrivate = true;
    emitText(socket, 'Yes\r\n');
  } else if (input === 'N') {
    isPrivate = false;
    emitText(socket, 'No\r\n');
  } else {
    return; // Wait for valid input
  }

  // Store privacy setting
  session.tempData.forwardData.isPrivate = isPrivate;

  // Check if user can delete original message (express.e:9853-9860)
  if (session.tempData.forwardData.canDeleteOriginal) {
    emitText(socket, 'Delete original message ');
    session.subState = LoggedOnSubState.FORWARD_MESSAGE_DELETE_ORIGINAL;
  } else {
    // Skip to saving message
    await saveForwardedMessage(socket, session, false);
  }
}

/**
 * Handle delete original confirmation for message forwarding (express.e:9853-9860)
 */
export async function handleForwardMessageDeleteOriginalInput(socket: any, session: BBSSession, input: string): Promise<void> {
  let deleteOriginal = false;

  // Handle Y/N input
  if (input === 'Y') {
    deleteOriginal = true;
    emitText(socket, 'Yes\r\n');
  } else if (input === 'N') {
    deleteOriginal = false;
    emitText(socket, 'No\r\n');
  } else {
    return; // Wait for valid input
  }

  // Save forwarded message and optionally delete original
  await saveForwardedMessage(socket, session, deleteOriginal);
}

/**
 * Save the forwarded message (express.e:9862-9871)
 */
async function saveForwardedMessage(socket: any, session: BBSSession, deleteOriginal: boolean): Promise<void> {
  emitText(socket, '\r\nSaving...');

  try {
    const originalMsg = session.tempData.forwardOriginalMessage;
    const forwardData = session.tempData.forwardData;

    // Create new message with original body but new headers
    const newMessage = {
      subject: forwardData.subject,
      body: originalMsg.body, // Copy original message body
      author: session.user.username,
      timestamp: new Date(),
      conferenceId: originalMsg.conferenceId,
      messageBaseId: originalMsg.messageBaseId,
      isPrivate: forwardData.isPrivate,
      toUser: forwardData.toUser,
      parentId: null,
      attachments: [],
      edited: false,
      editedBy: null,
      editedAt: null
    };

    // Save the forwarded message
    await _db.createMessage(newMessage);

    // Delete original if requested
    if (deleteOriginal) {
      await _db.deleteMessage(originalMsg.id);

      // Remove from reader's message list
      const messages = session.tempData.msgReaderMessages || [];
      const originalIndex = session.tempData.forwardOriginalIndex || 0;
      messages.splice(originalIndex, 1);
      session.tempData.msgReaderMessages = messages;
    }

    emitText(socket, ' done.\r\n');

    // Return to message reader
    const messages = session.tempData.msgReaderMessages || [];
    const currentIndex = session.tempData.forwardOriginalIndex || 0;

    // If we deleted the original and there are no more messages, exit
    if (deleteOriginal && messages.length === 0) {
      emitText(socket, 'No more messages.\r\n');
      const { saveMessagePointerAndExit } = require('./messaging.handler');
      await saveMessagePointerAndExit(socket, session);
      return;
    }

    // Display next message (or previous if we deleted the last one)
    const nextIndex = deleteOriginal && currentIndex < messages.length ? currentIndex : currentIndex;
    session.subState = LoggedOnSubState.MSG_READER_NAV;

    const { displaySingleMessage } = require('./messaging.handler');
    await displaySingleMessage(socket, session, deleteOriginal ? Math.min(nextIndex, messages.length - 1) : nextIndex);

  } catch (error: any) {
console.error('[ForwardMessage] Error saving forwarded message:', error);
    emitText(socket, '\r\nError forwarding message.\r\n');

    // Return to message reader
    session.subState = LoggedOnSubState.MSG_READER_NAV;
    const { displaySingleMessage } = require('./messaging.handler');
    const currentIndex = session.tempData.forwardOriginalIndex || 0;
    await displaySingleMessage(socket, session, currentIndex);
  }
}

/**
 * Handle text file upload input
 * Web extension: Import text file contents into message body
 */
export async function handleUploadFileInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const filePath = input.trim();

  // Check for directory listing command
  if (filePath.startsWith('5 ')) {
    const dirPath = filePath.substring(2).trim() || '.';
    await displayDirectoryListing(socket, session, dirPath);
    emitText(socket, '\r\n');
    emitText(socket, `${AnsiUtil.colorize('Enter path/filename to import ', 'cyan')}${AnsiUtil.colorize('(', 'green')}${AnsiUtil.colorize('5 <DIR>', 'yellow')}${AnsiUtil.colorize(')', 'green')}=${AnsiUtil.colorize('DIR', 'yellow')}${AnsiUtil.colorize(')', 'green')}${AnsiUtil.colorize(':', 'cyan')} `);
    return;
  }

  // Empty input = cancel
  if (filePath === '') {
    emitText(socket, '\r\n');
    emitText(socket, AnsiUtil.colorize('Upload cancelled.', 'yellow'));
    emitText(socket, '\r\n');
    emitText(socket, `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
    session.subState = LoggedOnSubState.POST_MESSAGE_BODY;
    return;
  }

  // Resolve file path
  const bbsRoot = config.get('dataDir');
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(bbsRoot, filePath);

  // Check if file exists
  if (!amigafs.existsSync(fullPath)) {
    emitText(socket, '\r\n');
    emitText(socket, AnsiUtil.errorLine(`File not found: ${filePath}`));
    emitText(socket, '\r\n');
    emitText(socket, `${AnsiUtil.colorize('Enter path/filename to import ', 'cyan')}${AnsiUtil.colorize('(', 'green')}${AnsiUtil.colorize('5 <DIR>', 'yellow')}${AnsiUtil.colorize(')', 'green')}=${AnsiUtil.colorize('DIR', 'yellow')}${AnsiUtil.colorize(')', 'green')}${AnsiUtil.colorize(':', 'cyan')} `);
    return;
  }

  // Check if it's a file (not directory)
  const stats = amigafs.statSync(fullPath);
  if (!stats.isFile()) {
    emitText(socket, '\r\n');
    emitText(socket, AnsiUtil.errorLine(`Path is not a file: ${filePath}`));
    emitText(socket, '\r\n');
    emitText(socket, `${AnsiUtil.colorize('Enter path/filename to import ', 'cyan')}${AnsiUtil.colorize('(', 'green')}${AnsiUtil.colorize('5 <DIR>', 'yellow')}${AnsiUtil.colorize(')', 'green')}=${AnsiUtil.colorize('DIR', 'yellow')}${AnsiUtil.colorize(')', 'green')}${AnsiUtil.colorize(':', 'cyan')} `);
    return;
  }

  // Read file contents
  try {
    const fileContents = amigafs.readFileSync(fullPath, 'utf-8');
    const contentStr = typeof fileContents === 'string' ? fileContents : fileContents.toString('utf-8');
    const lines = contentStr.split(/\r?\n/);

    // Import lines into message body
    const messageData = session.tempData.messageEntry;
    let importedLines = 0;

    for (const line of lines) {
      // Limit to 200 lines total
      if (messageData.body.length >= 200) {
        emitText(socket, '\r\n');
        emitText(socket, AnsiUtil.warningLine(`Maximum message length reached (200 lines). Imported ${importedLines} lines.`));
        break;
      }

      messageData.body.push(line);
      importedLines++;
    }

    messageData.currentLine = messageData.body.length + 1;

    emitText(socket, '\r\n');
    emitText(socket, AnsiUtil.colorize(`Imported ${importedLines} line(s) from ${path.basename(filePath)}`, 'green'));
    emitText(socket, '\r\n');
    emitText(socket, `${AnsiUtil.colorize(String(messageData.currentLine).padStart(3), 'yellow')}> `);
    session.subState = LoggedOnSubState.POST_MESSAGE_BODY;
  } catch (error) {
    emitText(socket, '\r\n');
    emitText(socket, AnsiUtil.errorLine(`Error reading file: ${(error as Error).message}`));
    emitText(socket, '\r\n');
    emitText(socket, `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
    session.subState = LoggedOnSubState.POST_MESSAGE_BODY;
  }
}

/**
 * Display directory listing for file attachment selection
 * 1:1 port from express.e:8343-8387 myDirRecurse()
 *
 * @param socket - Socket connection
 * @param session - User session
 * @param dirPath - Directory path to list
 */
async function displayDirectoryListing(socket: any, session: BBSSession, dirPath: string): Promise<void> {
  emitText(socket, '\r\n');

  // Resolve path relative to BBS root
  const bbsRoot = config.get('dataDir');
  const fullPath = path.isAbsolute(dirPath) ? dirPath : path.join(bbsRoot, dirPath);

  // Check if path exists (express.e:8353-8364)
  if (!amigafs.existsSync(fullPath)) {
    emitText(socket, AnsiUtil.errorLine(`${dirPath} does not exist`));
    emitText(socket, '\r\n');
    return;
  }

  // Check if it's a directory (express.e:8367)
  const stats = amigafs.statSync(fullPath);
  if (!stats.isDirectory()) {
    // If it's a file, just display the file info (express.e:8382)
    displayFileInfo(socket, path.basename(fullPath), stats);
    return;
  }

  // Display directory header (express.e:8368-8369)
  emitText(socket, `${AnsiUtil.colorize('Directory of ', 'cyan')}${AnsiUtil.colorize(dirPath, 'white')}\r\n`);
  emitText(socket, '\r\n');

  // Read directory contents (express.e:8371-8380)
  try {
    const entries = amigafs.readdirSync(fullPath);

    for (const entry of entries) {
      const entryPath = path.join(fullPath, entry);
      try {
        const entryStats = amigafs.statSync(entryPath);
        displayFileInfo(socket, entry, entryStats);
      } catch (error) {
        // Skip files that can't be stat'd
console.warn(`[Directory Listing] Cannot stat ${entry}:`, error);
      }
    }
  } catch (error) {
    emitText(socket, AnsiUtil.errorLine(`Error reading directory: ${(error as Error).message}`));
    emitText(socket, '\r\n');
  }

  emitText(socket, '\r\n');
}

/**
 * Display information for a single file
 * Port from express.e:8325-8341 myDirDisplay()
 *
 * @param socket - Socket connection
 * @param filename - File name
 * @param stats - File stats
 */
function displayFileInfo(socket: any, filename: string, stats: any): void {
  // Format file size or "Dir" indicator (express.e:8333-8337)
  const sizeStr = stats.isDirectory()
    ? AnsiUtil.colorize('     Dir', 'blue')
    : AnsiUtil.colorize(String(stats.size).padStart(8), 'white');

  // Format modification date/time (express.e:8327-8332, 8339-8340)
  const mtime = stats.mtime || new Date();
  const dateStr = `${String(mtime.getMonth() + 1).padStart(2, '0')}/${String(mtime.getDate()).padStart(2, '0')}/${String(mtime.getFullYear()).substring(2)}`;
  const timeStr = `${String(mtime.getHours()).padStart(2, '0')}:${String(mtime.getMinutes()).padStart(2, '0')}:${String(mtime.getSeconds()).padStart(2, '0')}`;

  // Display file info line (express.e:8339-8340)
  // Format: filename (25 chars) size (8 chars) date time
  emitText(socket, ' ');
  emitText(socket, AnsiUtil.colorize(filename.padEnd(25).substring(0, 25), stats.isDirectory() ? 'yellow' : 'green'));
  emitText(socket, ' ');
  emitText(socket, sizeStr);
  emitText(socket, ' ');
  emitText(socket, AnsiUtil.colorize(dateStr, 'cyan'));
  emitText(socket, ' ');
  emitText(socket, AnsiUtil.colorize(timeStr, 'cyan'));
  emitText(socket, '\r\n');
}
