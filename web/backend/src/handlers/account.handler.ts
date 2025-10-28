/**
 * Account Management Handler
 * Handles user account editing, viewing, and management operations
 * 1:1 port from AmiExpress express.e account management
 */

import { BBSSession, LoggedOnSubState } from '../index';

// Dependencies (injected)
let db: any;

// Dependency injection setters
export function setDatabase(database: any) {
  db = database;
}

// ===== Account Editing Menu =====

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

// handleEditUserAccount() - Edit user account details
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

    socket.emit('ansi-output', `\r\n\x1b[36m-= Editing User: ${user.username} =-\x1b[0m\r\n`);
    socket.emit('ansi-output', `Real Name: ${user.realname || 'Not set'}\r\n`);
    socket.emit('ansi-output', `Location: ${user.location || 'Not set'}\r\n`);
    socket.emit('ansi-output', `Phone: ${user.phone || 'Not set'}\r\n`);
    socket.emit('ansi-output', `Security Level: ${user.secLevel}\r\n`);
    socket.emit('ansi-output', `Expert Mode: ${user.expert ? 'Yes' : 'No'}\r\n`);
    socket.emit('ansi-output', `ANSI: ${user.ansi ? 'Yes' : 'No'}\r\n\r\n`);

    socket.emit('ansi-output', '\x1b[32mAccount editing interface not fully implemented yet.\x1b[0m\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
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
  // This would need multi-step input: username, then new level
  socket.emit('ansi-output', '\r\n\x1b[32mSecurity level editing not fully implemented yet.\x1b[0m\r\n');
  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
  session.tempData = undefined;
}

// handleToggleUserFlags() - Toggle user flags (expert, ansi, etc.)
export function handleToggleUserFlags(socket: any, session: BBSSession, input: string) {
  socket.emit('ansi-output', '\r\n\x1b[32mUser flag editing not fully implemented yet.\x1b[0m\r\n');
  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
  session.tempData = undefined;
}

// handleDeleteUserAccount() - Delete user account
export function handleDeleteUserAccount(socket: any, session: BBSSession, input: string) {
  socket.emit('ansi-output', '\r\n\x1b[32mUser account deletion not implemented yet.\x1b[0m\r\n');
  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
  session.tempData = undefined;
}

// handleSearchUsers() - Search users by various criteria
export function handleSearchUsers(socket: any, session: BBSSession, searchTerm: string) {
  socket.emit('ansi-output', `\r\n\x1b[36m-= Searching for "${searchTerm}" =-\x1b[0m\r\n`);
  socket.emit('ansi-output', 'Searching...\r\n\r\n');

  // For now, just show a message that search is not fully implemented
  socket.emit('ansi-output', '\x1b[32mUser search not fully implemented yet.\x1b[0m\r\n');
  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
  session.tempData = undefined;
}
