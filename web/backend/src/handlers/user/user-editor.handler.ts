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
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.headerBox('New User Accounts'));
  socket.emit('ansi-output', '\r\n');

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
 */
async function handleListCreditAccounts(socket: any, session: BBSSession, db: Database): Promise<void> {
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.headerBox('Credit Accounts'));
  socket.emit('ansi-output', '\r\n');

  const allUsers = await db.getUsers({});
  const creditUsers = allUsers.filter(u => u.ratio < 0);

  if (creditUsers.length === 0) {
    socket.emit('ansi-output', 'No credit accounts found.\r\n');
  } else {
    socket.emit('ansi-output', `Found ${creditUsers.length} credit account(s):\r\n\r\n`);
    for (const user of creditUsers) {
      const ratioStr = user.ratio.toFixed(2);
      socket.emit('ansi-output', `  ${user.username.padEnd(20)} Ratio: ${ratioStr.padStart(8)} Sec: ${user.secLevel}\r\n`);
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
 * Bulk Account Editor (B command)
 * Original: express.e:22421-22422 (calls bulkAccountEditor)
 */
async function handleBulkAccountEditor(socket: any, session: BBSSession, db: Database): Promise<void> {
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.headerBox('Bulk Account Editor'));
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', 'Enter security level (0-255) to assign to all new accounts, or press ENTER to skip: ');

  // Store state for bulk operation
  session.subState = LoggedOnSubState.ACCOUNT_EDITOR_BULK;
  session.inputCallback = async (input: string) => {
    const trimmed = input.trim();
    if (!trimmed) {
      socket.emit('ansi-output', '\r\nNo bulk changes applied.\r\n');
      socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
      session.inputCallback = async () => {
        await handleAccountEditorMenu(socket, session, db);
      };
      return;
    }

    const level = parseInt(trimmed, 10);
    if (isNaN(level) || level < 0 || level > 255) {
      socket.emit('ansi-output', '\r\n\x1b[31mInvalid security level.\x1b[0m\r\n');
      socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
      session.inputCallback = async () => {
        await handleAccountEditorMenu(socket, session, db);
      };
      return;
    }

    try {
      const newUsers = await db.getUsers({ newUser: true });
      for (const user of newUsers) {
        await db.updateUser(user.id, { secLevel: level });
        // DISK-BASED: Update user files after database update
        try {
          const updatedUser = await db.getUserById(user.id);
          if (updatedUser) {
            userFileManager.updateUserDataFile(updatedUser, parseInt(user.id, 10));
          }
        } catch (error) {
          console.error(`[UserEditor] Error updating user ${user.id} disk files:`, error);
        }
      }
      socket.emit('ansi-output', `\r\nUpdated ${newUsers.length} new account(s) to level ${level}.\r\n`);
    } catch (err) {
      console.error('Bulk update error:', err);
      socket.emit('ansi-output', '\r\n\x1b[31mError applying bulk changes.\x1b[0m\r\n');
    }

    socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
    session.inputCallback = async () => {
      await handleAccountEditorMenu(socket, session, db);
    };
  };
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
  socket.emit('ansi-output', '\x1b[2J\x1b[H'); // Clear screen
  socket.emit('ansi-output', AnsiUtil.headerBox(`Editing: ${user.username}`));
  socket.emit('ansi-output', '\r\n');

  if (page === 0) {
    // Page 0 - Basic info (express.e fields A-M)
    socket.emit('ansi-output', AnsiUtil.colorize(' A.', 'yellow'));
    socket.emit('ansi-output', ` Name:            ${user.username}\r\n`);

    socket.emit('ansi-output', AnsiUtil.colorize(' B.', 'yellow'));
    socket.emit('ansi-output', ` Real Name:       ${user.realname}\r\n`);

    socket.emit('ansi-output', AnsiUtil.colorize(' C.', 'yellow'));
    socket.emit('ansi-output', ` Location:        ${user.location}\r\n`);

    socket.emit('ansi-output', AnsiUtil.colorize(' D.', 'yellow'));
    socket.emit('ansi-output', ` Phone:           ${user.phone}\r\n`);

    socket.emit('ansi-output', AnsiUtil.colorize(' E.', 'yellow'));
    socket.emit('ansi-output', ` Email:           ${user.email || '(none)'}\r\n`);

    socket.emit('ansi-output', AnsiUtil.colorize(' F.', 'yellow'));
    socket.emit('ansi-output', ` Security:        ${user.secLevel}\r\n`);

    socket.emit('ansi-output', AnsiUtil.colorize(' G.', 'yellow'));
    socket.emit('ansi-output', ` Password:        ********\r\n`);

    socket.emit('ansi-output', AnsiUtil.colorize(' H.', 'yellow'));
    socket.emit('ansi-output', ` Ratio:           ${user.ratio.toFixed(2)}\r\n`);

    socket.emit('ansi-output', AnsiUtil.colorize(' I.', 'yellow'));
    socket.emit('ansi-output', ` Time Limit:      ${user.timeLimit} min\r\n`);

    socket.emit('ansi-output', AnsiUtil.colorize(' J.', 'yellow'));
    socket.emit('ansi-output', ` Expert Mode:     ${user.expert === 'X' ? 'Yes' : 'No'}\r\n`);
  } else {
    // Page 1 - Additional info
    socket.emit('ansi-output', AnsiUtil.colorize(' A.', 'yellow'));
    socket.emit('ansi-output', ` Uploads:         ${user.uploads}\r\n`);

    socket.emit('ansi-output', AnsiUtil.colorize(' B.', 'yellow'));
    socket.emit('ansi-output', ` Downloads:       ${user.downloads}\r\n`);

    socket.emit('ansi-output', AnsiUtil.colorize(' C.', 'yellow'));
    socket.emit('ansi-output', ` Calls:           ${user.calls}\r\n`);

    socket.emit('ansi-output', AnsiUtil.colorize(' D.', 'yellow'));
    socket.emit('ansi-output', ` New User:        ${user.newUser ? 'Yes' : 'No'}\r\n`);
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
          try {
            userFileManager.updateUserDataFile(user, parseInt(user.id, 10));
            console.log(`[UserEditor] Updated user ${user.username} disk files`);
          } catch (error) {
            console.error(`[UserEditor] Error updating user ${user.id} disk files:`, error);
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
    try {
      userFileManager.updateUserDataFile(user, parseInt(user.id, 10));
      console.log(`[UserEditor] Updated user ${user.username} disk files`);
    } catch (error) {
      console.error(`[UserEditor] Error updating user ${user.id} disk files:`, error);
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

  const fieldMap: { [key: string]: { field: keyof User, prompt: string, maxLen: number } } = {
    'A': { field: 'username', prompt: 'Name', maxLen: 30 },
    'B': { field: 'realname', prompt: 'Real Name', maxLen: 25 },
    'C': { field: 'location', prompt: 'Location', maxLen: 30 },
    'D': { field: 'phone', prompt: 'Phone', maxLen: 15 },
    'E': { field: 'email', prompt: 'Email', maxLen: 50 },
    'F': { field: 'secLevel', prompt: 'Security (0-255)', maxLen: 3 },
    'G': { field: 'passwordHash', prompt: 'Password', maxLen: 20 },
    'H': { field: 'ratio', prompt: 'Ratio', maxLen: 10 },
    'I': { field: 'timeLimit', prompt: 'Time Limit (min)', maxLen: 5 },
    'J': { field: 'expert', prompt: 'Expert (Y/N)', maxLen: 1 }
  };

  if (fieldMap[command]) {
    const field = fieldMap[command];

    // Check permission for security level editing (express.e:21458-21469)
    if (command === 'F' && !canEditSecLevel()) {
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

  const fieldMap: { [key: string]: { field: keyof User, prompt: string } } = {
    'A': { field: 'uploads', prompt: 'Uploads' },
    'B': { field: 'downloads', prompt: 'Downloads' },
    'C': { field: 'calls', prompt: 'Calls' },
    'D': { field: 'newUser', prompt: 'New User (Y/N)' }
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
