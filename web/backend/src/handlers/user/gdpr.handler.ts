/**
 * GDPR self-service handlers (Phase 3).
 *
 * Invoked from the W (Write User Parameters) menu via options 19 (view my
 * data) and 20 (delete my account / GDPR erasure). Three-step erasure
 * confirm: literal 'YES ERASE' → re-enter password → type username
 * verbatim → eraseUserData().
 *
 * See thoughts/shared/plans/2026-04-24-gdpr-hobby-baseline.md Phase 3.
 */

import type { BBSSession } from '../../index';
import { LoggedOnSubState } from '../../constants/bbs-states';
import { AnsiUtil } from '../../utils/ansi.util';
import { emitText, emitPrompt } from '../../utils/output.util';
import { eraseUserData } from '../../services/gdpr-erasure.service';
import { db } from '../../database';
// Runtime require for bcrypt to match the import style used elsewhere in the
// codebase (avoids TypeScript default-import interop surprises).
const bcrypt: any = require('bcryptjs');

function setPasswordMask(socket: any, session: any, enabled: boolean) {
  if (!!session.maskInput === enabled) return;
  session.maskInput = enabled;
  socket.emit('password-mode', enabled);
}

/**
 * W option 19 — print the user's full record and return to the W menu.
 * Output is plain-text; if it overflows a single screen, the existing
 * pagination in socket-emit handles the pause.
 */
export async function handleViewMyDataOption(socket: any, session: BBSSession): Promise<void> {
  const user = session.user;
  if (!user) return;

  emitText(socket, '\r\n');
  emitText(socket, AnsiUtil.colorize('-= YOUR DATA ON FILE =-\r\n', 'cyan'));
  emitText(socket, '\r\n');

  const rows: Array<[string, string]> = [
    ['Handle',          user.username || '(none)'],
    ['Real name',       user.realname || '(none)'],
    ['Location/Group',  user.location || '(blank)'],
    ['Phone',           user.phone || '(blank)'],
    ['Email',           user.email || '(blank)'],
    ['Security level',  String(user.secLevel ?? 0)],
    ['First login',     user.firstLogin ? new Date(user.firstLogin as any).toISOString() : '(unknown)'],
    ['Last login',      user.lastLogin ? new Date(user.lastLogin as any).toISOString() : '(unknown)'],
    ['Calls total',     String(user.calls ?? 0)],
    ['Uploads',         String(user.uploads ?? 0)],
    ['Downloads',       String(user.downloads ?? 0)],
    ['Bytes uploaded',  String(user.bytesUpload ?? 0)],
    ['Bytes downloaded',String(user.bytesDownload ?? 0)],
    ['Consent at',      (user as any).gdprConsentAt || '(none)'],
    ['Consent version', (user as any).gdprNoticeVersion || '(none)'],
    ['Consent source',  (user as any).gdprConsentSource || '(none)'],
  ];

  for (const [k, v] of rows) {
    emitText(socket, AnsiUtil.colorize(`${k.padEnd(17, ' ')}: `, 'magenta'));
    emitText(socket, AnsiUtil.colorize(v, 'yellow'));
    emitText(socket, '\r\n');
  }

  emitText(socket, '\r\n');
  emitText(socket, AnsiUtil.colorize(
    'You can also ask the sysop for a copy of any logs that still reference you.\r\n',
    'white'
  ));
  emitText(socket, '\r\n');
  emitPrompt(socket, AnsiUtil.pressKeyPrompt());

  // Caller (handleWOptionSelectInput) has already returned — we rely on the
  // outer state machine to put us back at the W menu after the pause.
  session.menuPause = true;
  session.subState = LoggedOnSubState.W_OPTION_SELECT;
}

/**
 * W option 20 — begin the 3-step erasure confirm.
 */
export function startForgetMe(socket: any, session: BBSSession): void {
  emitText(socket, '\r\n');
  emitText(socket, AnsiUtil.colorize('-= DELETE MY ACCOUNT (GDPR) =-\r\n', 'red'));
  emitText(socket, '\r\n');
  emitText(socket, AnsiUtil.colorize('WARNING: this action is irreversible.\r\n', 'red'));
  emitText(socket, 'Your profile, posts, and session logs will be scrubbed.\r\n');
  emitText(socket, 'See Documentation/PRIVACY.md for details.\r\n');
  emitText(socket, '\r\n');
  emitText(socket, AnsiUtil.colorize('Type ', 'white'));
  emitText(socket, AnsiUtil.colorize('YES ERASE', 'red'));
  emitText(socket, AnsiUtil.colorize(' to continue (case-sensitive), anything else cancels: ', 'white'));

  session.subState = LoggedOnSubState.W_FORGETME_CONFIRM;
  session.inputBuffer = '';
}

export async function handleForgetMeConfirmInput(socket: any, session: BBSSession, input: string): Promise<void> {
  // NOTE: case-sensitive to prevent accidental invocation.
  if (input !== 'YES ERASE') {
    emitText(socket, '\r\n');
    emitText(socket, AnsiUtil.colorize('Deletion cancelled.\r\n', 'green'));
    emitText(socket, '\r\n');
    session.subState = LoggedOnSubState.W_OPTION_SELECT;
    const { handleWriteUserParamsCommand } = require('../commands/info-commands.handler');
    handleWriteUserParamsCommand(socket, session);
    return;
  }

  emitText(socket, '\r\n');
  setPasswordMask(socket, session, true);
  emitText(socket, AnsiUtil.colorize('Re-enter your password: ', 'white'));
  session.subState = LoggedOnSubState.W_FORGETME_PASSWORD;
  session.inputBuffer = '';
}

export async function handleForgetMePasswordInput(socket: any, session: BBSSession, input: string): Promise<void> {
  setPasswordMask(socket, session, false);
  const user: any = session.user;
  if (!user || !user.passwordHash) {
    await cancelErasure(socket, session, 'No password set on this account. Contact the sysop.');
    return;
  }

  let ok = false;
  try {
    ok = await bcrypt.compare(input, user.passwordHash);
  } catch (error) {
    console.warn('[gdpr] password compare failed:', error);
  }
  if (!ok) {
    await cancelErasure(socket, session, 'Password incorrect. Deletion cancelled.');
    return;
  }

  emitText(socket, '\r\n');
  emitText(socket, AnsiUtil.colorize(
    `Type your username (${user.username}) to confirm: `,
    'white'
  ));
  session.subState = LoggedOnSubState.W_FORGETME_USERNAME;
  session.inputBuffer = '';
}

export async function handleForgetMeUsernameInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const user: any = session.user;
  if (!user) {
    await cancelErasure(socket, session, 'Session has no user bound. Deletion cancelled.');
    return;
  }

  if (input !== user.username) {
    await cancelErasure(socket, session, 'Username did not match. Deletion cancelled.');
    return;
  }

  emitText(socket, '\r\n');
  emitText(socket, AnsiUtil.colorize('Erasing your data...\r\n', 'red'));

  try {
    const result = await eraseUserData(db, user.id);
    emitText(socket, AnsiUtil.colorize(
      `Scrubbed ${result.messageBodiesScrubbed} message bodies, ${result.answersFilesScrubbed} questionnaire files, ${result.callersLogFilesRedacted} log files.\r\n`,
      'yellow'
    ));
    emitText(socket, AnsiUtil.colorize('Your data has been erased.\r\n', 'green'));
    emitText(socket, '\r\nNO CARRIER\r\n');
  } catch (error) {
    console.error('[gdpr] eraseUserData failed:', error);
    emitText(socket, AnsiUtil.colorize(
      '\r\nErasure failed. Contact the sysop — your data may be partially scrubbed.\r\n',
      'red'
    ));
  }

  // Drop the session. State reset mirrors abortNewUser: any stray input
  // during the 500ms window is inert.
  (session as any).state = 'await';
  session.subState = undefined;
  (session as any).user = undefined;
  setTimeout(() => {
    try {
      (socket as any).disconnect(true);
    } catch {
      socket.disconnect();
    }
  }, 500);
}

async function cancelErasure(socket: any, session: BBSSession, reason: string): Promise<void> {
  emitText(socket, '\r\n');
  emitText(socket, AnsiUtil.colorize(`${reason}\r\n`, 'yellow'));
  emitText(socket, '\r\n');
  setPasswordMask(socket, session, false);
  session.subState = LoggedOnSubState.W_OPTION_SELECT;
  const { handleWriteUserParamsCommand } = require('../commands/info-commands.handler');
  handleWriteUserParamsCommand(socket, session);
}
