/**
 * Account Edit Input Handler
 * Handles keyboard input during account editing
 * 1:1 port from express.e:21228-21650 editInfo() command handling
 */

import { BBSSession, LoggedOnSubState } from '../../index';
import { AnsiUtil } from '../../utils/ansi.util';
import { displayAccountPage0, displayAccountPage1 } from './account.handler';
import * as amigafs from '../../utils/amigafs';
import * as path from 'path';

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
    // Enter user notes view mode
    session.subState = LoggedOnSubState.USER_NOTES_VIEW;
    displayUserNotes(socket, session);
    return;
  }

  // @ - Conference Accounting (express.e:21316-21318)
  if (command === '@') {
    // Enter conference accounting view mode
    session.subState = LoggedOnSubState.CONF_ACCOUNTING_VIEW;
    session.tempData.confAcctConf = session.tempData.editingUser.confRJoin || 1;
    session.tempData.confAcctMsgBase = session.tempData.editingUser.msgBaseRJoin || 1;
    await displayConferenceAccounting(socket, session);
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

// ===== User Notes Functions - express.e:21679-21739 =====

/**
 * Get user notes folder path
 * express.e:31797-31799 - defaults to bbsLoc/userNotes/
 */
function getUserNotesFolder(): string {
  // Use data directory for user notes
  const dataDir = process.env.DATABASE_DIR || './data';
  return path.join(dataDir, 'userNotes');
}

/**
 * Get user notes file path for a slot number
 * express.e:21701 - StringF(fname,'\s\d',userNotesFolder,hoozer.slotNumber)
 */
function getUserNotesPath(slotNumber: number): string {
  const folder = getUserNotesFolder();
  return path.join(folder, slotNumber.toString());
}

/**
 * Read user notes from file
 */
function readUserNotes(slotNumber: number): string | null {
  try {
    const notesPath = getUserNotesPath(slotNumber);
    if (amigafs.existsSync(notesPath)) {
      const content = amigafs.readFileSync(notesPath, 'utf8');
      return typeof content === 'string' ? content : content.toString('utf8');
    }
  } catch (err) {
    console.error('Error reading user notes:', err);
  }
  return null;
}

/**
 * Save user notes to file
 */
function saveUserNotes(slotNumber: number, content: string): boolean {
  try {
    const folder = getUserNotesFolder();
    // Create folder if it doesn't exist (express.e:21698-21700)
    if (!amigafs.existsSync(folder)) {
      amigafs.mkdirSync(folder, { recursive: true });
    }
    const notesPath = getUserNotesPath(slotNumber);
    amigafs.writeFileSync(notesPath, content, 'utf8');
    return true;
  } catch (err) {
    console.error('Error saving user notes:', err);
    return false;
  }
}

/**
 * Display user notes screen
 * express.e:21679-21739
 */
export function displayUserNotes(socket: any, session: BBSSession): void {
  const user = session.tempData.editingUser;
  const slot = session.tempData.editingSlot;
  const onlineEdit = session.tempData.onlineEdit || false;

  // Clear screen and show header (express.e:21688-21689)
  socket.emit('ansi-output', '\x1b[2J');
  socket.emit('ansi-output', '\x1b[2;1H                          \x1b[33mUSER ACCOUNT NOTES\x1b[0m');

  // Hide cursor (express.e:21691)
  socket.emit('ansi-output', '\x1b[?25l');

  // Show user info (express.e:21695-21696)
  // Format: [0001] Username
  const slotStr = slot.toString().padStart(4, '0');
  const nameStr = (user.username || '').substring(0, 32).padEnd(32);
  socket.emit('ansi-output', `\x1b[4;0H\x1b[0m[${slotStr}] ${nameStr}`);

  // Show notes header (express.e:21703-21704)
  socket.emit('ansi-output', '\x1b[6;0H\x1b[33mUSER NOTES\x1b[0m\r\n\r\n');
  socket.emit('ansi-output', '\x1b[34m------------------------------------------------------------------------------\x1b[0m\r\n');

  // Display notes content (express.e:21705)
  const notes = readUserNotes(slot);
  if (notes) {
    socket.emit('ansi-output', notes + '\r\n');
  } else {
    socket.emit('ansi-output', 'None\r\n');
  }

  // Show footer (express.e:21706-21708)
  socket.emit('ansi-output', '\x1b[34m------------------------------------------------------------------------------\x1b[0m\r\n');
  socket.emit('ansi-output', '\r\n');

  // Show commands - +/- only available if not online editing
  if (onlineEdit) {
    socket.emit('ansi-output', '\x1b[33m<TAB>\x1b[36m=\x1b[0mExit \x1b[33mE\x1b[36m=\x1b[0mEdit\r\n');
  } else {
    socket.emit('ansi-output', '\x1b[33m<TAB>\x1b[36m=\x1b[0mExit \x1b[33mE\x1b[36m=\x1b[0mEdit \x1b[33m+\x1b[36m=\x1b[0mNext \x1b[33m-\x1b[36m=\x1b[0mPrev\r\n');
  }

  // Show cursor
  socket.emit('ansi-output', '\x1b[?25h');
}

/**
 * Handle user notes input
 * express.e:21710-21736
 */
export async function handleUserNotesInput(socket: any, session: BBSSession, key: string): Promise<void> {
  const command = key.toUpperCase();
  const onlineEdit = session.tempData.onlineEdit || false;

  // TAB - Exit (express.e:21734-21735)
  if (key === '\t') {
    session.subState = LoggedOnSubState.ACCOUNT_EDITOR_EDIT;
    const page = session.tempData.page || 0;
    if (page === 0) {
      displayAccountPage0(socket, session.tempData.editingUser, session.tempData.editingSlot);
    } else {
      displayAccountPage1(socket, session.tempData.editingUser, session.tempData.editingSlot);
    }
    return;
  }

  // E - Edit notes (express.e:21731-21733)
  if (command === 'E') {
    const slot = session.tempData.editingSlot;

    // Load existing notes into message buffer
    const existingNotes = readUserNotes(slot) || '';

    // Initialize notes editing state
    session.tempData.notesEditing = true;
    session.tempData.notesBuffer = existingNotes.split('\n');
    session.tempData.notesSlot = slot;

    // Show simple line editor
    socket.emit('ansi-output', '\r\n\x1b[33mEditing user notes. Enter text (blank line to finish):\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[36m' + '-'.repeat(78) + '\x1b[0m\r\n');

    // Show existing content
    if (existingNotes) {
      socket.emit('ansi-output', existingNotes + '\r\n');
    }

    session.tempData.notesNewLines = [];
    socket.emit('ansi-output', '> ');
    return;
  }

  // + - Next user (express.e:21717-21724)
  if (command === '+' && !onlineEdit) {
    await loadNextUserForNotes(socket, session, 1);
    return;
  }

  // - - Previous user (express.e:21725-21730)
  if (command === '-' && !onlineEdit) {
    await loadNextUserForNotes(socket, session, -1);
    return;
  }
}

/**
 * Handle user notes line input (during editing)
 */
export async function handleUserNotesLineInput(socket: any, session: BBSSession, line: string): Promise<void> {
  // Blank line finishes editing
  if (line.trim() === '') {
    const slot = session.tempData.notesSlot;
    const newContent = session.tempData.notesNewLines.join('\n');

    if (saveUserNotes(slot, newContent)) {
      socket.emit('ansi-output', '\r\n\x1b[32mNotes saved.\x1b[0m\r\n');
    } else {
      socket.emit('ansi-output', '\r\n\x1b[31mError saving notes.\x1b[0m\r\n');
    }

    // Clean up and redisplay
    session.tempData.notesEditing = false;
    session.tempData.notesBuffer = undefined;
    session.tempData.notesNewLines = undefined;
    session.tempData.notesSlot = undefined;

    // Return to notes view
    displayUserNotes(socket, session);
    return;
  }

  // Add line to buffer
  session.tempData.notesNewLines.push(line);
  socket.emit('ansi-output', '> ');
}

/**
 * Load next/previous user for notes view
 */
async function loadNextUserForNotes(socket: any, session: BBSSession, direction: number): Promise<void> {
  const { db } = require('../../database');
  const currentSlot = session.tempData.editingSlot;

  try {
    let nextSlot = currentSlot + direction;

    if (direction > 0) {
      // Next user (express.e:21719-21723)
      const nextUser = await db.getUserBySlot(nextSlot);
      if (!nextUser) {
        // Wrap to first user
        nextSlot = 1;
        const firstUser = await db.getUserBySlot(nextSlot);
        if (firstUser) {
          session.tempData.editingUser = firstUser;
          session.tempData.editingSlot = firstUser.id;
        }
      } else {
        session.tempData.editingUser = nextUser;
        session.tempData.editingSlot = nextUser.id;
      }
    } else {
      // Previous user (express.e:21726-21729)
      if (nextSlot < 1) {
        // Find last account
        const lastSlot = await findLastAccountSlot();
        nextSlot = lastSlot;
      }
      const prevUser = await db.getUserBySlot(nextSlot);
      if (prevUser) {
        session.tempData.editingUser = prevUser;
        session.tempData.editingSlot = prevUser.id;
      }
    }

    displayUserNotes(socket, session);
  } catch (err) {
    console.error('Error loading user for notes:', err);
    socket.emit('ansi-output', '\r\n\x1b[31mError loading user.\x1b[0m\r\n');
  }
}

/**
 * Find the last account slot number
 * express.e references findLastAccount()
 */
async function findLastAccountSlot(): Promise<number> {
  const { db } = require('../../database');
  try {
    const users = await db.getAllUsers();
    if (users && users.length > 0) {
      return Math.max(...users.map((u: any) => u.id || u.slotNumber || 1));
    }
  } catch (err) {
    console.error('Error finding last account:', err);
  }
  return 1;
}

// ===== Conference Accounting Functions - express.e:22045-22250 =====

/**
 * Get or create conf_base record for user/conference/msgbase
 */
async function getConfBaseRecord(userId: string, confId: number, msgBaseId: number): Promise<any> {
  const { db } = require('../../database');
  try {
    // Try to get existing record
    const existingResult = db.db.prepare(`
      SELECT * FROM conf_base
      WHERE user_id = ? AND conference_id = ? AND message_base_id = ?
    `).get(userId, confId, msgBaseId);

    if (existingResult) {
      return existingResult;
    }

    // Create new record with explicit scan_flags=0 (not the SQL DEFAULT of 12,
    // which would incorrectly enable both FILE_SCAN and MAIL_SCAN for every conf).
    db.db.prepare(`
      INSERT INTO conf_base (user_id, conference_id, message_base_id, scan_flags)
      VALUES (?, ?, ?, 0)
    `).run(userId, confId, msgBaseId);

    return db.db.prepare(`
      SELECT * FROM conf_base
      WHERE user_id = ? AND conference_id = ? AND message_base_id = ?
    `).get(userId, confId, msgBaseId);
  } catch (err) {
    console.error('Error getting conf_base record:', err);
    return null;
  }
}

/**
 * Save conf_base record
 */
async function saveConfBaseRecord(record: any): Promise<boolean> {
  const { db } = require('../../database');
  try {
    db.db.prepare(`
      UPDATE conf_base SET
        messages_posted = ?,
        bytes_download = ?,
        bytes_upload = ?,
        upload = ?,
        downloads = ?
      WHERE user_id = ? AND conference_id = ? AND message_base_id = ?
    `).run(
      record.messages_posted || 0,
      record.bytes_download || 0,
      record.bytes_upload || 0,
      record.upload || 0,
      record.downloads || 0,
      record.user_id,
      record.conference_id,
      record.message_base_id
    );
    return true;
  } catch (err) {
    console.error('Error saving conf_base record:', err);
    return false;
  }
}

/**
 * Display Conference Accounting screen
 * express.e:22045-22250
 */
export async function displayConferenceAccounting(socket: any, session: BBSSession): Promise<void> {
  const { db } = require('../../database');
  const user = session.tempData.editingUser;
  const confId = session.tempData.confAcctConf || 1;
  const msgBaseId = session.tempData.confAcctMsgBase || 1;

  try {
    // Get conference and message base info
    const conferences = await db.getConferences();
    const conf = conferences.find((c: any) => c.id === confId);
    const confName = conf?.name || `Conference ${confId}`;

    // Get conf_base record for this user/conference/msgbase
    const confBase = await getConfBaseRecord(user.id.toString(), confId, msgBaseId);
    session.tempData.confBaseRecord = confBase;

    // Clear screen
    socket.emit('ansi-output', '\x1b[2J');

    // User info (express.e:22112-22116)
    socket.emit('ansi-output', `\x1b[2;1H \x1b[32mName\x1b[36m:\x1b[0m ${(user.username || '').substring(0, 32).padEnd(32)}`);
    socket.emit('ansi-output', `\x1b[3;1H \x1b[32mLoc.\x1b[36m:\x1b[0m ${(user.location || '').substring(0, 29).padEnd(29)}\r\n`);
    socket.emit('ansi-output', `\x1b[4;1H \x1b[32mConf\x1b[36m:\x1b[0m ${confName.substring(0, 60).padEnd(60)}\r\n`);

    // Per-conference stats (express.e:22128-22160)
    const ratio = (confBase?.ratio || 0) & 0xFFFF;
    const ratioType = (confBase?.ratio_type || 0) & 0xFFFF;
    const uploads = (confBase?.upload || 0) & 0xFFFF;
    const downloads = (confBase?.downloads || 0) & 0xFFFF;
    const bytesUp = confBase?.bytes_upload || 0;
    const bytesDn = confBase?.bytes_download || 0;
    const msgPosted = (confBase?.messages_posted || 0) & 0xFFFF;

    socket.emit('ansi-output', `\x1b[6;2H\x1b[33mG>\x1b[32mRatio .........\x1b[36m:\x1b[0m ${String(ratio).padEnd(7)}\r\n`);

    let ratioTypeStr = '';
    if (ratioType === 0) ratioTypeStr = ' \x1b[32m<-\x1b[33mByte\x1b[32m)\x1b[0m';
    else if (ratioType === 1) ratioTypeStr = ' \x1b[32m<-\x1b[33mB/F\x1b[32m)\x1b[0m ';
    else if (ratioType === 2) ratioTypeStr = ' \x1b[32m<-\x1b[33mFile\x1b[32m)\x1b[0m';
    socket.emit('ansi-output', `\x1b[7;2H\x1b[33mI>\x1b[32mRatio Type ....\x1b[36m:\x1b[0m ${String(ratioType).padEnd(5)}${ratioTypeStr}`);

    socket.emit('ansi-output', `\x1b[8;2H\x1b[33mK>\x1b[32mUploads .......\x1b[36m:\x1b[0m ${String(uploads).padEnd(10)}\r\n`);
    socket.emit('ansi-output', `\x1b[9;2H\x1b[33mM>\x1b[32mDownloads .....\x1b[36m:\x1b[0m ${String(downloads).padEnd(10)}\r\n`);
    socket.emit('ansi-output', `\x1b[10;2H\x1b[33mO>\x1b[32mBytes Uled ....\x1b[36m:\x1b[0m ${String(bytesUp).padEnd(16)}\r\n`);
    socket.emit('ansi-output', `\x1b[11;2H\x1b[33mP>\x1b[32mBytes Dled ....\x1b[36m:\x1b[0m ${String(bytesDn).padEnd(16)}\r\n`);
    socket.emit('ansi-output', `\x1b[12;2H\x1b[33mL>\x1b[32mMessages Posted\x1b[36m:\x1b[0m ${String(msgPosted).padEnd(10)}`);

    // Accumulated totals (express.e:22162-22187)
    socket.emit('ansi-output', '\x1b[6;40H\x1b[33mAccumulated Total\x1b[0m');
    socket.emit('ansi-output', `\x1b[8;40H\x1b[32mUploads .......\x1b[36m:\x1b[0m ${String(user.uploads || 0).padEnd(10)}\r\n`);
    socket.emit('ansi-output', `\x1b[9;40H\x1b[32mDownloads .....\x1b[36m:\x1b[0m ${String(user.downloads || 0).padEnd(10)}\r\n`);
    socket.emit('ansi-output', `\x1b[10;40H\x1b[32mBytes Uled ....\x1b[36m:\x1b[0m ${String(user.bytesUpload || 0).padEnd(16)}\r\n`);
    socket.emit('ansi-output', `\x1b[11;40H\x1b[32mBytes Dled ....\x1b[36m:\x1b[0m ${String(user.bytesDownload || 0).padEnd(16)}\r\n`);
    socket.emit('ansi-output', `\x1b[12;40H\x1b[32mMessages_Posted\x1b[36m:\x1b[0m ${String(user.messagesPosted || 0).padEnd(10)}`);

    // Commands (express.e:22189-22191)
    socket.emit('ansi-output', '\x1b[14;1H  \x1b[33m-/+\x1b[36m=\x1b[0mPrev/Next Conference      \x1b[33m~\x1b[36m=\x1b[0mSAVE\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[15;1H  \x1b[33m<TAB>\x1b[36m=\x1b[0mEXIT Conference Accounting\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[16;1H');

  } catch (err) {
    console.error('Error displaying conference accounting:', err);
    socket.emit('ansi-output', '\r\n\x1b[31mError loading conference data.\x1b[0m\r\n');
  }
}

/**
 * Handle Conference Accounting input
 * express.e:22197-22250
 */
export async function handleConferenceAccountingInput(socket: any, session: BBSSession, key: string): Promise<void> {
  const { db } = require('../../database');
  const command = key.toUpperCase();
  const user = session.tempData.editingUser;

  // TAB - Exit (express.e:22222-22225)
  if (key === '\t') {
    // Check for unsaved changes
    if (session.tempData.confAcctChanges) {
      socket.emit('ansi-output', '\r\n\x1b[33mYou have unsaved changes. Save before exiting? (Y/N): \x1b[0m');
      session.tempData.confAcctExitPending = true;
      return;
    }
    exitConferenceAccounting(socket, session);
    return;
  }

  // Handle save confirmation if pending
  if (session.tempData.confAcctExitPending) {
    if (command === 'Y') {
      await saveConferenceAccountingChanges(socket, session);
    }
    session.tempData.confAcctExitPending = false;
    exitConferenceAccounting(socket, session);
    return;
  }

  // Handle field editing if waiting for input
  if (session.tempData.confAcctFieldEdit) {
    if (key === '\r' || key === '\n') {
      const field = session.tempData.confAcctFieldEdit;
      const value = parseInt(session.inputBuffer || '0', 10) || 0;
      session.inputBuffer = '';

      const confBase = session.tempData.confBaseRecord;
      if (confBase) {
        switch (field) {
          case 'K': confBase.upload = value; break;
          case 'M': confBase.downloads = value; break;
          case 'O': confBase.bytes_upload = value; break;
          case 'P': confBase.bytes_download = value; break;
          case 'L': confBase.messages_posted = value; break;
        }
        session.tempData.confAcctChanges = true;
      }

      session.tempData.confAcctFieldEdit = undefined;
      await displayConferenceAccounting(socket, session);
    } else if (key === '\x7f' || key === '\b') {
      if (session.inputBuffer?.length) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
        socket.emit('ansi-output', '\b \b');
      }
    } else if (key >= '0' && key <= '9') {
      session.inputBuffer = (session.inputBuffer || '') + key;
      socket.emit('ansi-output', key);
    }
    return;
  }

  // + - Next conference (express.e:22203-22211)
  if (command === '+') {
    const conferences = await db.getConferences();
    let confId = session.tempData.confAcctConf || 1;
    confId++;
    if (confId > conferences.length) confId = 1;
    session.tempData.confAcctConf = confId;
    session.tempData.confAcctMsgBase = 1;
    await displayConferenceAccounting(socket, session);
    return;
  }

  // - - Previous conference (express.e:22212-22220)
  if (command === '-') {
    const conferences = await db.getConferences();
    let confId = session.tempData.confAcctConf || 1;
    confId--;
    if (confId < 1) confId = conferences.length;
    session.tempData.confAcctConf = confId;
    session.tempData.confAcctMsgBase = 1;
    await displayConferenceAccounting(socket, session);
    return;
  }

  // ~ - Save (express.e:22189)
  if (command === '~') {
    await saveConferenceAccountingChanges(socket, session);
    await displayConferenceAccounting(socket, session);
    return;
  }

  // Field editing commands (express.e:22229-22250)
  if (['K', 'M', 'O', 'P', 'L'].includes(command)) {
    const lineNum: { [key: string]: number } = { K: 8, M: 9, O: 10, P: 11, L: 12 };
    socket.emit('ansi-output', `\x1b[${lineNum[command]};21H`);
    session.tempData.confAcctFieldEdit = command;
    session.inputBuffer = '';
    return;
  }
}

/**
 * Save conference accounting changes
 */
async function saveConferenceAccountingChanges(socket: any, session: BBSSession): Promise<void> {
  const confBase = session.tempData.confBaseRecord;
  if (confBase && session.tempData.confAcctChanges) {
    if (await saveConfBaseRecord(confBase)) {
      socket.emit('ansi-output', '\r\n\x1b[32mSaved.\x1b[0m\r\n');
    } else {
      socket.emit('ansi-output', '\r\n\x1b[31mError saving.\x1b[0m\r\n');
    }
    session.tempData.confAcctChanges = false;
  }
}

/**
 * Exit conference accounting and return to account editor
 */
function exitConferenceAccounting(socket: any, session: BBSSession): void {
  // Clean up temp data
  session.tempData.confAcctConf = undefined;
  session.tempData.confAcctMsgBase = undefined;
  session.tempData.confBaseRecord = undefined;
  session.tempData.confAcctChanges = undefined;
  session.tempData.confAcctFieldEdit = undefined;
  session.tempData.confAcctExitPending = undefined;

  // Return to account editor
  session.subState = LoggedOnSubState.ACCOUNT_EDITOR_EDIT;
  const page = session.tempData.page || 0;
  if (page === 0) {
    displayAccountPage0(socket, session.tempData.editingUser, session.tempData.editingSlot);
  } else {
    displayAccountPage1(socket, session.tempData.editingUser, session.tempData.editingSlot);
  }
}
