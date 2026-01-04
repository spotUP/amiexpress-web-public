/**
 * Account Edit Input Handler
 * Handles keyboard input during account editing
 * 1:1 port from express.e:21228-21650 editInfo() command handling
 */

import { BBSSession, LoggedOnSubState } from '../../index';
import { AnsiUtil } from '../../utils/ansi.util';
import { displayAccountPage0, displayAccountPage1 } from './account.handler';

/**
 * Handle account edit input - Main keyboard handler
 * express.e:21228-21650
 */
export async function handleAccountEditInput(socket: any, session: BBSSession, key: string): Promise<void> {
  if (!session.tempData?.accountEditing) {
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  const user = session.tempData.editingUser;
  const slot = session.tempData.editingSlot;
  const page = session.tempData.page;
  const command = key.toUpperCase();

  // express.e:21249-21327 - Special commands (work on all pages)

  // TAB - Exit (express.e:21250-21253)
  if (command === '\t') {
    if (session.tempData.changes) {
      socket.emit('ansi-output', '\r\n\x1b[33mYou have unsaved changes. Save before exiting? (Y/N): \x1b[0m');
      session.tempData.waitingForSaveConfirm = true;
      session.tempData.saveAction = 'exit';
      return;
    }
    session.tempData = undefined;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  // X - No-Save Exit (express.e:21254-21258)
  if (command === 'X') {
    if (session.tempData.changes) {
      socket.emit('ansi-output', '\r\n\x1b[31mExiting without saving changes.\x1b[0m\r\n');
    }
    session.tempData = undefined;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  // SPACE - Toggle page (express.e:21259-21262)
  if (command === ' ') {
    session.tempData.page = page === 0 ? 1 : 0;
    if (session.tempData.page === 0) {
      displayAccountPage0(socket, user, slot);
    } else {
      displayAccountPage1(socket, user, slot);
    }
    return;
  }

  // + - Next user (express.e:21263-21276)
  if (command === '+') {
    if (session.tempData.changes) {
      socket.emit('ansi-output', '\r\n\x1b[33mYou have unsaved changes. Save before changing users? (Y/N): \x1b[0m');
      session.tempData.waitingForSaveConfirm = true;
      session.tempData.saveAction = 'next';
      return;
    }
    await loadNextUser(socket, session, 1);
    return;
  }

  // - - Previous user (express.e:21277-21286)
  if (command === '-') {
    if (session.tempData.changes) {
      socket.emit('ansi-output', '\r\n\x1b[33mYou have unsaved changes. Save before changing users? (Y/N): \x1b[0m');
      session.tempData.waitingForSaveConfirm = true;
      session.tempData.saveAction = 'prev';
      return;
    }
    await loadNextUser(socket, session, -1);
    return;
  }

  // ~ - Save (express.e:21287-21309)
  if (command === '~') {
    await saveAccount(socket, session);
    return;
  }

  // ! - Credit Maintenance (express.e:21310-21312)
  if (command === '!') {
    socket.emit('ansi-output', '\r\n\x1b[33mCredit maintenance not implemented in web version.\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[32mPress any key...\x1b[0m');
    return;
  }

  // * - User Notes (express.e:21313-21315)
  if (command === '*') {
    socket.emit('ansi-output', '\r\n\x1b[33mUser notes not implemented in web version.\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[32mPress any key...\x1b[0m');
    return;
  }

  // @ - Conference Accounting (express.e:21316-21318)
  if (command === '@') {
    socket.emit('ansi-output', '\r\n\x1b[33mConference accounting not implemented in web version.\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[32mPress any key...\x1b[0m');
    return;
  }

  // ? - User Answers (express.e:21319-21326)
  if (command === '?') {
    socket.emit('ansi-output', '\r\n\x1b[33mUser questionnaire answers not implemented in web version.\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[32mPress any key...\x1b[0m');
    return;
  }

  // DELETE - Delete account (express.e:21362-21373)
  if (key === '\x7f' || command === 'DELETE') {
    socket.emit('ansi-output', '\r\n\x1b[31mDelete account\x1b[0m\r\n');
    user.slotNumber = 0;
    session.tempData.changes = true;
    await saveAccount(socket, session);
    socket.emit('ansi-output', '\r\n\x1b[32mAccount deleted.\x1b[0m\r\n');
    session.tempData = undefined;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  // 9 - Reactivate (express.e:21374-21378)
  if (command === '9') {
    socket.emit('ansi-output', '\r\n\x1b[32mRe-Activate\x1b[0m\r\n');
    user.slotNumber = slot;
    session.tempData.changes = true;
    if (session.tempData.page === 0) {
      displayAccountPage0(socket, user, slot);
    } else {
      displayAccountPage1(socket, user, slot);
    }
    return;
  }

  // Page-specific field editing (express.e:21381-21643)
  if (page === 0) {
    await handlePage0Edit(socket, session, command);
  } else {
    await handlePage1Edit(socket, session, command);
  }
}

/**
 * Handle Page 0 field edits (express.e:21382-21613)
 */
async function handlePage0Edit(socket: any, session: BBSSession, command: string): Promise<void> {
  const user = session.tempData.editingUser;
  const slot = session.tempData.editingSlot;

  switch (command) {
    // A - Name (express.e:21383-21391)
    case 'A':
      socket.emit('ansi-output', '\x1b[2;10H'); // Position cursor
      await promptForString(socket, session, 'username', user.username || '', 30);
      break;

    // B - Real Name (express.e:21392-21398)
    case 'B':
      socket.emit('ansi-output', '\x1b[2;56H');
      await promptForString(socket, session, 'realname', user.realname || '', 25);
      break;

    // C - Location (express.e:21399-21405)
    case 'C':
      socket.emit('ansi-output', '\x1b[3;10H');
      await promptForString(socket, session, 'location', user.location || '', 29);
      break;

    // D - Password (express.e:21406-21438)
    case 'D':
      socket.emit('ansi-output', '\x1b[3;56H         \x1b[3;56H');
      await promptForPassword(socket, session);
      break;

    // E - Phone (express.e:21439-21445)
    case 'E':
      socket.emit('ansi-output', '\x1b[4;21H');
      await promptForString(socket, session, 'phone', user.phone || '', 12);
      break;

    // F - Conference Access (express.e:21446-21452)
    case 'F':
      socket.emit('ansi-output', '\x1b[4;56H');
      await promptForString(socket, session, 'conferenceAccess', user.conferenceAccess || '', 9);
      break;

    // G - Ratio (express.e:21453-21457)
    case 'G':
      socket.emit('ansi-output', '\x1b[5;21H');
      await promptForNumber(socket, session, 'ratio', user.ratio || 0);
      break;

    // H - Security Level (express.e:21458-21469)
    case 'H':
      socket.emit('ansi-output', '\x1b[5;56H');
      await promptForNumber(socket, session, 'secLevel', user.secLevel || 0);
      break;

    // I - Ratio Type (express.e:21470-21483)
    case 'I':
      socket.emit('ansi-output', '\x1b[6;21H');
      await promptForNumber(socket, session, 'ratioType', user.ratioType || 0, 0, 2);
      break;

    // J - Conference ReJoin (express.e:21484-21490)
    case 'J':
      socket.emit('ansi-output', '\x1b[6;56H');
      await promptForRejoin(socket, session);
      break;

    // K - Uploads (express.e:21491-21495)
    case 'K':
      socket.emit('ansi-output', '\x1b[7;21H');
      await promptForNumber(socket, session, 'uploads', user.uploads || 0);
      break;

    // L - Messages Posted (express.e:21496-21500)
    case 'L':
      socket.emit('ansi-output', '\x1b[7;56H');
      await promptForNumber(socket, session, 'messagesPosted', user.messagesPosted || 0);
      break;

    // M - Downloads (express.e:21501-21505)
    case 'M':
      socket.emit('ansi-output', '\x1b[8;21H');
      await promptForNumber(socket, session, 'downloads', user.downloads || 0);
      break;

    // N - New User Flag (express.e:21506-21511)
    case 'N':
      socket.emit('ansi-output', '\x1b[8;56H   \x1b[8;56H');
      await promptForYesNo(socket, session, 'newUser', user.newUser);
      break;

    // # - Times Called (express.e:21512-21516)
    case '#':
      socket.emit('ansi-output', '\x1b[6;71H');
      await promptForNumber(socket, session, 'calls', user.calls || 0);
      break;

    // % - Calls Today (express.e:21517-21521)
    case '%':
      socket.emit('ansi-output', '\x1b[7;71H');
      await promptForNumber(socket, session, 'callsToday', user.callsToday || 0);
      break;

    // O - Bytes Uploaded (express.e:21522-21528)
    case 'O':
      socket.emit('ansi-output', '\x1b[9;21H');
      await promptForLongNumber(socket, session, 'bytesUpload', user.bytesUpload || 0);
      break;

    // P - Bytes Downloaded (express.e:21529-21534)
    case 'P':
      socket.emit('ansi-output', '\x1b[10;21H');
      await promptForLongNumber(socket, session, 'bytesDownload', user.bytesDownload || 0);
      break;

    // Q - Daily Bytes Limit (express.e:21535-21546)
    case 'Q':
      socket.emit('ansi-output', '\x1b[11;21H         \x1b[11;21H');
      await promptForLongNumber(socket, session, 'dailyBytesLimit', user.dailyBytesLimit || 0);
      break;

    // R - Time Total (express.e:21547-21558)
    case 'R':
      socket.emit('ansi-output', '\x1b[12;17H');
      await promptForTimeMinutes(socket, session, 'timeTotal', user.timeTotal || 0);
      break;

    // S - Upload CPS (express.e:21559-21564)
    case 'S':
      socket.emit('ansi-output', '\x1b[12;47H');
      await promptForLongNumber(socket, session, 'upCPS', user.upCPS || 0);
      break;

    // T - Download CPS (express.e:21565-21570)
    case 'T':
      socket.emit('ansi-output', '\x1b[12;69H');
      await promptForLongNumber(socket, session, 'dnCPS', user.dnCPS || 0);
      break;

    // U - Time Limit (express.e:21571-21585)
    case 'U':
      socket.emit('ansi-output', '\x1b[13;17H');
      await promptForTimeMinutes(socket, session, 'timeLimit', user.timeLimit || 0);
      break;

    // V - Time Used (express.e:21586-21593)
    case 'V':
      socket.emit('ansi-output', '\x1b[13;51H');
      await promptForTimeMinutes(socket, session, 'timeUsed', user.timeUsed || 0);
      break;

    // W - UUCP Address (express.e:21594-21598)
    case 'W':
      socket.emit('ansi-output', '\x1b[13;76H');
      await promptForString(socket, session, 'uucpa', user.uucpa || '', 4);
      break;

    // Y - Chat Limit (express.e:21599-21606)
    case 'Y':
      socket.emit('ansi-output', '\x1b[14;17H');
      await promptForTimeMinutes(socket, session, 'chatLimit', user.chatLimit || 0);
      break;

    // Z - Chat Used (express.e:21607-21612)
    case 'Z':
      socket.emit('ansi-output', '\x1b[14;51H');
      const chatUsed = (user.chatLimit || 0) - (user.chatRemain || 0);
      await promptForTimeMinutes(socket, session, 'chatUsed', chatUsed);
      break;
  }

  // Refresh display after edit
  if (session.tempData?.accountEditing) {
    displayAccountPage0(socket, user, slot);
  }
}

/**
 * Handle Page 1 field edits (express.e:21614-21642)
 */
async function handlePage1Edit(socket: any, session: BBSSession, command: string): Promise<void> {
  const user = session.tempData.editingUser;
  const slot = session.tempData.editingSlot;

  switch (command) {
    // A - Name (repeated, express.e:21616-21624)
    case 'A':
      socket.emit('ansi-output', '\x1b[2;10H');
      await promptForString(socket, session, 'username', user.username || '', 30);
      break;

    // B - Password Reset Flag (express.e:21625-21630)
    case 'B':
      socket.emit('ansi-output', '\x1b[3;21H   \x1b[3;21H');
      await promptForYesNo(socket, session, 'forcePwdReset', user.forcePwdReset);
      break;

    // C - Account Locked (express.e:21631-21636)
    case 'C':
      socket.emit('ansi-output', '\x1b[3;56H   \x1b[3;56H');
      await promptForYesNo(socket, session, 'accountLocked', user.accountLocked);
      break;

    // D - Invalid Attempts (express.e:21637-21641)
    case 'D':
      socket.emit('ansi-output', '\x1b[4;21H');
      await promptForNumber(socket, session, 'invalidAttempts', user.invalidAttempts || 0);
      break;
  }

  // Refresh display after edit
  if (session.tempData?.accountEditing) {
    displayAccountPage1(socket, user, slot);
  }
}

// ===== Input Prompt Functions =====

async function promptForString(socket: any, session: BBSSession, field: string, currentValue: string, maxLength: number): Promise<void> {
  session.tempData.waitingForFieldInput = { field, currentValue, maxLength, type: 'string' };
  socket.emit('ansi-output', currentValue);
}

async function promptForNumber(socket: any, session: BBSSession, field: string, currentValue: number, min: number = 0, max: number = 999999): Promise<void> {
  session.tempData.waitingForFieldInput = { field, currentValue, type: 'number', min, max };
  socket.emit('ansi-output', String(currentValue));
}

async function promptForLongNumber(socket: any, session: BBSSession, field: string, currentValue: number): Promise<void> {
  session.tempData.waitingForFieldInput = { field, currentValue, type: 'long' };
  socket.emit('ansi-output', String(currentValue));
}

async function promptForTimeMinutes(socket: any, session: BBSSession, field: string, currentValue: number): Promise<void> {
  const minutes = Math.floor(currentValue / 60);
  session.tempData.waitingForFieldInput = { field, currentValue, type: 'time' };
  socket.emit('ansi-output', String(minutes));
}

async function promptForYesNo(socket: any, session: BBSSession, field: string, currentValue: boolean | number): Promise<void> {
  session.tempData.waitingForFieldInput = { field, currentValue, type: 'yesno' };
  // Show (Y/N) prompt
}

async function promptForPassword(socket: any, session: BBSSession): Promise<void> {
  session.tempData.waitingForFieldInput = { field: 'password', type: 'password' };
  socket.emit('ansi-output', '         ');
  for (let i = 0; i < 9; i++) {
    socket.emit('ansi-output', '\b');
  }
}

async function promptForRejoin(socket: any, session: BBSSession): Promise<void> {
  const user = session.tempData.editingUser;
  session.tempData.waitingForFieldInput = {
    field: 'confRJoin',
    currentValue: `${user.confRJoin || 0}:${user.msgBaseRJoin || 0}`,
    type: 'rejoin'
  };
}

// ===== Helper Functions =====

async function loadNextUser(socket: any, session: BBSSession, direction: number): Promise<void> {
  const { db } = require('../../database');
  const currentSlot = session.tempData.editingSlot;

  try {
    const nextSlot = currentSlot + direction;
    if (nextSlot < 1) {
      socket.emit('ansi-output', '\r\n\x1b[31mNo previous user.\x1b[0m\r\n');
      return;
    }

    const nextUser = await db.getUserBySlot(nextSlot);
    if (!nextUser) {
      socket.emit('ansi-output', '\r\n\x1b[31mNo next user found.\x1b[0m\r\n');
      return;
    }

    session.tempData.editingUser = nextUser;
    session.tempData.editingSlot = nextUser.id;
    session.tempData.changes = false;
    session.tempData.page = 0;

    displayAccountPage0(socket, nextUser, nextUser.id);
  } catch (err) {
console.error('Error loading next user:', err);
    socket.emit('ansi-output', '\r\n\x1b[31mError loading user.\x1b[0m\r\n');
  }
}

async function saveAccount(socket: any, session: BBSSession): Promise<void> {
  const { db } = require('../../database');
  const user = session.tempData.editingUser;

  try {
    socket.emit('ansi-output', '\r\n\x1b[32mSaving...\x1b[0m\r\n');

    await db.updateUser(user.id, user);

    session.tempData.changes = false;
    socket.emit('ansi-output', '\x1b[32mSaved.\x1b[0m\r\n');

    // Refresh display
    const page = session.tempData.page;
    if (page === 0) {
      displayAccountPage0(socket, user, user.id);
    } else {
      displayAccountPage1(socket, user, user.id);
    }
  } catch (err) {
console.error('Error saving account:', err);
    socket.emit('ansi-output', '\x1b[31mCan\'t save account\x1b[0m\r\n');
  }
}
