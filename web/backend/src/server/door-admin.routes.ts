/**
 * This board's own door management API.
 *
 * Deliberately NOT under /api/door-repo/*, which proxies out to the door
 * server: these routes act on THIS board's installed doors. Phase A adds one
 * route - the install record the DoorRepo C door reports after it installs
 * something. Reads and the remaining writes arrive in phases B and C.
 *
 * Mounted at /api/door-admin, not /api/doors: /api/doors is already
 * door-api-routes.ts (client door bundles, manifests, assets) and that
 * router serves browsers with no door token at all. Putting this router's
 * token-gated middleware on the same prefix would 401 every browser
 * fetching a TypeScript door's client bundle.
 *
 * Text responses, not JSON: the client is a C89 door.
 */
import express, { NextFunction, Request, Response } from 'express';
import * as path from 'path';
import { recordDoorInstall } from '../doors/door-install-record';
import { verifyLaunchToken } from '../doors/door-launch-token';

export const doorAdminRouter = express.Router();

/** A BBS command: A-Z, 0-9, up to 12 - the same shape the C door validates
 *  and the only shape that can name a Commands/BBSCmd/<CMD>.info. */
function isCommandName(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9]{1,12}$/.test(value);
}

doorAdminRouter.use((req: Request, res: Response, next: NextFunction) => {
  const claims = verifyLaunchToken(req.header('X-Door-Token') ?? undefined);
  if (!claims) {
    res.status(401).type('text/plain').send('UNAUTHORIZED\r\n');
    return;
  }
  // The token says which session this is; it does not say what that session
  // may do. Checked server-side on every request, never inferred from the
  // mere presence of a token.
  if (claims.secLevel < 250) {
    res.status(403).type('text/plain').send('FORBIDDEN\r\n');
    return;
  }
  (req as any).doorClaims = claims;
  next();
});

doorAdminRouter.post('/installed', (req: Request, res: Response) => {
  const { command, archiveName, metadata } = req.body ?? {};
  if (!isCommandName(command) || typeof archiveName !== 'string' || archiveName.length === 0) {
    res.status(400).type('text/plain').send('BAD REQUEST\r\n');
    return;
  }

  const bbsRoot = process.env.BBS_DATA_DIR || process.cwd();
  recordDoorInstall({
    bbsRoot,
    command: command.toUpperCase(),
    archiveName,
    installDir: path.join(bbsRoot, 'Doors', command.toUpperCase()),
    infoPath: path.join(bbsRoot, 'Commands', 'BBSCmd', `${command.toUpperCase()}.info`),
    metadata: metadata ?? {},
  });

  res.status(200).type('text/plain').send('OK\r\n');
});
