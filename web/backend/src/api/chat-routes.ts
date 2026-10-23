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
import { tokenHolderRefusal } from '../services/logon-gates';
import { chatLogin } from '../services/chat-login';
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

      // services/chat-login: the password check, its failure count and the
      // board's account gates, shared with the socket modal and the door.
      const login = await chatLogin(database, safeUsername, password);
      if (!login.ok) {
console.log(`[Chat API] Login refused for: ${safeUsername} (${login.status})`);
        return handleError(res, new Error(login.message), login.status);
      }
      const user = login.user;

      // One minting implementation, shared with the door's login modal, so
      // the two cannot drift into different claims or lifetimes.

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
console.info(`[Chat API] User logged out: ${username}`);
    }

    sendResponse(res, { loggedOut: true }, 'Logged out successfully');
  });

  return router;
}
