/**
 * Authentication Handler
 * Handles login, registration, and token refresh endpoints.
 *
 * **ADMIN_**: this is the HTTP REST API used by the admin panel and
 * the modern web/SSH/Telnet clients. None of these endpoints have an
 * express.e equivalent — express.e's authentication runs through the
 * BBS prompt loop (server/auth-socket-handlers.ts is closer to the
 * canonical 1:1 path). Methods here are admin-side conveniences that
 * sit alongside the BBS auth flow, not in place of it. (Audit A-23.)
 */

import { Request, Response } from 'express';
import { Database } from '../../database';
import { sanitizeInput } from '../../utils/input-normalizer.util';
import { AuthRequest } from '../../middleware/auth.middleware';
import { getSystemTime } from '../../utils/date-time.util';

export class AuthHandler {
  constructor(private db: Database) {}

  private toPublicUser(user: any) {
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      realname: user.realname,
      secLevel: user.secLevel,
      expert: user.expert === 'X' ? 'X' : 'N',
      ansi: typeof user.ansi === 'boolean' ? user.ansi : true,
      email: user.email,
      created_at: user.created_at
    };
  }

  /**
   * POST /auth/login
   * Authenticate user and return access/refresh tokens
   */
  async login(req: Request, res: Response): Promise<void> {
    try {
      const { username, password } = req.body;
      const safeUsername = sanitizeInput(username);

      if (!safeUsername || !password) {
        res.status(400).json({ error: 'Username and password required' });
        return;
      }

      // Authenticate user
      const user = await this.db.getUserByUsername(safeUsername);
      if (!user) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      const isValidPassword = await this.db.verifyPassword(password, user.passwordHash);
      if (!isValidPassword) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      if (user.secLevel < 255) {
        res.status(403).json({ error: 'Sysop access required' });
        return;
      }

      // Update last login
      await this.db.updateUser(user.id, {
        lastLogin: getSystemTime(),
        calls: user.calls + 1,
        callsToday: user.callsToday + 1
      });

      // Generate tokens
      const accessToken = await this.db.generateAccessToken(user);
      const refreshToken = await this.db.generateRefreshToken(user);

      const publicUser = this.toPublicUser(user);
      res.json({
        accessToken,
        refreshToken,
        user: publicUser
      });
    } catch (error) {
console.error('Login error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * GET /auth/me
   * Return the authenticated user's info
   */
  async me(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const user = await this.db.getUserById(req.user.userId);
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      res.json({ user: this.toPublicUser(user) });
    } catch (error) {
console.error('Me error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * POST /auth/register
   * Register new user and return access/refresh tokens
   */
  async register(req: Request, res: Response): Promise<void> {
    try {
      const { username, realname, location, password } = req.body;
      const safeUsername = sanitizeInput(username);
      const safeRealname = sanitizeInput(realname);

      if (!safeUsername || !safeRealname || !password) {
        res.status(400).json({ error: 'Username, realname, and password required' });
        return;
      }

      // Check if user already exists
      const normalizedRegName = safeUsername;
      const existingUser = await this.db.getUserByUsername(normalizedRegName);
      if (existingUser) {
        res.status(409).json({ error: 'Username already exists' });
        return;
      }

      // Hash password
      const passwordHash = await this.db.hashPassword(password);

      // Determine new-user confAccess. system_config.new_user_conf_access
      // is the canonical source — initialization.ts:660-685 keeps it
      // expanded to match the current conference count. Falling back to
      // 'XXX' would limit new users to 3 conferences on sites with more
      // (e.g. live BBS has 14 confs; users registered with hardcoded
      // 'XXX' saw only the first 3).
      let newUserConfAccess = 'XXX';
      try {
        const cfg = this.db.getConfigRepository?.()?.getSystemConfig?.();
        if (cfg?.new_user_conf_access && typeof cfg.new_user_conf_access === 'string' && cfg.new_user_conf_access.length > 0) {
          newUserConfAccess = cfg.new_user_conf_access;
        }
      } catch (_) {
        // Best-effort — keep 'XXX' default if system_config query fails.
      }

      // Create new user with default settings
      const userId = await this.db.createUser({
        username: normalizedRegName,
        passwordHash,
        realname: safeRealname,
        location: location || '',
        phone: '',
        secLevel: 10, // Default security level
        uploads: 0,
        downloads: 0,
        bytesUpload: 0,
        bytesDownload: 0,
        ratio: 0,
        ratioType: 0,
        timeTotal: 0,
        timeLimit: 3600, // 3600 seconds = 60 minutes default (express.e:7684)
        timeUsed: 0,
        chatLimit: 0,
        chatUsed: 0,
        firstLogin: getSystemTime(),
        calls: 1,
        callsToday: 1,
        newUser: true,
        expert: 'N',
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
        confAccess: newUserConfAccess, // system_config.new_user_conf_access (expanded to match conf count)
        areaName: 'Standard',
        uuCP: false,
        topUploadCPS: 0,
        topDownloadCPS: 0,
        byteLimit: 0,
        userFlags: 0 // Default user flags
      });

      // Get the created user
      const user = await this.db.getUserById(userId);
      if (!user) {
        res.status(500).json({ error: 'Registration failed' });
        return;
      }

      // Generate tokens
      const accessToken = await this.db.generateAccessToken(user);
      const refreshToken = await this.db.generateRefreshToken(user);

      res.status(201).json({
        accessToken,
        refreshToken,
        user: this.toPublicUser(user)
      });
    } catch (error) {
console.error('Registration error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * POST /auth/refresh
   * Refresh access token using refresh token
   */
  async refresh(req: Request, res: Response): Promise<void> {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        res.status(400).json({ error: 'Refresh token required' });
        return;
      }

      // Verify refresh token
      const decoded = await this.db.verifyRefreshToken(refreshToken);

      // Get user
      const user = await this.db.getUserById(decoded.userId);
      if (!user) {
        res.status(401).json({ error: 'User not found' });
        return;
      }

      // Generate new access token
      const accessToken = await this.db.generateAccessToken(user);

      res.json({ accessToken });
    } catch (error) {
console.error('Token refresh error:', error);
      res.status(403).json({ error: 'Invalid refresh token' });
    }
  }
}
