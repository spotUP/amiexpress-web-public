import express, { Request, Response } from 'express';
import { db } from '../database';
import { AuthHandler } from '../handlers/auth.handler';
import { authenticateToken, AuthRequest } from '../middleware/auth.middleware';

/**
 * REST API Routes
 *
 * Handles RESTful API endpoints including:
 * - Authentication (login, register, refresh)
 * - User profile endpoints
 */

export const apiRouter = express.Router();

// Initialize handlers
const authHandler = new AuthHandler(db);

// Authentication endpoints
apiRouter.post('/auth/login', (req: Request, res: Response) => authHandler.login(req, res));
apiRouter.post('/auth/register', (req: Request, res: Response) => authHandler.register(req, res));
apiRouter.post('/auth/refresh', (req: Request, res: Response) => authHandler.refresh(req, res));

// Protected route example - get user by ID
apiRouter.get('/users/:id', authenticateToken(db), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.params.id;

    // Check if user can access this resource (own profile or admin)
    if (req.user!.userId !== userId && req.user!.secLevel < 100) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const user = await db.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user.id,
      username: user.username,
      realname: user.realname,
      location: user.location,
      secLevel: user.secLevel,
      lastLogin: user.lastLogin,
      uploads: user.uploads,
      downloads: user.downloads
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default apiRouter;
