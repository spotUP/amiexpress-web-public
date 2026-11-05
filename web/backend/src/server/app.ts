import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { doorApiRouter } from '../doors/door-api-routes';
import { deploymentRouter } from '../api/deployment-routes';
import { doorAdminRouter, doorAdminBodyError } from './door-admin.routes';
import { doorRepoRouter, isDoorRepoProxyEnabled } from './door-repo.routes';
import { doorRepoCors, isDoorRepoPath } from './door-repo-cors';
import { getSystemTime } from '../utils/date-time.util';
import { getRepoRevision } from './repo-revision';
import { sessions } from './session-manager';
import { isParked } from './session-parking';
import { ftpCallersOnline } from '../ftp/ftp-presence';
import { batchQueueDepth } from '../services/batch-scheduler';
import { BBSState } from '../constants/bbs-states';
import { boardRoot } from '../utils/board-root.util';

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
 *  - script-src 'self' 'wasm-unsafe-eval' — bundled React/xterm/
 *    socket.io, no CDNs, no inline <script>, no eval. wasm-unsafe-eval
 *    is for the TrackerEngine's libopenmpt AudioWorklet (mod/xm music
 *    in client doors), which compiles a same-origin wasm module;
 *    without it, enforcing this policy silences every tracker door.
 *  - style-src 'self' 'unsafe-inline' — index.html has an inline
 *    <style> block; React components use the style={{...}} prop
 *    (DOM style attribute, requires unsafe-inline in CSP2).
 *  - img-src 'self' data: — favicon is a data: URI SVG.
 *  - connect-src 'self' — socket.io connects to same-origin in prod;
 *    'self' covers WebSocket on same origin per CSP3.
 *  - worker-src 'self' blob: — Tone.js (SDK AudioEngine, bundled into
 *    client doors) spins up a blob: worker for its clock; AudioWorklet
 *    module loads ride script-src, not worker-src.
 *  - frame-ancestors 'self' — the board frames ITSELF: the emulator
 *    surface (EmulatorOverlay -> /beeb/) is a same-origin iframe over the
 *    terminal. This was 'none', the DENY equivalent, which reported a
 *    violation on every launch and would have blocked the emulator outright
 *    the day this policy stops being report-only. 'self' keeps every
 *    OUTSIDE site from framing the board, which is what the directive is
 *    for; it does not let anyone else in.
 *    NOTE: the live host's Caddyfile sets these headers too and is not in
 *    this repo. Changing it here is only half the job on the live board.
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
      scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      workerSrc: ["'self'", 'blob:'],
      // The webcam arrives as a MediaStream and is attached to a <video> as
      // a blob: URL. Without this, default-src caught it and the browser
      // reported a violation on every video call - harmless while the policy
      // is report-only, and a broken camera the moment it is enforced.
      mediaSrc: ["'self'", 'blob:', 'data:'],
      frameAncestors: ["'self'"],
      formAction: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      reportUri: ['/api/csp-report'],
    },
    reportOnly: true,
  },
  crossOriginEmbedderPolicy: false,
}));

// The public door-repo API gets its own cross-origin policy, and it has to
// be installed BEFORE the global one: the global policy REJECTS an unknown
// origin with 403, so a browser client would never reach the router below no
// matter what the router itself said. See door-repo-cors.ts for why a public
// read-only catalog wants a different shape from the BBS's own API.
app.use('/api/door-repo', doorRepoCors);

// Configure CORS with centralized origin list (includes production domains)
// Uses config.corsOrigins which already includes https://bbs.uprough.net
const corsOrigins = config.get('corsOrigins') as string[];

console.log('[CORS] NODE_ENV:', process.env.NODE_ENV);
console.log('[CORS] Configured origins:', corsOrigins);

const globalCors = cors({
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
});

// Everything except the public catalog goes through the allowlist. The
// door-repo paths are skipped rather than allowlisted because the two
// policies are contradictory by design - allowlist+credentials for the BBS,
// wildcard and no credentials for a catalog anyone may write a client for -
// and running both would leave the response carrying half of each.
app.use((req, res, next) => {
  if (isDoorRepoPath(req.path)) {
    return next();
  }
  /*
   * A request from the page this server itself served is not cross-origin,
   * whatever port it is on. Browsers send `Origin` on same-origin fetches and
   * on stylesheet/script loads too, so a board on any port but the ones in
   * the allowlist answered its OWN admin bundle with
   * `{"error":"Not allowed by CORS"}` - the sysop's test server on 3011 could
   * not load its stylesheet. Same-origin is decided against the request's own
   * Host; the allowlist still rules every other origin.
   */
  const origin = req.get('origin');
  const self = `${req.protocol}://${req.get('host') ?? ''}`.toLowerCase();
  if (origin && origin.toLowerCase() === self) {
    return next();
  }
  return globalCors(req, res, next);
});

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
  /*
   * `callers` is here so a DEPLOY can refuse to drop people.
   *
   * Recreating the container ends every session on the board - the sysop's
   * words on 2026-09-07: "we are throwing users out of the live bbs". A
   * deploy has no way to know whether that costs somebody a half-typed
   * message or nothing at all, so the board answers the question itself, on
   * the endpoint the deploy already reads for the revision.
   *
   * Counted: a caller who has LOGGED ON, over any transport, plus anyone on
   * over FTP (an FTP session holds a node but has no BBSSession - see
   * ftp/ftp-presence.ts). A connection that has not logged on yet is not
   * counted: it is a port scanner or a login prompt nobody is sitting at, and
   * blocking deploys on those would block them for ever.
   */
  const loggedOn = Array.from(sessions.values()).filter(
    (session) => session.state === BBSState.LOGGEDON && session.user
  );
  // A parked web session (dropped, inside its resume window) is listed apart:
  // nobody is attached to it, so `callers` counts only attached callers.
  const attached = loggedOn.filter((session) => !isParked(session));
  const detached = loggedOn.length - attached.length;
  const ftp = ftpCallersOnline();

  res.json({
    status: 'ok',
    timestamp: getSystemTime().toISOString(),
    revision: getRepoRevision(),
    callers: attached.length + ftp.length,
    detached,
    /*
     * `batch` is here for the same reason `callers` is: so a DEPLOY can
     * refuse to interrupt something.
     *
     * The logoff batch is seven 68K doors, run one at a time, and it is what
     * rebuilds every bulletin on the board. It outlives the caller
     * deliberately (handleGoodbyeCommand's 3 s grace), so it is usually
     * running with NOBODY on the board - which is exactly when the deploy
     * decides it is safe to recreate the container. On 2026-09-14 that is
     * what happened: the batch finally ran for the first time, reached
     * MultiTop, and a deploy killed it mid-door. The bulletins had not
     * changed since 18:40 and still had not afterwards.
     *
     * Zero means nothing is queued or running and a recreate costs nothing.
     */
    batch: batchQueueDepth(),
    // Named, because "3 callers" and "3 callers, one of them you" are
    // different decisions for whoever is about to deploy.
    online: [
      ...loggedOn.map((session) => ({
        username: session.user?.username ?? 'unknown',
        nodeId: session.nodeId ?? 0,
        transport: session.connectionType ?? 'web',
        // When this session connected. A caller listed for hours after
        // everyone left is a session the logoff never removed (2026-10-05:
        // `regress` stayed listed for 50 minutes after its logoff and
        // blocked every deploy); this is what tells the two apart.
        since: session.connectionStart ? new Date(session.connectionStart).toISOString() : null,
        // A parked session (dropped, inside its resume window): listed so the
        // sysop sees it, flagged so the deploy guard does not wait for it
        // (deploy/caller-guard.sh; session-persistence plan, Decision 22).
        detached: isParked(session),
      })),
      ...ftp.map((caller) => ({
        username: caller.username,
        nodeId: caller.nodeId,
        transport: 'ftp',
      })),
    ],
  });
});

app.get('/api', (req, res) => {
  res.json({ message: 'AmiExpress Backend API' });
});

// WEB_ plain-HTTP Text-TV proxy (services/texttv-proxy.service.ts).
// api.texttv.nu is HTTPS-only; 68K doors and classic Amigas cannot do
// TLS, so the board fetches over TLS and serves the verbatim JSON array
// here. Public and read-only like /health above: validated page range,
// 502 when the mirror is silent (a door reports that, not a blank page).
app.get('/api/texttv/:page', async (req, res) => {
  const raw = String(req.params.page ?? '');
  if (!/^\d{3}$/.test(raw)) {
    res.status(400).json({ success: false, message: 'page is 100-999' });
    return;
  }
  const page = Number(raw);
  if (page < 100 || page > 999) {
    res.status(400).json({ success: false, message: 'page is 100-999' });
    return;
  }
  try {
    const { fetchTextTvPage } = await import('../services/texttv-proxy.service');
    const { status, body } = await fetchTextTvPage(page);
    if (status !== 200) throw new Error(`upstream answered ${status}`);
    res.type('application/json').send(body);
  } catch (err) {
    res.status(502).json({ success: false, message: 'Text-TV did not answer' });
  }
});

// Door API routes
app.use('/api', doorApiRouter);

// Deployment API routes
app.use('/api', deploymentRouter);

// Door Repo API routes — proxied to the standalone door server.
// Gate is "is a door server configured" (DOOR_SERVER_URL non-empty), not
// "is this BBS the repo owner" — the catalog and archive corpus moved to
// github.com/spotUP/amiexpress-doorserver. When no door server is
// configured, simply don't mount the router — the paths must 404 via
// Express's default "no route matched", not a custom response, so a
// disabled feature isn't advertised.
if (isDoorRepoProxyEnabled()) {
  app.use('/api/door-repo', doorRepoRouter);
}

// This board's own door management API — the DoorRepo C door reports what
// it installed here, guarded by its per-launch token (door-launch-token.ts).
// NOT /api/doors: that prefix is door-api-routes.ts above, which serves
// browsers with no token at all, and this router's auth middleware would
// 401 every one of those requests if mounted on the same path.
//
// A body-parser failure (malformed JSON, a body over the limit, a bare
// JSON string) never reaches the router, so it would otherwise fall
// through to the global JSON error handler below. doorAdminBodyError
// (door-admin.routes.ts) intercepts it and answers plain text instead -
// the client here is a C89 door that reads plain text with CRLF, never
// JSON, on any path.
app.use('/api/door-admin', express.json({ limit: '16kb' }), doorAdminBodyError, doorAdminRouter);

// Debug-MCP routes — dev-only, read-only introspection for the MCP sidecar.
// See dev/mcp/debug/ and web/backend/src/debug/debug-mcp.routes.ts.
if (process.env.NODE_ENV !== 'production') {
  try {
    const { createDebugMcpRouter } = require('../debug/debug-mcp.routes');
    const bbsRoot = boardRoot();
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
