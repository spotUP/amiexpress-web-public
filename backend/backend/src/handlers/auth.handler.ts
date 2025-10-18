/**
 * Authentication Handler
 * Handles login, registration, and token refresh endpoints
 */

import { Request, Response } from 'express';
import { Database } from '../database';

export class AuthHandler {
  constructor(private db: Database) {}

  /**
   * POST /auth/login
   * Authenticate user and return access/refresh tokens
   */
  async login(req: Request, res: Response): Promise<void> {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        res.status(400).json({ error: 'Username and password required' });
        return;
      }

      // Authenticate user
      const user = await this.db.getUserByUsername(username);
      if (!user) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      const isValidPassword = await this.db.verifyPassword(password, user.passwordHash);
      if (!isValidPassword) {
        res.status(401).json({ error: 'Invalid credentials' });
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

      res.json({
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          username: user.username,
          realname: user.realname,
          secLevel: user.secLevel,
          expert: user.expert,
          ansi: user.ansi
        }
      });
    } catch (error) {
      console.error('Login error:', error);
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

      if (!username || !realname || !password) {
        res.status(400).json({ error: 'Username, realname, and password required' });
        return;
      }

      // Check if user already exists
      const existingUser = await this.db.getUserByUsername(username);
      if (existingUser) {
        res.status(409).json({ error: 'Username already exists' });
        return;
      }

      // Hash password
      const passwordHash = await this.db.hashPassword(password);

      // Create new user with default settings
      const userId = await this.db.createUser({
        username,
        passwordHash,
        realname,
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
        user: {
          id: user.id,
          username: user.username,
          realname: user.realname,
          secLevel: user.secLevel,
          expert: user.expert,
          ansi: user.ansi
        }
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
