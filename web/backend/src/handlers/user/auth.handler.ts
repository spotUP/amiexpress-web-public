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
import { getBoardConfig } from '../../services/bbs-config-file.service';
import { newUserConferenceAccess } from '../../utils/new-user-preset';
import { config as appConfig } from '../../config';
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
      const { username, password, rememberMe } = req.body;
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

      if (user.secLevel < 10) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      // A web login is not a call. express.e counts one at the board's logon
      // (login-post.service), and this wrote the database copy's count + 1
      // over the account on disk.

      // Generate tokens — longer refresh lifetime when rememberMe is set
      const accessToken = await this.db.generateAccessToken(user);
      const refreshToken = await this.db.generateRefreshToken(user, !!rememberMe);

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

      // A new account's conference access is Preset.1's PRESET.AREA, as
      // express.e's initNewUser writes it (30438-30443, 29369) - read from
      // disk, never the database copy. See utils/new-user-preset.ts. The web
      // has no node, so only the board's Access/PRESET.1 applies.
      let newUserConfAccess = 'XXX';
      try {
        newUserConfAccess = newUserConferenceAccess(appConfig.get('dataDir'));
      } catch (_) {
        // Best-effort - keep 'XXX' if the board's files cannot be read.
      }

      // Same story for the time limit, which was hardcoded here: the sysop's
      // configured value never reached anyone who signed up through the BBS.
      // new_user_time_limit is MINUTES; users.timelimit is SECONDS.
      let newUserTimeLimitSeconds = 1440 * 60;
      try {
        const cfg = getBoardConfig(appConfig.get('dataDir'));
        const minutes = Number(cfg?.new_user_time_limit);
        if (Number.isFinite(minutes) && minutes > 0) {
          newUserTimeLimitSeconds = Math.floor(minutes) * 60;
        }
      } catch (_) {
        // Best-effort — keep the default if system_config query fails.
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
        // Seconds. Was hardcoded to 3600 regardless of what the sysop had
        // configured, so raising the new-user time limit had no effect on
        // anyone who signed up through the BBS itself - which is everyone.
        timeLimit: newUserTimeLimitSeconds,
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
        confAccess: newUserConfAccess, // Preset.1's PRESET.AREA (express.e:29369)
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
      // Same distinction as authenticateToken: a refresh token that will not
      // verify means log in again, not "forbidden".
      res.status(401).json({ error: 'Invalid refresh token' });
    }
  }
}
