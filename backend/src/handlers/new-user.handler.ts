/**
 * New User Registration Handler
 *
 * 1:1 port from express.e:30003+ (newUserAccount, doNewUser)
 *
 * Implements the authentic AmiExpress new user account creation flow:
 * - Name entry with duplicate checking
 * - Location, phone, email
 * - Password with confirmation and strength checking
 * - Lines per screen, computer type, preferences
 * - Backward navigation with blank lines
 * - Summary and confirmation
 */

import { Socket } from 'socket.io';
import { LoggedOnSubState, BBSState } from '../constants/bbs-states';

// Dependencies (injected from index.ts)
let db: any;
let sessions: Map<string, any>;

export function setNewUserDependencies(deps: { db: any; sessions: Map<string, any> }) {
  db = deps.db;
  sessions = deps.sessions;
}

/**
 * Start new user registration flow
 * express.e:30003-30050 (newUserAccount)
 */
export async function startNewUserRegistration(socket: Socket, session: any, username: string) {
  console.log('📝 [NEW USER] Starting registration for:', username);

  // express.e:30003 - Check SCREEN_NONEWUSERS (if exists, block new users)
  // For now, skip this check - can be added later

  // express.e:30005 - Check SCREEN_NONEWATBAUD (if exists, block at certain baud rates)
  // Skip for web version

  // express.e:30008-30042 - New User Password check
  // Skip for now - can be added as configuration option

  // express.e:30045 - Display SCREEN_GUESTLOGON
  // Skip for web version

  // express.e:30047 - Create new account structure
  // Initialize registration data
  session.newUserData = {
    username: username === 'NEW' ? '' : username,
    location: '',
    phone: '',
    email: '',
    password: '',
    linesPerScreen: 0, // 0 = auto
    computerType: 0,
    screenClear: true,
    retryCount: 0
  };

  // express.e:30051-30053 - Display SCREEN_JOIN
  socket.emit('ansi-output', '\r\n\x1b[36m-= New User Account Creation =-\x1b[0m\r\n\r\n');
  socket.emit('ansi-output', 'Blank line to retreat to previous question.\r\n\r\n');

  // Start with name entry if username is 'NEW', otherwise skip to location
  if (username.toUpperCase() === 'NEW') {
    session.subState = LoggedOnSubState.NEW_USER_NAME;
    promptForName(socket, session);
  } else {
    session.subState = LoggedOnSubState.NEW_USER_LOCATION;
    promptForLocation(socket, session);
  }
}

/**
 * Prompt for name - express.e:30115-30168 (jLoop1)
 */
function promptForName(socket: Socket, session: any) {
  socket.emit('ansi-output', `\r\nHandle: `);
}

/**
 * Handle name input - express.e:30115-30168
 */
export async function handleNameInput(socket: Socket, session: any, input: string) {
  const name = input.trim();

  // express.e:30138-30145 - Blank line counts as error
  if (name === '') {
    session.newUserData.retryCount++;
    console.log(`[NEW USER] Retry count: ${session.newUserData.retryCount}/5 (empty name)`);

    // express.e:30142-30145 - Too many errors, disconnect
    if (session.newUserData.retryCount > 5) {
      console.log('[NEW USER] Too many errors, disconnecting');
      socket.emit('ansi-output', '\r\n\x1b[31mToo Many Errors, Goodbye!\x1b[0m\r\n');
      setTimeout(() => socket.disconnect(), 500);
      return;
    }
    socket.emit('ansi-output', '\r\n');
    promptForName(socket, session);
    return;
  }

  // express.e:30126-30129 - Check for single character
  if (name.length === 1) {
    socket.emit('ansi-output', '\r\n\x1b[31mGet REAL!!  One Character???\x1b[0m\r\n');
    promptForName(socket, session);
    return;
  }

  // express.e:30135-30144 - Check for duplicate name
  socket.emit('ansi-output', '\r\nChecking for duplicate name...');

  const existingUser = await db.getUserByUsername(name);
  if (existingUser) {
    socket.emit('ansi-output', '\x1b[31mAlready in use!, try another.\x1b[0m\r\n');
    promptForName(socket, session);
    return;
  }

  socket.emit('ansi-output', '\x1b[32mOk!\x1b[0m\r\n\r\n');

  // Save name and move to next question
  session.newUserData.username = name;
  session.subState = LoggedOnSubState.NEW_USER_LOCATION;
  promptForLocation(socket, session);
}

/**
 * Prompt for location - express.e:30172
 */
function promptForLocation(socket: Socket, session: any) {
  socket.emit('ansi-output', 'City, State: ');
}

/**
 * Handle location input - express.e:30172-30179
 */
export async function handleLocationInput(socket: Socket, session: any, input: string) {
  const location = input.trim();

  // Blank line - go back to name
  if (location === '') {
    socket.emit('ansi-output', '\r\n');
    session.subState = LoggedOnSubState.NEW_USER_NAME;
    promptForName(socket, session);
    return;
  }

  session.newUserData.location = location;
  session.subState = LoggedOnSubState.NEW_USER_PHONE;
  promptForPhone(socket, session);
}

/**
 * Prompt for phone - express.e:30181
 */
function promptForPhone(socket: Socket, session: any) {
  socket.emit('ansi-output', 'Phone Number: ');
}

/**
 * Handle phone input - express.e:30181-30189
 */
export async function handlePhoneInput(socket: Socket, session: any, input: string) {
  const phone = input.trim();

  // Blank line - go back to location
  if (phone === '') {
    socket.emit('ansi-output', '\r\n');
    session.subState = LoggedOnSubState.NEW_USER_LOCATION;
    promptForLocation(socket, session);
    return;
  }

  session.newUserData.phone = phone;
  session.subState = LoggedOnSubState.NEW_USER_EMAIL;
  promptForEmail(socket, session);
}

/**
 * Prompt for email - express.e:30191
 */
function promptForEmail(socket: Socket, session: any) {
  socket.emit('ansi-output', 'E-Mail Address: ');
}

/**
 * Handle email input - express.e:30191-30199
 */
export async function handleEmailInput(socket: Socket, session: any, input: string) {
  const email = input.trim();

  // Blank line - go back to phone
  if (email === '') {
    socket.emit('ansi-output', '\r\n');
    session.subState = LoggedOnSubState.NEW_USER_PHONE;
    promptForPhone(socket, session);
    return;
  }

  // Validate email format
  // Must contain @ with local part and domain with TLD
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    socket.emit('ansi-output', '\r\n\x1b[31mInvalid email format. Please include @ and domain (e.g., user@example.com)\x1b[0m\r\n\r\n');
    promptForEmail(socket, session);
    return;
  }

  session.newUserData.email = email;
  session.subState = LoggedOnSubState.NEW_USER_PASSWORD;
  promptForPassword(socket, session);
}

/**
 * Prompt for password - express.e:30203
 */
function promptForPassword(socket: Socket, session: any) {
  socket.emit('password-mode', true); // Enable password masking on frontend
  socket.emit('ansi-output', 'Enter a PassWord: ');
}

/**
 * Handle password input - express.e:30203-30234
 */
export async function handlePasswordInput(socket: Socket, session: any, input: string) {
  const password = input.trim();

  // Blank line - go back to email
  if (password === '') {
    socket.emit('ansi-output', '\r\n');
    session.subState = LoggedOnSubState.NEW_USER_EMAIL;
    promptForEmail(socket, session);
    return;
  }

  // Save password and prompt for confirmation
  session.newUserData.password = password;
  session.subState = LoggedOnSubState.NEW_USER_PASSWORD_CONFIRM;
  socket.emit('password-mode', true); // Enable password masking on frontend
  socket.emit('ansi-output', 'Reenter the PassWord: ');
}

/**
 * Handle password confirmation - express.e:30207-30234
 */
export async function handlePasswordConfirm(socket: Socket, session: any, input: string) {
  const confirmation = input.trim();

  // Check if passwords match
  if (confirmation !== session.newUserData.password) {
    socket.emit('ansi-output', '\r\n\x1b[31mPasswords do not match, try again..\x1b[0m\r\n\r\n');
    session.subState = LoggedOnSubState.NEW_USER_PASSWORD;
    promptForPassword(socket, session);
    return;
  }

  // Password confirmed, move to lines per screen
  socket.emit('password-mode', false); // Disable password masking
  socket.emit('ansi-output', '\r\n');
  session.subState = LoggedOnSubState.NEW_USER_LINES;
  promptForLines(socket, session);
}

/**
 * Prompt for lines per screen - express.e:30236-30237
 */
function promptForLines(socket: Socket, session: any) {
  socket.emit('ansi-output', 'Number of Lines per screen (0=Auto): ');
}

/**
 * Handle lines input - express.e:30236-30237
 */
export async function handleLinesInput(socket: Socket, session: any, input: string) {
  const lines = parseInt(input.trim()) || 0;

  session.newUserData.linesPerScreen = lines;
  session.subState = LoggedOnSubState.NEW_USER_COMPUTER;
  promptForComputer(socket, session);
}

/**
 * Prompt for computer type - express.e:30238-30239
 */
function promptForComputer(socket: Socket, session: any) {
  socket.emit('ansi-output', 'Computer Type (e.g., Amiga, PC, Mac): ');
}

/**
 * Handle computer input - express.e:30238-30239
 */
export async function handleComputerInput(socket: Socket, session: any, input: string) {
  const computer = input.trim();

  // Default to Amiga if empty (express.e:30238)
  session.newUserData.computerType = computer || 'Amiga';
  session.subState = LoggedOnSubState.NEW_USER_SCREEN_CLEAR;
  promptForScreenClear(socket, session);
}

/**
 * Prompt for screen clear preference - express.e:30250-30260
 */
function promptForScreenClear(socket: Socket, session: any) {
  socket.emit('ansi-output', '\r\nYou want Screen Clears after Messages? (Y/n) ');
}

/**
 * Handle screen clear input - express.e:30250-30260
 */
export async function handleScreenClearInput(socket: Socket, session: any, input: string) {
  const response = input.trim().toUpperCase();

  // Empty input or Y/YES = Yes (default is Yes)
  session.newUserData.screenClear = response === '' || response === 'Y' || response === 'YES';

  if (session.newUserData.screenClear) {
    socket.emit('ansi-output', 'Yes..\r\n\r\n');
  } else {
    socket.emit('ansi-output', 'No!\r\n\r\n');
  }

  // Show summary and ask for confirmation
  session.subState = LoggedOnSubState.NEW_USER_CONFIRM;
  showSummaryAndConfirm(socket, session);
}

/**
 * Show summary and ask for confirmation - express.e:30264-30281
 */
function showSummaryAndConfirm(socket: Socket, session: any) {
  const data = session.newUserData;

  socket.emit('ansi-output', `Handle: ${data.username}\r\n`);
  socket.emit('ansi-output', `City, St.: ${data.location}\r\n`);
  socket.emit('ansi-output', `Phone Num: ${data.phone}\r\n`);
  socket.emit('ansi-output', `E-Mail   : ${data.email}\r\n`);
  socket.emit('ansi-output', `Num Lines: ${data.linesPerScreen === 0 ? 'Auto' : data.linesPerScreen}\r\n`);
  socket.emit('ansi-output', `PassWord : ENCRYPTED\r\n`);
  socket.emit('ansi-output', `Computer : ${data.computerType}\r\n`);
  socket.emit('ansi-output', `Scr Clear: ${data.screenClear ? 'Yes' : 'No'}\r\n\r\n`);
  socket.emit('ansi-output', 'Is this Information Correct? (Y/n) ');
}

/**
 * Handle confirmation - create account or go back
 */
export async function handleConfirmInput(socket: Socket, session: any, input: string) {
  const response = input.trim().toUpperCase();

  if (response === 'N' || response === 'NO') {
    // Go back to name entry
    socket.emit('ansi-output', '\r\n\x1b[33mStarting over...\x1b[0m\r\n\r\n');
    session.subState = LoggedOnSubState.NEW_USER_NAME;
    promptForName(socket, session);
    return;
  }

  // Create the account
  await createAccount(socket, session);
}

/**
 * Create the user account in database
 */
async function createAccount(socket: Socket, session: any) {
  const data = session.newUserData;

  try {
    socket.emit('ansi-output', '\r\n\x1b[32mCreating your account...\x1b[0m\r\n');

    // Hash password with bcrypt
    const bcrypt = await import('bcrypt');
    const passwordHash = await bcrypt.hash(data.password, 10);

    // Create user in database
    const newUserId = await db.createUser({
      username: data.username,
      passwordHash: passwordHash,
      realname: data.username, // Can be changed later
      location: data.location,
      phone: data.phone,
      email: data.email,
      secLevel: 10, // Default new user level
      linesPerScreen: data.linesPerScreen,
      computer: data.computerType,
      ansi: true,
      expert: false,
      screenClear: data.screenClear,
      availableForChat: true, // Enable chat by default
      quietNode: false, // Show chat notifications
      autoRejoin: 1, // Auto-rejoin conference on login
      confAccess: 'XXX', // Access to all 3 default conferences
      newUser: true // Mark as new user
    });

    if (!newUserId) {
      socket.emit('ansi-output', '\r\n\x1b[31mError creating account. Please try again.\x1b[0m\r\n');
      session.state = BBSState.AWAIT;
      return;
    }

    // Fetch the full user object
    const newUser = await db.getUserByUsername(data.username);
    if (!newUser) {
      socket.emit('ansi-output', '\r\n\x1b[31mError fetching account. Please try again.\x1b[0m\r\n');
      session.state = BBSState.AWAIT;
      return;
    }

    socket.emit('ansi-output', '\x1b[32mAccount created successfully!\x1b[0m\r\n\r\n');

    // Log them in automatically
    session.state = BBSState.LOGGEDON;
    session.subState = LoggedOnSubState.DISPLAY_BULL;
    session.user = newUser;

    // Initialize security
    const { initializeSecurity } = require('../index');
    if (initializeSecurity) {
      initializeSecurity(session);
    }

    // Set user preferences
    session.confRJoin = 1; // Default to General conference
    session.msgBaseRJoin = 1;
    session.cmdShortcuts = false;

    // Clean up registration data
    delete session.newUserData;

    // Send success to frontend
    socket.emit('login-success', {
      user: {
        id: newUser.id,
        username: newUser.username,
        realname: newUser.realname,
        secLevel: newUser.secLevel,
        expert: newUser.expert,
        ansi: newUser.ansi
      }
    });

    // Show welcome screen and bulletins
    socket.emit('ansi-output', '\r\n\x1b[36mWelcome to the BBS!\x1b[0m\r\n\r\n');
    socket.emit('ansi-output', '\x1b[32mPress any key to continue...\x1b[0m\r\n');
  } catch (error) {
    console.error('❌ [NEW USER] Account creation error:', error);
    socket.emit('ansi-output', '\r\n\x1b[31mError creating account. Please try again.\x1b[0m\r\n');
    session.state = BBSState.AWAIT;
  }
}
