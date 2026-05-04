/**
 * Account Management Handler
 * Handles user account editing, viewing, and management operations
 * 1:1 port from AmiExpress express.e account management
 */

import { BBSSession, LoggedOnSubState, BBSState } from '../../index';

// Dependencies (injected)
let db: any;

// Dependency injection setters
export function setDatabase(database: any) {
  db = database;
}

// ===== Account Editing Menu =====

/**
 * **WEB_**: 7-option menu wrapper around editInfo (express.e:21211).
 * Express.e has no equivalent menu — `editInfo` is invoked directly by
 * the W command and shows individual fields without a numeric chooser.
 * Web users prefer a menu over typing through every prompt, so this
 * wrapper sits in front of the per-field editor. (Audit A-24.)
 */
export function displayAccountEditingMenu(socket: any, session: BBSSession) {
  socket.emit('ansi-output', '\x1b[36m-= Account Editing Menu =-\x1b[0m\r\n');
  socket.emit('ansi-output', 'Available operations:\r\n\r\n');
  socket.emit('ansi-output', '1. Edit User Account\r\n');
  socket.emit('ansi-output', '2. View User Statistics\r\n');
  socket.emit('ansi-output', '3. Change User Security Level\r\n');
  socket.emit('ansi-output', '4. Toggle User Flags\r\n');
  socket.emit('ansi-output', '5. Delete User Account\r\n');
  socket.emit('ansi-output', '6. List All Users\r\n');
  socket.emit('ansi-output', '7. Search Users\r\n');
  socket.emit('ansi-output', '\r\n\x1b[32mSelect option (1-7) or press Enter to cancel: \x1b[0m');

  session.subState = LoggedOnSubState.FILE_AREA_SELECT; // Reuse for menu selection
  session.tempData = { accountEditingMenu: true };
}

// handleAccountEditing() - Process account editing selections
export function handleAccountEditing(socket: any, session: BBSSession, input: string) {
  const option = parseInt(input.trim());

  if (isNaN(option) || option < 1 || option > 7) {
    socket.emit('ansi-output', '\r\n\x1b[31mInvalid option.\x1b[0m\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
    return;
  }

  switch (option) {
    case 1: // Edit User Account
      socket.emit('ansi-output', '\r\n\x1b[36m-= Edit User Account =-\x1b[0m\r\n');
      socket.emit('ansi-output', 'Enter username to edit: ');
      session.subState = LoggedOnSubState.FILE_DIR_SELECT; // Reuse for username input
      session.tempData = { editUserAccount: true };
      return;

    case 2: // View User Statistics
      socket.emit('ansi-output', '\r\n\x1b[36m-= User Statistics =-\x1b[0m\r\n');
      socket.emit('ansi-output', 'Enter username to view stats: ');
      session.subState = LoggedOnSubState.FILE_DIR_SELECT;
      session.tempData = { viewUserStats: true };
      return;

    case 3: // Change User Security Level
      socket.emit('ansi-output', '\r\n\x1b[36m-= Change Security Level =-\x1b[0m\r\n');
      socket.emit('ansi-output', 'Enter username: ');
      session.subState = LoggedOnSubState.FILE_DIR_SELECT;
      session.tempData = { changeSecLevel: true };
      return;

    case 4: // Toggle User Flags
      socket.emit('ansi-output', '\r\n\x1b[36m-= Toggle User Flags =-\x1b[0m\r\n');
      socket.emit('ansi-output', 'Enter username: ');
      session.subState = LoggedOnSubState.FILE_DIR_SELECT;
      session.tempData = { toggleUserFlags: true };
      return;

    case 5: // Delete User Account
      socket.emit('ansi-output', '\r\n\x1b[36m-= Delete User Account =-\x1b[0m\r\n');
      socket.emit('ansi-output', '\x1b[31mWARNING: This action cannot be undone!\x1b[0m\r\n');
      socket.emit('ansi-output', 'Enter username to delete: ');
      session.subState = LoggedOnSubState.FILE_DIR_SELECT;
      session.tempData = { deleteUserAccount: true };
      return;

    case 6: // List All Users
      displayUserList(socket, session);
      return;

    case 7: // Search Users
      socket.emit('ansi-output', '\r\n\x1b[36m-= Search Users =-\x1b[0m\r\n');
      socket.emit('ansi-output', 'Enter search term (username, realname, or location): ');
      session.subState = LoggedOnSubState.FILE_DIR_SELECT;
      session.tempData = { searchUsers: true };
      return;
  }
}

// ===== User List Display =====

// displayUserList() - Display paginated user list
export function displayUserList(socket: any, session: BBSSession, page: number = 1, searchTerm?: string) {
  const pageSize = 20;
  const offset = (page - 1) * pageSize;

  socket.emit('ansi-output', '\x1b[36m-= User List ');
  if (searchTerm) {
    socket.emit('ansi-output', `(Search: "${searchTerm}") `);
  }
  socket.emit('ansi-output', `Page ${page} =-\x1b[0m\r\n\r\n`);

  socket.emit('ansi-output', '\x1b[32mUsername'.padEnd(16) + 'Real Name'.padEnd(20) + 'Location'.padEnd(15) + 'Level  Last Login\x1b[0m\r\n');
  socket.emit('ansi-output', '\x1b[36m' + '='.repeat(75) + '\x1b[0m\r\n');

  // Get users (with optional search)
  db.getUsers({ limit: pageSize + 1, newUser: undefined }).then((users: any[]) => {
    const hasMorePages = users.length > pageSize;
    const displayUsers = users.slice(0, pageSize);

    displayUsers.forEach((user: any) => {
      const lastLogin = user.lastLogin ? user.lastLogin.toLocaleDateString() : 'Never';
      socket.emit('ansi-output',
        user.username.padEnd(16) +
        (user.realname || '').padEnd(20) +
        (user.location || '').padEnd(15) +
        user.secLevel.toString().padStart(5) + '  ' +
        lastLogin + '\r\n'
      );
    });

    socket.emit('ansi-output', '\r\n');

    if (hasMorePages) {
      socket.emit('ansi-output', `\x1b[32mPress any key for page ${page + 1}, or 'Q' to quit: \x1b[0m`);
      session.tempData = { userListPage: page + 1, searchTerm };
    } else {
      socket.emit('ansi-output', '\x1b[32mEnd of list. Press any key to continue...\x1b[0m');
      session.tempData = undefined;
    }

    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
  }).catch((error: any) => {
console.error('Error fetching users:', error);
    socket.emit('ansi-output', '\x1b[31mError loading user list.\x1b[0m\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
  });
}

// ===== User Account Editing =====
// 1:1 port from express.e:21211-21650 editInfo()

/**
 * Display account information - Page 0 (Main Info)
 * Port from express.e:21222 displayAccount()
 */
export function displayAccountPage0(socket: any, user: any, slot: number) {
  // Clear screen and display header
  socket.emit('ansi-output', '\x1b[2J\x1b[H'); // CLS
  socket.emit('ansi-output', '\x1b[36m-= Account Editor: Page 1 of 2 =-\x1b[0m\r\n');
  socket.emit('ansi-output', `\x1b[33mSlot #${slot}\x1b[0m\r\n\r\n`);

  // Line 2: A) Name, B) Real Name
  socket.emit('ansi-output', `\x1b[33mA>\x1b[32m Name......:\x1b[36m${(user.username || '').padEnd(31)}\x1b[33mB>\x1b[32m Real Name.:\x1b[36m${(user.realname || '').padEnd(26)}\x1b[0m\r\n`);

  // Line 3: C) Location, D) Password
  socket.emit('ansi-output', `\x1b[33mC>\x1b[32m Location..:\x1b[36m${(user.location || '').padEnd(30)}\x1b[33mD>\x1b[32m Password..:\x1b[36m*********\x1b[0m\r\n`);

  // Line 4: E) Phone, F) Conf Access
  socket.emit('ansi-output', `\x1b[33mE>\x1b[32m Phone Number.:\x1b[36m${(user.phone || '').padEnd(13)}\x1b[33mF>\x1b[32m Conf Access:\x1b[36m${(user.conferenceAccess || '').padEnd(10)}\x1b[0m\r\n`);

  // Line 5: G) Ratio, H) Sec Level
  socket.emit('ansi-output', `\x1b[33mG>\x1b[32m Ratio.........:\x1b[36m${String(user.ratio || 0).padStart(5)}\x1b[33mH>\x1b[32m Sec_Level.:\x1b[36m${String(user.secLevel || 0).padStart(5)}\x1b[0m\r\n`);

  // Line 6: I) Ratio Type, J) ReJoin, #) Calls
  const ratioType = user.ratioType === 0 ? 'Byte' : user.ratioType === 1 ? 'B/F' : 'File';
  const confRejoin = user.confRJoin || 0;
  const msgBaseRejoin = user.msgBaseRJoin || 0;
  socket.emit('ansi-output', `\x1b[33mI>\x1b[32m Ratio Type...:\x1b[36m${String(user.ratioType || 0).padStart(5)} \x1b[32m<-\x1b[33m${ratioType}\x1b[32m)\x1b[0m `);
  socket.emit('ansi-output', `\x1b[33mJ>\x1b[32m ReJoin:\x1b[36m${String(confRejoin).padStart(3)}:${String(msgBaseRejoin).padStart(2)}`);
  socket.emit('ansi-output', `  \x1b[33m#>\x1b[32m Calls:\x1b[36m${String(user.calls || 0).padStart(5)}\x1b[0m\r\n`);

  // Line 7: K) Uploads, L) Messages Posted, %) Calls Today
  socket.emit('ansi-output', `\x1b[33mK>\x1b[32m Uploads.......:\x1b[36m${String(user.uploads || 0).padStart(5)}\x1b[33mL>\x1b[32m Msgs Posted:\x1b[36m${String(user.messagesPosted || 0).padStart(5)}`);
  socket.emit('ansi-output', `  \x1b[33m%>\x1b[32m Calls Today:\x1b[36m${String(user.callsToday || 0).padStart(3)}\x1b[0m\r\n`);

  // Line 8: M) Downloads, N) New User
  const newUser = user.newUser ? 'Yes' : 'No';
  socket.emit('ansi-output', `\x1b[33mM>\x1b[32m Downloads.....:\x1b[36m${String(user.downloads || 0).padStart(5)}\x1b[33mN>\x1b[32m New User..:\x1b[36m${newUser.padEnd(3)}\x1b[0m\r\n`);

  // Line 9: O) Bytes Uploaded
  socket.emit('ansi-output', `\x1b[33mO>\x1b[32m Bytes Uploaded:\x1b[36m${String(user.bytesUpload || 0).padStart(12)}\x1b[0m\r\n`);

  // Line 10: P) Bytes Downloaded
  socket.emit('ansi-output', `\x1b[33mP>\x1b[32m Bytes Downloaded:\x1b[36m${String(user.bytesDownload || 0).padStart(10)}\x1b[0m\r\n`);

  // Line 11: Q) Daily Bytes Limit
  socket.emit('ansi-output', `\x1b[33mQ>\x1b[32m Daily Bytes Limit:\x1b[36m${String(user.dailyBytesLimit || 0).padStart(9)}\x1b[0m\r\n`);

  // Line 12: R) Time Total, S) Upload CPS, T) Download CPS
  const timeTotal = Math.floor((user.timeTotal || 0) / 60);
  socket.emit('ansi-output', `\x1b[33mR>\x1b[32m Time Total:\x1b[36m${String(timeTotal).padStart(5)} min  `);
  socket.emit('ansi-output', `\x1b[33mS>\x1b[32m UpCPS:\x1b[36m${String(user.upCPS || 0).padStart(6)}  `);
  socket.emit('ansi-output', `\x1b[33mT>\x1b[32m DnCPS:\x1b[36m${String(user.dnCPS || 0).padStart(6)}\x1b[0m\r\n`);

  // Line 13: U) Time Limit, V) Time Used, W) UUCP
  const timeLimit = Math.floor((user.timeLimit || 0) / 60);
  const timeUsed = Math.floor((user.timeUsed || 0) / 60);
  socket.emit('ansi-output', `\x1b[33mU>\x1b[32m Time Limit:\x1b[36m${String(timeLimit).padStart(5)} min  `);
  socket.emit('ansi-output', `\x1b[33mV>\x1b[32m Used:\x1b[36m${String(timeUsed).padStart(5)} min  `);
  socket.emit('ansi-output', `\x1b[33mW>\x1b[32m UUCP:\x1b[36m${(user.uucpa || '').padEnd(4)}\x1b[0m\r\n`);

  // Line 14: Y) Chat Limit, Z) Chat Used
  const chatLimit = Math.floor((user.chatLimit || 0) / 60);
  const chatUsed = Math.floor(((user.chatLimit || 0) - (user.chatRemain || 0)) / 60);
  socket.emit('ansi-output', `\x1b[33mY>\x1b[32m Chat Limit:\x1b[36m${String(chatLimit).padStart(5)} min  `);
  socket.emit('ansi-output', `\x1b[33mZ>\x1b[32m Used:\x1b[36m${String(chatUsed).padStart(5)} min\x1b[0m\r\n`);

  // Line 18: Commands
  socket.emit('ansi-output', '\r\n\r\n\r\n');
  socket.emit('ansi-output', '\x1b[33m<SPACE>\x1b[36m=Page 2  \x1b[33m<TAB>\x1b[36m=Exit  \x1b[33m~\x1b[36m=Save  \x1b[33mX\x1b[36m=No-Save  \x1b[33m+/-\x1b[36m=Next/Prev User\x1b[0m\r\n');
  socket.emit('ansi-output', '\x1b[33m!\x1b[36m=Credits  \x1b[33m*\x1b[36m=Notes  \x1b[33m@\x1b[36m=Conf Acct  \x1b[33m?\x1b[36m=Answers  \x1b[33mDEL\x1b[36m=Delete  \x1b[33m9\x1b[36m=Reactivate\x1b[0m\r\n');
}

/**
 * Display account information - Page 1 (Security Settings)
 * Port from express.e:21614-21643
 */
export function displayAccountPage1(socket: any, user: any, slot: number) {
  // Clear screen and display header
  socket.emit('ansi-output', '\x1b[2J\x1b[H'); // CLS
  socket.emit('ansi-output', '\x1b[36m-= Account Editor: Page 2 of 2 =-\x1b[0m\r\n');
  socket.emit('ansi-output', `\x1b[33mSlot #${slot}\x1b[0m\r\n\r\n`);

  // Line 2: A) Name (repeated)
  socket.emit('ansi-output', `\x1b[33mA>\x1b[32m Name...........:\x1b[36m${(user.username || '').padEnd(31)}\x1b[0m\r\n`);

  // Line 3: B) Password Reset, C) Account Locked
  const pwdReset = user.forcePwdReset ? 'Yes' : 'No';
  const accountLocked = user.accountLocked ? 'Yes' : 'No';
  socket.emit('ansi-output', `\x1b[33mB>\x1b[32m Password Reset.:\x1b[36m${pwdReset.padEnd(3)}\x1b[33mC>\x1b[32m Account Locked:\x1b[36m${accountLocked.padEnd(3)}\x1b[0m\r\n`);

  // Line 4: D) Invalid Attempts
  socket.emit('ansi-output', `\x1b[33mD>\x1b[32m Invalid Attempts:\x1b[36m${String(user.invalidAttempts || 0).padStart(3)}\x1b[0m\r\n`);

  // Line 18: Commands
  socket.emit('ansi-output', '\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n');
  socket.emit('ansi-output', '\x1b[33m<SPACE>\x1b[36m=Page 1  \x1b[33m<TAB>\x1b[36m=Exit  \x1b[33m~\x1b[36m=Save  \x1b[33mX\x1b[36m=No-Save  \x1b[33m+/-\x1b[36m=Next/Prev User\x1b[0m\r\n');
}

// handleEditUserAccount() - Enter account editing mode
// 1:1 port from express.e:21211-21650 editInfo()
export function handleEditUserAccount(socket: any, session: BBSSession, username: string) {
  db.getUserByUsername(username).then((user: any) => {
    if (!user) {
      socket.emit('ansi-output', '\r\n\x1b[31mUser not found.\x1b[0m\r\n');
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      session.tempData = undefined;
      return;
    }

    // Initialize account editing session (express.e:21217-21222)
    session.tempData = {
      accountEditing: true,
      editingUser: user,
      editingSlot: user.id,
      page: 0,  // 0 = page 1, 1 = page 2
      changes: false,
      originalData: JSON.parse(JSON.stringify(user))  // Deep copy for change tracking
    };

    // Display first page
    displayAccountPage0(socket, user, user.id);

    // Set state to wait for edit commands
    session.subState = LoggedOnSubState.ACCOUNT_EDITOR_EDIT;
  }).catch((error: any) => {
console.error('Error fetching user:', error);
    socket.emit('ansi-output', '\r\n\x1b[31mError loading user data.\x1b[0m\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
  });
}

// handleViewUserStats() - View detailed user statistics
export function handleViewUserStats(socket: any, session: BBSSession, username: string) {
  db.getUserByUsername(username).then((user: any) => {
    if (!user) {
      socket.emit('ansi-output', '\r\n\x1b[31mUser not found.\x1b[0m\r\n');
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      session.tempData = undefined;
      return;
    }

    socket.emit('ansi-output', `\r\n\x1b[36m-= Statistics for ${user.username} =-\x1b[0m\r\n\r\n`);
    socket.emit('ansi-output', `\x1b[32mAccount Information:\x1b[0m\r\n`);
    socket.emit('ansi-output', `Real Name: ${user.realname}\r\n`);
    socket.emit('ansi-output', `Location: ${user.location}\r\n`);
    socket.emit('ansi-output', `Security Level: ${user.secLevel}\r\n`);
    socket.emit('ansi-output', `First Login: ${user.firstLogin.toLocaleDateString()}\r\n`);
    socket.emit('ansi-output', `Last Login: ${user.lastLogin?.toLocaleDateString() || 'Never'}\r\n\r\n`);

    socket.emit('ansi-output', `\x1b[32mActivity Statistics:\x1b[0m\r\n`);
    socket.emit('ansi-output', `Total Calls: ${user.calls}\r\n`);
    socket.emit('ansi-output', `Calls Today: ${user.callsToday}\r\n`);
    socket.emit('ansi-output', `Time Total: ${user.timeTotal} minutes\r\n`);
    socket.emit('ansi-output', `Time Used: ${user.timeUsed} minutes\r\n`);
    socket.emit('ansi-output', `Time Limit: ${user.timeLimit} minutes\r\n\r\n`);

    socket.emit('ansi-output', `\x1b[32mFile Statistics:\x1b[0m\r\n`);
    socket.emit('ansi-output', `Files Uploaded: ${user.uploads}\r\n`);
    socket.emit('ansi-output', `Bytes Uploaded: ${user.bytesUpload}\r\n`);
    socket.emit('ansi-output', `Files Downloaded: ${user.downloads}\r\n`);
    socket.emit('ansi-output', `Bytes Downloaded: ${user.bytesDownload}\r\n\r\n`);

    socket.emit('ansi-output', '\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
  }).catch((error: any) => {
console.error('Error fetching user stats:', error);
    socket.emit('ansi-output', '\r\n\x1b[31mError loading user statistics.\x1b[0m\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
  });
}

// ===== User Account Modification =====

// handleChangeSecLevel() - Change user security level
export function handleChangeSecLevel(socket: any, session: BBSSession, input: string) {
  const { db } = require('../database');
  const trimmed = input.trim();

  // Step 1: ask for username
  if (!session.tempData?.changeSecUser) {
    if (!trimmed) {
      socket.emit('ansi-output', '\r\n\x1b[31mUsername is required.\x1b[0m\r\n');
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      session.tempData = undefined;
      return;
    }

    db.getUserByUsername(trimmed).then((user: any) => {
      if (!user) {
        socket.emit('ansi-output', '\r\n\x1b[31mUser not found.\x1b[0m\r\n');
        socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
        session.menuPause = false;
        session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
        session.tempData = undefined;
        return;
      }
      socket.emit('ansi-output', `\r\nCurrent level for ${user.username}: ${user.secLevel}\r\n`);
      socket.emit('ansi-output', 'Enter new security level (0-255): ');
      session.tempData = { changeSecUser: user };
      session.subState = LoggedOnSubState.FILE_DIR_SELECT;
    }).catch((err: any) => {
console.error('Error loading user for sec level change:', err);
      socket.emit('ansi-output', '\r\n\x1b[31mError loading user.\x1b[0m\r\n');
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      session.tempData = undefined;
    });
    return;
  }

  // Step 2: apply new level
  const newLevel = parseInt(trimmed, 10);
  if (isNaN(newLevel) || newLevel < 0 || newLevel > 255) {
    socket.emit('ansi-output', '\r\n\x1b[31mInvalid security level.\x1b[0m\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
    return;
  }

  const user = session.tempData.changeSecUser;
  db.updateUser(user.id, { secLevel: newLevel }).then(() => {
    socket.emit('ansi-output', `\r\n\x1b[32mUpdated ${user.username} to level ${newLevel}.\x1b[0m\r\n`);
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
  }).catch((err: any) => {
console.error('Error updating security level:', err);
    socket.emit('ansi-output', '\r\n\x1b[31mError updating security level.\x1b[0m\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
  });
}

// handleToggleUserFlags() - Toggle user flags (expert, ansi, etc.)
export function handleToggleUserFlags(socket: any, session: BBSSession, input: string) {
  const { db } = require('../database');
  const trimmed = input.trim();

  if (!session.tempData?.toggleFlagsUser) {
    if (!trimmed) {
      socket.emit('ansi-output', '\r\n\x1b[31mUsername is required.\x1b[0m\r\n');
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      session.tempData = undefined;
      return;
    }

    db.getUserByUsername(trimmed).then((user: any) => {
      if (!user) {
        socket.emit('ansi-output', '\r\n\x1b[31mUser not found.\x1b[0m\r\n');
        socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
        session.menuPause = false;
        session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
        session.tempData = undefined;
        return;
      }

      socket.emit('ansi-output', `\r\nUser: ${user.username}\r\n`);
      socket.emit('ansi-output', `Expert mode (Y/N) [${user.expert === 'X' ? 'Y' : 'N'}]: `);
      session.tempData = { toggleFlagsUser: user, awaitingAnsi: false };
      session.subState = LoggedOnSubState.FILE_DIR_SELECT;
    }).catch((err: any) => {
console.error('Error loading user for flag toggle:', err);
      socket.emit('ansi-output', '\r\n\x1b[31mError loading user.\x1b[0m\r\n');
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      session.tempData = undefined;
    });
    return;
  }

  // If expert not set yet, interpret as expert input then ask ANSI
  const user = session.tempData.toggleFlagsUser;
  if (session.tempData.awaitingAnsi === false) {
    const val = trimmed.toUpperCase();
    if (val !== 'Y' && val !== 'N' && val !== '') {
      socket.emit('ansi-output', '\r\n\x1b[31mEnter Y or N.\x1b[0m\r\n');
      socket.emit('ansi-output', 'Expert mode (Y/N): ');
      return;
    }
    if (val) {
      user.expert = val === 'Y' ? 'X' : 'N';
    }
    socket.emit('ansi-output', `ANSI (Y/N) [${user.ansi ? 'Y' : 'N'}]: `);
    session.tempData.awaitingAnsi = true;
    session.subState = LoggedOnSubState.FILE_DIR_SELECT;
    return;
  }

  const val = trimmed.toUpperCase();
  if (val && val !== 'Y' && val !== 'N') {
    socket.emit('ansi-output', '\r\n\x1b[31mEnter Y or N.\x1b[0m\r\n');
    socket.emit('ansi-output', 'ANSI (Y/N): ');
    return;
  }
  if (val) {
    user.ansi = val === 'Y';
  }

  db.updateUser(user.id, { expert: user.expert, ansi: user.ansi }).then(() => {
    socket.emit('ansi-output', '\r\n\x1b[32mUser flags updated.\x1b[0m\r\n');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
  }).catch((err: any) => {
console.error('Error updating user flags:', err);
    socket.emit('ansi-output', '\r\n\x1b[31mError updating user flags.\x1b[0m\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
  });
}

// handleDeleteUserAccount() - Delete user account
export async function handleDeleteUserAccount(socket: any, session: BBSSession, input: string) {
  const { db } = require('../database');

  if (!session.user) {
    socket.emit('ansi-output', '\r\n\x1b[31mError: No user logged in\x1b[0m\r\n');
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  // If this is first call, ask for confirmation
  if (!session.tempData?.deleteUserConfirmed) {
    socket.emit('ansi-output', '\r\n\x1b[33;1m WARNING: Account Deletion \x1b[0m\r\n\r\n');
    socket.emit('ansi-output', 'Are you sure you want to delete your account?\r\n');
    socket.emit('ansi-output', 'This action CANNOT be undone!\r\n\r\n');
    socket.emit('ansi-output', 'All your messages, uploads, and account data will be permanently removed.\r\n\r\n');
    socket.emit('ansi-output', '\x1b[36mType YES (in capitals) to confirm deletion, or press any other key to cancel:\x1b[0m ');

    session.tempData = { deleteUserConfirmed: false, awaitingConfirmation: true };
    session.subState = LoggedOnSubState.DELETE_ACCOUNT_CONFIRM;
    return;
  }

  // Check confirmation
  if (input.trim() === 'YES') {
    socket.emit('ansi-output', '\r\n\r\n\x1b[31mDeleting your account...\x1b[0m\r\n');

    try {
      // Delete user from database
      await db.deleteUser(session.user.id);

      socket.emit('ansi-output', '\x1b[32mYour account has been successfully deleted.\x1b[0m\r\n');
      socket.emit('ansi-output', 'Thank you for using the BBS. Goodbye!\r\n\r\n');

      // Log them out
      session.state = BBSState.AWAIT;
      session.subState = LoggedOnSubState.DISPLAY_CONNECT;
      session.user = undefined;
      session.tempData = undefined;

      setTimeout(() => {
        socket.disconnect();
      }, 2000);
    } catch (error: any) {
console.error('[DeleteAccount] Error deleting user:', error);
      socket.emit('ansi-output', `\r\n\x1b[31mError deleting account: ${error.message}\x1b[0m\r\n`);
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      session.tempData = undefined;
    }
  } else {
    socket.emit('ansi-output', '\r\n\r\n\x1b[32mAccount deletion cancelled.\x1b[0m\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
  }
}

// handleSearchUsers() - Search users by various criteria
export function handleSearchUsers(socket: any, session: BBSSession, searchTerm: string) {
  const { db } = require('../database');
  const term = searchTerm.trim();
  if (!term) {
    socket.emit('ansi-output', '\r\n\x1b[31mSearch term is required.\x1b[0m\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
    return;
  }

  socket.emit('ansi-output', `\r\n\x1b[36m-= Searching for "${term}" =-\x1b[0m\r\n\r\n`);

  db.getUsers({ limit: 50, search: term }).then((users: any[]) => {
    if (!users || users.length === 0) {
      socket.emit('ansi-output', 'No matching users found.\r\n');
    } else {
      users.forEach((user: any) => {
        socket.emit('ansi-output', `${user.username.padEnd(16)} ${user.realname?.padEnd(20) || ''.padEnd(20)} ${user.location?.padEnd(15) || ''.padEnd(15)} lvl:${String(user.secLevel).padStart(3)}\r\n`);
      });
    }
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
  }).catch((err: any) => {
console.error('Error searching users:', err);
    socket.emit('ansi-output', '\r\n\x1b[31mError searching users.\x1b[0m\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
  });
}
