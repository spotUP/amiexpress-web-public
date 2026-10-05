/**
 * Chat API Routes
 * REST API for standalone web chat authentication
 *
 * Provides login endpoint for web chat clients to authenticate
 * and receive a JWT token for Socket.IO connection.
 *
 * Base URL: /api/chat
 */

import express, { Request, Response } from 'express';
import { jwtSecret } from '../utils/jwt-secrets';
import { mintChatToken } from '../services/chat-token.service';
import { loadAccount } from '../services/load-account';
import { accountRefusal, tokenHolderRefusal } from '../services/logon-gates';
import { countWrongPasswordFor, clearWrongPasswords } from '../services/password-failures';
import jwt from 'jsonwebtoken';
import { getSystemTime } from '../utils/date-time.util';
import type { Database } from '../database';

// Standard API response format
interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  timestamp: string;
}

/**
 * Create chat router
 */
export function createChatRouter(database: Database): ReturnType<typeof express.Router> {
  const router = express.Router();

  // Standard response wrapper
  const sendResponse = <T>(res: Response, data: T, message?: string) => {
    const response: ApiResponse<T> = {
      success: true,
      data,
      message,
      timestamp: getSystemTime().toISOString()
    };
    res.json(response);
  };

  // Error handler wrapper
  const handleError = (res: Response, error: unknown, statusCode: number = 500) => {
console.error('[Chat API] Error:', error);

    // A refusal's own sentence (4xx) is for the caller; an unexpected
    // failure's text can name server paths and stays in the log above -
    // these routes take no login.
    const message = statusCode < 500 && error instanceof Error ? error.message : 'An error occurred';
    const response: ApiResponse = {
      success: false,
      message,
      timestamp: getSystemTime().toISOString()
    };

    res.status(statusCode).json(response);
  };

  /**
   * POST /api/chat/login
   * Authenticate user for chat-only access
   *
   * Body: { username: string, password: string, rememberMe?: boolean }
   * Returns: { token: string, user: { id, username, secLevel } }
   *
   * Token expiry:
   * - rememberMe=true: 30 days
   * - rememberMe=false: 24 hours
   */
  router.post('/login', async (req: Request, res: Response) => {
    try {
      const { username, password, rememberMe } = req.body;

      // Validate input
      if (!username || typeof username !== 'string') {
        return handleError(res, new Error('Username is required'), 400);
      }

      if (!password || typeof password !== 'string') {
        return handleError(res, new Error('Password is required'), 400);
      }

      // Sanitize username (no angle brackets to prevent XSS)
      const safeUsername = username.replace(/[<>]/g, '').trim();

      if (!safeUsername) {
        return handleError(res, new Error('Invalid username'), 400);
      }

      // Authenticate user
      const user = await database.authenticateUser(safeUsername, password);

      if (!user) {
console.log(`[Chat API] Failed login attempt for: ${safeUsername}`);
        // express.e:1008-1016 - the account counts it toward
        // MAX_PASSWORD_FAILS, as the BBS logon and FTP count theirs.
        await countWrongPasswordFor(() => database.getUserByUsername(safeUsername), 'CHAT');
        return handleError(res, new Error('Invalid username or password'), 401);
      }

      // The board's own account gates on the board's own record - the BBS
      // logon's and FTP's (services/logon-gates). A deleted, locked or
      // level-0 account was handed a chat token here (open-surface audit,
      // 2026-10-04); a password that must be changed cannot be changed here.
      if (accountRefusal(loadAccount(user).user) !== null) {
console.log(`[Chat API] Account refused by the logon gates: ${safeUsername}`);
        return handleError(res, new Error('That account cannot log on. Call the board to find out why.'), 403);
      }

      // One minting implementation, shared with the door's login modal, so
      // the two cannot drift into different claims or lifetimes.
      // express.e:1018 - a right password zeroes the count.
      clearWrongPasswords(user, 'CHAT');

      const token = mintChatToken(
        { id: user.id, username: user.username, secLevel: user.secLevel },
        !!rememberMe
      );

console.log(`[Chat API] Successful login for: ${user.username} (rememberMe: ${!!rememberMe})`);

      sendResponse(res, {
        token,
        user: {
          id: user.id,
          username: user.username,
          secLevel: user.secLevel
        }
      }, 'Login successful');

    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * POST /api/chat/verify
   * Verify an existing chat token is still valid
   *
   * Body: { token: string }
   * Returns: { valid: boolean, user?: { id, username, secLevel } }
   */
  router.post('/verify', async (req: Request, res: Response) => {
    try {
      const { token } = req.body;

      if (!token || typeof token !== 'string') {
        return sendResponse(res, { valid: false });
      }

      const secret = jwtSecret();

      try {
        const decoded = jwt.verify(token, secret) as any;

        // The account must still exist AND still be allowed on the board:
        // a token minted before a delete or a lock is no longer valid
        // (services/logon-gates tokenHolderRefusal).
        const user = await database.getUserById(decoded.userId);

        if (!user || tokenHolderRefusal(user).refusal !== null) {
          return sendResponse(res, { valid: false });
        }

        sendResponse(res, {
          valid: true,
          user: {
            id: user.id,
            username: user.username,
            secLevel: user.secLevel
          }
        });

      } catch (jwtError) {
        // Token expired or invalid
        sendResponse(res, { valid: false });
      }

    } catch (error) {
      handleError(res, error);
    }
  });

  /**
   * POST /api/chat/logout
   * Logout from chat (client should discard token)
   *
   * This is mainly for logging purposes since JWTs are stateless.
   * The client should delete the token from localStorage/sessionStorage.
   */
  router.post('/logout', async (req: Request, res: Response) => {
    const { username } = req.body;

    if (username) {
console.log(`[Chat API] User logged out: ${username}`);
    }

    sendResponse(res, { loggedOut: true }, 'Logged out successfully');
  });

  return router;
}
