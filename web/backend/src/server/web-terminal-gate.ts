/**
 * The web terminal switch.
 *
 * `http_enabled` was schema, column and checkbox, read by NOTHING - the one
 * HTTP listener started regardless, and a sysop who unticked the box watched
 * the board carry on. This is what it switches.
 *
 * It gates the browser terminal, and only that. Telnet and SSH have their own
 * listeners and are untouched; /admin, /sdk, /api, /auth and /socket.io keep
 * serving, because the admin page that turns the switch back on is served by
 * the same listener and uses Socket.IO for its live node status and operator
 * chat. A switch that can lock the sysop out of the page holding the switch
 * is not a switch.
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { config } from '../config';
import { getBoardConfig } from '../services/bbs-config-file.service';

/**
 * Everything the switch must never reach.
 *
 * The SPA fallback skips the same prefixes, and takes them from here: a
 * prefix on one list and not the other would 503 the admin the moment the
 * box is unticked.
 */
export const NOT_THE_WEB_TERMINAL = ['/api', '/auth', '/socket.io', '/sdk', '/admin'];

export function isReservedPath(reqPath: string): boolean {
  return NOT_THE_WEB_TERMINAL.some(
    prefix => reqPath === prefix || reqPath.startsWith(`${prefix}/`)
  );
}

/**
 * Read per request, through the accessor whose cache is stamped with the two
 * config files' mtime and size. Unticking the box takes effect on the next
 * request, with no restart - and it is the same store the admin writes to,
 * because `http_enabled` is neither sensitive nor database-only and so goes
 * to bbsConfig.info.
 */
export function isWebTerminalEnabled(): boolean {
  try {
    return getBoardConfig(config.get('dataDir')).http_enabled !== false;
  } catch {
    // A board whose configuration cannot be read still answers on the web.
    // The alternative is a dark board whose only way back in is the admin
    // that this same failure would have taken down.
    return true;
  }
}

/**
 * Named in the body, so a sysop who finds the board dark knows which switch
 * did it and where the switch is. 503 rather than 404: it exists, it is off.
 */
export const webTerminalGate: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (isReservedPath(req.path) || isWebTerminalEnabled()) return next();

  res
    .status(503)
    .type('text/plain')
    .send(
      'The web terminal is switched off.\n\n' +
      'Turn it back on with "Web Terminal Enabled" under System Configuration\n' +
      'at /admin. Telnet and SSH are unaffected.\n'
    );
};
