/**
 * Message Forward Handler — extracted from message-entry.handler.ts to
 * keep that file under the 2000-line limit.
 *
 * Hosts the F (forward) flow + the reply-delete-original confirmation:
 *   handleForwardMessageToInput          (express.e:9817-9871)
 *   handleForwardMessageSubjectInput     (express.e:9826-9835)
 *   handleForwardMessagePrivateInput     (express.e:9837-9851)
 *   handleForwardMessageDeleteOriginalInput  (express.e:9853-9860)
 *   handleReplyDeleteOriginalInput       (express.e:9898-9903)
 *   saveForwardedMessage                 (express.e:9862-9871)
 *
 * Re-exported from message-entry.handler.ts so existing imports keep
 * resolving — no touch needed on command.handler / input-handlers.
 */

import { BBSSession } from '../../index';
import { LoggedOnSubState } from '../../constants/bbs-states';
import { ACSPermission } from '../../constants/acs-permissions';
import { checkSecurity } from '../../utils/security.util';
import { emitText } from '../../utils/output.util';
import { config } from '../../config';
import { getSystemTime } from '../../utils/date-time.util';
import {
  isExtSendMsgBase,
  applyConfForwardMail,
} from './message-entry.handler';

// Dependencies injected from index.ts / initialization.ts.
let _db: any;

export function setMessageForwardDependencies(deps: { db: any }): void {
  _db = deps.db;
}

export async function handleForwardMessageToInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const trimmed = (input || '').trim().substring(0, 30);
  // Stash a temporary messageEntry so the existing isExtSendMsgBase /
  // applyConfForwardMail helpers (which read session.tempData.messageEntry)
  // work in the forward context too.
  session.tempData.messageEntry = session.tempData.messageEntry || {};

  if (trimmed === '') {
    session.tempData.forwardData.toUser = 'ALL';
    session.tempData.messageEntry.toUser = 'ALL';
    emitText(socket, '\r\n');
    applyConfForwardMail(socket, session);
    if (session.tempData.messageEntry.toUser !== 'ALL') {
      session.tempData.forwardData.toUser = session.tempData.messageEntry.toUser;
    }
    promptForwardSubject(socket, session);
    return;
  }

  const lower = trimmed.toLowerCase();
  if (lower === 'eall') {
    if (isExtSendMsgBase(session)) {
      emitText(socket, "\r\nCan't use EALL in external message bases!!\r\n\r\n");
      // Bail back to reader rather than dropping to menu — forward was cancelled
      const currentIndex = session.tempData.forwardOriginalIndex || 0;
      session.subState = LoggedOnSubState.MSG_READER_NAV;
      delete session.tempData.forwardData;
      delete session.tempData.forwardOriginalMessage;
      const { displaySingleMessage } = require('./messaging.handler');
      await displaySingleMessage(socket, session, currentIndex);
      return;
    }
    if (!checkSecurity(session.user, ACSPermission.EALL_MESSAGES)) {
      emitText(socket, '\r\nUser does not exist!!\r\n\r\n');
      const currentIndex = session.tempData.forwardOriginalIndex || 0;
      session.subState = LoggedOnSubState.MSG_READER_NAV;
      delete session.tempData.forwardData;
      delete session.tempData.forwardOriginalMessage;
      const { displaySingleMessage } = require('./messaging.handler');
      await displaySingleMessage(socket, session, currentIndex);
      return;
    }
    session.tempData.forwardData.toUser = 'EALL';
    session.tempData.messageEntry.toUser = 'EALL';
    emitText(socket, '\r\n');
    applyConfForwardMail(socket, session);
    promptForwardSubject(socket, session);
    return;
  }

  if (lower === 'sysop') {
    session.tempData.forwardData.toUser = 'SYSOP';
    session.tempData.messageEntry.toUser = 'SYSOP';
    emitText(socket, '\r\n');
    applyConfForwardMail(socket, session);
    if (session.tempData.messageEntry.toUser !== 'SYSOP') {
      session.tempData.forwardData.toUser = session.tempData.messageEntry.toUser;
    }
    promptForwardSubject(socket, session);
    return;
  }

  // express.e:10822-10841 — chooseAName + canonical name + checkConfAccess.
  // Forward path uses the same logic as enterMSG.
  let resolved = trimmed;
  let resolvedUser: any = null;
  try {
    if (_db?.getUserByUsername) {
      resolvedUser = await _db.getUserByUsername(trimmed);
    }
  } catch {
    /* fall through — accept as-is */
  }

  if (resolvedUser) {
    const confId = session.currentConf || 1;
    const msgBaseId = session.currentMsgBase || 1;
    const { getConferenceToolFlags } = require('../../utils/conference-tooltypes.util');
    const flags = getConferenceToolFlags(confId);
    // express.e:5017-5024 priority order (REALNAME wins over INTERNETNAME).
    // Mirrors processToRecipient in message-entry.handler.ts.
    const requireRealname = flags?.requireRealname || flags?.requireRealnameMsgBases?.has?.(msgBaseId);
    const requireInternetname = flags?.requireInternetname || flags?.requireInternetnameMsgBases?.has?.(msgBaseId);
    if (requireRealname && resolvedUser.realName) {
      resolved = String(resolvedUser.realName).substring(0, 26);
    } else if (requireInternetname && (resolvedUser.internetName || resolvedUser.internetname)) {
      resolved = String(resolvedUser.internetName || resolvedUser.internetname).substring(0, 10);
    } else if (resolvedUser.username) {
      resolved = String(resolvedUser.username).substring(0, 31);
    }
    const { checkConfAccess } = require('./message-scan.handler');
    if (typeof checkConfAccess === 'function' && !checkConfAccess(resolvedUser, confId)) {
      emitText(socket, '\r\nUser does not have access to this conference!\r\n\r\n');
      const currentIndex = session.tempData.forwardOriginalIndex || 0;
      session.subState = LoggedOnSubState.MSG_READER_NAV;
      delete session.tempData.forwardData;
      delete session.tempData.forwardOriginalMessage;
      const { displaySingleMessage } = require('./messaging.handler');
      await displaySingleMessage(socket, session, currentIndex);
      return;
    }
  }

  session.tempData.forwardData.toUser = resolved;
  session.tempData.messageEntry.toUser = resolved;
  emitText(socket, '\r\n');
  applyConfForwardMail(socket, session);
  if (session.tempData.messageEntry.toUser !== resolved) {
    session.tempData.forwardData.toUser = session.tempData.messageEntry.toUser;
  }
  promptForwardSubject(socket, session);
}

function promptForwardSubject(socket: any, session: BBSSession): void {
  // express.e:9825-9826: Subject prompt with default = original subject.
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
 *
 * yesNo(2) semantics: y/Y/n/N exit; CR defaults to N; anything else loops.
 */
export async function handleForwardMessagePrivateInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const ch = (input[0] || '').toUpperCase();
  if (ch !== 'Y' && ch !== 'N' && ch !== '\r' && ch !== '\n' && ch !== '') {
    return; // loop — yesNo(2) waits for valid char
  }
  const isPrivate = ch === 'Y';
  emitText(socket, isPrivate ? 'Yes\r\n' : 'No\r\n');

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
 *
 * yesNo(2) semantics: y/Y/n/N exit; CR defaults to N; anything else loops.
 */
export async function handleForwardMessageDeleteOriginalInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const ch = (input[0] || '').toUpperCase();
  if (ch !== 'Y' && ch !== 'N' && ch !== '\r' && ch !== '\n' && ch !== '') {
    return; // loop
  }
  const deleteOriginal = ch === 'Y';
  emitText(socket, deleteOriginal ? 'Yes\r\n' : 'No\r\n');

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
 *
 * Goes through writeMessageFile so the forwarded message gets the same
 * lockMsgBase + canonical-status + attachment-list treatment as enterMSG
 * outputs. Status follows express.e:9843-9851 — 'R' if Private, 'p' if
 * censored or original was 'p', else 'P'.
 */
async function saveForwardedMessage(socket: any, session: BBSSession, deleteOriginal: boolean): Promise<void> {
  emitText(socket, '\r\nSaving...');

  try {
    const originalMsg = session.tempData.forwardOriginalMessage;
    const forwardData = session.tempData.forwardData;

    // express.e:9843-9851 status computation:
    //   Private → 'R'
    //   Public + (ACS_CENSORED OR original was 'p') → 'p'
    //   Public                                       → 'P'
    const { MsgStatus } = require('../../services/MessageIndexManager');
    const wasOriginalCensored = originalMsg?.status === 'p' ||
                                originalMsg?.status === MsgStatus.CENSORED ||
                                originalMsg?.censored === true;
    const userIsCensored = checkSecurity(session.user, ACSPermission.CENSORED);
    let status: number;
    if (forwardData.isPrivate) {
      status = MsgStatus.PRIVATE; // 'R'
    } else if (userIsCensored || wasOriginalCensored) {
      status = MsgStatus.CENSORED; // 'p'
    } else {
      status = MsgStatus.NORMAL; // 'P'
    }

    const { writeMessageFile, formatMessageDate } = require('../../utils/message-file.util');
    const { getConfMailNameFor } = require('./message-entry.handler');
    const messageDate = getSystemTime();
    const confId = originalMsg.conferenceId || session.currentConf || 1;
    const msgBaseId = originalMsg.messageBaseId || session.currentMsgBase || 1;
    // express.e:10649 — fromName from confMailName, NOT raw username.
    // For forward we resolve relative to the destination conf/msgBase.
    const fromName = getConfMailNameFor(session.user, confId, msgBaseId);
    // express.e:10707-10711 — forwarded messages also write A<N> attachment
    // list when present (forward inherits attachments from original).
    const inheritedAttachments: string[] = (originalMsg as any)?.attachments || [];
    const msgNum = await writeMessageFile(
      confId,
      msgBaseId,
      {
        from: fromName,
        to: forwardData.toUser,
        subject: forwardData.subject,
        date: formatMessageDate(messageDate),
        body: originalMsg.body || '',
        status,
        attachments: inheritedAttachments.length > 0
          ? { filenames: inheritedAttachments, deleteOnMessageDelete: false }
          : undefined,
      } as any,
      config.get('dataDir'),
      session.nodeId || 0,
    );

    // express.e:10692-10705: aePuts('Message Number N...done!\b\n\b\n')
    emitText(socket, `Message Number ${msgNum}...done!`);

    // Mirror to DB for web UI / search index — disk has the canonical copy.
    await _db.createMessage({
      subject: forwardData.subject,
      body: originalMsg.body,
      author: fromName,
      timestamp: messageDate,
      conferenceId: confId,
      messageBaseId: msgBaseId,
      isPrivate: forwardData.isPrivate,
      toUser: forwardData.toUser,
      parentId: null,
      attachments: inheritedAttachments,
      edited: false,
      editedBy: null,
      editedAt: null,
      censored: status === MsgStatus.CENSORED,
    } as any, { skipDiskWrite: true });

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
