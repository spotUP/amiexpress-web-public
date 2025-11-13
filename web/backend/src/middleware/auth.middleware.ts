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
      return res.status(403).json({ error: 'Invalid or expired access token' });
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

    // Sysop level is typically 255 in AmiExpress
    if (req.user.secLevel < 255) {
      return res.status(403).json({
        error: 'Sysop access required',
        message: 'This operation requires sysop-level privileges'
      });
    }

    next();
  };
};
