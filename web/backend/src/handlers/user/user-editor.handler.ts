/**
 * User Account Editor Handler
 * 1:1 port from AmiExpress express.e:22400-22460 (editAccounts)
 *                          express.e:22380-22399 (checkNEdit)
 *                          express.e:21211-21400 (editInfo)
 * Handles Command 1: Account Editing
 */

import { BBSSession, LoggedOnSubState } from '../../index';
import { Database, User } from '../../database';
import { AnsiUtil } from '../../utils/ansi.util';
import * as bcrypt from 'bcryptjs';
import { userFileManager } from '../../services/UserFileManager';

// Account editor state tracking
interface AccountEditorState {
  includeDeact: boolean;  // Include deactivated accounts (express.e:22403)
  editingUserId?: string;  // Currently editing user ID
  page?: number;          // Display page (0 or 1) from express.e:21217
  changes?: boolean;      // Track if changes made (express.e:21218)
}

// Initialize state in session
function getAccountEditorState(session: BBSSession): AccountEditorState {
  if (!session.accountEditorState) {
    session.accountEditorState = {
      includeDeact: false,
      page: 0,
      changes: false
    };
  }
  return session.accountEditorState as AccountEditorState;
}

/**
 * Main Account Editor Menu (LOOP structure)
 * Original: express.e:22400-22460 (editAccounts)
 *
 * This function implements the LOOP from express.e:22410-22451
 * which continuously displays menu and processes commands
 */
export async function handleAccountEditorMenu(socket: any, session: BBSSession, db: Database): Promise<void> {
  const state = getAccountEditorState(session);

  // Display menu - express.e:22408-22415
  socket.emit('ansi-output', '\r\n');

  // Toggle option
  if (state.includeDeact) {
    socket.emit('ansi-output', AnsiUtil.colorize('I', 'yellow'));
    socket.emit('ansi-output', '>nactive accounts: ');
    socket.emit('ansi-output', AnsiUtil.colorize('Include', 'cyan'));
  } else {
    socket.emit('ansi-output', AnsiUtil.colorize('I', 'yellow'));
    socket.emit('ansi-output', '>nactive accounts: ');
    socket.emit('ansi-output', AnsiUtil.colorize('Exclude', 'cyan'));
  }
  socket.emit('ansi-output', '  ');

  // Menu options
  socket.emit('ansi-output', AnsiUtil.colorize('S', 'yellow'));
  socket.emit('ansi-output', '>earch by name  ');
  socket.emit('ansi-output', AnsiUtil.colorize('N', 'yellow'));
  socket.emit('ansi-output', '>ew account editing\r\n');

  socket.emit('ansi-output', AnsiUtil.colorize('C', 'yellow'));
  socket.emit('ansi-output', '>redit Accounts  ');
  socket.emit('ansi-output', AnsiUtil.colorize('B', 'yellow'));
  socket.emit('ansi-output', '>ulk editing\r\n');

  socket.emit('ansi-output', 'Edit which account? ');

  // Set up for line input - express.e:22416
  session.subState = LoggedOnSubState.ACCOUNT_EDITOR_MENU;
}

/**
 * Handle Account Editor Menu Input
 * Original: express.e:22416-22457
 */
export async function handleAccountEditorInput(socket: any, session: BBSSession, db: Database, input: string): Promise<void> {
  const state = getAccountEditorState(session);

  // Empty input exits to menu - express.e:22444-22445
  if (!input || input === '') {
    socket.emit('ansi-output', '\r\n');
    delete session.accountEditorState;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    session.menuPause = false;
    return;
  }

  const firstChar = input.charAt(0).toUpperCase();

  // Toggle inactive accounts - express.e:22425-22426
  if (firstChar === 'I') {
    state.includeDeact = !state.includeDeact;
    // LOOP back to menu
    await handleAccountEditorMenu(socket, session, db);
    return;
  }

  // Search by name - express.e:22427-22444
  if (firstChar === 'S') {
    await handleSearchByName(socket, session, db);
    return;
  }

  // New account editing - express.e:22419-22420
  if (firstChar === 'N') {
    await handleListNewAccounts(socket, session, db);
    return;
  }

  // Credit accounts - express.e:22423-22424
  if (firstChar === 'C') {
    await handleListCreditAccounts(socket, session, db);
    return;
  }

  // Bulk editing - express.e:22421-22422
  if (firstChar === 'B') {
    await handleBulkAccountEditor(socket, session, db);
    return;
  }

  // Try to parse as account number - express.e:22445-22449
  const accountNum = parseInt(input, 10);
  if (!isNaN(accountNum) && accountNum > 0) {
    const allUsers = await db.getUsers({});

    // Check range - express.e:22382-22386 (checkNEdit)
    if (accountNum > allUsers.length) {
      socket.emit('ansi-output', 'Higher Than Maximum Account\r\n');
      // LOOP back to menu
      await handleAccountEditorMenu(socket, session, db);
      return;
    }

    const user = allUsers[accountNum - 1]; // Convert to 0-based
    await handleEditUser(socket, session, db, user);
    return;
  }

  // Invalid input, LOOP back to menu
  socket.emit('ansi-output', '\r\n');
  await handleAccountEditorMenu(socket, session, db);
}

/**
 * Search By Name Handler
 * Original: express.e:22427-22444
 */
async function handleSearchByName(socket: any, session: BBSSession, db: Database): Promise<void> {
  socket.emit('ansi-output', '\r\nUserName: ');
  session.subState = LoggedOnSubState.ACCOUNT_EDITOR_SEARCH_NAME;
}

/**
 * Handle Search By Name Input
 * Original: express.e:22429-22444
 */
export async function handleSearchByNameInput(socket: any, session: BBSSession, db: Database, input: string): Promise<void> {
  const searchName = input.trim();

  // Empty returns to menu - express.e:22430
  if (!searchName) {
    await handleAccountEditorMenu(socket, session, db);
    return;
  }

  // Search for user by username - express.e:22434-22435 (findUserFromName)
  const users = await db.getUsers({});
  const matches = users.filter(u =>
    u.username.toLowerCase().includes(searchName.toLowerCase())
  );

  if (matches.length === 0) {
    socket.emit('ansi-output', '\r\nSorry no user under that name.\r\n');
    // LOOP back to menu - express.e:22436-22438
    await handleAccountEditorMenu(socket, session, db);
    return;
  }

  // Found match - express.e:22439-22442
  // Edit the first match (original used REPEAT loop for multiple)
  await handleEditUser(socket, session, db, matches[0]);
}

/**
 * List New Accounts (N command)
 * Original: express.e:22417-22418 (calls listNewAccounts)
 */
async function handleListNewAccounts(socket: any, session: BBSSession, db: Database): Promise<void> {
  // express.e:21747-21751 listNewAccounts - no header, just "Searching..."
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', 'Searching...');

  const newUsers = await db.getUsers({ newUser: true });

  if (newUsers.length === 0) {
    socket.emit('ansi-output', 'No new user accounts found.\r\n');
  } else {
    socket.emit('ansi-output', `Found ${newUsers.length} new account(s):\r\n\r\n`);
    for (const user of newUsers) {
      socket.emit('ansi-output', `  ${user.username.padEnd(20)} ${user.realname.padEnd(25)} Sec: ${user.secLevel}\r\n`);
    }
  }

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());

  // Return to menu after keypress
  session.inputCallback = async () => {
    await handleAccountEditorMenu(socket, session, db);
  };
}

/**
 * List Credit Accounts (C command)
 * Original: express.e:22419-22420 (calls listCreditAccounts)
 * Filter: express.e:21864 - creditDays > 0
 */
async function handleListCreditAccounts(socket: any, session: BBSSession, db: Database): Promise<void> {
  // express.e:21848-21882 listCreditAccounts - searches for creditDays > 0
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', 'Searching...');

  const allUsers = await db.getUsers({});
  // express.e:21864 - IF((tempUser.creditDays>0) AND (includeDeact OR (tempUser.slotNumber<>0)))
  const creditUsers = allUsers.filter(u => (u.creditDays || 0) > 0);

  if (creditUsers.length === 0) {
    socket.emit('ansi-output', 'No credit accounts found.\r\n');
  } else {
    socket.emit('ansi-output', `Found ${creditUsers.length} credit account(s):\r\n\r\n`);
    for (const user of creditUsers) {
      const creditDays = user.creditDays || 0;
      socket.emit('ansi-output', `  ${user.username.padEnd(20)} Credit Days: ${String(creditDays).padStart(5)} Sec: ${user.secLevel}\r\n`);
    }
  }

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());

  // Return to menu after keypress
  session.inputCallback = async () => {
    await handleAccountEditorMenu(socket, session, db);
  };
}

/**
 * Bulk Account Editor State
 * express.e:23400-23568 - bulkAccountEditor
 */
interface BulkEditorState {
  settings: string[];     // 18 settings fields
  areaName: string;       // Filter: area name
  secLevel: string;       // Filter: security level
  includeDeact: boolean;  // Filter: include deactivated
  inputField?: string;    // Current field being edited
}

/**
 * Bulk Account Editor (B command)
 * Original: express.e:22421-22422 (calls bulkAccountEditor)
 * Full-screen editor: express.e:23400-23686
 */
async function handleBulkAccountEditor(socket: any, session: BBSSession, db: Database): Promise<void> {
  const state = getAccountEditorState(session);

  // Initialize bulk editor state - express.e:23413-23417
  const bulkState: BulkEditorState = {
    settings: Array(18).fill(''),  // 18 settings, all empty = "Leave Unchanged"
    areaName: '',
    secLevel: '',
    includeDeact: state.includeDeact
  };
  session.tempData = session.tempData || {};
  session.tempData.bulkState = bulkState;

  // Display bulk screen - express.e:23408-23411
  displayBulkScreen(socket);
  displayBulkSettings(socket, bulkState, db);

  // Set up character input handler - express.e:23419-23567
  session.subState = LoggedOnSubState.ACCOUNT_EDITOR_BULK;
  session.inputCallback = async (input: string) => {
    await handleBulkEditorCommand(socket, session, db, input);
  };
}

/**
 * Display Bulk Editor Screen
 * express.e:23570-23618 - displayBulkScreen
 */
function displayBulkScreen(socket: any): void {
  // Clear screen - express.e:23408
  socket.emit('ansi-output', '\x1b[2J\x1b[H');

  // Title - express.e:23571
  socket.emit('ansi-output', '\x1b[2;1H                     \x1b[33mBULK ACCOUNT MAINTENANCE\x1b[0m');

  // Updates section - express.e:23573
  socket.emit('ansi-output', '\x1b[4;1H Updates to apply:');

  // Field labels - express.e:23575-23617
  socket.emit('ansi-output', '\x1b[6;1H\x1b[33mF> \x1b[32mArea Name .....\x1b[36m:');
  socket.emit('ansi-output', '\x1b[6;39H\x1b[33mG> \x1b[32mRatio .........\x1b[36m:');
  socket.emit('ansi-output', '\x1b[7;1H\x1b[33mH> \x1b[32mSec_Level .....\x1b[36m:');
  socket.emit('ansi-output', '\x1b[7;39H\x1b[33mI> \x1b[32mRatio Type ....\x1b[36m:');
  socket.emit('ansi-output', '\x1b[8;1H\x1b[33mJ> \x1b[32mAutoRejoin ....\x1b[36m:');
  socket.emit('ansi-output', '\x1b[9;1H\x1b[33mK> \x1b[32mUploads .......\x1b[36m:');
  socket.emit('ansi-output', '\x1b[9;39H\x1b[33mL> \x1b[32mMessages Posted\x1b[36m:');
  socket.emit('ansi-output', '\x1b[10;1H\x1b[33mM> \x1b[32mDownloads .....\x1b[36m:');
  socket.emit('ansi-output', '\x1b[11;1H\x1b[33mO> \x1b[32mBytes Uled ....\x1b[36m:');
  socket.emit('ansi-output', '\x1b[11;39H\x1b[33mP> \x1b[32mBytes Dled ....\x1b[36m:');
  socket.emit('ansi-output', '\x1b[12;1H\x1b[33mQ> \x1b[32mByte Limit ....\x1b[36m:');
  socket.emit('ansi-output', '\x1b[13;1H\x1b[33mR> \x1b[32mTime Total ....\x1b[36m:');
  socket.emit('ansi-output', '\x1b[13;39H\x1b[33mU> \x1b[32mTime Limit ....\x1b[36m:');
  socket.emit('ansi-output', '\x1b[14;1H\x1b[33mY> \x1b[32mChat Limit ....\x1b[36m:');
  socket.emit('ansi-output', '\x1b[15;1H\x1b[33m#> \x1b[32mTimes Called ..\x1b[36m:');
  socket.emit('ansi-output', '\x1b[15;39H\x1b[33m*> \x1b[32mActive ........\x1b[36m:');
  socket.emit('ansi-output', '\x1b[16;1H\x1b[33m!> \x1b[32mForce Pwd Reset\x1b[36m:');
  socket.emit('ansi-output', '\x1b[16;39H\x1b[33m&> \x1b[32mAccnt Locked ..\x1b[36m:');

  // Filter section - express.e:23612-23616
  socket.emit('ansi-output', '\x1b[18;2H\x1b[0mFilter Settings:');
  socket.emit('ansi-output', '\x1b[20;1H\x1b[33m1> \x1b[32mSelect Area Name \x1b[36m:');
  socket.emit('ansi-output', '\x1b[20;39H\x1b[33m2> \x1b[32mSelect Sec Level \x1b[36m:');
  socket.emit('ansi-output', '\x1b[21;1H\x1b[33m3> \x1b[32mInclude deactivated \x1b[36m:');

  // Commands - express.e:23617
  socket.emit('ansi-output', '\x1b[23;1H\x1b[33m~\x1b[36m=\x1b[0mApply Changes \x1b[33m<TAB>\x1b[36m=\x1b[0mExit');
}

/**
 * Display Bulk Settings Values
 * express.e:23620-23686 - displayBulkSettings
 */
async function displayBulkSettings(socket: any, bulkState: BulkEditorState, db: Database): Promise<void> {
  const s = bulkState.settings;

  // Settings values - express.e:23624-23668
  const unchanged = 'Leave Unchanged';

  // Row 6: Area Name (F), Ratio (G)
  socket.emit('ansi-output', `\x1b[6;20H\x1b[0m ${s[13] || unchanged}               `);
  socket.emit('ansi-output', `\x1b[6;58H\x1b[0m ${s[0] || unchanged}               `);

  // Row 7: Sec_Level (H), Ratio Type (I)
  socket.emit('ansi-output', `\x1b[7;20H\x1b[0m ${s[14] || unchanged}               `);
  const ratioType = s[1] ? (s[1] === '0' ? '0 (Byte)' : s[1] === '1' ? '1 (B/F)' : '2 (File)') : unchanged;
  socket.emit('ansi-output', `\x1b[7;58H\x1b[0m ${ratioType}               `);

  // Row 8: AutoRejoin (J)
  socket.emit('ansi-output', `\x1b[8;20H\x1b[0m ${s[2] || unchanged}               `);

  // Row 9: Uploads (K), Messages Posted (L)
  socket.emit('ansi-output', `\x1b[9;20H\x1b[0m ${s[3] || unchanged}               `);
  socket.emit('ansi-output', `\x1b[9;58H\x1b[0m ${s[4] || unchanged}               `);

  // Row 10: Downloads (M)
  socket.emit('ansi-output', `\x1b[10;20H\x1b[0m ${s[5] || unchanged}               `);

  // Row 11: Bytes Uled (O), Bytes Dled (P)
  socket.emit('ansi-output', `\x1b[11;20H\x1b[0m ${s[6] || unchanged}               `);
  socket.emit('ansi-output', `\x1b[11;58H\x1b[0m ${s[7] || unchanged}               `);

  // Row 12: Byte Limit (Q)
  socket.emit('ansi-output', `\x1b[12;20H\x1b[0m ${s[8] || unchanged}               `);

  // Row 13: Time Total (R), Time Limit (U)
  socket.emit('ansi-output', `\x1b[13;20H\x1b[0m ${s[9] || unchanged}               `);
  socket.emit('ansi-output', `\x1b[13;58H\x1b[0m ${s[10] || unchanged}               `);

  // Row 14: Chat Limit (Y)
  socket.emit('ansi-output', `\x1b[14;20H\x1b[0m ${s[11] || unchanged}               `);

  // Row 15: Times Called (#), Active (*)
  socket.emit('ansi-output', `\x1b[15;20H\x1b[0m ${s[12] || unchanged}               `);
  const active = s[15] ? (s[15] === '0' ? 'Deactivate' : 'Activate') : unchanged;
  socket.emit('ansi-output', `\x1b[15;58H\x1b[0m ${active}               `);

  // Row 16: Force Pwd Reset (!), Account Locked (&)
  const pwdReset = s[16] ? (s[16] === '1' ? 'Yes' : 'No') : unchanged;
  socket.emit('ansi-output', `\x1b[16;20H\x1b[0m ${pwdReset}               `);
  const locked = s[17] ? (s[17] === '1' ? 'Yes' : 'No') : unchanged;
  socket.emit('ansi-output', `\x1b[16;58H\x1b[0m ${locked}               `);

  // Calculate affected users - express.e:23671-23673
  const { affected, total } = await calcAffectedUsers(db, bulkState);
  socket.emit('ansi-output', `\x1b[18;19H\x1b[34m[\x1b[0m${affected}/${total}\x1b[34m]\x1b[0m Users will be updated.     `);

  // Filter values - express.e:23676-23683
  socket.emit('ansi-output', `\x1b[20;26H${bulkState.areaName || 'N/A'}          `);
  socket.emit('ansi-output', `\x1b[20;64H${bulkState.secLevel || 'N/A'}   `);
  socket.emit('ansi-output', `\x1b[21;26H${bulkState.includeDeact ? 'Yes' : 'No '}   `);

  // Position cursor - express.e:23685
  socket.emit('ansi-output', '\x1b[24;1H');
}

/**
 * Calculate affected users for bulk update
 * express.e:calcAffected
 */
async function calcAffectedUsers(db: Database, bulkState: BulkEditorState): Promise<{ affected: number; total: number }> {
  try {
    const allUsers = await db.getUsers({});
    let affected = 0;
    let total = allUsers.length;

    for (const user of allUsers) {
      // Skip deactivated if not included
      if (!bulkState.includeDeact && !user.slotNumber) continue;

      // Filter by area name
      if (bulkState.areaName && user.location?.toLowerCase() !== bulkState.areaName.toLowerCase()) continue;

      // Filter by security level
      if (bulkState.secLevel) {
        const level = parseInt(bulkState.secLevel, 10);
        if (!isNaN(level) && user.secLevel !== level) continue;
      }

      affected++;
    }

    return { affected, total };
  } catch {
    return { affected: 0, total: 0 };
  }
}

/**
 * Handle Bulk Editor Commands
 * express.e:23427-23565 - SELECT command
 */
async function handleBulkEditorCommand(socket: any, session: BBSSession, db: Database, input: string): Promise<void> {
  const bulkState = session.tempData?.bulkState as BulkEditorState;
  if (!bulkState) {
    await handleAccountEditorMenu(socket, session, db);
    return;
  }

  // If we're in field input mode, handle the value
  if (bulkState.inputField) {
    await handleBulkFieldInput(socket, session, db, input);
    return;
  }

  const cmd = input.toUpperCase();

  // TAB - Exit - express.e:23563-23564
  if (cmd === '\t' || cmd === 'Q' || cmd === '') {
    delete session.tempData.bulkState;
    await handleAccountEditorMenu(socket, session, db);
    return;
  }

  // ~ - Apply Changes - express.e:23553-23562
  if (cmd === '~') {
    await applyBulkChanges(socket, session, db, bulkState);
    return;
  }

  // Toggle fields (*, !, &) - express.e:23519-23542
  if (cmd === '*') {
    bulkState.settings[15] = bulkState.settings[15] === '' ? '1' : bulkState.settings[15] === '1' ? '0' : '';
    await displayBulkSettings(socket, bulkState, db);
    return;
  }
  if (cmd === '!') {
    bulkState.settings[16] = bulkState.settings[16] === '' ? '1' : bulkState.settings[16] === '1' ? '0' : '';
    await displayBulkSettings(socket, bulkState, db);
    return;
  }
  if (cmd === '&') {
    bulkState.settings[17] = bulkState.settings[17] === '' ? '1' : bulkState.settings[17] === '1' ? '0' : '';
    await displayBulkSettings(socket, bulkState, db);
    return;
  }

  // Filter toggle (3) - express.e:23551-23552
  if (cmd === '3') {
    bulkState.includeDeact = !bulkState.includeDeact;
    await displayBulkSettings(socket, bulkState, db);
    return;
  }

  // Field input commands - express.e:23437-23518
  const fieldMap: { [key: string]: { index: number; col: number; row: number; maxLen: number } } = {
    'F': { index: 13, col: 21, row: 6, maxLen: 15 },   // Area Name
    'G': { index: 0, col: 59, row: 6, maxLen: 15 },    // Ratio
    'H': { index: 14, col: 21, row: 7, maxLen: 3 },    // Sec_Level
    'I': { index: 1, col: 59, row: 7, maxLen: 15 },    // Ratio Type (0-2)
    'J': { index: 2, col: 21, row: 8, maxLen: 15 },    // AutoRejoin
    'K': { index: 3, col: 21, row: 9, maxLen: 15 },    // Uploads
    'L': { index: 4, col: 59, row: 9, maxLen: 15 },    // Messages Posted
    'M': { index: 5, col: 21, row: 10, maxLen: 15 },   // Downloads
    'O': { index: 6, col: 21, row: 11, maxLen: 15 },   // Bytes Uled
    'P': { index: 7, col: 59, row: 11, maxLen: 15 },   // Bytes Dled
    'Q': { index: 8, col: 21, row: 12, maxLen: 15 },   // Byte Limit
    'R': { index: 9, col: 21, row: 13, maxLen: 15 },   // Time Total
    'U': { index: 10, col: 59, row: 13, maxLen: 15 },  // Time Limit
    'Y': { index: 11, col: 21, row: 14, maxLen: 15 },  // Chat Limit
    '#': { index: 12, col: 21, row: 15, maxLen: 15 },  // Times Called
    '1': { index: -1, col: 26, row: 20, maxLen: 10 },  // Filter: Area Name
    '2': { index: -2, col: 64, row: 20, maxLen: 3 },   // Filter: Sec Level
  };

  const field = fieldMap[cmd];
  if (field) {
    // Clear field and position cursor
    socket.emit('ansi-output', `\x1b[${field.row};${field.col}H               \x1b[${field.row};${field.col}H`);
    bulkState.inputField = cmd;
    session.tempData.bulkFieldInfo = field;
    return;
  }

  // Unknown command - just refresh
  await displayBulkSettings(socket, bulkState, db);
}

/**
 * Handle field value input
 */
async function handleBulkFieldInput(socket: any, session: BBSSession, db: Database, input: string): Promise<void> {
  const bulkState = session.tempData?.bulkState as BulkEditorState;
  const fieldInfo = session.tempData?.bulkFieldInfo;

  if (!bulkState || !fieldInfo) {
    await handleAccountEditorMenu(socket, session, db);
    return;
  }

  const value = input.trim();
  const cmd = bulkState.inputField;
  bulkState.inputField = undefined;
  delete session.tempData.bulkFieldInfo;

  // Validate and store value based on field type
  if (cmd === '1') {
    // Filter: Area Name
    bulkState.areaName = value;
  } else if (cmd === '2') {
    // Filter: Security Level
    const num = parseInt(value, 10);
    bulkState.secLevel = !isNaN(num) ? value : '';
  } else if (fieldInfo.index >= 0) {
    // Settings field - validate numeric for most fields
    if (['F'].includes(cmd!)) {
      // Area name is string, no validation
      bulkState.settings[fieldInfo.index] = value;
    } else if (cmd === 'I') {
      // Ratio type must be 0, 1, or 2
      const num = parseInt(value, 10);
      bulkState.settings[fieldInfo.index] = (num >= 0 && num <= 2) ? String(num) : '';
    } else {
      // Numeric fields
      const num = parseInt(value, 10);
      bulkState.settings[fieldInfo.index] = !isNaN(num) ? String(num) : '';
    }
  }

  await displayBulkSettings(socket, bulkState, db);
}

/**
 * Apply Bulk Changes to Users
 * express.e:23688-23738+ - applyBulkChanges
 */
async function applyBulkChanges(socket: any, session: BBSSession, db: Database, bulkState: BulkEditorState): Promise<void> {
  socket.emit('ansi-output', '\x1b[0mUpdating users...');

  try {
    const allUsers = await db.getUsers({});
    let updated = 0;
    const s = bulkState.settings;

    for (const user of allUsers) {
      // Skip deactivated if not included
      if (!bulkState.includeDeact && !user.slotNumber) continue;

      // Filter by area name
      if (bulkState.areaName && user.location?.toLowerCase() !== bulkState.areaName.toLowerCase()) continue;

      // Filter by security level
      if (bulkState.secLevel) {
        const level = parseInt(bulkState.secLevel, 10);
        if (!isNaN(level) && user.secLevel !== level) continue;
      }

      // Build update object
      const updates: Partial<User> = {};

      if (s[0]) updates.ratio = parseInt(s[0], 10);
      if (s[1]) updates.ratioType = parseInt(s[1], 10);
      // s[2] = AutoRejoin - would need conference-specific handling
      if (s[3]) updates.uploads = parseInt(s[3], 10);
      if (s[4]) updates.messagesPosted = parseInt(s[4], 10);
      if (s[5]) updates.downloads = parseInt(s[5], 10);
      if (s[6]) updates.bytesUpload = parseInt(s[6], 10);
      if (s[7]) updates.bytesDownload = parseInt(s[7], 10);
      if (s[8]) updates.dailyBytesLimit = parseInt(s[8], 10);
      if (s[9]) updates.timeTotal = parseInt(s[9], 10);
      if (s[10]) updates.timeLimit = parseInt(s[10], 10);
      if (s[11]) updates.chatLimit = parseInt(s[11], 10);
      if (s[12]) updates.calls = parseInt(s[12], 10);
      if (s[13]) updates.location = s[13];  // Area Name
      if (s[14]) updates.secLevel = parseInt(s[14], 10);
      if (s[15]) {
        // Active toggle: 1 = activate (assign slot), 0 = deactivate (remove slot)
        if (s[15] === '0') {
          updates.slotNumber = undefined;
        }
        // Activation would need slot assignment logic
      }
      // s[16] = Force Pwd Reset - would need flag
      // s[17] = Account Locked - would need flag

      // Apply updates if any
      if (Object.keys(updates).length > 0) {
        await db.updateUser(user.id, updates);

        // DISK-BASED: Update user files
        try {
          const updatedUser = await db.getUserById(user.id);
          if (updatedUser && updatedUser.slotNumber) {
            userFileManager.updateUserDataFile(updatedUser, updatedUser.slotNumber);
          }
        } catch (error) {
          console.error(`[BulkEditor] Error updating user ${user.id} disk files:`, error);
        }

        updated++;
      }
    }

    socket.emit('ansi-output', `\r\n\x1b[32mUpdated ${updated} user(s).\x1b[0m\r\n`);
    console.log(`[BulkEditor] Bulk update: Area=${bulkState.areaName}, SecLevel=${bulkState.secLevel}, Records=${updated}`);
  } catch (err) {
    console.error('[BulkEditor] Error applying bulk changes:', err);
    socket.emit('ansi-output', '\r\n\x1b[31mError applying bulk changes.\x1b[0m\r\n');
  }

  socket.emit('ansi-output', '\x1b[24;1H                                     ');
  await displayBulkSettings(socket, bulkState, db);
}

/**
 * Edit User Account (checkNEdit + editInfo combined)
 * Original: express.e:22380-22399 (checkNEdit)
 *           express.e:21211-21400+ (editInfo)
 *
 * This implements the REPEAT loop from editInfo that processes single-character commands
 */
async function handleEditUser(socket: any, session: BBSSession, db: Database, user: User): Promise<void> {
  const state = getAccountEditorState(session);
  state.editingUserId = user.id;
  state.page = state.page || 0;
  state.changes = false;

  // Display account - express.e:21220 (displayAccount)
  await displayAccount(socket, user, state.page!);

  // Set up character-based input - express.e:21224-21226
  // flag:=0
  // command:=readChar(INPUT_TIMEOUT)
  session.inputCallback = async (input: string) => {
    await handleEditInfoCommand(socket, session, db, user, input);
  };
}

/**
 * Display Account Info
 * Original: express.e:displayAccount (referenced at 21220)
 */
async function displayAccount(socket: any, user: User, page: number): Promise<void> {
  // express.e:22952-22988 displayAccount - sendCLS() then status line, no headerBox
  socket.emit('ansi-output', '\x1b[2J\x1b[H'); // Clear screen - express.e:22957 sendCLS()

  // express.e:22982-22988 - Status line with ACTIVE/INACTIVE and slot number
  const statusColor = user.slotNumber ? '\x1b[0;33m' : '\x1b[0;37m';
  const statusText = user.slotNumber ? '  ACTIVE' : 'INACTIVE';
  socket.emit('ansi-output', `${statusColor}${statusText}\x1b[0m [${user.slotNumber || 0}]   \x1b[0;32mBAUD\x1b[0;36m:\x1b[0m ${(user as any).baud || 115200}\r\n`);
  socket.emit('ansi-output', '\r\n');

  if (page === 0) {
    // Page 0 - express.e:22990-23047 displayAccount() exact field layout
    // Row 2: A=Name, B=Real Name
    socket.emit('ansi-output', AnsiUtil.colorize('A>', 'yellow'));
    socket.emit('ansi-output', ` \x1b[0;32mName\x1b[0;36m:\x1b[0m ${user.username.padEnd(32)}`);
    socket.emit('ansi-output', AnsiUtil.colorize('B>', 'yellow'));
    socket.emit('ansi-output', ` \x1b[0;32mReal Name\x1b[0;36m:\x1b[0m ${user.realname}\r\n`);

    // Row 3: C=Location, D=Password
    socket.emit('ansi-output', AnsiUtil.colorize('C>', 'yellow'));
    socket.emit('ansi-output', ` \x1b[0;32mLoc.\x1b[0;36m:\x1b[0m ${(user.location || '').padEnd(29)}`);
    socket.emit('ansi-output', AnsiUtil.colorize('D>', 'yellow'));
    socket.emit('ansi-output', ` \x1b[0;32mPass ....\x1b[0;36m: \x1b[44mENCRYPTED\x1b[0m\r\n`);

    // Row 4: E=Phone Number, F=Area Name (express.e:23010-23014)
    socket.emit('ansi-output', AnsiUtil.colorize('E>', 'yellow'));
    socket.emit('ansi-output', ` \x1b[0;32mPhone Number ..\x1b[0;36m:\x1b[0m ${(user.phone || '').padEnd(13)}`);
    socket.emit('ansi-output', AnsiUtil.colorize('F>', 'yellow'));
    socket.emit('ansi-output', ` \x1b[0;32mArea Name......\x1b[0;36m:\x1b[0m ${user.areaName || ''}\r\n`);

    // Row 5: G=Ratio (secLibrary), H=Sec_Level (secStatus) - express.e:23016-23020
    socket.emit('ansi-output', AnsiUtil.colorize('G>', 'yellow'));
    socket.emit('ansi-output', ` \x1b[0;32mRatio .........\x1b[0;36m:\x1b[0m ${String(user.ratio).padEnd(7)}`);
    socket.emit('ansi-output', '         ');
    socket.emit('ansi-output', AnsiUtil.colorize('H>', 'yellow'));
    socket.emit('ansi-output', ` \x1b[0;32mSec_Level .....\x1b[0;36m:\x1b[0m ${user.secLevel}\r\n`);

    // Row 6: I=Ratio Type, J=AutoReJoin - express.e:23022-23034
    const ratioTypeLabels = ['<-Byte)', '<-B/F) ', '<-File)'];
    const ratioLabel = ratioTypeLabels[user.ratioType] || '';
    socket.emit('ansi-output', AnsiUtil.colorize('I>', 'yellow'));
    socket.emit('ansi-output', ` \x1b[0;32mRatio Type ....\x1b[0;36m:\x1b[0m ${String(user.ratioType).padEnd(5)} \x1b[0;32m<-\x1b[0;33m${ratioLabel}\x1b[0m`);
    socket.emit('ansi-output', ' ');
    socket.emit('ansi-output', AnsiUtil.colorize('J>', 'yellow'));
    socket.emit('ansi-output', ` \x1b[0;32mAutoReJoin ....\x1b[0;36m:\x1b[0m ${user.autoRejoin || 0}\r\n`);

    // Row 7: K=Uploads, L=Messages Posted - express.e:23036-23040
    socket.emit('ansi-output', AnsiUtil.colorize('K>', 'yellow'));
    socket.emit('ansi-output', ` \x1b[0;32mUploads .......\x1b[0;36m:\x1b[0m ${String(user.uploads).padEnd(10)}`);
    socket.emit('ansi-output', '       ');
    socket.emit('ansi-output', AnsiUtil.colorize('L>', 'yellow'));
    socket.emit('ansi-output', ` \x1b[0;32mMessages Posted\x1b[0;36m:\x1b[0m ${user.messagesPosted || 0}\r\n`);

    // Row 8: M=Downloads, N=New_User - express.e:23042-23047
    socket.emit('ansi-output', AnsiUtil.colorize('M>', 'yellow'));
    socket.emit('ansi-output', ` \x1b[0;32mDownloads .....\x1b[0;36m:\x1b[0m ${String(user.downloads).padEnd(10)}`);
    socket.emit('ansi-output', '       ');
    socket.emit('ansi-output', AnsiUtil.colorize('N>', 'yellow'));
    socket.emit('ansi-output', ` \x1b[0;32mNew_User ......\x1b[0;36m:\x1b[0m ${user.newUser ? 'Yes' : 'No'}\r\n`);
  } else {
    // Page 1 - Security Info (express.e:23132-23170)
    // Row 3: B=Force Pwd Reset, C=Account Locked - WEB: show password info
    socket.emit('ansi-output', AnsiUtil.colorize('B>', 'yellow'));
    socket.emit('ansi-output', ` \x1b[0;32mPassword Hash\x1b[0;36m:\x1b[0m ${user.passwordHash ? 'Set' : 'Not Set'}\r\n`);

    // Row 4: D=Invalid Pwd Att + Last Pwd Reset - WEB: show account dates
    socket.emit('ansi-output', AnsiUtil.colorize('C>', 'yellow'));
    const lastLogin = user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never';
    socket.emit('ansi-output', ` \x1b[0;32mLast Login\x1b[0;36m:\x1b[0m ${lastLogin}\r\n`);

    socket.emit('ansi-output', AnsiUtil.colorize('D>', 'yellow'));
    const firstLogin = user.firstLogin ? new Date(user.firstLogin).toLocaleDateString() : 'N/A';
    socket.emit('ansi-output', ` \x1b[0;32mFirst Login\x1b[0;36m:\x1b[0m ${firstLogin}\r\n`);

    // Time stats - express.e:23108-23127
    socket.emit('ansi-output', AnsiUtil.colorize('E>', 'yellow'));
    socket.emit('ansi-output', ` \x1b[0;32mTime_Total\x1b[0;36m:\x1b[0m [${String(Math.floor(user.timeTotal / 60)).padStart(8)}] mins\r\n`);

    socket.emit('ansi-output', AnsiUtil.colorize('F>', 'yellow'));
    socket.emit('ansi-output', ` \x1b[0;32mTime_Limit\x1b[0;36m:\x1b[0m [${String(user.timeLimit).padStart(8)}] mins\r\n`);

    socket.emit('ansi-output', AnsiUtil.colorize('G>', 'yellow'));
    socket.emit('ansi-output', ` \x1b[0;32mTime_Used\x1b[0;36m:\x1b[0m [${String(Math.floor(user.timeUsed / 60)).padStart(8)}] mins\r\n`);

    socket.emit('ansi-output', AnsiUtil.colorize('H>', 'yellow'));
    socket.emit('ansi-output', ` \x1b[0;32mChat_Limit\x1b[0;36m:\x1b[0m [${String(Math.floor(user.chatLimit / 60)).padStart(8)}] mins\r\n`);

    // Transfer stats
    socket.emit('ansi-output', AnsiUtil.colorize('I>', 'yellow'));
    socket.emit('ansi-output', ` \x1b[0;32mBytes Uled\x1b[0;36m:\x1b[0m ${user.bytesUpload.toLocaleString()}\r\n`);

    socket.emit('ansi-output', AnsiUtil.colorize('J>', 'yellow'));
    socket.emit('ansi-output', ` \x1b[0;32mBytes Dled\x1b[0;36m:\x1b[0m ${user.bytesDownload.toLocaleString()}\r\n`);

    socket.emit('ansi-output', AnsiUtil.colorize('K>', 'yellow'));
    socket.emit('ansi-output', ` \x1b[0;32mByte Limit\x1b[0;36m:\x1b[0m ${user.byteLimit === 0 ? 'Infinite' : user.byteLimit.toLocaleString()}\r\n`);

    socket.emit('ansi-output', AnsiUtil.colorize('L>', 'yellow'));
    socket.emit('ansi-output', ` \x1b[0;32mCalls\x1b[0;36m:\x1b[0m ${user.calls}\r\n`);
  }

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.colorize('Commands:', 'cyan'));
  socket.emit('ansi-output', ' [Space]=Page  ');
  socket.emit('ansi-output', AnsiUtil.colorize('~', 'yellow'));
  socket.emit('ansi-output', '=Save  ');
  socket.emit('ansi-output', AnsiUtil.colorize('X', 'yellow'));
  socket.emit('ansi-output', '=No-Save  ');
  socket.emit('ansi-output', AnsiUtil.colorize('TAB', 'yellow'));
  socket.emit('ansi-output', '=Exit\r\n');
  socket.emit('ansi-output', 'Command: ');
}

/**
 * Handle Edit Info Commands (character-based)
 * Original: express.e:21224-21400+ (editInfo REPEAT loop)
 */
async function handleEditInfoCommand(socket: any, session: BBSSession, db: Database, user: User, input: string): Promise<void> {
  const state = getAccountEditorState(session);
  const command = input.charAt(0).toUpperCase();

  // TAB - Exit with save check - express.e:21230-21233
  if (command === '\t' || input === '\t') {
    if (state.changes) {
      socket.emit('ansi-output', '\r\nSave changes? (Y/N): ');
      session.inputCallback = async (saveInput: string) => {
        if (saveInput.toUpperCase() === 'Y') {
          await db.updateUser(user.id, user);
          // DISK-BASED: Update user files after database update
          if (user.slotNumber) {
            try {
              userFileManager.updateUserDataFile(user, user.slotNumber);
console.log(`[UserEditor] Updated user ${user.username} disk files`);
            } catch (error) {
console.error(`[UserEditor] Error updating user ${user.id} disk files:`, error);
            }
          }
          socket.emit('ansi-output', '\r\nSaved.\r\n');
        }
        // Exit to menu
        delete session.accountEditorState;
        session.inputCallback = undefined;
        await handleAccountEditorMenu(socket, session, db);
      };
      return;
    }
    // No changes, just exit
    delete session.accountEditorState;
    session.inputCallback = undefined;
    await handleAccountEditorMenu(socket, session, db);
    return;
  }

  // X - No-Save exit - express.e:21234-21238
  if (command === 'X') {
    socket.emit('ansi-output', '\r\nNo-Save\r\n');
    delete session.accountEditorState;
    session.inputCallback = undefined;
    await handleAccountEditorMenu(socket, session, db);
    return;
  }

  // Space - Toggle page - express.e:21239-21242
  if (command === ' ') {
    state.page = state.page === 0 ? 1 : 0;
    await displayAccount(socket, user, state.page);
    // Continue in edit mode
    session.inputCallback = async (nextInput: string) => {
      await handleEditInfoCommand(socket, session, db, user, nextInput);
    };
    return;
  }

  // ~ - Save - express.e:21259-21284
  if (command === '~') {
    socket.emit('ansi-output', '\r\nSave\r\n');
    user.newUser = false;
    await db.updateUser(user.id, user);
    // DISK-BASED: Update user files after database update
    if (user.slotNumber) {
      try {
        userFileManager.updateUserDataFile(user, user.slotNumber);
console.log(`[UserEditor] Updated user ${user.username} disk files`);
      } catch (error) {
console.error(`[UserEditor] Error updating user ${user.id} disk files:`, error);
      }
    }
    state.changes = false;
    await displayAccount(socket, user, state.page!);
    // Continue in edit mode
    session.inputCallback = async (nextInput: string) => {
      await handleEditInfoCommand(socket, session, db, user, nextInput);
    };
    return;
  }

  // Field editing - express.e:21317-21400+
  if (state.page === 0) {
    await handlePageZeroEdit(socket, session, db, user, command);
  } else {
    await handlePageOneEdit(socket, session, db, user, command);
  }
}

/**
 * Handle Page 0 Field Editing
 * Original: express.e:21317+ (SELECT command for page 0)
 */
async function handlePageZeroEdit(socket: any, session: BBSSession, db: Database, user: User, command: string): Promise<void> {
  const state = getAccountEditorState(session);

  // Check security level edit permission (express.e:21458-21469)
  // Remote users can only edit security level if they're slot #1 (sysop)
  // F6 mode (onlineEdit) allows editing
  const canEditSecLevel = (): boolean => {
    // If editing own account (onlineEdit mode), allow if sysop
    if (session.user && user.id === session.user.id) {
      return session.user.secLevel >= 255; // Sysop level
    }
    // If editing another user, must be sysop
    return session.user?.secLevel >= 255;
  };

  // Page 0 field mapping per express.e:22990-23047 displayAccount()
  const fieldMap: { [key: string]: { field: keyof User, prompt: string, maxLen: number } } = {
    'A': { field: 'username', prompt: 'Name', maxLen: 30 },
    'B': { field: 'realname', prompt: 'Real Name', maxLen: 25 },
    'C': { field: 'location', prompt: 'Location', maxLen: 30 },
    // D=Password is ENCRYPTED and not user-editable per express.e:23000-23007
    'E': { field: 'phone', prompt: 'Phone Number', maxLen: 15 },
    'F': { field: 'areaName', prompt: 'Area Name', maxLen: 30 },
    'G': { field: 'ratio', prompt: 'Ratio', maxLen: 10 },
    'H': { field: 'secLevel', prompt: 'Sec_Level (0-255)', maxLen: 3 },
    'I': { field: 'ratioType', prompt: 'Ratio Type (0=Byte, 1=B/F, 2=File)', maxLen: 1 },
    'J': { field: 'autoRejoin', prompt: 'AutoReJoin (conf#)', maxLen: 5 },
    'K': { field: 'uploads', prompt: 'Uploads', maxLen: 10 },
    'L': { field: 'messagesPosted', prompt: 'Messages Posted', maxLen: 10 },
    'M': { field: 'downloads', prompt: 'Downloads', maxLen: 10 },
    'N': { field: 'newUser', prompt: 'New_User (Y/N)', maxLen: 1 }
  };

  if (fieldMap[command]) {
    const field = fieldMap[command];

    // Check permission for security level editing (express.e:21458-21469)
    // H=Sec_Level per express.e:23019
    if (command === 'H' && !canEditSecLevel()) {
      socket.emit('ansi-output', '\r\nAccess Denied: Only sysop can edit security level\r\n');
      await displayAccount(socket, user, state.page!);
      session.inputCallback = async (nextInput: string) => {
        await handleEditInfoCommand(socket, session, db, user, nextInput);
      };
      return;
    }

    socket.emit('ansi-output', `\r\n${field.prompt}: `);

    session.inputCallback = async (newValue: string) => {
      await handleFieldUpdate(socket, session, db, user, field.field, newValue.trim());
    };
  } else {
    // Invalid command, redisplay
    await displayAccount(socket, user, state.page!);
    session.inputCallback = async (nextInput: string) => {
      await handleEditInfoCommand(socket, session, db, user, nextInput);
    };
  }
}

/**
 * Handle Page 1 Field Editing
 */
async function handlePageOneEdit(socket: any, session: BBSSession, db: Database, user: User, command: string): Promise<void> {
  const state = getAccountEditorState(session);

  // Page 1 field mapping - Security and time stats
  // B, C, D are read-only display fields (password hash, last/first login)
  const fieldMap: { [key: string]: { field: keyof User, prompt: string } } = {
    'E': { field: 'timeTotal', prompt: 'Time_Total (mins)' },
    'F': { field: 'timeLimit', prompt: 'Time_Limit (mins)' },
    'G': { field: 'timeUsed', prompt: 'Time_Used (mins)' },
    'H': { field: 'chatLimit', prompt: 'Chat_Limit (mins)' },
    'I': { field: 'bytesUpload', prompt: 'Bytes Uploaded' },
    'J': { field: 'bytesDownload', prompt: 'Bytes Downloaded' },
    'K': { field: 'byteLimit', prompt: 'Byte Limit (0=Infinite)' },
    'L': { field: 'calls', prompt: 'Calls' }
  };

  if (fieldMap[command]) {
    const field = fieldMap[command];
    socket.emit('ansi-output', `\r\n${field.prompt}: `);

    session.inputCallback = async (newValue: string) => {
      await handleFieldUpdate(socket, session, db, user, field.field, newValue.trim());
    };
  } else {
    // Invalid command, redisplay
    await displayAccount(socket, user, state.page!);
    session.inputCallback = async (nextInput: string) => {
      await handleEditInfoCommand(socket, session, db, user, nextInput);
    };
  }
}

/**
 * Handle Field Update
 */
async function handleFieldUpdate(socket: any, session: BBSSession, db: Database, user: User, fieldName: keyof User, newValue: string): Promise<void> {
  const state = getAccountEditorState(session);

  if (!newValue && fieldName !== 'email') {
    // Empty, cancel
    await displayAccount(socket, user, state.page!);
    session.inputCallback = async (nextInput: string) => {
      await handleEditInfoCommand(socket, session, db, user, nextInput);
    };
    return;
  }

  try {
    switch (fieldName) {
      case 'username':
      case 'realname':
      case 'location':
      case 'phone':
        user[fieldName] = newValue;
        state.changes = true;
        break;
      case 'email':
        user.email = newValue || undefined;
        state.changes = true;
        break;
      case 'secLevel':
        const secLevel = parseInt(newValue, 10);
        if (isNaN(secLevel) || secLevel < 0 || secLevel > 255) {
          throw new Error('Must be 0-255');
        }
        user.secLevel = secLevel;
        state.changes = true;
        break;
      case 'passwordHash':
        user.passwordHash = await bcrypt.hash(newValue, 10);
        state.changes = true;
        break;
      case 'ratio':
        const ratio = parseFloat(newValue);
        if (isNaN(ratio)) {
          throw new Error('Must be a number');
        }
        user.ratio = ratio;
        state.changes = true;
        break;
      case 'timeLimit':
      case 'uploads':
      case 'downloads':
      case 'calls':
        const numVal = parseInt(newValue, 10);
        if (isNaN(numVal) || numVal < 0) {
          throw new Error('Must be >= 0');
        }
        user[fieldName] = numVal;
        state.changes = true;
        break;
      case 'expert': {
        const boolVal = newValue.toUpperCase();
        if (boolVal !== 'Y' && boolVal !== 'N') {
          throw new Error('Enter Y or N');
        }
        user.expert = boolVal === 'Y' ? 'X' : 'N';
        state.changes = true;
        break;
      }
      case 'newUser': {
        const boolVal = newValue.toUpperCase();
        if (boolVal !== 'Y' && boolVal !== 'N') {
          throw new Error('Enter Y or N');
        }
        user.newUser = boolVal === 'Y';
        state.changes = true;
        break;
      }
    }

    // Redisplay account with updated values
    await displayAccount(socket, user, state.page!);
    session.inputCallback = async (nextInput: string) => {
      await handleEditInfoCommand(socket, session, db, user, nextInput);
    };
  } catch (error) {
    socket.emit('ansi-output', `\r\nError: ${(error as Error).message}\r\n`);
    await displayAccount(socket, user, state.page!);
    session.inputCallback = async (nextInput: string) => {
      await handleEditInfoCommand(socket, session, db, user, nextInput);
    };
  }
}

// Export main entry point
export { handleAccountEditorMenu as handleAccountEditing };
