/**
 * Import/Export API Handlers
 *
 * REST API endpoints for Amiga BBS import/export functionality.
 * Provides file upload, validation, conflict resolution, and import execution.
 */

import express, { type Request, type Response } from 'express';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs/promises';
import { ImportTransactionService } from '../services/import-transaction.service';
import { AmigaParserService } from '../services/amiga-parser.service';
import { ImportValidationService } from '../services/import-validation.service';
import { ImportMappingService } from '../services/import-mapping.service';
import type { Database } from '../database';
import type { ImportOptions } from '../services/import-transaction.service';

/**
 * Configure multer for file uploads
 */
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'data', 'uploads');
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with timestamp
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext);
    cb(null, `${basename}-${timestamp}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max
  },
});

/**
 * Create import router
 */
export function createImportRouter(db: Database): ReturnType<typeof express.Router> {
  const router = express.Router();

  // Create services
  const parser = new AmigaParserService();
  const validator = new ImportValidationService(db);
  const mapper = new ImportMappingService();
  const transactionService = new ImportTransactionService(db, parser, validator, mapper);

  // Setup progress event broadcasting (for WebSocket/SSE in future)
  transactionService.on('progress', (event) => {
    console.log(`[ImportAPI] Progress: ${event.sessionId} - ${event.progress}% - ${event.message}`);
    // TODO: Broadcast via WebSocket to connected admin clients
  });

  /**
   * POST /api/import/upload
   * Upload archive file and create import session
   */
  router.post('/upload', upload.single('archive'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No archive file provided' });
      }

      console.log('[ImportAPI] Upload received:', req.file.originalname);
      console.log('[ImportAPI] Saved to:', req.file.path);

      // Create import session
      const session = await transactionService.createSession(req.file.path);

      res.json({
        success: true,
        sessionId: session.id,
        filename: req.file.originalname,
        size: req.file.size,
      });
    } catch (error: any) {
      console.error('[ImportAPI] Upload error:', error);
      res.status(500).json({
        error: 'Upload failed',
        message: error.message,
      });
    }
  });

  /**
   * POST /api/import/validate/:sessionId
   * Validate archive and detect conflicts
   */
  router.post('/validate/:sessionId', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      console.log('[ImportAPI] Validating session:', sessionId);

      const result = await transactionService.validateSession(sessionId);

      res.json({
        success: true,
        valid: result.valid,
        validation: result.validationResults,
        conflicts: result.conflicts,
        summary: result.summary,
      });
    } catch (error: any) {
      console.error('[ImportAPI] Validation error:', error);
      res.status(500).json({
        error: 'Validation failed',
        message: error.message,
      });
    }
  });

  /**
   * GET /api/import/session/:sessionId
   * Get session status and details
   */
  router.get('/session/:sessionId', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const session = transactionService.getSession(sessionId);

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      res.json({
        success: true,
        session: {
          id: session.id,
          status: session.status,
          progress: session.progress,
          createdAt: session.createdAt,
          conflicts: session.conflicts,
          result: session.result,
        },
      });
    } catch (error: any) {
      console.error('[ImportAPI] Session status error:', error);
      res.status(500).json({
        error: 'Failed to get session status',
        message: error.message,
      });
    }
  });

  /**
   * GET /api/import/sessions
   * List all import sessions
   */
  router.get('/sessions', async (req: Request, res: Response) => {
    try {
      const sessions = transactionService.listSessions();

      res.json({
        success: true,
        sessions: sessions.map(s => ({
          id: s.id,
          status: s.status,
          progress: s.progress,
          createdAt: s.createdAt,
          archivePath: path.basename(s.archivePath),
        })),
      });
    } catch (error: any) {
      console.error('[ImportAPI] List sessions error:', error);
      res.status(500).json({
        error: 'Failed to list sessions',
        message: error.message,
      });
    }
  });

  /**
   * POST /api/import/execute/:sessionId
   * Execute import with conflict resolution options
   */
  router.post('/execute/:sessionId', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const options: ImportOptions = {
        userConflictStrategy: req.body.userConflictStrategy || 'skip',
        conferenceConflictStrategy: req.body.conferenceConflictStrategy || 'skip',
        commandConflictStrategy: req.body.commandConflictStrategy || 'skip',
        createBackup: req.body.createBackup !== false, // Default true
        forcePasswordReset: req.body.forcePasswordReset === true,
        importUsers: req.body.importUsers !== false,
        importConferences: req.body.importConferences !== false,
        importCommands: req.body.importCommands !== false,
        importConfig: req.body.importConfig !== false,
        importBulletins: req.body.importBulletins !== false,
        importScreens: req.body.importScreens !== false,
      };

      console.log('[ImportAPI] Executing import:', sessionId, options);

      // Execute import (async, returns immediately)
      const result = await transactionService.executeImport(sessionId, options);

      res.json({
        success: result.success,
        result: {
          usersImported: result.usersImported,
          conferencesImported: result.conferencesImported,
          commandsImported: result.commandsImported,
          errors: result.errors,
          warnings: result.warnings,
        },
      });
    } catch (error: any) {
      console.error('[ImportAPI] Import execution error:', error);
      res.status(500).json({
        error: 'Import failed',
        message: error.message,
      });
    }
  });

  /**
   * DELETE /api/import/session/:sessionId
   * Cancel and delete import session
   */
  router.delete('/session/:sessionId', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      console.log('[ImportAPI] Deleting session:', sessionId);

      await transactionService.deleteSession(sessionId);

      res.json({
        success: true,
        message: 'Session deleted',
      });
    } catch (error: any) {
      console.error('[ImportAPI] Delete session error:', error);
      res.status(500).json({
        error: 'Failed to delete session',
        message: error.message,
      });
    }
  });

  /**
   * POST /api/import/cancel/:sessionId
   * Cancel active import
   */
  router.post('/cancel/:sessionId', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      console.log('[ImportAPI] Cancelling import:', sessionId);

      transactionService.cancelImport(sessionId);

      res.json({
        success: true,
        message: 'Import cancelled',
      });
    } catch (error: any) {
      console.error('[ImportAPI] Cancel import error:', error);
      res.status(500).json({
        error: 'Failed to cancel import',
        message: error.message,
      });
    }
  });

  // TODO: Export endpoints
  // router.post('/export/create', async (req: Request, res: Response) => { ... });
  // router.get('/export/download/:exportId', async (req: Request, res: Response) => { ... });

  return router;
}
