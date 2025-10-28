/**
 * Authentication Handlers Module
 *
 * This module contains all authentication-related socket event handlers for the BBS system.
 * It handles user login, token-based authentication, new user registration, and new user prompts.
 *
 * Event Handlers:
 * - 'login': Handles username/password authentication
 * - 'login-with-token': Handles JWT token-based auto-login
 * - 'register': Handles new user account creation
 * - 'new-user-response': Handles response to "new user?" prompt
 *
 * Security Features:
 * - Rate limiting for login and registration attempts
 * - Password hashing with bcrypt
 * - JWT token generation for persistent sessions
 * - Legacy SHA-256 password migration to bcrypt
 *
 * @module handlers/authHandlers
 */

import { Socket, Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { BBSSession, BBSState, LoggedOnSubState } from '../bbs/session';
import { loginRateLimiter, registerRateLimiter } from '../server/rateLimiter';
import { RedisSessionStore } from '../server/sessionStore';
import { conferences, messageBases } from '../server/dataStore';
import { db } from '../database';
import { newUserAccount, completeNewUserRegistration } from '../bbs/newuser';
import { displayScreen, loadScreen, doPause } from '../bbs/screens';
import { joinConference } from './conferenceHandlers';
import { assignNodeToSession } from '../chatHandlers';

// JWT Secret (should be in environment variables)
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

/**
 * Setup authentication event handlers for a socket connection
 *
 * @param socket - The socket.io socket instance
 * @param io - The socket.io server instance
 * @param sessions - Redis session store for managing BBS sessions
 */
export function setupAuthHandlers(socket: Socket, io: Server, sessions: RedisSessionStore) {

  /**
   * Handle username/password login
   *
   * This handler:
   * 1. Validates credentials against the database
   * 2. Implements rate limiting to prevent brute force attacks
   * 3. Offers new user registration if username doesn't exist
   * 4. Migrates legacy SHA-256 passwords to bcrypt transparently
   * 5. Assigns a node to the user (multinode system)
   * 6. Generates JWT token for persistent sessions
   * 7. Displays LOGON screen and checks for unread messages
   *
   * Based on express.e lines 29607-29622
   */
  socket.on('login', async (data: { username: string; password: string }) => {
    console.log('Login attempt:', data.username);

    try {
      const session = await sessions.get(socket.id);
      if (!session) {
        socket.emit('login-failed', 'Session expired');
        return;
      }

      // Rate limiting check (using IP address + username as identifier)
      const rateLimitKey = `${socket.handshake.address}:${data.username}`;
      if (!loginRateLimiter.check(rateLimitKey)) {
        console.log('Rate limit exceeded for:', rateLimitKey);
        socket.emit('login-failed', 'Too many login attempts. Please try again in 15 minutes.');
        return;
      }

      // Validate input
      if (!data.username || !data.password) {
        socket.emit('login-failed', 'Username and password are required');
        return;
      }

      console.log('Step 1: Validating input - OK');

      // Authenticate user against database
      console.log('Step 2: Getting user from database...');
      const user = await db.getUserByUsername(data.username);
      console.log('Step 2 result:', user ? 'User found' : 'User not found');
      if (!user) {
        console.log('User not found:', data.username);

        // Offer new user registration (express.e lines 29607-29622)
        if (data.username.toUpperCase() === 'NEW') {
          socket.emit('ansi-output', '\r\n\x1b[36m[C]ontinue as a new user?\x1b[0m ');
        } else {
          socket.emit('ansi-output', `\r\n\x1b[36mThe name ${data.username} is not used on this BBS.\x1b[0m\r\n`);
          socket.emit('ansi-output', '\x1b[36m[R]etry your name or [C]ontinue as a new user?\x1b[0m ');
        }

        socket.emit('new-user-prompt', { username: data.username });
        return;
      }

      console.log('Step 3: Verifying password...');
      // Verify password
      const isValidPassword = await db.verifyPassword(data.password, user.passwordHash);
      console.log('Step 3 result: Password valid =', isValidPassword);
      if (!isValidPassword) {
        console.log('Invalid password for user:', data.username);
        socket.emit('login-failed', 'Invalid password');
        return;
      }

      // Transparent password migration: upgrade legacy SHA-256 hashes to bcrypt
      if (user.passwordHash.length === 64) { // SHA-256 hashes are always 64 hex characters
        console.log('Step 3a: Migrating legacy password to bcrypt...');
        const newHash = await db.hashPassword(data.password);
        await db.updateUser(user.id, { passwordHash: newHash });
        console.log('Step 3a: Password upgraded to bcrypt successfully');
      }

      console.log('Step 4: Updating user login info...');
      // Update last login
      await db.updateUser(user.id, { lastLogin: new Date(), calls: user.calls + 1, callsToday: user.callsToday + 1 });
      console.log('Step 4: User updated successfully');

      // Set session user data
      console.log('Step 5: Setting session data...');
      session.state = BBSState.LOGGEDON;
      session.subState = LoggedOnSubState.DISPLAY_BULL;
      session.user = user;

      // Set user preferences
      session.confRJoin = user.autoRejoin || 1;
      session.msgBaseRJoin = 1; // Default message base
      session.cmdShortcuts = !user.expert; // Expert mode uses shortcuts

      // Reset rate limiter on successful login
      loginRateLimiter.reset(rateLimitKey);

      console.log('Login successful for user:', data.username);

      // Assign node to user (multinode system)
      console.log('Step 6: Assigning node to user...');
      const nodeId = await assignNodeToSession(
        session,
        user.id,
        user.username,
        user.location || ''
      );

      if (nodeId) {
        console.log(`Step 6: Assigned node ${nodeId} to ${user.username}`);
      } else {
        console.error(`Step 6: No available nodes for ${user.username}`);
        socket.emit('login-failed', 'System is full - no available nodes. Please try again later.');
        return;
      }

      // Generate JWT token for persistent login
      const token = jwt.sign(
        {
          userId: user.id,
          username: user.username,
          securityLevel: user.secLevel || 0
        },
        JWT_SECRET,
        { expiresIn: '7d' } // Token valid for 7 days
      );

      socket.emit('login-success', {
        token,
        user: {
          id: user.id,
          username: user.username,
          realname: user.realname,
          securityLevel: user.secLevel || 0
        }
      });

      // Display LOGON screen and pause before bulletins
      const logonScreen = loadScreen('LOGON', session);
      if (logonScreen) {
        socket.emit('ansi-output', logonScreen);
      }

      // Check for unread OLM messages
      try {
        const unreadCount = await db.getUnreadMessageCount(user.id);
        if (unreadCount > 0) {
          socket.emit('ansi-output', `\r\n\x1b[33m*** You have ${unreadCount} unread message(s)! Type OLM READ to view. ***\x1b[0m\r\n`);
        }
      } catch (error) {
        console.error('Error checking OLM messages:', error);
      }

      // Pause after LOGON screen, then show bulletins
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.subState = LoggedOnSubState.DISPLAY_BULL; // Wait for key before bulletins

      // Save session
      await sessions.set(socket.id, session);
    } catch (error) {
      console.error('Login error details:', error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      socket.emit('login-failed', 'Internal server error');
    }
  });

  /**
   * Handle JWT token-based login for persistent sessions
   *
   * This handler:
   * 1. Verifies the JWT token signature and expiration
   * 2. Retrieves user data from database
   * 3. Updates login statistics
   * 4. Sets up user session
   * 5. Generates a fresh token for continued use
   * 6. Displays LOGON screen and checks for unread messages
   *
   * Used for automatic login when user returns with a valid token.
   */
  socket.on('login-with-token', async (data: { token: string }) => {
    console.log('Token login attempt');

    try {
      const session = await sessions.get(socket.id);
      if (!session) {
        socket.emit('login-failed', 'Session expired');
        return;
      }

      // Verify JWT token
      const decoded = jwt.verify(data.token, JWT_SECRET) as { userId: string; username: string; securityLevel: number };
      console.log('Token verified for user:', decoded.username);

      // Get user from database
      const user = await db.getUserByUsername(decoded.username);
      if (!user) {
        console.log('User not found for token:', decoded.username);
        socket.emit('login-failed', 'Invalid session');
        return;
      }

      // Update last login
      await db.updateUser(user.id, { lastLogin: new Date(), calls: user.calls + 1, callsToday: user.callsToday + 1 });

      // Set session user data
      session.state = BBSState.LOGGEDON;
      session.subState = LoggedOnSubState.DISPLAY_BULL;
      session.user = user;

      // Set user preferences
      session.confRJoin = user.autoRejoin || 1;
      session.msgBaseRJoin = 1;
      session.cmdShortcuts = !user.expert;

      console.log('Token login successful for user:', decoded.username);

      // Generate a fresh token
      const newToken = jwt.sign(
        {
          userId: user.id,
          username: user.username,
          securityLevel: user.secLevel || 0
        },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      socket.emit('login-success', {
        token: newToken,
        user: {
          id: user.id,
          username: user.username,
          realname: user.realname,
          securityLevel: user.secLevel || 0
        }
      });

      // Display LOGON screen and pause before bulletins
      const logonScreen = loadScreen('LOGON', session);
      if (logonScreen) {
        socket.emit('ansi-output', logonScreen);
      }

      // Check for unread OLM messages
      try {
        const unreadCount = await db.getUnreadMessageCount(user.id);
        if (unreadCount > 0) {
          socket.emit('ansi-output', `\r\n\x1b[33m*** You have ${unreadCount} unread message(s)! Type OLM READ to view. ***\x1b[0m\r\n`);
        }
      } catch (error) {
        console.error('Error checking OLM messages:', error);
      }

      // Pause after LOGON screen, then show bulletins
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.subState = LoggedOnSubState.DISPLAY_BULL; // Wait for key before bulletins

      // Save session
      await sessions.set(socket.id, session);
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        console.log('Invalid token:', error.message);
        socket.emit('login-failed', 'Invalid or expired session');
      } else {
        console.error('Token login error:', error);
        socket.emit('login-failed', 'Internal server error');
      }
    }
  });

  /**
   * Handle new user registration response
   *
   * This handler processes the user's response to the "new user?" prompt:
   * - 'C': Continue with new user registration
   * - 'R': Retry login with different username
   *
   * Based on express.e lines 29622-29656
   */
  socket.on('new-user-response', async (data: { response: string; username: string }) => {
    console.log('New user response:', data.response, 'for username:', data.username);

    try {
      const session = await sessions.get(socket.id);
      if (!session) {
        socket.emit('login-failed', 'Session expired');
        return;
      }

      const response = data.response.toUpperCase();

      if (response === 'C') {
        // Continue as new user
        console.log('Starting new user registration for:', data.username);
        socket.emit('ansi-output', '\r\n\x1b[32mStarting new user registration...\x1b[0m\r\n');

        // Call newUserAccount to start the registration process
        const success = await newUserAccount(socket, session, data.username);

        if (!success) {
          socket.emit('login-failed', 'Registration cancelled or failed');
        }
      } else if (response === 'R') {
        // Retry login
        socket.emit('ansi-output', '\r\n\x1b[36mPlease try again.\x1b[0m\r\n');
        socket.emit('login-failed', 'Please retry with a different username');
      } else {
        // Invalid response
        socket.emit('ansi-output', '\r\n\x1b[31mInvalid response. Please enter C to continue or R to retry.\x1b[0m\r\n');
        socket.emit('new-user-prompt', { username: data.username });
      }

      // Save session
      await sessions.set(socket.id, session);
    } catch (error) {
      console.error('New user response error:', error);
      socket.emit('login-failed', 'Internal server error');
    }
  });

  /**
   * Handle new user registration
   *
   * This handler creates a new user account with the provided information:
   * - Validates input (username length, required fields)
   * - Checks for existing username
   * - Hashes password with bcrypt
   * - Creates user with default settings
   * - Sets up initial session
   * - Displays LOGON screen and starts bulletin flow
   *
   * Security features:
   * - Rate limiting (3 attempts per hour per IP)
   * - Password hashing
   * - Input validation
   */
  socket.on('register', async (data: { username: string; realname: string; location: string; password: string }) => {
    console.log('Registration attempt:', data.username);

    try {
      const session = await sessions.get(socket.id);
      if (!session) {
        socket.emit('register-failed', 'Session expired');
        return;
      }

      // Rate limiting check (using IP address as identifier)
      const rateLimitKey = socket.handshake.address;
      if (!registerRateLimiter.check(rateLimitKey)) {
        console.log('Registration rate limit exceeded for IP:', rateLimitKey);
        socket.emit('register-failed', 'Too many registration attempts. Please try again in 1 hour.');
        return;
      }

      // Validate input
      if (!data.username || !data.password || !data.realname) {
        socket.emit('register-failed', 'Username, password, and real name are required');
        return;
      }

      // Validate username format
      if (data.username.length < 2 || data.username.length > 20) {
        socket.emit('register-failed', 'Username must be between 2 and 20 characters');
        return;
      }

      // Check if user already exists
      const existingUser = await db.getUserByUsername(data.username);
      if (existingUser) {
        console.log('Username already exists:', data.username);
        socket.emit('register-failed', 'Username already exists');
        return;
      }

      // Hash password
      const passwordHash = await db.hashPassword(data.password);

      // Create new user
      const userId = await db.createUser({
        username: data.username,
        passwordHash,
        realname: data.realname,
        location: data.location,
        phone: '',
        secLevel: 10, // Default security level
        uploads: 0,
        downloads: 0,
        bytesUpload: 0,
        bytesDownload: 0,
        ratio: 0,
        ratioType: 0,
        timeTotal: 0,
        timeLimit: 60, // 60 minutes default
        timeUsed: 0,
        chatLimit: 0,
        chatUsed: 0,
        firstLogin: new Date(),
        calls: 1,
        callsToday: 1,
        newUser: true,
        expert: false,
        ansi: true,
        linesPerScreen: 23,
        computer: 'Unknown',
        screenType: 'Amiga Ansi',
        protocol: '/X Zmodem',
        editor: 'Prompt',
        zoomType: 'QWK',
        availableForChat: true,
        quietNode: false,
        autoRejoin: 1,
        confAccess: 'XXX', // Access to first 3 conferences
        areaName: 'Standard',
        uuCP: false,
        topUploadCPS: 0,
        topDownloadCPS: 0,
        byteLimit: 0
      });

      // Get the created user
      const user = await db.getUserById(userId);
      if (!user) {
        console.error('Failed to retrieve created user:', userId);
        socket.emit('register-failed', 'Registration failed - user not created');
        return;
      }

      // Set session data
      session.state = BBSState.LOGGEDON;
      session.subState = LoggedOnSubState.DISPLAY_BULL;
      session.user = user;

      // Set user preferences
      session.confRJoin = user.autoRejoin || 1;
      session.msgBaseRJoin = 1;
      session.cmdShortcuts = !user.expert;

      console.log('Registration successful for user:', data.username);
      socket.emit('register-success');

      // Show LOGON screen if it exists
      if (displayScreen(socket, session, 'LOGON')) {
        doPause(socket, session);
      }

      // Start DISPLAY_BULL flow (will show BULL, NODE_BULL, CONF_BULL, then menu)
      session.subState = LoggedOnSubState.DISPLAY_BULL;

      // Save session
      await sessions.set(socket.id, session);
    } catch (error) {
      console.error('Registration error:', error);
      socket.emit('register-failed', 'Registration failed - internal server error');
    }
  });
}
