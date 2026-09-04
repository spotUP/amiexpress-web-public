/**
 * Authentication Middleware
 */

import { Request, Response, NextFunction } from 'express';
import { Database } from '../database';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    username: string;
    secLevel: number;
  };
  params: any; // Route parameters
}

/**
 * Middleware to authenticate JWT access tokens
 */
export const authenticateToken = (db: Database) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = (req as any).headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    try {
      const decoded = await db.verifyAccessToken(token);
      req.user = decoded;
      next();
    } catch (error) {
      // 401, not 403: the token is absent, malformed or past its eight hours,
      // and the answer is "authenticate again" - which a client can act on by
      // spending its refresh token. 403 is requireSysop's answer, for a caller
      // who IS authenticated and still may not. The two were the same code, so
      // the admin logged the sysop out on every expiry and threw away a
      // refresh token good for seven days (reported live, 2026-09-02).
      return res.status(401).json({ error: 'Invalid or expired access token' });
    }
  };
};

/**
 * Middleware to require sysop-level access (security level 255)
 * Must be used after authenticateToken
 */
export const requireSysop = () => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (req.user.secLevel < 255) {
      return res.status(403).json({
        error: 'Sysop access required',
        message: 'This operation requires sysop-level privileges'
      });
    }

    next();
  };
};

/**
 * Middleware to require a minimum security level.
 * Must be used after authenticateToken.
 *
 * Usage: `requireLevel(100)` for screen editors, `requireLevel(255)` for full sysop.
 */
export const requireLevel = (minLevel: number) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (req.user.secLevel < minLevel) {
      return res.status(403).json({
        error: 'Access denied',
        message: `This operation requires security level ${minLevel} or higher`
      });
    }

    next();
  };
};
