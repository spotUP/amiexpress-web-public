import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { doorApiRouter } from '../doors/door-api-routes';
import { deploymentRouter } from '../api/deployment-routes';

/**
 * Express Application Setup
 *
 * Initializes the Express app with middleware and basic configuration.
 * This module handles:
 * - CORS configuration
 * - JSON body parsing
 * - Basic health check endpoint
 * - Door API routes for client door bundling
 * - Deployment and health check routes
 */

export const app = express();

// Configure CORS
app.use(cors());

// Access log (HTTP only; telnet/ssh handled elsewhere)
const projectRoot = path.resolve(__dirname, '../../../..');
const logsDir = path.join(projectRoot, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}
const accessLogPath = path.join(logsDir, 'access.log');
const accessStream = fs.createWriteStream(accessLogPath, { flags: 'a' });
app.use((req: Request & { originalUrl?: string; ip?: string }, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const line = `[ACCESS] ${new Date().toISOString()} ${req.ip || (req as any).socket?.remoteAddress || '-'} ${req.method} ${req.originalUrl || req.url} ${res.statusCode} ${duration}ms\n`;
    accessStream.write(line);
  });
  next();
});

// Parse JSON bodies
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api', (req, res) => {
  res.json({ message: 'AmiExpress Backend API' });
});

// Door API routes
app.use('/api', doorApiRouter);

// Deployment API routes
app.use('/api', deploymentRouter);

// Error logger + responder (HTTP)
const errorLogPath = path.join(logsDir, 'error.log');
app.use(
  (err: any, req: Request & { originalUrl?: string }, res: Response, next: NextFunction) => {
    try {
      const line = `[ERROR] ${new Date().toISOString()} ${req.method} ${req.originalUrl || req.url} ${err?.message || err}\n`;
      fs.appendFileSync(errorLogPath, line, { encoding: 'utf8' });
    } catch (_) {
      /* ignore logging failures */
    }
    res.status(500).json({ error: 'Internal Server Error' });
    next(err);
  }
);

export default app;
