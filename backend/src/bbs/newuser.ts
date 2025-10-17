/**
 * New User Registration Module
 * 1:1 port from AmiExpress express.e lines 30003-30400
 */

import { Socket } from 'socket.io';
import { BBSSession } from './session';
import { db } from '../database';
import bcrypt from 'bcrypt';
import { displayScreen, doPause } from './screens';

/**
 * Password strength checking (express.e checkPasswordStrength)
 */
function checkPasswordStrength(password: string): { valid: boolean; reason?: number } {
  // MIN_PASSWORD_LENGTH check
  const minLength = 6; // Default minimum
  if (password.length < minLength) {
    return { valid: false, reason: 1 }; // Length too short
  }

  // MIN_PASSWORD_STRENGTH check (must have mix of upper, lower, numbers, symbols)
  let strength = 0;
  if (/[A-Z]/.test(password)) strength++; // Has uppercase
  if (/[a-z]/.test(password)) strength++; // Has lowercase
  if (/[0-9]/.test(password)) strength++; // Has numbers
  if (/[^A-Za-z0-9]/.test(password)) strength++; // Has symbols

  const minStrength = 2; // Minimum categories required
  if (strength < minStrength) {
    return { valid: false, reason: 2 }; // Not strong enough
  }

  return { valid: true };
}

/**
 * Collect username with duplicate checking (express.e doNewUser lines 30133-30189)
 */
async function collectUsername(socket: Socket, session: BBSSession, initialName: string): Promise<string | null> {
  const namePrompt = 'Enter your handle';
  let retryCount = 0;
  let ch = 0;

  while (retryCount < 5) {
    socket.emit('ansi-output', `\r\n${namePrompt}: `);

    // Wait for user input (this will be handled by the input handler)
    // For now, we'll use the initial name if provided
    let userName = initialName || '';

    if (userName.length === 0) {
      ch++;
      if (ch > 5) {
        socket.emit('ansi-output', '\r\n\x1b[31mToo Many Errors, Goodbye!\x1b[0m\r\n');
        return null;
      }
      retryCount++;
      continue;
    }

    if (userName.length === 1) {
      socket.emit('ansi-output', '\r\n\x1b[31mGet REAL!!  One Character???\x1b[0m\r\n');
      retryCount++;
      continue;
    }

    // Check for wildcards
    if (/[\*\?]/.test(userName)) {
      socket.emit('ansi-output', '\r\n\x1b[31mNo wildcards allowed in a name.\x1b[0m\r\n');
      retryCount++;
      continue;
    }

    // Check for duplicate name in database
    socket.emit('ansi-output', '\r\nChecking for duplicate name...');
    const existingUser = await db.getUserByUsername(userName);

    if (existingUser) {
      socket.emit('ansi-output', '\x1b[31mAlready in use!, try another.\x1b[0m\r\n');
      retryCount++;
      continue;
    }

    socket.emit('ansi-output', '\x1b[32mOk!\x1b[0m\r\n\r\n');
    return userName;
  }

  socket.emit('ansi-output', '\r\n\x1b[31mToo Many Errors, Goodbye!\x1b[0m\r\n');
  return null;
}

/**
 * Main new user account creation (express.e newUserAccount lines 30003-30126)
 */
export async function newUserAccount(socket: Socket, session: BBSSession, userName: string): Promise<boolean> {
  // Check if new users are allowed (SCREEN_NONEWUSERS)
  if (displayScreen(socket, session, 'NONEWUSERS')) {
    return false;
  }

  // Check if new users are allowed at this baud (SCREEN_NONEWATBAUD)
  if (displayScreen(socket, session, 'NONEWATBAUD')) {
    return false;
  }

  // Check for new user password if configured (express.e lines 30013-30047)
  const newUserPassword = process.env.NEW_USER_PASSWORD || '';
  if (newUserPassword.length > 0) {
    displayScreen(socket, session, 'NEWUSERPW');

    let tries = 0;
    let passwordCorrect = false;

    while (tries < 3 && !passwordCorrect) {
      socket.emit('ansi-output', '\r\nEnter New User Password: ');

      // This will be handled by the input state machine
      // For now, return false to indicate we need password input
      session.subState = 'NEWUSER_PASSWORD' as any;
      session.tempData = { tries, userName };
      return false; // Will continue after password input
    }

    if (!passwordCorrect) {
      socket.emit('ansi-output', '\r\n\x1b[31mExcessive Password Failure\x1b[0m\r\n');
      return false;
    }

    socket.emit('ansi-output', '\x1b[32mCorrect\x1b[0m\r\n');
  }

  // Display guest logon screen (express.e line 30049)
  if (displayScreen(socket, session, 'GUESTLOGON')) {
    doPause(socket, session);
  }

  // Start user info collection
  return await doNewUser(socket, session, userName);
}

/**
 * Collect all user information (express.e doNewUser lines 30128-30321)
 */
async function doNewUser(socket: Socket, session: BBSSession, initialName: string): Promise<boolean> {
  socket.emit('ansi-output', '\r\n\x1b[36mNew User Registration\x1b[0m\r\n');
  socket.emit('ansi-output', '\r\nBlank line to retreat\r\n');

  // Display JOIN screen
  if (displayScreen(socket, session, 'JOIN')) {
    doPause(socket, session);
  }

  // Step 1: Collect username
  const userName = await collectUsername(socket, session, initialName);
  if (!userName) {
    return false;
  }

  // Initialize new user data structure
  const newUserData: any = {
    username: userName,
    location: '',
    phoneNumber: '',
    email: '',
    password: '',
    lineLength: 0,
    computer: 'Unknown',
    screenClear: false
  };

  // Step 2: Collect City, State (express.e lines 30193-30201)
  socket.emit('ansi-output', 'City, State: ');
  session.subState = 'NEWUSER_LOCATION' as any;
  session.tempData = { newUserData, step: 'location' };
  return false; // Will continue with input state machine

  // Steps 3-7 will be handled by the state machine:
  // 3. Phone Number
  // 4. E-Mail Address
  // 5. Password (with confirmation)
  // 6. Number of Lines
  // 7. Computer Type
  // 8. Screen Clear preference
  // 9. Confirmation

  // This function will be called again from the state machine to complete registration
}

/**
 * Complete new user registration and save to database
 */
export async function completeNewUserRegistration(socket: Socket, session: BBSSession, userData: any): Promise<boolean> {
  try {
    // Hash the password with bcrypt
    const passwordHash = await bcrypt.hash(userData.password, 10);

    // Create the new user in the database
    const userId = await db.createUser({
      username: userData.username,
      passwordHash: passwordHash,
      realName: userData.username, // Can be updated later
      location: userData.location,
      phoneNumber: userData.phoneNumber,
      email: userData.email,
      securityLevel: 10, // Default new user security level
      timeLimit: 60, // Default 60 minutes per day
      expert: 'N', // Start with full menus
      calls: 1, // First call
      uploads: 0,
      downloads: 0,
      messages: 0,
      bytesUpload: 0,
      bytesDownload: 0,
      lastLogin: new Date(),
      accountDate: new Date()
    });

    // Load the newly created user into session
    const user = await db.getUserById(userId);
    if (user) {
      session.user = user;
      session.state = 'loggedon' as any;

      // Display JOINED screen
      if (displayScreen(socket, session, 'JOINED')) {
        doPause(socket, session);
      }

      socket.emit('ansi-output', '\r\n\x1b[32mAccount created successfully! Welcome to AmiExpress!\x1b[0m\r\n\r\n');
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error creating new user:', error);
    socket.emit('ansi-output', '\r\n\x1b[31mError creating account. Please try again later.\x1b[0m\r\n');
    return false;
  }
}

/**
 * Helper to check if username is allowed (express.e checkIfNameAllowed)
 */
function checkIfNameAllowed(name: string): boolean {
  // Reserved names that shouldn't be allowed
  const reserved = ['SYSOP', 'ADMIN', 'GUEST', 'NEW', 'ALL', 'EVERYONE'];

  if (reserved.includes(name.toUpperCase())) {
    return false; // Not allowed
  }

  return true; // Allowed
}
