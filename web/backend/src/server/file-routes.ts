import express, { Request, Response } from 'express';
import multer from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';
import { db } from '../database';
import { getConferenceDir } from '../utils/file-hold.util';

/**
 * File Upload/Download Routes
 *
 * Handles file operations including:
 * - BBS file uploads
 * - Door package uploads
 * - File downloads
 */

export const fileRouter = express.Router();

// File upload configuration
// Express.e uses Node#/Playpen for uploaded files (express.e:19573-19584)
const playpenStorage = multer.diskStorage({
  destination: (req: any, file: any, cb: (error: Error | null, destination: string) => void) => {
    try {
      // Use Node0/Playpen for uploads (express.e uses ramPen or Node#/Playpen)
      const playpenDir = path.join(config.get('dataDir'), 'Node0', 'Playpen');

console.log('[Upload] BBS data directory:', config.get('dataDir'));
console.log('[Upload] Playpen directory:', playpenDir);

      // Ensure directory exists
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
      // Use original filename (already validated in UPLOAD_FILENAME_INPUT handler)
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

// File upload endpoint with error handling
fileRouter.post('/upload', (req: Request, res: Response) => {
console.log('[Upload] Upload request received from:', req.headers.origin);

  // Use multer middleware with error handling
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
fileRouter.post('/upload/door', (req: Request, res: Response) => {
console.log('[Door Upload] Upload request received from:', req.headers.origin);

  // Use multer middleware with 'door' field name
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

// File download endpoint - express.e:20075+ (downloadAFile)
fileRouter.get('/download/:fileId', async (req: Request, res: Response) => {
  try {
    const fileId = parseInt(req.params.fileId);

    if (isNaN(fileId)) {
      return res.status(400).json({ error: 'Invalid file ID' });
    }

    // Get file info from database
    const fileEntry = await db.getFileEntry(fileId);

    if (!fileEntry) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Determine file path
    // Files can be in: active directory, private directory, or hold directory
    // Try to find the file in these locations
    const conferencePath = getConferenceDir(fileEntry.conferenceId || 1, config.get('dataDir'));

    let filePath: string | null = null;
    const possiblePaths = [
      // Try stored path first if available
      fileEntry.filePath,
      // Try active file area directory
      path.join(conferencePath, `Dir${fileEntry.areaId}`, fileEntry.filename),
      // Try Node0/Playpen (recent uploads)
      path.join(config.get('dataDir'), 'Node0', 'Playpen', fileEntry.filename),
      // Try HOLD directory (failed tests)
      path.join(conferencePath, 'HOLD', fileEntry.filename),
      // Try PRIVATE directory
      path.join(conferencePath, 'PRIVATE', fileEntry.filename)
    ].filter(p => p); // Filter out null/undefined

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

    // Set headers for file download
    res.setHeader('Content-Disposition', `attachment; filename="${fileEntry.filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', fileEntry.size.toString());

    // Stream file to client
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

    // Note: Download statistics are updated when frontend sends 'file-download-started' event
    // This matches express.e flow where statistics are updated after transfer

  } catch (error) {
console.error('[Download] Error:', error);
    res.status(500).json({ error: 'Download failed' });
  }
});

export default fileRouter;
