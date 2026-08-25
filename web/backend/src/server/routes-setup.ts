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
import { Server as SocketIOServer } from 'socket.io';
import { join } from 'path';
import multer from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import * as amigafs from '../utils/amigafs';
import express from 'express';
import { db } from '../database';
import { config } from '../config';
import { AuthHandler } from '../handlers/user/auth.handler';
import { SessionLogsHandler } from '../handlers/admin/session-logs.handler';
import { authenticateToken, requireSysop, AuthRequest } from '../middleware/auth.middleware';
import { createConfigRouter } from '../api/config-routes';
import { createBatchRouter } from '../api/batch-routes';
import { createImportRouter } from '../handlers/admin/import.handler';
import { createChatRouter } from '../api/chat-routes';
import { createGlobalWallRouter } from '../api/globalwall-routes';
import { createStatisticsRouter } from '../api/statistics-routes';
import { createNodeControlRouter } from '../api/node-control-routes';
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

      // Handle stray non-directory blocker (same class of bug as the
      // Conf<n>/HOLD EEXIST issue — old AmiExpress installs leave a
      // zero-byte FILE at the path that should be a directory).
      // mkdir -p errors EEXIST when a non-directory file exists there.
      // Rename the stray out of the way + retry.
      if (fs.existsSync(playpenDir)) {
        const stat = fs.statSync(playpenDir);
        if (!stat.isDirectory()) {
          const backup = `${playpenDir}.stray-${Date.now()}`;
          console.warn(`[Upload] ${playpenDir} exists as non-directory; renaming to ${path.basename(backup)} and retrying mkdir`);
          fs.renameSync(playpenDir, backup);
          fs.mkdirSync(playpenDir, { recursive: true });
        }
      } else {
console.log('[Upload] Creating playpen directory...');
        fs.mkdirSync(playpenDir, { recursive: true });
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
 * @param app - Express application instance
 * @param io - Socket.IO server instance (for real-time features)
 */
export function registerHttpRoutes(app: Application, io: SocketIOServer): void {
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

  // ===== Info Editor API - Sysop-only Routes =====
  const { infoEditorRouter } = require('../api/info-editor-routes');
  app.use('/api/info-editor', authenticateToken(db), requireSysop(), infoEditorRouter);

  // ===== Chat API - Public Routes (for web chat authentication) =====
  const chatRouter = createChatRouter(db);
  app.use('/api/chat', chatRouter);

  // ===== Global Wall API - Sysop-only Routes =====
  const globalWallRouter = createGlobalWallRouter(db);
  app.use('/api/globalwall', authenticateToken(db), requireSysop(), globalWallRouter);

  // ===== Statistics API - Sysop-only Routes =====
  const statisticsRouter = createStatisticsRouter(db);
  app.use('/api/stats', authenticateToken(db), requireSysop(), statisticsRouter);

  // ===== Node Control API - Sysop-only Routes (Real-time SV_* commands) =====
  const nodeControlRouter = createNodeControlRouter(io);
  app.use('/api/nodes', authenticateToken(db), requireSysop(), nodeControlRouter);

  // ===== Static File Serving for Unified Deployment =====
  //
  // Derived from THIS FILE's location, not from the working directory. The
  // old `join(process.cwd(), '..', '..')` assumed the backend was always
  // launched from web/backend - but the BBS data paths are relative to the
  // repo root, so launching from there (which the dev notes tell you to do)
  // resolved the project root to the parent of the repo and served nothing:
  // the terminal answered 404 at / and every asset.
  //
  // __dirname is web/backend/src/server in both dev and the container,
  // which run the TypeScript directly. BBS_ROOT overrides it if set.
  const projectRoot = process.env.BBS_ROOT
    ? path.resolve(process.env.BBS_ROOT)
    : path.resolve(__dirname, '../../../..');

  // Helper: Serve SPA with fallback to index.html
  function serveSPA(prefix: string, distPath: string, name: string) {
    // Check if dist directory exists
    if (!fs.existsSync(distPath)) {
console.warn(`[Static] ${name} dist not found: ${distPath}`);
console.warn(`[Static] Run 'cd ${path.relative(projectRoot, path.dirname(distPath))} && npm run build'`);
      return;
    }

console.log(`[Static] Serving ${name} at ${prefix} from ${distPath}`);

    // Serve hashed assets with long-term caching, index.html with no cache
    const spaAssetsPath = join(distPath, 'assets');
    if (fs.existsSync(spaAssetsPath)) {
      app.use(`${prefix}/assets`, express.static(spaAssetsPath, {
        maxAge: '1y',
        immutable: true,
      }));
    }
    app.use(prefix, express.static(distPath, { maxAge: 0 }));

    // SPA fallback: serve index.html for non-asset requests
    app.use(prefix, (req: Request, res: Response, next: NextFunction) => {
      if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|map|json)$/)) {
        return next(); // Let it 404 if asset doesn't exist
      }
      const indexPath = join(distPath, 'index.html');
      if (!fs.existsSync(indexPath)) {
console.error(`[Static] ${name} index.html not found: ${indexPath}`);
        return res.status(500).send(`${name} not built. Run 'npm run build' in ${path.relative(projectRoot, path.dirname(distPath))}`);
      }
      res.sendFile(indexPath);
    });
  }

  // Serve SDK Preview at /sdk/
  const sdkPreviewPath = join(projectRoot, 'sdk/tools/preview/frontend/dist');
  serveSPA('/sdk', sdkPreviewPath, 'SDK Preview');

  // Serve Admin Config at /admin/
  const adminConfigPath = join(projectRoot, 'web/config-app/dist');
  serveSPA('/admin', adminConfigPath, 'Admin Config');

  // Serve BBS Terminal Frontend at / (fallback)
  const bbsFrontendPath = join(projectRoot, 'web/frontend/dist');

console.log(`[Static] Project root: ${projectRoot}`);
console.log(`[Static] Process cwd: ${process.cwd()}`);
console.log(`[Static] Frontend path: ${bbsFrontendPath}`);
console.log(`[Static] Frontend path exists: ${fs.existsSync(bbsFrontendPath)}`);

  if (fs.existsSync(bbsFrontendPath)) {
    const assetsPath = join(bbsFrontendPath, 'assets');
    const fontsPath = join(bbsFrontendPath, 'fonts');
console.log(`[Static] Assets path exists: ${fs.existsSync(assetsPath)}`);
console.log(`[Static] Fonts path exists: ${fs.existsSync(fontsPath)}`);
    if (fs.existsSync(assetsPath)) {
      const assetFiles = fs.readdirSync(assetsPath);
console.log(`[Static] Assets count: ${assetFiles.length}, first 5: ${assetFiles.slice(0, 5).join(', ')}`);
    }
    if (fs.existsSync(fontsPath)) {
      const fontFiles = fs.readdirSync(fontsPath);
console.log(`[Static] Fonts count: ${fontFiles.length}`);
    }
  }

  if (!fs.existsSync(bbsFrontendPath)) {
console.warn(`[Static] BBS Frontend dist not found: ${bbsFrontendPath}`);
console.warn(`[Static] Run 'cd web/frontend && npm run build'`);
  } else {
console.log(`[Static] Serving BBS Terminal at / from ${bbsFrontendPath}`);

    // Serve hashed assets with long-term caching
    const assetsDir = join(bbsFrontendPath, 'assets');
    if (fs.existsSync(assetsDir)) {
      app.use('/assets', express.static(assetsDir, {
        maxAge: '1y',
        immutable: true,
      }));
    }

    // Serve fonts with long-term caching
    const fontsDir = join(bbsFrontendPath, 'fonts');
    if (fs.existsSync(fontsDir)) {
      app.use('/fonts', express.static(fontsDir, {
        maxAge: '1y',
        immutable: true,
      }));
    }

    // Serve remaining files (index.html etc) with no caching
    app.use(express.static(bbsFrontendPath, { maxAge: 0 }));

    app.use((req: Request, res: Response, next: NextFunction) => {
      // Skip API routes
      if (req.path.startsWith('/api') || req.path.startsWith('/auth') || req.path.startsWith('/socket.io')) {
        return next();
      }
      // Skip sub-app routes
      if (req.path.startsWith('/sdk') || req.path.startsWith('/admin')) {
        return next();
      }
      // Skip asset files - let them 404 naturally
      if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|map|json)$/)) {
        return next();
      }
      // Serve index.html for all other routes (SPA fallback)
      const indexPath = join(bbsFrontendPath, 'index.html');
      if (!fs.existsSync(indexPath)) {
console.error(`[Static] BBS Frontend index.html not found: ${indexPath}`);
        return res.status(500).send('BBS Frontend not built. Run \'npm run build\' in web/frontend');
      }
      res.sendFile(indexPath);
    });
  }

  // ===== Game Prompt Wizard API Endpoints =====
  app.post('/api/wizard/enhance', (req: Request, res: Response) => enhancePrompt(req, res));
  app.post('/api/wizard/analyze', (req: Request, res: Response) => analyzePrompt(req, res));
  app.post('/api/wizard/enhance-audio', (req: Request, res: Response) => enhanceAudioDescription(req, res));
  app.post('/api/wizard/analyze-audio', (req: Request, res: Response) => analyzeAudioDescription(req, res));
  app.post('/api/wizard/generate', (req: Request, res: Response) => generateGame(req, res));

  // ===== File Upload Routes =====
  // BBS user file uploads were migrated to ZMODEM/lrzsz in c67e50385
  // and no longer use `/api/upload`. The route stays because two
  // door-side flows still rely on multipart HTTP upload:
  //   1. TypeScript doors calling `ctx.bbs.requestArchiveUpload()`
  //      (web/backend/src/doors/BBSApi.ts) emit `show-file-upload`
  //      with the default uploadUrl — frontend POSTs here, then
  //      emits `file-upload-ready` with the multer-saved path.
  //   2. DoorManager admin flow uses the parallel `/api/upload/door`
  //      route below.
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

  // ===== File Download Endpoint (by path) =====
  // express.e:20075+ (downloadAFile) - disk-based file serving
  // Route: /api/download/:confNum/:dirNum/:filename
  // Uses amigafs for case-insensitive file lookups (AmigaOS compatibility)
  app.get('/api/download/:confNum/:dirNum/:filename', async (req: Request, res: Response) => {
    try {
      const confNum = parseInt(req.params.confNum);
      const dirNum = parseInt(req.params.dirNum);
      const filename = decodeURIComponent(req.params.filename);

      if (isNaN(confNum) || isNaN(dirNum) || !filename) {
        return res.status(400).json({ error: 'Invalid download parameters' });
      }

      const dataDir = config.get('dataDir');
      const conferencePath = getConferenceDir(confNum, dataDir);

      // Search for file in conference directories - express.e disk-based approach
      // AmiExpress stores files in Conf{N}/Files/ directory
      // Use amigafs for case-insensitive matching (AmigaOS is case-insensitive)
      const possiblePaths = [
        path.join(conferencePath, 'Files', filename),
        path.join(conferencePath, 'Upload', filename),
        path.join(conferencePath, `Dir${dirNum}`, filename),
        path.join(dataDir, 'Node0', 'Playpen', filename),
        path.join(conferencePath, 'HOLD', filename),
        path.join(conferencePath, 'PRIVATE', filename)
      ];

      let filePath: string | null = null;
      let resolvedPath: string | null = null;
      for (const testPath of possiblePaths) {
        // Use amigafs.existsSync for case-insensitive check
        if (amigafs.existsSync(testPath)) {
          // Get the actual resolved path (with correct case)
          try {
            resolvedPath = amigafs.realpathSync(testPath);
            filePath = resolvedPath;
          } catch {
            filePath = testPath;
          }
          break;
        }
      }

      if (!filePath) {
console.error(`[Download] File not found: ${filename} in conf ${confNum}`);
        return res.status(404).json({ error: 'File not found on server' });
      }

      const stats = amigafs.statSync(filePath);
      const actualFilename = path.basename(filePath);
console.log(`[Download] Serving file: ${actualFilename} from ${filePath} (${stats.size} bytes)`);

      res.setHeader('Content-Disposition', `attachment; filename="${actualFilename}"`);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Length', stats.size.toString());

      // Use standard fs for streaming (amigafs doesn't have createReadStream)
      const fileStream = fs.createReadStream(filePath);
      // Without an error handler the stream emits 'error' as an unhandled
      // EventEmitter error, which kills the Node process. Guard both the
      // readable and the response so a client disconnect (EPIPE/ECONNRESET)
      // or a mid-read disk error never crashes the server.
      fileStream.on('error', (err) => {
        console.error('[Download] Stream read error:', err.message);
        if (!res.headersSent) res.status(500).json({ error: 'File read error' });
        else res.destroy();
      });
      res.on('error', (err) => {
        console.error('[Download] Response write error (client disconnect?):', err.message);
        fileStream.destroy();
      });
      fileStream.pipe(res);
    } catch (error) {
console.error('[Download] Error:', error);
      res.status(500).json({ error: 'Download failed' });
    }
  });

  // ===== File Download Endpoint (by ID - legacy) =====
  // For backward compatibility with database-based file IDs
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
      fileStream.on('error', (err) => {
        console.error('[Download] Stream read error (legacy):', err.message);
        if (!res.headersSent) res.status(500).json({ error: 'File read error' });
        else res.destroy();
      });
      res.on('error', (err) => {
        console.error('[Download] Response write error (legacy, client disconnect?):', err.message);
        fileStream.destroy();
      });
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

  // ===== Global Error Handler (MUST BE LAST) =====
  // Catches errors from express.static and other middleware
  // This handler catches any errors that weren't caught by route-specific error handling
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    // Log error details for debugging
    console.error('[Express Error]', {
      url: req.url,
      method: req.method,
      error: err.message,
      code: err.code,
      statusCode: err.statusCode,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });

    // For static file errors (ENOENT = file not found, permission errors, etc.)
    // Return 404 instead of 500 to prevent confusion
    if (err.code === 'ENOENT' || err.statusCode === 404) {
      return res.status(404).send('Not Found');
    }

    // For permission/access errors
    if (err.code === 'EACCES' || err.code === 'EPERM') {
      console.error('[Express Error] Permission denied:', req.url);
      return res.status(403).send('Forbidden');
    }

    // For all other errors, return 500 with safe message
    const statusCode = err.statusCode || 500;
    res.status(statusCode).send(
      process.env.NODE_ENV === 'production'
        ? 'Internal Server Error'
        : `Error: ${err.message}`
    );
  });
}
