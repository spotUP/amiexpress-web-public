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
import { getSystemTime, formatLongDateTime } from '../../utils/date-time.util';


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
  // express.e:10762,10779 — lineInput max 30 chars; truncate silently if longer
  const recipient = input.trim().substring(0, 30);

  // Blank = ALL (express.e:10793-10795)
  if (recipient === '') {
    session.tempData.messageEntry.toUser = 'ALL';
    emitText(socket, '\r\n');
    promptForSubject(socket, session);
    return;
  }

  // Check for EALL - express.e:10800-10816
  const recipientLower = recipient.toLowerCase();
  if (recipientLower === 'eall') {
    // express.e:10810 - Check ACS_EALL_MESSAGES permission
    if (checkSecurity(session.user, ACSPermission.EALL_MESSAGES)) {
      session.tempData.messageEntry.toUser = 'EALL';
      emitText(socket, '\r\n');
      promptForSubject(socket, session);
    } else {
      // express.e:10814 - No permission, reject
      emitText(socket, '\r\nUser does not exist!!\r\n\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      session.tempData = undefined;
    }
    return;
  }

  // Check for SYSOP - express.e:10818-10820 maps to slot 1
  if (recipientLower === 'sysop') {
    // Map SYSOP to actual sysop username (slot 1)
    session.tempData.messageEntry.toUser = 'SYSOP';
    emitText(socket, '\r\n');
    promptForSubject(socket, session);
    return;
  }

  // Regular recipient
  session.tempData.messageEntry.toUser = recipient;
  emitText(socket, '\r\n');
  promptForSubject(socket, session);
}

/**
 * Handle subject input - express.e:10839-10849
 */
export async function handleMessageSubjectInput(socket: any, session: BBSSession, input: string): Promise<void> {
  // express.e:10847 — lineInput('','',30,...) caps subject at 30 chars
  const subject = input.trim().substring(0, 30);

  // Blank = abort:
  // - replyToMSG:9890: RETURN RESULT_SUCCESS → back to reader
  // - enterMSG:10854: RETURN RESULT_FAILURE → back to menu
  if (subject === '') {
    emitText(socket, '\r\n');
    if (session.tempData?.messageEntry?.parentId) {
      // Reply context: return to message reader (express.e:9890 RESULT_SUCCESS)
      const msgReaderMessages = session.tempData.msgReaderMessages;
      const msgReaderIndex = session.tempData.msgReaderIndex || 0;
      const msgReaderHighest = session.tempData.msgReaderHighestRead;
      session.tempData = { msgReaderMessages, msgReaderIndex, msgReaderHighestRead: msgReaderHighest };
      session.subState = LoggedOnSubState.MSG_READER_NAV;
      const { displaySingleMessage } = require('./messaging.handler');
      await displaySingleMessage(socket, session, msgReaderIndex);
    } else {
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      session.tempData = undefined;
    }
    return;
  }

  session.tempData.messageEntry.subject = subject;
  emitText(socket, '\r\n');

  promptForPrivate(socket, session);
}

/**
 * Handle Private/Public input - express.e:10862 yesNo(2) — single char Y/y = private
 */
export function handleMessagePrivateInput(socket: any, session: BBSSession, input: string): void {
  // express.e yesNo(2): single char — y/Y=yes, n/N=no, CR=no (default), else loop (ignore)
  const ch = (input[0] || '').toUpperCase();

  // Loop on anything that's not y/Y, n/N, or CR (express.e: readChar loop until valid)
  if (ch !== 'Y' && ch !== 'N' && ch !== '\r' && ch !== '\n' && ch !== '') {
    return; // stay in POST_MESSAGE_PRIVATE, wait for valid char
  }

  const isPrivate = (ch === 'Y');
  session.tempData.messageEntry.isPrivate = isPrivate;

  // echo "Yes\r\n" or "No\r\n" like yesNo() (express.e:2147-2155)
  emitText(socket, isPrivate ? 'Yes\r\n' : 'No\r\n');

  // express.e:10878-10884: IF(replyFlag=1) show "  Quote in Reply (y/N)?"
  if (session.tempData.messageEntry.parentId) {
    emitText(socket, '  \x1b[36mQuote in Reply \x1b[32m(\x1b[33my\x1b[32m/\x1b[33mN\x1b[32m)?\x1b[0m ');
    session.subState = LoggedOnSubState.POST_MESSAGE_QUOTE_REPLY_CONFIRM;
    return;
  }

  promptForMessageBody(socket, session);
}

/**
 * Handle message body input - express.e edit() body entry loop.
 * Blank line ends body entry and shows the options menu (A/C/D/E/L/S/?).
 * No slash-command handling here — commands are at the options menu.
 */
export async function handleMessageBodyInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const line = input;

  // Blank line = end of body entry → show options menu (express.e: bkFlag=1 → REPEAT/UNTIL)
  if (line === '') {
    showOptionsMenu(socket, session, false);
    return;
  }

  // Add line to body — truncate at 75 chars (express.e: maxLineLen=75, edit() enforces via word-wrap)
  const truncated = line.length > 75 ? line.substring(0, 75) : line;
  session.tempData.messageEntry.body.push(truncated);
  session.tempData.messageEntry.currentLine++;

  // 800-line hard limit (express.e: maxMsgLines = 800)
  if (session.tempData.messageEntry.body.length >= 800) {
    showOptionsMenu(socket, session, false);
    return;
  }

  // Next line prompt: " N> " — 2-digit for lines ≤99, 3-digit for 100+ (express.e format)
  emitLinePrompt(socket, session.tempData.messageEntry.currentLine);
}

/** express.e:10374-10391 "Msg. Options: A,C,D,E,L,S,? >:" */
function showOptionsMenu(socket: any, session: BBSSession, helpList: boolean): void {
  session.subState = LoggedOnSubState.POST_MESSAGE_OPTIONS;
  const hasAttach = checkSecurity(session.user, ACSPermission.ATTACH_FILES);
  const hasParent = !!(session.tempData?.messageEntry?.parentId);
  if (!helpList) {
    // express.e:10375-10379 — dynamic based on ACS; WEB_: add I, R, Q
    let menu = '\r\n\x1b[32mMsg. Options: \x1b[33mA\x1b[36m,\x1b[33mC\x1b[36m,\x1b[33mD\x1b[36m,\x1b[33mE\x1b[36m';
    if (hasAttach) menu += ',\x1b[33mF\x1b[36m';
    menu += ',\x1b[33mI\x1b[36m,\x1b[33mL\x1b[36m,\x1b[33mR\x1b[36m,\x1b[33mS\x1b[36m';
    if (hasParent) menu += ',\x1b[33mQ\x1b[36m';
    menu += ',\x1b[33m? \x1b[0m>:';
    emitText(socket, menu);
  } else {
    // express.e:10381-10390; WEB_: add I, R, Q entries
    emitText(socket, '\r\n\x1b[33mA\x1b[32m>\x1b[36mbort\x1b[0m');
    emitText(socket, '\r\n\x1b[33mC\x1b[32m>\x1b[36montinue\x1b[0m');
    emitText(socket, '\r\n\x1b[33mD\x1b[32m>\x1b[36melete Lines\x1b[0m');
    emitText(socket, '\r\n\x1b[33mE\x1b[32m>\x1b[36mdit\x1b[0m');
    if (hasAttach) emitText(socket, '\r\n\x1b[33mF\x1b[32m>\x1b[36mile Attachment\x1b[0m');
    emitText(socket, '\r\n\x1b[33mI\x1b[32m>\x1b[36mnsert Line\x1b[0m');
    emitText(socket, '\r\n\x1b[33mL\x1b[32m>\x1b[36mist\x1b[0m');
    emitText(socket, '\r\n\x1b[33mR\x1b[32m>\x1b[36meplace Text\x1b[0m');
    emitText(socket, '\r\n\x1b[33mS\x1b[32m>\x1b[36mave\x1b[0m');
    if (hasParent) emitText(socket, '\r\n\x1b[33mQ\x1b[32m>\x1b[36muote from Reply\x1b[0m');
    // express.e:10389 helplist:=0 resets so next prompt shows short menu
    emitText(socket, '\r\n\x1b[0m >: ');
  }
}

/** Line prompt exactly matching express.e: " N> " format */
function emitLinePrompt(socket: any, lineNum: number): void {
  const n = lineNum <= 99
    ? String(lineNum).padStart(2)
    : String(lineNum).padStart(3);
  emitText(socket, `${n}> `);
}

/**
 * Handle the "Msg. Options:" menu — express.e cont2: loop.
 * Single-letter commands: A, C, D, E, L, S, ?
 */
export async function handleMessageOptionsInput(socket: any, session: BBSSession, input: string): Promise<void> {
  // express.e:10394 messageMenuChar:=str[0] — only first char matters
  const cmd = (input.trim()[0] || '').toUpperCase();
  // Bare CR/empty input arriving while a previous async command (e.g. S=save) is still
  // running would race with the subState transition and re-emit "Msg. Options:" before
  // the BBS menu prompt. Express.e's lineInput is synchronous; ours is not, so swallow
  // empty inputs at this prompt instead of looping back.
  if (!cmd) return;
  const messageData = session.tempData.messageEntry;
  const lines: string[] = messageData.body;

  if (cmd === '?') {
    showOptionsMenu(socket, session, true);
    return;
  }

  if (cmd === 'A') {
    // Abort — confirm first (express.e: 'Abort message entry (y/n)?')
    emitText(socket, '\r\nAbort message entry (y/n)? ');
    session.subState = LoggedOnSubState.POST_MESSAGE_ABORT_CONFIRM;
    return;
  }

  if (cmd === 'C') {
    // express.e:10452-10466: lines--, restore last line content into space, JUMP bEG_IN
    // BEG_IN pre-fills the edit buffer (space) so pressing Enter commits existing content.
    emitText(socket, '\r\n');
    let restoreContent = '';
    if (messageData.body.length > 0) {
      restoreContent = messageData.body.pop()!;
      messageData.currentLine = messageData.body.length + 1;
    }
    // Pre-fill inputBuffer so pressing Enter immediately commits the restored line
    // (express.e: space = msgBuf.item(lines); bkFlag=0; x=StrLen(space); JUMP bEG_IN)
    session.inputBuffer = restoreContent;
    session.subState = LoggedOnSubState.POST_MESSAGE_BODY;
    // Show prompt + pre-filled content (express.e BEG_IN: StringF(str,'\d[2]> \s',...))
    emitLinePrompt(socket, messageData.currentLine);
    emitText(socket, restoreContent);
    return;
  }

  if (cmd === 'D') {
    // Delete line
    if (lines.length === 0) {
      emitText(socket, '\r\nNo lines to delete.\r\n');
      showOptionsMenu(socket, session, false);
      return;
    }
    emitText(socket, `\r\n\x1b[36mLine number to delete \x1b[32m[\x1b[33m1\x1b[32m..\x1b[33m${lines.length}\x1b[32m]\x1b[0m? `);
    session.subState = LoggedOnSubState.POST_MESSAGE_DELETE_LINE;
    return;
  }

  if (cmd === 'E') {
    // Edit line
    if (lines.length === 0) {
      emitText(socket, '\r\nNo Lines to edit!\r\n');
      showOptionsMenu(socket, session, false);
      return;
    }
    emitText(socket, `\r\n\x1b[36mLine number to edit \x1b[32m[\x1b[33m1\x1b[32m..\x1b[33m${lines.length}\x1b[32m]\x1b[0m? `);
    session.subState = LoggedOnSubState.POST_MESSAGE_EDIT_LINE;
    return;
  }

  if (cmd === 'L') {
    // List all lines (express.e: FOR j:=0 TO lines-1 … aePuts(space))
    emitText(socket, '\r\n');
    lines.forEach((bodyLine, index) => {
      const n = index >= 99 ? String(index + 1).padStart(3) : String(index + 1).padStart(2);
      emitText(socket, `${n}> ${bodyLine}\r\n`);
    });
    showOptionsMenu(socket, session, false);
    return;
  }

  if (cmd === 'S') {
    // Save (express.e: RETURN RESULT_SUCCESS)
    await saveMessage(socket, session);
    return;
  }

  // express.e:10376 — F: File Attachment (gated on ACS_ATTACH_FILES)
  if (cmd === 'F') {
    if (!checkSecurity(session.user, ACSPermission.ATTACH_FILES)) {
      showOptionsMenu(socket, session, false);
      return;
    }
    emitText(socket, "\r\nEnter path/filename to attach ('5 <DIR>'=DIR): ");
    session.subState = LoggedOnSubState.POST_MESSAGE_ATTACH_FILE;
    return;
  }

  // WEB_: I — Insert line at position
  if (cmd === 'I') {
    emitText(socket, `\r\n\x1b[36mInsert before line \x1b[32m[\x1b[33m1\x1b[32m..\x1b[33m${lines.length + 1}\x1b[32m]\x1b[0m? `);
    session.subState = LoggedOnSubState.POST_MESSAGE_INSERT_LINE;
    return;
  }

  // WEB_: R — Replace text throughout message
  if (cmd === 'R') {
    emitText(socket, '\r\n\x1b[36mSearch for: \x1b[0m');
    session.subState = LoggedOnSubState.POST_MESSAGE_REPLACE_SEARCH;
    return;
  }

  // WEB_: Q — Quote from parent message (only when replying)
  if (cmd === 'Q') {
    if (!messageData.parentId) {
      showOptionsMenu(socket, session, false);
      return;
    }
    const parentMsg = await _db.getMessage(messageData.parentId);
    if (!parentMsg) {
      showOptionsMenu(socket, session, false);
      return;
    }
    const parentLines: string[] = parentMsg.body.split('\n');
    emitText(socket, '\r\n');
    parentLines.forEach((line: string, index: number) => {
      emitLinePrompt(socket, index + 1);
      emitText(socket, `${line}\r\n`);
    });
    emitText(socket, '\r\n Enter Startline,Endline or (*=ALL, A=Abort): ');
    session.tempData.quoteData = {
      parentMessage: parentMsg,
      parentLines,
      totalLines: parentLines.length,
      appendToEnd: true  // WEB_: mid-compose quote appends rather than prepends
    };
    session.subState = LoggedOnSubState.POST_MESSAGE_QUOTE_RANGE;
    return;
  }

  // Unknown — redisplay menu (express.e loops back to cont2:)
  showOptionsMenu(socket, session, false);
}

/**
 * Handle abort confirmation "Abort message entry (y/n)?"
 * express.e:10567-10572: yesNo(0), IF stat>0 RETURN -1
 */
export async function handleMessageAbortConfirm(socket: any, session: BBSSession, input: string): Promise<void> {
  // express.e yesNo(0): single char, no default — loops on CR and unknown; only Y or N exits
  const ch = (input[0] || '').toUpperCase();
  if (ch !== 'Y' && ch !== 'N') {
    return; // loop — stay in POST_MESSAGE_ABORT_CONFIRM (matches yesNo(0) loop on CR/unknown)
  }
  if (ch === 'Y') {
    emitText(socket, 'Yes\r\n');
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    session.tempData = undefined;
    return;
  }
  emitText(socket, 'No\r\n');
  showOptionsMenu(socket, session, false);
}

/**
 * Handle "Quote in Reply (y/N)?" confirmation — express.e:10878-10950
 * Called after Private prompt when replying (parentId is set).
 */
export async function handleMessageQuoteReplyConfirm(socket: any, session: BBSSession, input: string): Promise<void> {
  // express.e yesNo(2): single char, loop on unknown, CR=no (default)
  const ch = (input[0] || '').toUpperCase();
  if (ch !== 'Y' && ch !== 'N' && ch !== '\r' && ch !== '\n' && ch !== '') {
    return; // loop — stay in POST_MESSAGE_QUOTE_REPLY_CONFIRM
  }
  emitText(socket, ch === 'Y' ? 'Yes\r\n' : 'No\r\n');

  if (ch !== 'Y') {
    // No quote — go straight to body editor
    promptForMessageBody(socket, session);
    return;
  }

  // Load parent message (express.e:10887-10888: IF(stat:=loadMsg(...)))
  const parentId = session.tempData.messageEntry.parentId;
  const parentMsg = await _db.getMessage(parentId);

  if (!parentMsg) {
    promptForMessageBody(socket, session);
    return;
  }

  const parentLines: string[] = parentMsg.body.split('\n');

  // Display parent lines with numbers (express.e:10889-10900: aePuts('\b\n') then FOR loop)
  emitText(socket, '\r\n');
  parentLines.forEach((line: string, index: number) => {
    // express.e uses \z\l\d[2]> (left-justified width 2) — web adaptation: right-justified
    emitLinePrompt(socket, index + 1);
    emitText(socket, `${line}\r\n`);
  });

  // express.e:10902: aePuts('\b\n Enter Startline,Endline or (*=ALL, A=Abort): ') — plain text
  emitText(socket, '\r\n Enter Startline,Endline or (*=ALL, A=Abort): ');

  session.tempData.quoteData = {
    parentMessage: parentMsg,
    parentLines,
    totalLines: parentLines.length
  };
  session.subState = LoggedOnSubState.POST_MESSAGE_QUOTE_RANGE;
}


/**
 * Save message to database - express.e:10909 saveNewMSG()
 */
async function saveMessage(socket: any, session: BBSSession): Promise<void> {
  const entry = session.tempData.messageEntry;

  // express.e:10972: aePuts('Saving...') — plain text, no newline after (saveNewMSG continues inline)
  emitText(socket, '\r\nSaving...');

  try {
    // Create message object
    const messageBody = entry.body.join('\n');
    const messageDate = getSystemTime();

    // express.e:10790-10794 — public msgs get 'p' status for users with ACS_CENSORED, else 'P'.
    // (Private msgs always get 'R' regardless.) The repository checks `censored` to decide P vs p.
    const censored = !entry.isPrivate && checkSecurity(session.user, ACSPermission.CENSORED);

    const message = {
      subject: entry.subject,
      body: messageBody,
      author: session.user!.username,
      timestamp: messageDate,
      conferenceId: session.currentConf || 1,
      messageBaseId: session.currentMsgBase || 1,
      isPrivate: entry.isPrivate,
      toUser: entry.toUser,
      parentId: entry.parentId || null,
      attachments: entry.attachedFiles || [],
      edited: false,
      editedBy: null,
      editedAt: null,
      transferFiles: entry.transferFiles || false,
      censored
    } as any;

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

    // express.e:10692-10705: aePuts('Message Number N...') + write + aePuts('done!\b\n\b\n')
    emitText(socket, `Message Number ${msgNum}...done!\r\n\r\n`);

    // Save to database (for web UI / search indexing only).
    // Body file + HeaderFile already written by writeMessageFile above —
    // tell createMessage to skip its own disk-write to avoid duplicates.
    const messageId = await _db.createMessage(message, { skipDiskWrite: true });

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
        userId: session.user!.id,
        gdprConsented: !!(session.user as any)?.gdprConsentAt,
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
          userId: session.user!.id,
          gdprConsented: !!(session.user as any)?.gdprConsentAt,
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
          entry.body.join('\n')
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

    // express.e:9898-9903 (replyToMSG): after saving, prompt "Delete original message (y/N)?"
    // only if user has DELETE permission AND original message was addressed to current user.
    const replyOriginalToUser: string = entry.replyOriginalToUser || '';
    if (
      replyOriginalToUser &&
      replyOriginalToUser.toLowerCase() === (session.user?.username || '').toLowerCase() &&
      checkSecurity(session.user, ACSPermission.DELETE_MESSAGE)
    ) {
      emitText(socket, 'Delete original message \x1b[32m(\x1b[33my\x1b[32m/\x1b[33mN\x1b[32m)?\x1b[0m ');
      session.tempData.replyDeleteParentId = entry.parentId;
      session.subState = LoggedOnSubState.REPLY_DELETE_ORIGINAL;
      return; // state machine continues; DISPLAY_MENU set after delete confirm
    }

    // express.e saves message and returns to main loop; main loop sets menuPause:=TRUE
    session.menuPause = true;

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
    // express.e:10713 aePuts('Failed!\b\n\b\n')
    emitText(socket, 'Failed!\r\n\r\n');
  }

  session.subState = LoggedOnSubState.DISPLAY_MENU;
  session.tempData = undefined;

  // Force the menu prompt to render. The debounce in displayMainMenu/displayMenuPrompt
  // could swallow the post-save prompt if any earlier code path bumped the timestamps;
  // forceMenuDisplay=true bypasses that. saveMessage is one place where we are CERTAIN
  // we want the menu prompt — no race.
  try {
    const { displayMainMenu } = require('../command-handler/menu');
    await displayMainMenu(socket, session, true /* forceMenuDisplay */);
  } catch (_) { /* swallow — advanceDisplayFlow is the fallback */ }
}

/**
 * Handle delete line number input - express.e:10555-10607
 */
export function handleMessageDeleteLineInput(socket: any, session: BBSSession, input: string): void {
  const lineNumber = parseInt(input.trim());
  const messageData = session.tempData.messageEntry;

  // Blank = back to options menu (express.e:10414-10416: stat=0 JUMP cont2)
  if (input.trim() === '') {
    showOptionsMenu(socket, session, false);
    return;
  }

  // Validate line number — express.e:10420-10423: show "Line N does not exist."
  const parsedNum = isNaN(lineNumber) ? 0 : lineNumber;
  if (parsedNum < 1 || parsedNum > messageData.body.length) {
    emitText(socket, `\r\nLine ${parsedNum} does not exist.\r\n`);
    emitText(socket, `\r\n\x1b[36mLine number to delete \x1b[32m[\x1b[33m1\x1b[32m..\x1b[33m${messageData.body.length}\x1b[32m]\x1b[0m? `);
    return;
  }

  // Show the line then confirmation (no extra blank line — express.e:10431-10438)
  const lineIndex = parsedNum - 1;
  const lineNum = parsedNum <= 99 ? String(parsedNum).padStart(2) : String(parsedNum).padStart(3);
  emitText(socket, `\r\n${lineNum}> ${messageData.body[lineIndex]}\r\n`);
  emitText(socket, '\r\n\x1b[36mIs this the correct line \x1b[32m(\x1b[33mY\x1b[32m/\x1b[33mN\x1b[32m)\x1b[0m? ');

  // Store the line number for confirmation
  session.tempData.messageEntry.pendingDeleteLine = lineIndex;
  session.subState = LoggedOnSubState.POST_MESSAGE_DELETE_CONFIRM;
}

/**
 * Handle delete confirmation - express.e:10555-10607
 */
export function handleMessageDeleteConfirm(socket: any, session: BBSSession, input: string): void {
  // express.e yesNo(0): single char, loops on CR/unknown — only Y or N exits
  const ch = (input[0] || '').toUpperCase();
  if (ch !== 'Y' && ch !== 'N') {
    return; // loop — stay in POST_MESSAGE_DELETE_CONFIRM
  }
  const messageData = session.tempData.messageEntry;
  const lineIndex = messageData.pendingDeleteLine;
  const lineNum = lineIndex + 1;

  if (ch === 'Y') {
    emitText(socket, 'Yes\r\n');
    // express.e:10443-10447: msgBuf.remove(stat-1); lines--; aePuts("Deleted line N.\n")
    messageData.body.splice(lineIndex, 1);
    if (messageData.currentLine > messageData.body.length + 1) {
      messageData.currentLine = messageData.body.length + 1;
    }
    emitText(socket, `\r\nDeleted line ${lineNum}.\r\n`);
  } else {
    emitText(socket, 'No\r\n');
  }

  delete messageData.pendingDeleteLine;
  showOptionsMenu(socket, session, false);
}

/**
 * Handle edit line number input - express.e:10608-10630
 */
export function handleMessageEditLineInput(socket: any, session: BBSSession, input: string): void {
  const lineNumber = parseInt(input.trim());
  const messageData = session.tempData.messageEntry;

  // Blank = back to options menu (express.e:10478: StrLen(str)=0 JUMP cont2)
  if (input.trim() === '') {
    showOptionsMenu(socket, session, false);
    return;
  }

  // Validate line number — express.e:10481-10484: loops back to loopHere
  const parsedLine = isNaN(lineNumber) ? 0 : lineNumber;
  if (parsedLine < 1 || parsedLine > messageData.body.length) {
    emitText(socket, `\r\nLine ${parsedLine} does not exist.\r\n`);
    emitText(socket, `\r\n\x1b[36mLine number to edit \x1b[32m[\x1b[33m1\x1b[32m..\x1b[33m${messageData.body.length}\x1b[32m]\x1b[0m? `);
    return;
  }

  // express.e:10486-10489: lineInput('\b\n    ',temp,maxLineLen,...) — pre-fills with current content
  const lineIndex = parsedLine - 1;
  const currentContent = messageData.body[lineIndex];
  emitText(socket, '\r\n    Edit Line');
  emitText(socket, '\r\n   (---------------------------------------------------------------------------)\r\n    ');
  emitText(socket, currentContent);
  // Pre-fill inputBuffer so pressing Enter immediately commits existing content unchanged
  // (matches express.e lineInput pre-fill: Enter = keep, typing = replace)
  session.inputBuffer = currentContent;

  messageData.pendingEditLine = lineIndex;
  session.subState = LoggedOnSubState.POST_MESSAGE_EDIT_LINE_CONTENT;
}

/**
 * Handle edit line content input - express.e:10608-10630
 */
export function handleMessageEditLineContent(socket: any, session: BBSSession, input: string): void {
  const messageData = session.tempData.messageEntry;
  const lineIndex = messageData.pendingEditLine;

  // express.e:10491 msgBuf.setItem(x-1,temp) — update with whatever user submitted
  // inputBuffer was pre-filled; Enter immediately = original content; typing replaces it
  messageData.body[lineIndex] = input;
  delete messageData.pendingEditLine;
  showOptionsMenu(socket, session, false);
}

/**
 * Helper: Prompt for message subject - express.e:10839-10849
 */
function promptForSubject(socket: any, session: BBSSession): void {
  // express.e:10847: '[36mSubject[33m: [32m([33mBlank[32m)[0m=[33mabort[32m?[0m '
  emitText(socket, '\x1b[36mSubject\x1b[33m: \x1b[32m(\x1b[33mBlank\x1b[32m)\x1b[0m=\x1b[33mabort\x1b[32m?\x1b[0m ');
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

  // express.e:10861 aePuts('         [36mPrivate ') then yesNo(2) → '[32m([33my[32m/[33mN[32m)[32m?[0m '
  emitText(socket, '         \x1b[36mPrivate \x1b[32m(\x1b[33my\x1b[32m/\x1b[33mN\x1b[32m)?\x1b[0m ');
  session.subState = LoggedOnSubState.POST_MESSAGE_PRIVATE;
}

/**
 * Handle file attachment input - express.e:10515-10556
 */
export async function handleMessageAttachFileInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const messageData = session.tempData.messageEntry;
  const attachedFile = input.trim();

  // Blank = cancel attachment, return to options menu
  if (attachedFile === '') {
    showOptionsMenu(socket, session, false);
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

  showOptionsMenu(socket, session, false);
}

/**
 * Handle /R (Replace Text) - Search String Input
 */
export function handleMessageReplaceSearchInput(socket: any, session: BBSSession, input: string): void {
  const searchStr = input.trim();

  // Empty = cancel, return to options menu
  if (searchStr === '') {
    showOptionsMenu(socket, session, false);
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

  showOptionsMenu(socket, session, false);
}

/**
 * Handle /I (Insert Line) - Line Number Input
 */
export function handleMessageInsertLineInput(socket: any, session: BBSSession, input: string): void {
  const lineNumStr = input.trim();
  const messageData = session.tempData.messageEntry;

  // Empty = cancel, return to options menu
  if (lineNumStr === '') {
    showOptionsMenu(socket, session, false);
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

  showOptionsMenu(socket, session, false);
}

/**
 * Handle /Q (Quote) - Line Range Input
 * express.e:10902-10944
 */
export function handleQuoteRangeInput(socket: any, session: BBSSession, input: string): void {
  const quoteData = session.tempData.quoteData;
  const messageData = session.tempData.messageEntry;
  const raw = input.trim();
  // express.e:10908 firstCharValue(str) — use first char for A/* checks
  const firstChar = (raw[0] || '').toUpperCase();

  if (!quoteData) {
    promptForMessageBody(socket, session);
    return;
  }

  // express.e:10909-10913: IF firstChar='A' → abort (i:=-1, lines:=0, exit:=TRUE)
  // express.e silently clears msgBuf and goes to edit() with empty body (no "Quote aborted" msg)
  if (firstChar === 'A') {
    delete session.tempData.quoteData;
    messageData.body = [];
    messageData.currentLine = 1;
    promptForMessageBody(socket, session);
    return;
  }

  let startLine = 0;
  let endLine = 0;

  // express.e:10916-10918: stat='*' → i=1, i2=lines (all)
  if (firstChar === '*') {
    startLine = 1;
    endLine = quoteData.totalLines;
  } else {
    // express.e:10920-10924: IF(i:=InStr(str,','))<>-1 → parse start,end
    const commaIdx = raw.indexOf(',');
    if (commaIdx !== -1) {
      startLine = parseInt(raw.substring(0, commaIdx), 10) || 0;
      endLine = parseInt(raw.substring(commaIdx + 1), 10) || 0;
    }
    // If no comma found, i and i2 stay 0 → EXIT condition fails → re-prompt (express.e loops)
  }

  // express.e:10927: EXIT (i>0 AND i<=lines AND i2>0 AND i2<=lines AND i<=i2)
  const valid = startLine > 0 && startLine <= quoteData.totalLines &&
                endLine > 0 && endLine <= quoteData.totalLines &&
                startLine <= endLine;

  if (!valid) {
    // express.e loops back to LOOP label and re-shows prompt — no error message
    emitText(socket, '\r\n Enter Startline,Endline or (*=ALL, A=Abort): ');
    return; // subState stays POST_MESSAGE_QUOTE_RANGE
  }

  // express.e:10931-10944: copy selected lines, then append separator, ' ', ''
  // ORDER: selected lines → separator → blank → empty cursor line
  const quotedLines: string[] = [];

  // Copy selected lines into start of buffer (express.e:10931-10935)
  for (let i = startLine - 1; i < endLine; i++) {
    quotedLines.push(quoteData.parentLines[i]);
  }

  // Separator (express.e:10936-10939: formatLongDateTime + SetStr(str,70))
  const parentMsg = quoteData.parentMessage;
  const authorName = parentMsg.author || parentMsg.fromUser || parentMsg.fromName || 'Unknown';
  const parentDate = parentMsg.createdAt || parentMsg.created_at || parentMsg.timestamp;
  const msgDate = formatLongDateTime(parentDate instanceof Date ? parentDate : new Date(parentDate || Date.now()));
  const separator = ` -----[ ${authorName} ]--[ ${msgDate} ]----------------------------------------------------------------------`.substring(0, 70);
  quotedLines.push(separator);       // express.e:10939
  quotedLines.push(' ');             // express.e:10942 msgBuf.setItem(lines,' ')
  // express.e:10944 msgBuf.setItem(lines,'') — empty line is where cursor starts in BEG_IN

  // WEB_: mid-compose quote (from options menu) appends to existing body;
  // initial reply quote (appendToEnd=false) prepends per express.e:10931-10935
  if (quoteData.appendToEnd) {
    messageData.body.push(...quotedLines);
  } else {
    messageData.body.splice(0, 0, ...quotedLines);
  }
  messageData.currentLine = messageData.body.length + 1;

  delete session.tempData.quoteData;

  // express.e falls through to edit() which shows header+ruler+pre-existing lines
  promptForMessageBody(socket, session);
}

/**
 * Helper: Prompt for message body - express.e:10898-10909
 */
function promptForMessageBody(socket: any, session: BBSSession): void {
  // express.e: aePuts("   Enter your text. (Enter) alone to end. (75 chars/line)\n")
  emitText(socket, '\r\n   Enter your text. (Enter) alone to end. (75 chars/line)\r\n');
  // express.e:10150-10152: StrCopy(str,'|-------...');SetStr(str,75);StringF(tempstr,'   (\s)\b\n',str)
  // SetStr to 75: 9 full |-------| groups (72 chars) + |-- (3 chars) = 75
  emitText(socket, '   (|-------|-------|-------|-------|-------|-------|-------|-------|-------|--)\r\n');

  const entry = session.tempData.messageEntry;

  // If body already has content (quoting/forwarding), show existing lines first
  if (!entry.body) {
    entry.body = [];
  }
  if (!entry.currentLine) {
    entry.currentLine = entry.body.length + 1;
  }

  // Show any pre-existing lines (e.g. quote preamble inserted before editor)
  if (entry.body.length > 0) {
    entry.body.forEach((bodyLine: string, index: number) => {
      emitLinePrompt(socket, index + 1);
      emitText(socket, `${bodyLine}\r\n`);
    });
  }

  emitLinePrompt(socket, entry.currentLine);
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
    emitPrompt(socket, '     \x1b[36mTo\x1b[33m: \x1b[32m(\x1b[33mEnter\x1b[32m)\x1b[0m=\x1b[32m\'\x1b[33mALL\x1b[32m\'\x1b[32m?\x1b[0m ');
    return; // Stay in same state
  }

  // Store recipient
  session.tempData.forwardData.toUser = recipient.toUpperCase();
  emitText(socket, '\r\n');

  // Prompt for subject (express.e:9825-9826: lineInput pre-fills with mailHeader.subject)
  const originalSubject = session.tempData.forwardOriginalMessage?.subject || '';
  emitText(socket, '\x1b[36mSubject\x1b[33m: \x1b[32m(\x1b[33mBlank\x1b[32m)\x1b[0m=\x1b[33mabort\x1b[32m?\x1b[0m ');
  if (originalSubject) {
    emitText(socket, originalSubject);
    session.inputBuffer = originalSubject;
  }
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

  // express.e:9826 — lineInput('','',30,...) caps subject at 30 chars
  session.tempData.forwardData.subject = input.substring(0, 30);

  // Prompt for privacy (express.e:9837-9851)
  emitText(socket, '         \x1b[36mPrivate \x1b[32m(\x1b[33my\x1b[32m/\x1b[33mN\x1b[32m)?\x1b[0m ');
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
    // express.e:9855: aePuts('Delete original message ') then yesNo(2) = (y/N)?
    emitText(socket, 'Delete original message \x1b[32m(\x1b[33my\x1b[32m/\x1b[33mN\x1b[32m)?\x1b[0m ');
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
 * Handle delete-original confirmation after a Reply is saved — express.e:9898-9903.
 * yesNo(2): loop on CR/unknown; Y=yes, N/Enter=no.
 */
export async function handleReplyDeleteOriginalInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const ch = (input[0] || '').toUpperCase();
  if (ch !== 'Y' && ch !== 'N' && ch !== '\r' && ch !== '\n' && ch !== '') {
    return; // loop
  }
  emitText(socket, ch === 'Y' ? 'Yes\r\n' : 'No\r\n');

  if (ch === 'Y') {
    const parentId = session.tempData.replyDeleteParentId;
    if (parentId) {
      try {
        await _db.deleteMessage(parentId);
      } catch (_) { /* ignore */ }
    }
  }

  // express.e:9907 ENDPROC RESULT_SUCCESS → returns to main loop → menuPause=true
  session.menuPause = true;
  delete session.tempData?.replyDeleteParentId;
  session.subState = LoggedOnSubState.DISPLAY_MENU;
  session.tempData = undefined;
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
      timestamp: getSystemTime(),
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
  const mtime = stats.mtime || getSystemTime();
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
