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
import jwt from 'jsonwebtoken';
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
      timestamp: new Date().toISOString()
    };
    res.json(response);
  };

  // Error handler wrapper
  const handleError = (res: Response, error: unknown, statusCode: number = 500) => {
console.error('[Chat API] Error:', error);

    const message = error instanceof Error ? error.message : 'An error occurred';
    const response: ApiResponse = {
      success: false,
      message,
      timestamp: new Date().toISOString()
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
        return handleError(res, new Error('Invalid username or password'), 401);
      }

      // Generate chat-specific JWT token
      const secret = process.env.JWT_SECRET || 'amiexpress-secret-key-change-in-production';
      const expiresIn = rememberMe ? '30d' : '24h';

      const payload = {
        userId: user.id,
        username: user.username,
        secLevel: user.secLevel,
        chatOnly: true // Marker to identify chat-only tokens
      };

      const token = jwt.sign(payload, secret, { expiresIn });

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

      const secret = process.env.JWT_SECRET || 'amiexpress-secret-key-change-in-production';

      try {
        const decoded = jwt.verify(token, secret) as any;

        // Verify user still exists
        const user = await database.getUserById(decoded.userId);

        if (!user) {
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
