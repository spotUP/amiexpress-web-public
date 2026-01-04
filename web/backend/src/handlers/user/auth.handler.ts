/**
 * Authentication Handler
 * Handles login, registration, and token refresh endpoints
 */

import { Request, Response } from 'express';
import { Database } from '../../database';
import { sanitizeInput } from '../../utils/input-normalizer.util';
import { AuthRequest } from '../../middleware/auth.middleware';

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
        lastLogin: new Date(),
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
        timeLimit: 60, // 60 minutes default
        timeUsed: 0,
        chatLimit: 0,
        chatUsed: 0,
        firstLogin: new Date(),
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
        confAccess: 'XXX', // Access to first 3 conferences
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
