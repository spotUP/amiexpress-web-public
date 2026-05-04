/**
 * Messaging Sysop Handlers
 * Extracted from messaging.handler.ts to keep file under 2000-line limit.
 * Handles M (move) and EH (edit header) sysop commands from the message reader.
 * express.e:11105-11148, 11602-11649, 27024-27084
 */

import { BBSSession } from '../../index';
import { LoggedOnSubState } from '../../constants/bbs-states';
import { AnsiUtil } from '../../utils/ansi.util';
import { emitText, emitPrompt } from '../../utils/output.util';

// Dependencies for move/edit operations (injected via setMoveEditDependencies)
let _conferences: any[] = [];
let _messageBases: any[] = [];
// _db reference — injected lazily via messaging.handler's _db through require
// We call _db.moveMessage / _db.updateMessage via the lazy require pattern below.

export function setMoveEditDependencies(deps: { conferences?: any[]; messageBases?: any[] }) {
  if (deps.conferences) _conferences = deps.conferences;
  if (deps.messageBases) _messageBases = deps.messageBases;
}

/**
 * Handle Move Message conference input
 * From express.e:27024-27049
 */
export async function handleMsgMoveConfInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const { returnToMessageReader } = require('./messaging.handler');
  const command = input.trim().toUpperCase();

  // Empty input = cancel - express.e:27028
  if (command === '') {
    emitText(socket, '\r\n');
    await returnToMessageReader(socket, session);
    return;
  }

  // L = list conferences - express.e:27030-27034
  if (command === 'L') {
    emitText(socket, '\r\n');
    emitText(socket, '                                 ');
    emitText(socket, AnsiUtil.colorize('Conference List', 'green'));
    emitText(socket, '\r\n\r\n');

    // Display accessible conferences
    for (const conf of _conferences) {
      emitText(socket, `  ${String(conf.id).padStart(3)} - ${conf.name}\r\n`);
    }

    emitText(socket, '\r\n');
    emitPrompt(socket, 'Conference Number to move to (L to List): ');
    return;
  }

  // Parse conference number
  const destConf = parseInt(command, 10);
  if (isNaN(destConf) || destConf < 1) {
    emitText(socket, '\r\n');
    emitText(socket, AnsiUtil.errorLine('Invalid conference number'));
    emitPrompt(socket, 'Conference Number to move to (L to List): ');
    return;
  }

  // Find conference
  const conference = _conferences.find(c => c.id === destConf);
  if (!conference) {
    emitText(socket, '\r\n');
    emitText(socket, AnsiUtil.errorLine('You do not have access to the requested conference'));
    emitText(socket, '\r\n');
    emitPrompt(socket, 'Conference Number to move to (L to List): ');
    return;
  }

  // Check if same conference
  if (destConf === session.currentConf) {
    // Check if conference has multiple message bases
    const confMsgBases = _messageBases.filter(mb => mb.conferenceId === destConf);
    if (confMsgBases.length <= 1) {
      emitText(socket, '\r\n');
      emitText(socket, 'You have not changed the message location\r\n');
      await returnToMessageReader(socket, session);
      return;
    }
  }

  // Store destination conference
  session.tempData.moveDestConf = destConf;
  session.tempData.moveDestConfName = conference.name;

  // Show confirmation - express.e:27051-27052
  emitText(socket, '\r\n');
  emitText(socket, `You have chosen conference: ${conference.name}\r\n`);

  // Check if destination conference has multiple message bases - express.e:27055-27084
  const destMsgBases = _messageBases.filter(mb => mb.conferenceId === destConf);
  if (destMsgBases.length > 1) {
    emitText(socket, '\r\n');
    emitPrompt(socket, 'Messagebase Number to move to (L to List): ');
    session.subState = LoggedOnSubState.MSG_MOVE_MSGBASE_INPUT;
  } else {
    // Single msgbase, use it and go to confirmation
    session.tempData.moveDestMsgBase = destMsgBases[0]?.id || 1;
    emitText(socket, '\r\n');
    emitPrompt(socket, 'Move message (y/n)? ');
    session.subState = LoggedOnSubState.MSG_MOVE_CONFIRM;
  }
}

/**
 * Handle Move Message msgbase input
 * From express.e:27058-27084
 */
export async function handleMsgMoveMsgBaseInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const { returnToMessageReader } = require('./messaging.handler');
  const command = input.trim().toUpperCase();
  const destConf = session.tempData.moveDestConf;

  // Empty input = cancel
  if (command === '') {
    emitText(socket, '\r\n');
    await returnToMessageReader(socket, session);
    return;
  }

  // L = list message bases - express.e:27064-27071
  if (command === 'L') {
    emitText(socket, '\r\n');
    emitText(socket, '                                 ');
    emitText(socket, AnsiUtil.colorize('Messagebase List', 'green'));
    emitText(socket, '\r\n\r\n');

    const destMsgBases = _messageBases.filter(mb => mb.conferenceId === destConf);
    destMsgBases.forEach((mb, index) => {
      emitText(socket, `  ${String(index + 1).padStart(3)} - ${mb.name}\r\n`);
    });

    emitText(socket, '\r\n');
    emitPrompt(socket, 'Messagebase Number to move to (L to List): ');
    return;
  }

  // Parse msgbase number (1-indexed relative)
  const destMsgBaseNum = parseInt(command, 10);
  const destMsgBases = _messageBases.filter(mb => mb.conferenceId === destConf);

  if (isNaN(destMsgBaseNum) || destMsgBaseNum < 1 || destMsgBaseNum > destMsgBases.length) {
    emitText(socket, '\r\n');
    emitText(socket, AnsiUtil.errorLine('Invalid message base number'));
    emitPrompt(socket, 'Messagebase Number to move to (L to List): ');
    return;
  }

  // Get actual msgbase ID from relative number
  const destMsgBase = destMsgBases[destMsgBaseNum - 1];
  session.tempData.moveDestMsgBase = destMsgBase.id;

  // Check if same location
  if (destConf === session.currentConf && destMsgBase.id === session.currentMsgBase) {
    emitText(socket, '\r\n');
    emitText(socket, 'You have not changed the message location\r\n');
    await returnToMessageReader(socket, session);
    return;
  }

  // Show confirmation - express.e:27080-27082
  emitText(socket, '\r\n');
  emitText(socket, `You have chosen message base: ${destMsgBase.name}\r\n`);

  // Go to confirmation
  emitText(socket, '\r\n');
  emitPrompt(socket, 'Move message (y/n)? ');
  session.subState = LoggedOnSubState.MSG_MOVE_CONFIRM;
}

/**
 * Handle Move Message confirmation
 * From express.e:11846-11849 — yesNo(0): single char, loop on CR / invalid,
 * only Y or N exits the prompt. We previously used yesNo(2) semantics
 * (default N on CR), which silently cancelled moves when users hit Enter
 * out of habit. Now mirrors express.e: empty input / unknown char → stay
 * in the prompt; only first char Y or N decides the outcome.
 */
export async function handleMsgMoveConfirm(socket: any, session: BBSSession, input: string): Promise<void> {
  const { returnToMessageReader, displaySingleMessage, saveMessagePointerAndExit: _saveAndExit } = require('./messaging.handler');
  const ch = (input[0] || '').toUpperCase();

  // yesNo(0) loops on CR / invalid — caller stays in MSG_MOVE_CONFIRM substate.
  if (ch !== 'Y' && ch !== 'N') return;

  if (ch === 'N') {
    emitText(socket, 'No\r\n');
    await returnToMessageReader(socket, session);
    return;
  }
  emitText(socket, 'Yes\r\n');

  const msg = session.tempData.moveMessage;
  const destConf = session.tempData.moveDestConf;
  const destMsgBase = session.tempData.moveDestMsgBase;

  // Access _db via the messaging.handler module (it owns the DI'd _db reference)
  const { _getDb } = require('./messaging.handler');

  try {
    // Move message in database
    await _getDb('handleMsgMoveConfirm').moveMessage(msg.id, destConf, destMsgBase);

    emitText(socket, '\r\n');
    emitText(socket, AnsiUtil.successLine(`Message ${msg.id} moved to conference ${session.tempData.moveDestConfName}`));
    emitText(socket, '\r\n');

    // Remove from reader's message list
    const messages = session.tempData.msgReaderMessages;
    const currentIndex = session.tempData.moveMessageIndex;
    messages.splice(currentIndex, 1);
    session.tempData.msgReaderMessages = messages;

    // Clean up move temp data
    delete session.tempData.moveMessage;
    delete session.tempData.moveMessageIndex;
    delete session.tempData.moveDestConf;
    delete session.tempData.moveDestConfName;
    delete session.tempData.moveDestMsgBase;

    // If no more messages, exit
    if (messages.length === 0) {
      emitText(socket, 'No more messages.\r\n');
      await _saveAndExit(socket, session);
      return;
    }

    // Display next message
    const nextIndex = currentIndex < messages.length ? currentIndex : currentIndex - 1;
    await displaySingleMessage(socket, session, nextIndex);
  } catch (err) {
    console.error('[MSG_MOVE] Error moving message:', err);
    emitText(socket, '\r\n');
    emitText(socket, AnsiUtil.errorLine('Error moving message'));
    await returnToMessageReader(socket, session);
  }
}

/**
 * Handle Edit Header: From input
 * From express.e:11611-11621
 */
export async function handleMsgEditHeaderFrom(socket: any, session: BBSSession, input: string): Promise<void> {
  const trimmed = input.trim();

  // Empty = keep current value
  if (trimmed !== '') {
    session.tempData.editHeader.from = trimmed;
  }

  // Prompt for To - express.e:11623-11627
  const currentTo = session.tempData.editHeader.to;
  emitText(socket, `     ${AnsiUtil.colorize('  To', 'cyan')}${AnsiUtil.colorize(':', 'yellow')} `);
  emitText(socket, `${AnsiUtil.colorize('(', 'green')}${AnsiUtil.colorize('Enter', 'yellow')}${AnsiUtil.colorize(')', 'green')}`);
  emitText(socket, `=${AnsiUtil.colorize("'", 'green')}${AnsiUtil.colorize(currentTo, 'yellow')}${AnsiUtil.colorize("'", 'green')}${AnsiUtil.colorize('?', 'green')} `);
  session.subState = LoggedOnSubState.MSG_EDIT_HEADER_TO;
}

/**
 * Handle Edit Header: To input
 * From express.e:11623-11629
 */
export async function handleMsgEditHeaderTo(socket: any, session: BBSSession, input: string): Promise<void> {
  const trimmed = input.trim();

  // Empty = keep current value
  if (trimmed !== '') {
    session.tempData.editHeader.to = trimmed;
  }

  // Prompt for Subject - express.e:11630-11634
  const currentSubject = session.tempData.editHeader.subject;
  emitText(socket, `  ${AnsiUtil.colorize('Subject', 'cyan')}${AnsiUtil.colorize(':', 'yellow')} `);
  emitText(socket, `${AnsiUtil.colorize('(', 'green')}${AnsiUtil.colorize('Enter', 'yellow')}${AnsiUtil.colorize(')', 'green')}`);
  emitText(socket, `=${AnsiUtil.colorize("'", 'green')}${AnsiUtil.colorize(currentSubject, 'yellow')}${AnsiUtil.colorize("'", 'green')}${AnsiUtil.colorize('?', 'green')} `);
  session.subState = LoggedOnSubState.MSG_EDIT_HEADER_SUBJECT;
}

/**
 * Handle Edit Header: Subject input
 * From express.e:11630-11634
 */
export async function handleMsgEditHeaderSubject(socket: any, session: BBSSession, input: string): Promise<void> {
  const trimmed = input.trim();

  // Empty = keep current value
  if (trimmed !== '') {
    session.tempData.editHeader.subject = trimmed;
  }

  // express.e:11636-11640: Private prompt — only shown if aFlag=FALSE (not ALL recipient)
  const editTo = (session.tempData.editHeader.to || '').toUpperCase();
  if (editTo !== 'ALL' && editTo !== 'EALL') {
    emitText(socket, '         \x1b[36mPrivate \x1b[32m(\x1b[33my\x1b[32m/\x1b[33mN\x1b[32m)?\x1b[0m ');
    session.subState = LoggedOnSubState.MSG_EDIT_HEADER_PRIVATE;
  } else {
    // ALL/EALL recipients can't be private — skip to save
    session.tempData.editHeader.isPrivate = false;
    await saveEditedHeader(socket, session);
  }
}

/**
 * Handle Edit Header: Private Y/N input — express.e:11638 yesNo(2), single char, CR=No
 * From express.e:11636-11648
 */
export async function handleMsgEditHeaderPrivate(socket: any, session: BBSSession, input: string): Promise<void> {
  const ch = (input[0] || '').toUpperCase();
  // yesNo(2): Y/y = yes, N/n/CR/empty = no, anything else = loop
  if (ch !== 'Y' && ch !== 'N' && ch !== '\r' && ch !== '\n' && ch !== '') return;

  const isPrivate = ch === 'Y';
  emitText(socket, isPrivate ? 'Yes\r\n' : 'No\r\n');
  session.tempData.editHeader.isPrivate = isPrivate;
  await saveEditedHeader(socket, session);
}

async function saveEditedHeader(socket: any, session: BBSSession): Promise<void> {
  const { displaySingleMessage, returnToMessageReader, _getDb } = require('./messaging.handler');
  const msg = session.tempData.editMessage;
  const editHeader = session.tempData.editHeader;
  const currentIndex = session.tempData.editMessageIndex;

  try {
    // express.e:11643 — editHeader sets mh.recv:=0; the edited message is treated as fresh.
    await _getDb('saveEditedHeader').updateMessage(msg.id, {
      author: editHeader.from,
      toUser: editHeader.to,
      subject: editHeader.subject,
      isPrivate: editHeader.isPrivate,
      receivedAt: null
    });

    // express.e:11643 saveOverHeader(gfh) — persist edited header to the
    // canonical HeaderFile on disk. Without this, doors reading messages
    // directly from disk would still see the old from/to/subject. The
    // status flag follows our enterMSG rules: PRIVATE if isPrivate else
    // CENSORED if poster has ACS_CENSORED else NORMAL. We don't have the
    // editor's ACS context here so we just preserve the existing status,
    // toggling only the PRIVATE bit.
    try {
      const { messageIndexManager, MsgStatus } = require('../../services/MessageIndexManager');
      const confId = session.tempData.msgReaderConfId || session.currentConf || 1;
      const msgNum = (msg.msgNumber || msg.id);
      const newStatus = editHeader.isPrivate
        ? MsgStatus.PRIVATE
        : (msg.status === MsgStatus.CENSORED || msg.status === 'p' ? MsgStatus.CENSORED : MsgStatus.NORMAL);
      messageIndexManager.updateMessageHeader(confId, msgNum, {
        toName: (editHeader.to || '').substring(0, 31),
        fromName: (editHeader.from || '').substring(0, 31),
        subject: (editHeader.subject || '').substring(0, 31),
        status: newStatus,
        recv: 0,
      });
    } catch (e) {
      console.error('[MSG_EDIT] Failed to update HeaderFile on disk:', e);
      // Continue — DB has the changes, doors will be out of sync until next sync.
    }

    const messages = session.tempData.msgReaderMessages;
    if (messages[currentIndex]) {
      messages[currentIndex].author = editHeader.from;
      messages[currentIndex].toUser = editHeader.to;
      messages[currentIndex].subject = editHeader.subject;
      messages[currentIndex].isPrivate = editHeader.isPrivate;
      messages[currentIndex].receivedAt = null;
    }

    delete session.tempData.editMessage;
    delete session.tempData.editMessageIndex;
    delete session.tempData.editHeader;

    // express.e:11150: displayMessage + JUMP nextMenu (re-display then nav prompt)
    await displaySingleMessage(socket, session, currentIndex);
  } catch (err) {
    console.error('[MSG_EDIT] Error updating message header:', err);
    await returnToMessageReader(socket, session);
  }
}
