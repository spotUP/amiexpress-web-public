import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { doorApiRouter } from '../doors/door-api-routes';
import { deploymentRouter } from '../api/deployment-routes';
import { doorRepoRouter } from './door-repo.routes';
import { getSystemTime } from '../utils/date-time.util';
import { getRepoRevision } from './repo-revision';

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

/**
 * Security headers via helmet.
 *
 * Mounted FIRST so every response — including CORS preflights, /health,
 * static assets, and /api/* — gets the standard hardening headers
 * (X-Frame-Options DENY, X-Content-Type-Options nosniff, HSTS,
 * Referrer-Policy, etc.) without per-route plumbing.
 *
 * CSP is shipped in REPORT-ONLY mode. Browsers honour the policy and
 * post violations to /api/csp-report (see endpoint below) but don't
 * block resources. Once a few production sessions confirm zero
 * violations, flip `reportOnly: false` to enforce.
 *
 * Directive choices (per asset audit 2026-05-05):
 *  - default-src 'self' — backend serves frontend in prod, all assets
 *    same-origin via /assets/* and /fonts/*.
 *  - script-src 'self' — bundled React/xterm/socket.io, no CDNs, no
 *    inline <script>, no eval / dangerouslySetInnerHTML.
 *  - style-src 'self' 'unsafe-inline' — index.html has an inline
 *    <style> block; React components use the style={{...}} prop
 *    (DOM style attribute, requires unsafe-inline in CSP2).
 *  - img-src 'self' data: — favicon is a data: URI SVG.
 *  - connect-src 'self' — socket.io connects to same-origin in prod;
 *    'self' covers WebSocket on same origin per CSP3.
 *  - frame-ancestors 'none' — modern X-Frame-Options DENY equivalent.
 *  - object-src 'none', base-uri 'self' — defang plugin / base-tag
 *    injection attacks even though we don't use plugins.
 *
 * crossOriginEmbedderPolicy: false stays disabled (separate hardening
 * pass — would require CORP headers on every static asset).
 *
 * Everything else (frameguard / hsts / noSniff / referrerPolicy /
 * permissionsPolicy / dnsPrefetchControl / hidePoweredBy / etc.) runs
 * with helmet defaults.
 */
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      workerSrc: ["'none'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      reportUri: ['/api/csp-report'],
    },
    reportOnly: true,
  },
  crossOriginEmbedderPolicy: false,
}));

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

// CSP violation reporter — browsers POST violations here while the
// policy is in report-only mode. Accept both legacy (CSP2)
// `application/csp-report` bodies and the new (Reporting API)
// `application/reports+json` arrays so we don't drop reports based on
// browser version. Logged to logs/csp-violations.log for the post-
// deploy audit; once the log shows zero violations across real
// sessions, flip reportOnly:false in helmet config above.
app.use(
  '/api/csp-report',
  express.json({
    type: ['application/csp-report', 'application/reports+json', 'application/json'],
    limit: '64kb',
  }),
);
app.post('/api/csp-report', (req, res) => {
  try {
    const reports = Array.isArray(req.body) ? req.body : [req.body];
    const cspLogPath = path.join(logsDir, 'csp-violations.log');
    for (const report of reports) {
      const line = `[CSP-VIOLATION] ${getSystemTime().toISOString()} ${JSON.stringify(report)}\n`;
      fs.appendFileSync(cspLogPath, line, { encoding: 'utf8' });
    }
  } catch (_) {
    /* never let a malformed report propagate as a 5xx */
  }
  res.status(204).end();
});

// Health check endpoint. Includes the git SHA embedded at image build
// time so monitoring + smoke tests can verify "is this the commit I
// expect?" via a single HTTP call. Falls back to "unknown" for local
// dev where the file isn't written (docker-compose default for non-CI
// builds).
//
// The read-'/app/.git-sha'-with-'unknown'-fallback logic (memoized in its
// own module-level `_cachedGitSha` variable) lives in repo-revision.ts —
// getRepoRevision() — so it's a single source of truth shared with the
// door-repo manifest builder (door-repo-manifest.ts), which needs the same
// revision string but can't import this file (app.ts pulls in the entire
// express/helmet/cors/log-stream stack at import time).
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: getSystemTime().toISOString(),
    revision: getRepoRevision(),
  });
});

app.get('/api', (req, res) => {
  res.json({ message: 'AmiExpress Backend API' });
});

// Door API routes
app.use('/api', doorApiRouter);

// Deployment API routes
app.use('/api', deploymentRouter);

// Door Repo API routes — read-only manifest/list.txt/archive/health
app.use('/api/door-repo', doorRepoRouter);

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
