import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { doorApiRouter } from '../doors/door-api-routes';
import { deploymentRouter } from '../api/deployment-routes';
import { getSystemTime } from '../utils/date-time.util';

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

// Configure CORS with centralized origin list (includes production domains)
// Uses config.corsOrigins which already includes https://bbs.uprough.net
const corsOrigins = config.get('corsOrigins') as string[];

console.log('[CORS] NODE_ENV:', process.env.NODE_ENV);
console.log('[CORS] Configured origins:', corsOrigins);

app.use(cors({
  origin: (origin, callback) => {
    // Silence health check CORS logs (no origin = internal requests)
    // Only log if there's an actual origin header
    if (origin) {
      console.log('[CORS] Request origin:', origin);
    }

    // Allow requests with no origin (mobile apps, Postman, curl, telnet clients, same-origin requests, health checks)
    if (!origin) {
      return callback(null, true);
    }

    // Development mode: allow all origins (convenience)
    if (process.env.NODE_ENV === 'development') {
console.log('[CORS] Development mode - allowing all origins');
      return callback(null, true);
    }

        // Production mode: check against configured origins
        if (corsOrigins.includes(origin)) {
          console.log('[CORS] Origin allowed:', origin);
          callback(null, true);
        } else {
          console.warn(`[CORS] BLOCKED request from unauthorized origin: ${origin}`);
          console.warn(`[CORS] Allowed origins:`, corsOrigins);
          const error = new Error('Not allowed by CORS');
          (error as any).statusCode = 403;
          callback(error);
        }
      },
      credentials: true,  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

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
    const line = `[ACCESS] ${getSystemTime().toISOString()} ${req.ip || (req as any).socket?.remoteAddress || '-'} ${req.method} ${req.originalUrl || req.url} ${res.statusCode} ${duration}ms\n`;
    accessStream.write(line);
  });
  next();
});

// Parse JSON bodies
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: getSystemTime().toISOString() });
});

app.get('/api', (req, res) => {
  res.json({ message: 'AmiExpress Backend API' });
});

// Door API routes
app.use('/api', doorApiRouter);

// Deployment API routes
app.use('/api', deploymentRouter);

// Debug-MCP routes — dev-only, read-only introspection for the MCP sidecar.
// See mcp-server-debug/ and web/backend/src/debug/debug-mcp.routes.ts.
if (process.env.NODE_ENV !== 'production') {
  try {
    const { createDebugMcpRouter } = require('../debug/debug-mcp.routes');
    const bbsRoot = process.env.BBS_DATA_DIR || path.resolve(__dirname, '../../../..');
    app.use('/debug/api', createDebugMcpRouter(bbsRoot));
    console.log('[debug-mcp] endpoints mounted at /debug/api (NODE_ENV=' + (process.env.NODE_ENV || 'unset') + ')');
  } catch (err) {
    console.warn('[debug-mcp] failed to mount:', err);
  }
}

// Error logger + responder (HTTP)
const errorLogPath = path.join(logsDir, 'error.log');
app.use(
  (err: any, req: Request & { originalUrl?: string }, res: Response, next: NextFunction) => {
    try {
      const line = `[ERROR] ${getSystemTime().toISOString()} ${req.method} ${req.originalUrl || req.url} ${err?.message || err}\n`;
      fs.appendFileSync(errorLogPath, line, { encoding: 'utf8' });
    } catch (_) {
      /* ignore logging failures */
    }

    // Don't send response if headers already sent
    if (res.headersSent) {
      return next(err);
    }

    const statusCode = err.statusCode || 500;
    const message = process.env.NODE_ENV === 'production' && statusCode === 500
      ? 'Internal Server Error'
      : (err.message || 'Internal Server Error');

    res.status(statusCode).json({ error: message });
  }
);

export default app;
