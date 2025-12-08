/**
 * HTTP Routes Setup
 *
 * Centralizes all HTTP route definitions:
 * - Authentication routes (/auth/*)
 * - Session logs API (/api/sessions/*)
 * - Configuration API (/api/config/*)
 * - File upload/download routes
 * - Static file serving (SDK, Admin, BBS Frontend)
 * - Protected routes
 */

import { Request, Response, NextFunction, Application } from 'express';
import { join } from 'path';
import multer from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import express from 'express';
import { db } from '../database';
import { config } from '../config';
import { AuthHandler } from '../handlers/user/auth.handler';
import { SessionLogsHandler } from '../handlers/admin/session-logs.handler';
import { authenticateToken, requireSysop, AuthRequest } from '../middleware/auth.middleware';
import { createConfigRouter } from '../api/config-routes';
import { createBatchRouter } from '../api/batch-routes';
import { createImportRouter } from '../handlers/admin/import.handler';
import { enhancePrompt, analyzePrompt, enhanceAudioDescription, analyzeAudioDescription, generateGame } from '../handlers/admin/wizard.handler';
import { reloadDoorCommands } from '../handlers/command-execution.handler';
import { getConferenceDir } from '../utils/file-hold.util';

// Initialize handlers
const authHandler = new AuthHandler(db);
const sessionLogsHandler = new SessionLogsHandler();

// File upload configuration
// Express.e uses Node#/Playpen for uploaded files (express.e:19573-19584)
const playpenStorage = multer.diskStorage({
  destination: (req: any, file: any, cb: (error: Error | null, destination: string) => void) => {
    try {
      const playpenDir = path.join(config.get('dataDir'), 'Node0', 'Playpen');
      console.log('[Upload] BBS data directory:', config.get('dataDir'));
      console.log('[Upload] Playpen directory:', playpenDir);

      if (!fs.existsSync(playpenDir)) {
        console.log('[Upload] Creating playpen directory...');
        fs.mkdirSync(playpenDir, { recursive: true });
        console.log('[Upload] Playpen directory created');
      }

      cb(null, playpenDir);
    } catch (error) {
      console.error('[Upload] Error setting destination:', error);
      cb(error as Error, '');
    }
  },
  filename: (req: any, file: any, cb: (error: Error | null, filename: string) => void) => {
    try {
      console.log('[Upload] Storing file as:', file.originalname);
      cb(null, file.originalname);
    } catch (error) {
      console.error('[Upload] Error setting filename:', error);
      cb(error as Error, '');
    }
  }
});

const upload = multer({
  storage: playpenStorage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max
  }
});

/**
 * Register all HTTP routes on the Express app
 */
export function registerHttpRoutes(app: Application): void {
  // Development: Disable caching to prevent stale session issues
  if (process.env.NODE_ENV !== 'production') {
    app.use((req: Request, res: Response, next: NextFunction) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      next();
    });
  }

  // ===== Authentication Routes =====
  app.post('/auth/login', (req: Request, res: Response) => authHandler.login(req, res));
  app.get('/auth/me', authenticateToken(db), requireSysop(), (req: Request, res: Response) =>
    authHandler.me(req as AuthRequest, res)
  );
  app.post('/auth/register', (req: Request, res: Response) => authHandler.register(req, res));
  app.post('/auth/refresh', (req: Request, res: Response) => authHandler.refresh(req, res));

  // ===== Session Logs API - Sysop-only Routes =====
  app.get('/api/sessions', authenticateToken(db), requireSysop(), (req: Request, res: Response) =>
    sessionLogsHandler.getActiveSessions(req as AuthRequest, res)
  );
  app.get('/api/sessions/stats', authenticateToken(db), requireSysop(), (req: Request, res: Response) =>
    sessionLogsHandler.getStats(req as AuthRequest, res)
  );
  app.get('/api/sessions/:sessionId/log', authenticateToken(db), requireSysop(), (req: Request, res: Response) =>
    sessionLogsHandler.getSessionLog(req as AuthRequest, res)
  );
  app.get('/api/sessions/:sessionId/log/raw', authenticateToken(db), requireSysop(), (req: Request, res: Response) =>
    sessionLogsHandler.getSessionLogRaw(req as AuthRequest, res)
  );
  app.post('/api/sessions/:sessionId/save', authenticateToken(db), requireSysop(), (req: Request, res: Response) =>
    sessionLogsHandler.saveSessionLog(req as AuthRequest, res)
  );

  // ===== Configuration API - Sysop-only Routes =====
  const configRouter = createConfigRouter(db);
  app.use('/api/config', authenticateToken(db), requireSysop(), configRouter);

  // ===== Batch Editor API - Sysop-only =====
  const batchRouter = createBatchRouter();
  app.use('/api/batches', authenticateToken(db), requireSysop(), batchRouter);

  // ===== Import/Export API - Sysop-only Routes =====
  const importRouter = createImportRouter(db);
  app.use('/api/import', authenticateToken(db), requireSysop(), importRouter);

  // ===== Static File Serving for Unified Deployment =====
  // Serve SDK Preview at /sdk/
  const sdkPreviewPath = join(__dirname, '../../../sdk/tools/preview/frontend/dist');
  app.use('/sdk', express.static(sdkPreviewPath));
  app.use('/sdk', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
      return next(); // Let it 404 if file doesn't exist
    }
    res.sendFile(join(sdkPreviewPath, 'index.html'));
  });

  // Serve Admin Config at /admin/
  const adminConfigPath = join(__dirname, '../../config-app/dist');
  app.use('/admin', express.static(adminConfigPath));
  app.use('/admin', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
      return next(); // Let it 404 if file doesn't exist
    }
    res.sendFile(join(adminConfigPath, 'index.html'));
  });

  // Serve BBS Terminal Frontend at / (fallback)
  const bbsFrontendPath = join(__dirname, '../../frontend/dist');
  app.use(express.static(bbsFrontendPath));
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/auth') || req.path.startsWith('/socket.io')) {
      return next();
    }
    if (req.path.startsWith('/sdk') || req.path.startsWith('/admin')) {
      return next();
    }
    if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
      return next(); // Let it 404 if file doesn't exist
    }
    res.sendFile(join(bbsFrontendPath, 'index.html'));
  });

  // ===== Game Prompt Wizard API Endpoints =====
  app.post('/api/wizard/enhance', (req: Request, res: Response) => enhancePrompt(req, res));
  app.post('/api/wizard/analyze', (req: Request, res: Response) => analyzePrompt(req, res));
  app.post('/api/wizard/enhance-audio', (req: Request, res: Response) => enhanceAudioDescription(req, res));
  app.post('/api/wizard/analyze-audio', (req: Request, res: Response) => analyzeAudioDescription(req, res));
  app.post('/api/wizard/generate', (req: Request, res: Response) => generateGame(req, res));

  // ===== File Upload Routes =====
  app.post('/api/upload', (req: Request, res: Response) => {
    console.log('[Upload] Upload request received from:', req.headers.origin);

    upload.single('file')(req, res, (err: any) => {
      if (err) {
        console.error('[Upload] Multer error:', err);
        return res.status(500).json({ error: `Upload failed: ${err.message}` });
      }

      try {
        if (!req.file) {
          console.error('[Upload] No file in request');
          return res.status(400).json({ error: 'No file provided' });
        }

        console.log('[Upload] File received:', req.file.originalname, req.file.size, 'bytes');
        console.log('[Upload] Saved to:', req.file.path);

        res.json({
          filename: req.file.filename || req.file.originalname,
          originalname: req.file.originalname,
          size: req.file.size,
          path: req.file.path
        });
      } catch (error) {
        console.error('[Upload] Processing error:', error);
        res.status(500).json({ error: 'Upload processing failed' });
      }
    });
  });

  // Door upload endpoint
  app.post('/api/upload/door', (req: Request, res: Response) => {
    console.log('[Door Upload] Upload request received from:', req.headers.origin);

    upload.single('door')(req, res, (err: any) => {
      if (err) {
        console.error('[Door Upload] Multer error:', err);
        return res.status(500).json({ error: `Upload failed: ${err.message}` });
      }

      try {
        if (!req.file) {
          console.error('[Door Upload] No file in request');
          return res.status(400).json({ error: 'No file provided' });
        }

        console.log('[Door Upload] Door file received:', req.file.originalname, req.file.size, 'bytes');
        console.log('[Door Upload] Saved to:', req.file.path);

        // Move file to Doors/archives directory in BBS data directory
        const doorsArchivePath = path.join(config.get('dataDir'), 'Doors', 'archives');
        if (!fs.existsSync(doorsArchivePath)) {
          fs.mkdirSync(doorsArchivePath, { recursive: true });
        }

        const destPath = path.join(doorsArchivePath, req.file.originalname);
        fs.copyFileSync(req.file.path, destPath);
        console.log('[Door Upload] Copied to archives:', destPath);

        // Clean up temp file
        fs.unlinkSync(req.file.path);

        res.json({
          filename: req.file.originalname,
          originalname: req.file.originalname,
          size: req.file.size,
          path: destPath
        });
      } catch (error) {
        console.error('[Door Upload] Processing error:', error);
        res.status(500).json({ error: 'Door upload processing failed' });
      }
    });
  });

  // ===== Door Hot-Reload Endpoint =====
  app.post('/api/doors/reload', async (req: Request, res: Response) => {
    try {
      console.log('[Door Reload] Hot-reload request received');

      const bbsBaseDir = config.get('dataDir');
      const result = await reloadDoorCommands(bbsBaseDir, 1, 0);

      if (result.success) {
        console.log(`[Door Reload] ${result.message}`);
        res.json({
          success: true,
          message: result.message,
          doorsReloaded: result.doorsReloaded
        });
      } else {
        console.error(`[Door Reload] ${result.message}`);
        res.status(500).json({
          success: false,
          message: result.message,
          doorsReloaded: 0
        });
      }
    } catch (error) {
      console.error('[Door Reload] Unexpected error:', error);
      res.status(500).json({
        success: false,
        message: `Reload failed: ${(error as Error).message}`,
        doorsReloaded: 0
      });
    }
  });

  // ===== File Download Endpoint =====
  // express.e:20075+ (downloadAFile)
  app.get('/api/download/:fileId', async (req: Request, res: Response) => {
    try {
      const fileId = parseInt(req.params.fileId);

      if (isNaN(fileId)) {
        return res.status(400).json({ error: 'Invalid file ID' });
      }

      const fileEntry = await db.getFileEntry(fileId);

      if (!fileEntry) {
        return res.status(404).json({ error: 'File not found' });
      }

      const conferencePath = getConferenceDir(fileEntry.conferenceId || 1, config.get('dataDir'));

      let filePath: string | null = null;
      const possiblePaths = [
        fileEntry.filePath,
        path.join(conferencePath, `Dir${fileEntry.areaId}`, fileEntry.filename),
        path.join(config.get('dataDir'), 'Node0', 'Playpen', fileEntry.filename),
        path.join(conferencePath, 'HOLD', fileEntry.filename),
        path.join(conferencePath, 'PRIVATE', fileEntry.filename)
      ].filter(p => p);

      for (const testPath of possiblePaths) {
        if (fs.existsSync(testPath!)) {
          filePath = testPath!;
          break;
        }
      }

      if (!filePath || !fs.existsSync(filePath)) {
        console.error(`[Download] File not found on disk: ${fileEntry.filename}`);
        return res.status(404).json({ error: 'File not found on server' });
      }

      console.log(`[Download] Serving file: ${fileEntry.filename} from ${filePath}`);

      res.setHeader('Content-Disposition', `attachment; filename="${fileEntry.filename}"`);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Length', fileEntry.size.toString());

      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    } catch (error) {
      console.error('[Download] Error:', error);
      res.status(500).json({ error: 'Download failed' });
    }
  });

  // ===== Protected Route Example =====
  app.get('/users/:id', authenticateToken(db), async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.params.id;

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
}
