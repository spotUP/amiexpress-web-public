/**
 * Messaging Handler - the R and E commands' entry points.
 *
 * R hands over to read-msg.ts, the port of express.e's readMSG; E starts
 * message entry (message-entry.handler.ts). The board's earlier reader -
 * a pre-filtered list walked by index, with its own move, edit-header,
 * forward and translation sub-states - was removed once every path read
 * through read-msg (2026-10-02).
 */

import { BBSSession } from '../../index';
import { messageIndent, narrowField } from '../../utils/table-format.util';
import { LoggedOnSubState } from '../../constants/bbs-states';
import { checkSecurity } from '../../utils/acs.util';
import { ACSPermission } from '../../constants/acs-permissions';
import { EnvStat } from '../../constants/env-codes';
import { ErrorHandler } from '../../utils/error-handling.util';
import { emitText } from '../../utils/output.util';
import { messageRule } from '../../utils/table-format.util';

// Dependencies (injected)
let _db: any;
let _setEnvStat: any;
let _setMessagingDependenciesCallCount = 0;

function _requireDb(caller: string): any {
  if (!_db) {
    throw new Error(
      `[messaging.handler] _db is undefined in ${caller} — setMessagingDependencies ` +
      `was called ${_setMessagingDependenciesCallCount} time(s) but none provided deps.db. ` +
      `If the count is 0, initializeData() aborted pre-DI; check server logs. If >0, ` +
      `check if module duplication is happening (dynamic import vs static import).`
    );
  }
  return _db;
}

/** The injected database, with the DI guard - read-msg uses it for U. */
export function _getDb(caller: string): any {
  return _requireDb(caller);
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
  _setMessagingDependenciesCallCount++;
  const hasDb = !!deps.db;
  const hasCallersLog = !!deps.callersLog;
  const hasSetEnvStat = !!deps.setEnvStat;
  if (deps.db) _db = deps.db;
  if (deps.setEnvStat) _setEnvStat = deps.setEnvStat;
  // Diagnostic for the 2026-04-24 read-mail crash: log what arrived in each
  // setter call so we can see if _db ever actually lands.
  const callerLine = (new Error().stack || '').split('\n')[2]?.trim() || '(stack unavailable)';
  console.log(`[setMessagingDependencies] call #${_setMessagingDependenciesCallCount} hasDb=${hasDb} hasCallersLog=${hasCallersLog} hasSetEnvStat=${hasSetEnvStat} _dbTypeAfter=${typeof _db} from ${callerLine}`);
}

/**
 * R Command: Read Messages (internalCommandR)
 * Original: express.e:25518-25531, 11000-11250
 *
 * The reader itself is read-msg.ts (readMSG, express.e:11972-12296).
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

  // express.e:25523 getMailStatFile, then callMsgFuncs(MAIL_READ) -> readMSG.
  const { startReadMSG } = require('./read-msg');
  startReadMSG(socket, session, params);
}

/**
 * The message-read header (C64/40-col Task 5d).
 *
 * 80 columns: express.e:8900-8937's padded-30 field pairs, byte-identical.
 * Narrow: one field per line via narrowField, so nothing is clipped and no
 * pair folds.
 */
export function buildMessageHeaderLines(fields: {
  dateStr: string;
  msgNumber: number | string;
  toDisplay: string;
  recvd: string;
  from: string;
  statusStr: string;
  subject: string;
}, narrow: boolean): string[] {
  const { dateStr, msgNumber, toDisplay, recvd, from, statusStr, subject } = fields;
  if (!narrow) {
    return [
      `\x1b[32mDate   \x1b[33m: \x1b[0m${dateStr.padEnd(30)}   \x1b[32mNumber\x1b[33m: \x1b[0m${msgNumber}`,
      `\x1b[32mTo     \x1b[33m: \x1b[0m${toDisplay.padEnd(30)}  \x1b[32mRecv\x27d\x1b[33m: \x1b[0m${recvd}`,
      `\x1b[32mFrom   \x1b[33m: \x1b[0m${from.padEnd(30)}   \x1b[32mStatus\x1b[33m: \x1b[0m${statusStr}`,
      `\x1b[32mSubject\x1b[33m: \x1b[0m${subject}`,
    ];
  }
  return [
    narrowField('Date', dateStr),
    narrowField('Number', String(msgNumber)),
    narrowField('To', toDisplay),
    narrowField("Recv'd", recvd),
    narrowField('From', from),
    narrowField('Status', statusStr),
    narrowField('Subject', subject),
  ];
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
  if (!checkSecurity(session.user, ACSPermission.ENTER_MESSAGE)) {
    ErrorHandler.permissionDenied(socket, 'post messages', {
      nextState: LoggedOnSubState.DISPLAY_CONF_BULL
    });
    return;
  }

  _setEnvStat(session, EnvStat.MAIL);

  // express.e:12471 captureRealAndInternetNames(conf, msgBaseNum) — gate the
  // entry on REALNAME/INTERNETNAME tooltype requirements. When the user
  // hasn't filled the required field, captureNames now prompts inline (per
  // express.e:28166-28225) and resumes by re-invoking this command after
  // the user supplies the value. We pass `params` through the resume so
  // the original `E <name>` form keeps its prefilled recipient.
  const { captureRealAndInternetNames: captureNames } = require('./message-entry.handler');
  if (typeof captureNames === 'function') {
    const ok = captureNames(socket, session, () => {
      handleEnterMessageFullCommand(socket, session, params);
    });
    if (!ok) return;
  }

  // express.e msgToHeader():9998-10001
  emitText(socket, `\r\n${messageRule(session, 'headerBox')}\r\n`);

  session.inputBuffer = '';
  session.tempData = { isPrivate: true, messageEntry: {} };

  // express.e:10764 firstparam:=parsedParams.item(0) - the first word only.
  const firstParam = params.trim().split(/\s+/)[0] || '';
  if (firstParam && firstParam.length <= 30) {
    // express.e:10762-10774: parsedParams[0] ≤ 30 chars → pre-fill To:, JUMP skipEntry
    //   AstrCopy(mailHeader.toName, firstparam, 31)
    //   msgToHeader()                — separator already emitted above
    //   aePuts(mailHeader.toName)    — echo prefilled name
    //   aePuts('\b\n')               — post-name newline
    //   JUMP skipEntry               — fall into EALL/sysop/chooseAName chain
    //
    // Echo the To: prompt with the prefilled name + post-name newline, then
    // route through processToRecipient to run the FULL skipEntry sequence
    // (EALL exact match, sysop loadAccount, chooseAName canonical-form,
    // checkConfAccess, checkToForward). Previously this branch only handled
    // EALL and skipped the rest, allowing pre-filled recipients to bypass
    // sysop comment routing, conference-access checks, and FORWARDMAIL.
    emitText(socket, `${messageIndent(session, 'to')}\x1b[36mTo\x1b[33m: \x1b[32m(\x1b[33mEnter\x1b[32m)\x1b[0m=\x1b[32m\'\x1b[33mALL\x1b[32m\'\x1b[32m?\x1b[0m ${firstParam}\r\n`);
    const { processToRecipient } = require('./message-entry.handler');
    session.subState = LoggedOnSubState.POST_MESSAGE_TO;
    void processToRecipient(socket, session, firstParam).catch((err: unknown) => console.error('[E]', err));
  } else {
    // No params — show To: prompt (express.e:10778-10780)
    emitText(socket, `${messageIndent(session, 'to')}\x1b[36mTo\x1b[33m: \x1b[32m(\x1b[33mEnter\x1b[32m)\x1b[0m=\x1b[32m\'\x1b[33mALL\x1b[32m\'\x1b[32m?\x1b[0m `);
    session.subState = LoggedOnSubState.POST_MESSAGE_TO;
  }
}
