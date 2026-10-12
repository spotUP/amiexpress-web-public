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
import { boardRoot, codeRoot } from '../utils/board-root.util';
import express from 'express';
import { db } from '../database';
import { config } from '../config';
import { AuthHandler } from '../handlers/user/auth.handler';
import { SessionLogsHandler } from '../handlers/admin/session-logs.handler';
import { authenticateToken, requireSysop, requireLevel, AuthRequest } from '../middleware/auth.middleware';
import { isPlainFileName } from '../utils/plain-file-name.util';
import { redeemUploadTicket, redeemAreaDownloadTicket, type OnServed } from '../handlers/file/download-ticket';
import { getSession } from './session-manager';
import { createConfigRouter } from '../api/config-routes';
import { createDoorArtRouter } from '../api/door-art-routes';
import { createBatchRouter } from '../api/batch-routes';
import { createImportRouter } from '../handlers/admin/import.handler';
import { createChatRouter } from '../api/chat-routes';
import { createWhipRouter } from '../api/whip-routes';
import { createBotDataRouter } from '../api/bot-data-routes';
import { authenticateServiceToken, authenticateBotToken } from '../middleware/service-auth.middleware';
import { createStatisticsRouter } from '../api/statistics-routes';
import { createNodeControlRouter } from '../api/node-control-routes';
import { enhancePrompt, analyzePrompt, enhanceAudioDescription, analyzeAudioDescription, generateGame } from '../handlers/admin/wizard.handler';
import { reloadDoorCommands } from '../handlers/command-execution.handler';
import { getConferenceDir } from '../utils/file-hold.util';
import { webTerminalGate, isReservedPath } from './web-terminal-gate';
import { bareEmulatorPage } from './beeb-bare-page';
import { ROM_COOKIE, romAccessHolder, cookieValue, queryWithoutGrant } from './beeb-rom-access';
import { AdminPermissionsHandler } from '../handlers/admin/admin-permissions.handler';
import { SpriteManagerHandler } from '../handlers/admin/sprite-manager.handler';
import { materialiseCatalogEntry, storageFailureText } from '../storage/remote-download';
import { resolveFile } from '../handlers/transfer/batch-download.handler';
import { getStorageContext } from '../storage/storage-context';

// Initialize handlers
const authHandler = new AuthHandler(db);
const sessionLogsHandler = new SessionLogsHandler();
const adminPermsHandler = new AdminPermissionsHandler();
const spriteManagerHandler = new SpriteManagerHandler();

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
      // One plain name: a client's `../../x` must not be joined above the
      // playpen. The directory part a browser may send is dropped.
      const name = path.basename(String(file.originalname ?? '').replace(/\\/g, '/'));
      if (!isPlainFileName(name)) return cb(new Error('That is not a file name the board can store'), '');
console.log('[Upload] Storing file as:', name);
      cb(null, name);
    } catch (error) {
console.error('[Upload] Error setting filename:', error);
      cb(error as Error, '');
    }
  }
});

/*
 * The size cap is the board's `maxFileSize` setting, read per request. It was
 * a second literal 10 MB here while the setting sat in config.ts read by
 * nothing, so changing the setting changed no upload.
 */
const upload = {
  single: (field: string) => multer({
    storage: playpenStorage,
    limits: { fileSize: config.get('maxFileSize') },
  }).single(field),
};

/**
 * Register all HTTP routes on the Express app
 * @param app - Express application instance
 * @param io - Socket.IO server instance (for real-time features)
 */
/**
 * What an unreachable volume tells an unauthenticated caller. The real detail
 * goes to the log - a backend's message can carry a bucket name, an endpoint
 * or a key id, and none of that is the downloader's business.
 */
const STORAGE_UNAVAILABLE_BODY = 'File storage is unavailable - try again later';

/**
 * Send one file as an attachment, from a real path on local disk.
 *
 * Shared by the local and the pooled branches so a pooled download is
 * byte-identical to a local one - same headers, same stream, same guards.
 * Without an error handler the stream emits 'error' as an unhandled
 * EventEmitter error, which kills the Node process, so both the readable and
 * the response are guarded: a client disconnect (EPIPE/ECONNRESET) or a
 * mid-read disk error must never crash the server.
 */
function streamDownload(res: Response, filePath: string, filename: string, size: number, onServed?: OnServed): void {
console.log(`[Download] Serving file: ${filename} from ${filePath} (${size} bytes)`);

  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Length', size.toString());

  const fileStream = fs.createReadStream(filePath);
  fileStream.on('error', (err) => {
    console.error('[Download] Stream read error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'File read error' });
    else res.destroy();
  });
  res.on('error', (err) => {
    console.error('[Download] Response write error (client disconnect?):', err.message);
    fileStream.destroy();
  });
  // The board's own measure of the transfer: the stream's start to the last
  // byte handed to the connection (express.e times its own transfers,
  // 15946-15953). A browser that hangs up early gets no figure.
  const started = Date.now();
  res.on('finish', () => onServed?.(size, Date.now() - started));
  fileStream.pipe(res);
}

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
  app.get('/auth/me', authenticateToken(db), (req: Request, res: Response) =>
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

  // ===== WHIP mirror bot API - service-token (shared secret, not a user JWT)
  const whipRouter = createWhipRouter(db);
  app.use('/api/whip', authenticateServiceToken, whipRouter);

  // ===== WEB_BOT_DATA chatbot reads - per-bot service tokens, GET only.
  // bbsRoot is projectRoot here (see below); mounted before its
  // declaration, so resolve the same way. Mounted bare of JWT: the bot
  // token is the auth.
  app.use('/api/bot/v1', authenticateBotToken, createBotDataRouter(db, {
    bbsRoot: boardRoot(),
  }));

  // ===== Bot plugin admin API - sysop JWT like every other /api/config route
  const { createBotPluginRouter } = require('../api/bot-plugin-routes');
  app.use('/api/config/bots', authenticateToken(db), requireSysop(), createBotPluginRouter(db));

  // ===== File lists - the admin file manager (sysop) =====
  // The same services/file-list.service FM uses at the prompt.
  const { createFileListRouter } = require('../api/file-list-routes');
  app.use('/api/files', authenticateToken(db), requireSysop(), createFileListRouter(db));

  // ===== Import/Export API - Sysop-only Routes =====
  const importRouter = createImportRouter(db);
  app.use('/api/import', authenticateToken(db), requireSysop(), importRouter);

  // ===== Info Editor API - Sysop-only Routes =====
  const { infoEditorRouter } = require('../api/info-editor-routes');
  app.use('/api/info-editor', authenticateToken(db), requireSysop(), infoEditorRouter);

  // ===== Screen Files API - Screen-editor level required =====
  const { screensRouter } = require('../api/screens-routes');
  app.use('/api/screens', authenticateToken(db), requireLevel(100), screensRouter);

  // ===== Door art - the ARTIST lane =====
  // Level 100 is this board's ANSI artists, and the Studio lists a door's
  // art beside the screen files they already edit. These were under
  // /api/config behind requireSysop(), so an artist saw the card and got a
  // 403 on the canvas. Every call is scoped to the sections a door's
  // manifest declares as ART - no setting is reachable through them.
  app.use('/api/door-art', authenticateToken(db), requireLevel(100), createDoorArtRouter());

  // ===== Screen Themes API - the same gate, because a theme IS a set of
  // screens: this decides which sets exist and who owns them, the screen
  // editor writes the files, and both enforce the same ownership rule.
  const { themesRouter } = require('../api/theme-routes');
  app.use('/api/themes', authenticateToken(db), requireLevel(100), themesRouter);
  // The new-user questionnaire: read by any admin, written by a sysop (the
  // router checks the level itself on every write).
  const { questionnaireRouter } = require('../api/questionnaire-routes');
  app.use('/api/questionnaire', authenticateToken(db), requireLevel(100), questionnaireRouter);

  // ===== Admin Permissions API - Sysop-only =====
  app.get('/api/admin-permissions', authenticateToken(db), requireSysop(), (req: Request, res: Response) =>
    adminPermsHandler.get(req, res)
  );
  app.put('/api/admin-permissions', authenticateToken(db), requireSysop(), (req: Request, res: Response) =>
    adminPermsHandler.put(req as AuthRequest, res)
  );

  // ===== Sprite Manager API - Sysop-only =====
  app.get('/api/sprite-manager/doors', authenticateToken(db), requireSysop(), (req: Request, res: Response) =>
    spriteManagerHandler.listDoors(req, res)
  );
  app.get('/api/sprite-manager/:door/sprites', authenticateToken(db), requireSysop(), (req: Request, res: Response) =>
    spriteManagerHandler.listSprites(req as AuthRequest, res)
  );
  app.get('/api/sprite-manager/:door/sprite/:file', authenticateToken(db), requireSysop(), (req: Request, res: Response) =>
    spriteManagerHandler.readSprite(req as AuthRequest, res)
  );
  app.put('/api/sprite-manager/:door/sprite/:file', authenticateToken(db), requireSysop(), (req: Request, res: Response) =>
    spriteManagerHandler.writeSprite(req as AuthRequest, res)
  );
  app.delete('/api/sprite-manager/:door/sprite/:file', authenticateToken(db), requireSysop(), (req: Request, res: Response) =>
    spriteManagerHandler.deleteSprite(req as AuthRequest, res)
  );

  // ===== Bulls Menu API - Sysop-only (Bulls.CFG for the 68K Bulls door) =====
  const { createBullsRouter } = require('../api/bulls-routes');
  app.use('/api/config/bulls', authenticateToken(db), requireSysop(), createBullsRouter(boardRoot()));

  // ===== Chat API - Public Routes (for web chat authentication) =====
  const chatRouter = createChatRouter(db);
  app.use('/api/chat', chatRouter);

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
  // NOT boardRoot(). This is where the BUILT BUNDLES are - web/frontend/dist,
  // web/config-app/dist, the SDK's docs - which live with the code, while the
  // board's own files live on a volume that BBS_DATA_DIR names. Reading the
  // board's root here would serve the admin app out of /app/data/bbs, where
  // there is no admin app. BBS_ROOT still overrides, for a host that keeps
  // the checkout somewhere unusual.
  const projectRoot = codeRoot();

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

  // --- BBC Micro emulator (vendored jsbeeb) --------------------------------
  //
  // Served as its own program at /beeb/, not compiled into anything here:
  // jsbeeb is GPL-3 and this repository is not, so it is aggregated rather
  // than linked. See vendor/jsbeeb/NOTICE.md.
  //
  // The three media paths are deliberately NOT served from the vendored
  // bundle. jsbeeb ships Acorn's copyrighted ROMs and a pile of disc images;
  // neither is ours to redistribute, so the vendored copy has them stripped
  // and these routes point at the BOARD instead - the sysop's own ROMs and
  // the software they have the right to run. Same policy KickstartRom.ts
  // already sets for the Amiga.
  const jsbeebPath = join(projectRoot, 'vendor', 'jsbeeb');
  if (fs.existsSync(jsbeebPath)) {
    const beebRoot = join(boardRoot(), 'Beeb');
    // What the emulator actually asked for, and what it got. A BBC that
    // boots to a black screen gives the caller nothing to report and the
    // sysop nothing to look at; the failing fetch is the whole diagnosis,
    // and it is invisible without this.
    app.use('/beeb', (req, res, next) => {
      const path = req.path;
      // The page and its media only - not every hashed asset.
      if (/^\/(roms|discs|tapes)\//.test(path) || path === '/' || path === '/index.html') {
        res.on('finish', () => {
          const level = res.statusCode >= 400 ? '[Beeb] MISS' : '[Beeb]     ';
          console.log(`${level} ${res.statusCode} ${req.method} /beeb${path}`);
        });
      }
      next();
    });

    /*
     * THE ROMS ARE NOT PUBLIC, AND THE PROOF DEPENDS ON IT.
     *
     * Callers are asked to show they own the BBC ROMs before they may use
     * the machine. If this route stayed open static serving, anyone could
     * simply fetch the file they were being asked to produce, and the whole
     * arrangement would be decoration.
     *
     * The token comes in on the emulator page's query and is turned into a
     * cookie there, because the emulator asks for its own ROMs by relative
     * path from inside a vendored bundle - there is nowhere to hang a query
     * parameter on those requests.
     */
    const romGate: express.RequestHandler = (req, res, next) => {
      const token = cookieValue(req.headers.cookie, ROM_COOKIE);
      if (romAccessHolder(token)) return next();
      res
        .status(403)
        .type('text/plain')
        .send('Run the BEEB door and show your own copy of the ROMs first.\n');
    };

    const media: Array<[string, string, express.RequestHandler[]]> = [
      ['/beeb/roms', join(beebRoot, 'roms'), [romGate]],
      ['/beeb/discs', join(beebRoot, 'software'), []],
      ['/beeb/tapes', join(beebRoot, 'software'), []],
    ];
    for (const [route, dir, guards] of media) {
      // fallthrough:false is the whole point. With it on, a ROM the sysop
      // has not installed falls past this route to the SPA and comes back
      // as 200 text/html - and the emulator then tries to parse the
      // terminal's index page as a ROM image and shows a black screen. A
      // missing file has to say 404.
      app.use(route, webTerminalGate, ...guards, express.static(dir, { maxAge: 0, fallthrough: false }));
    }
    // The page itself, with the emulator's own interface hidden - see
    // beeb-bare-page.ts for why this happens here and not in the vendored
    // files. Registered BEFORE the static handler so it wins for the page,
    // while every other file still comes straight off disk.
    const barePage = (() => {
      let cached: string | null = null;
      return (): string | null => {
        if (cached !== null) return cached;
        try {
          cached = bareEmulatorPage(fs.readFileSync(join(jsbeebPath, 'index.html'), 'utf8'));
        } catch {
          cached = null;
        }
        return cached;
      };
    })();

    app.get(['/beeb', '/beeb/', '/beeb/index.html'], webTerminalGate, (req, res, next) => {
      const page = barePage();
      if (!page) return next();

      /*
       * THE GRANT ARRIVES ON THE URL AND LEAVES ON A COOKIE.
       *
       * It comes in as `grant` - never as `rom`, which is the emulator's own
       * parameter for extra ROM images and would send it looking for a file
       * by that name. Once it is a cookie the URL is redirected WITHOUT it,
       * so the token stops riding in the address bar, the history and the
       * referer of everything the page fetches.
       *
       * That last part is not hypothetical: jsbeeb's page reported its own
       * URL to Google Analytics, grant and all, until the tag was stripped
       * (beeb-bare-page.ts). Belt as well as braces.
       */
      const offered = typeof req.query.grant === 'string' ? req.query.grant : undefined;
      if (offered && romAccessHolder(offered)) {
        res.cookie?.(ROM_COOKIE, offered, {
          httpOnly: true,
          sameSite: 'lax',
          path: '/beeb',
          maxAge: 30 * 60 * 1000,
        });

        /*
         * THE REST OF THE QUERY IS PASSED THROUGH BYTE FOR BYTE.
         *
         * Not re-serialised. URLSearchParams writes a space as `+`, which is
         * correct for form encoding and wrong for this: jsbeeb does not read
         * `+` as a space, so `autotype=CHAIN%20%22GOMOKU%22` came back as
         * `CHAIN+"GOMOKU"` and the machine dutifully typed the plus - "No
         * such variable" (sysop, 2026-09-17).
         *
         * So the grant is cut out of the original string and nothing else is
         * touched.
         */
        const rest = queryWithoutGrant(req.originalUrl);
        return res.redirect(302, rest ? `/beeb/?${rest}` : '/beeb/');
      }
      res.type('html').send(page);
    });

    app.use('/beeb', webTerminalGate, express.static(jsbeebPath, { maxAge: 0 }));
    console.log(`[Static] Serving BBC Micro emulator at /beeb from ${jsbeebPath}`);
    console.log(`[Static]   ROMs and software from ${beebRoot} (never from the repo)`);
  }

  if (!fs.existsSync(bbsFrontendPath)) {
console.warn(`[Static] BBS Frontend dist not found: ${bbsFrontendPath}`);
console.warn(`[Static] Run 'cd web/frontend && npm run build'`);
  } else {
console.log(`[Static] Serving BBS Terminal at / from ${bbsFrontendPath}`);

    // Serve hashed assets with long-term caching
    const assetsDir = join(bbsFrontendPath, 'assets');
    if (fs.existsSync(assetsDir)) {
      app.use('/assets', webTerminalGate, express.static(assetsDir, {
        maxAge: '1y',
        immutable: true,
      }));
    }

    // Serve fonts with long-term caching
    const fontsDir = join(bbsFrontendPath, 'fonts');
    if (fs.existsSync(fontsDir)) {
      app.use('/fonts', webTerminalGate, express.static(fontsDir, {
        maxAge: '1y',
        immutable: true,
      }));
    }

    // Serve remaining files (index.html etc) with no caching
    app.use(webTerminalGate, express.static(bbsFrontendPath, { maxAge: 0 }));

    app.use(webTerminalGate, (req: Request, res: Response, next: NextFunction) => {
      // Skip the API, the auth routes, the sockets and the sub-apps - the
      // same list the gate above refuses to switch off.
      if (isReservedPath(req.path)) {
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
  // Each of these spends the board's AI quota: a door author's tool, not a
  // visitor's (open-surface audit, 2026-10-04).
  app.post('/api/wizard/enhance', authenticateToken(db), requireLevel(100), (req: Request, res: Response) => enhancePrompt(req, res));
  app.post('/api/wizard/analyze', authenticateToken(db), requireLevel(100), (req: Request, res: Response) => analyzePrompt(req, res));
  app.post('/api/wizard/enhance-audio', authenticateToken(db), requireLevel(100), (req: Request, res: Response) => enhanceAudioDescription(req, res));
  app.post('/api/wizard/analyze-audio', authenticateToken(db), requireLevel(100), (req: Request, res: Response) => analyzeAudioDescription(req, res));
  app.post('/api/wizard/generate', authenticateToken(db), requireLevel(100), (req: Request, res: Response) => generateGame(req, res));

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

    // Only the caller the board asked: the ticket came with the request
    // (BBSApi.requestArchiveUpload) and names that caller's session.
    const socketId = redeemUploadTicket(String(req.query.ticket ?? ''));
    if (!socketId) {
      return res.status(403).json({ error: 'This upload was not asked for' });
    }

    upload.single('file')(req, res, (err: any) => {
      if (err) {
console.error('[Upload] Multer error:', err);
        // A limit multer enforces ("File too large") is the caller's to
        // read; anything else is logged above, not returned - this route
        // takes no login, and a disk error's text names the server's paths.
        return res.status(500).json({
          error: err instanceof multer.MulterError ? `Upload failed: ${err.message}` : 'Upload failed',
        });
      }

      try {
        if (!req.file) {
console.error('[Upload] No file in request');
          return res.status(400).json({ error: 'No file provided' });
        }

console.log('[Upload] File received:', req.file.originalname, req.file.size, 'bytes');
console.log('[Upload] Saved to:', req.file.path);
        // The door's request completes with THIS file - the board's own
        // record of where it saved it, never a path the browser reports.
        const session = getSession(socketId);
        if (session?.pendingDoorUpload) session.doorUploadSavedPath = req.file.path;

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
  app.post('/api/upload/door', authenticateToken(db), requireSysop(), (req: Request, res: Response) => {
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

        const archiveName = path.basename(req.file.filename);
        if (!isPlainFileName(archiveName)) {
          fs.unlinkSync(req.file.path);
          return res.status(400).json({ error: 'That is not a file name the board can store' });
        }
        const destPath = path.join(doorsArchivePath, archiveName);
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
  app.post('/api/doors/reload', authenticateToken(db), requireSysop(), async (req: Request, res: Response) => {
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

  // ===== File Download Endpoint (by ticket) =====
  // A file outside the file areas - a message's attached file (express.e
  // checkAttachedFile 9746 -> downloadFile 14957) - fetched once by the
  // browser through the ticket the board issued for it (download-ticket.ts).
  app.get('/api/download/ticket/:token', (req: Request, res: Response) => {
    const { redeemDownloadTicket } = require('../handlers/file/download-ticket');
    const ticket: { path: string; onServed?: OnServed } | null = redeemDownloadTicket(String(req.params.token));
    if (!ticket) return res.status(404).json({ error: 'File not found on server' });
    const filePath = ticket.path;
    try {
      const stats = amigafs.statSync(filePath);
      return streamDownload(res, filePath, path.basename(filePath), stats.size, ticket.onServed);
    } catch {
      return res.status(404).json({ error: 'File not found on server' });
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
      // Express has already decoded the parameter once; decoding it again
      // turned `%252f` into a `/` that path.join then followed upwards.
      const filename = req.params.filename;

      if (isNaN(confNum) || isNaN(dirNum) || !filename) {
        return res.status(400).json({ error: 'Invalid download parameters' });
      }
      if (!isPlainFileName(filename)) {
        return res.status(404).json({ error: 'File not found on server' });
      }
      // Only a file the board delivered to a caller: the ticket came with
      // the download-file event for exactly this file (download-ticket.ts).
      // With none, any visitor could take any conference's files.
      const ticket = redeemAreaDownloadTicket(String(req.query.ticket ?? ''), confNum, dirNum, filename);
      if (!ticket) {
        return res.status(403).json({ error: 'This download was not asked for' });
      }

      const dataDir = config.get('dataDir');
      const conferencePath = getConferenceDir(confNum, dataDir);

      // The board's one locator - the same `resolveFile` FTP and the flagged
      // batch use: a pooled area first (a hit is final, and the bytes come
      // back as a real local file the cache materialised), then the
      // conference's DLPATH directories, Files/ and Upload/ on local disk.
      //
      // A volume that cannot answer does not end the search. A directory put
      // on a drive keeps the files it already had on this disk, and the
      // bucket being down says nothing about those. Only when the file is
      // found nowhere locally is the outage the answer - 503, never the 404
      // below: "not found" about a file that is fine is what gets a good
      // catalog row deleted.
      let storageError: unknown;
      try {
        const found = await resolveFile(dataDir, confNum, filename);
        if (found) return streamDownload(res, found.fullPath, found.name, found.size, ticket.onServed);
      } catch (error) {
        storageError = error;
      }

      // The places outside the conference's file directories this route has
      // always also looked in. Use amigafs for case-insensitive matching
      // (AmigaOS is case-insensitive).
      const possiblePaths = [
        // Never HOLD, PRIVATE or a node's Playpen: this route takes no login,
        // and those hold files the board has not released (a held upload, one
        // addressed to the sysop alone, one still arriving). A file the board
        // hands a caller from outside the file areas goes by one-time ticket
        // (handlers/file/download-ticket.ts).
        path.join(conferencePath, `Dir${dirNum}`, filename),
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

      if (!filePath && storageError !== undefined) {
        // The detail is logged, not returned: this route is unauthenticated,
        // and a backend's own message can name a bucket, an endpoint or a
        // key id. The caller needs to know to come back, not where the
        // board's storage lives.
console.error(`[Download] ${filename} in conf ${confNum}:`, storageError);
        return res.status(503).json({ error: STORAGE_UNAVAILABLE_BODY });
      }

      if (!filePath) {
console.error(`[Download] File not found: ${filename} in conf ${confNum}`);
        return res.status(404).json({ error: 'File not found on server' });
      }

      const stats = amigafs.statSync(filePath);
      return streamDownload(res, filePath, path.basename(filePath), stats.size, ticket.onServed);
    } catch (error) {
console.error('[Download] Error:', error);
      res.status(500).json({ error: 'Download failed' });
    }
  });

  // ===== File Download Endpoint (by ID - legacy) =====
  // For backward compatibility with database-based file IDs
  // No client fetches this any more, and it serves any active catalog row to
  // whoever asks: the sysop's tool now (open-surface audit, 2026-10-04).
  app.get('/api/download/:fileId', authenticateToken(db), requireSysop(), async (req: Request, res: Response) => {
    try {
      const fileId = parseInt(req.params.fileId);

      if (isNaN(fileId)) {
        return res.status(400).json({ error: 'Invalid file ID' });
      }

      const fileEntry = await db.getFileEntry(fileId);

      // A held or deleted row is not a released file - its filePath points
      // into HOLD - and this route takes no login.
      if (!fileEntry || (fileEntry.status && fileEntry.status !== 'active')) {
        return res.status(404).json({ error: 'File not found' });
      }

      // The row already says where the object is - storage_volume and
      // object_key came back mapped from the repository. Walking the local
      // directories for it and answering 404 would report a pooled file as
      // missing while holding its exact location.
      const storage = getStorageContext();
      if (storage) {
        try {
          const remote = await materialiseCatalogEntry(fileEntry, storage);
          if (remote) {
            return streamDownload(res, remote.fullPath, fileEntry.filename, remote.size);
          }
        } catch (storageError) {
console.error(`[Download] file ${fileId} (${fileEntry.filename}):`, storageError);
          return res.status(503).json({ error: STORAGE_UNAVAILABLE_BODY });
        }
      }

      const conferencePath = getConferenceDir(fileEntry.conferenceId || 1, config.get('dataDir'));

      let filePath: string | null = null;
      const possiblePaths = [
        fileEntry.filePath,
        path.join(conferencePath, `Dir${fileEntry.areaId}`, fileEntry.filename),
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

      return streamDownload(res, filePath, fileEntry.filename, fileEntry.size);
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
