/**
 * Where a TypeScript door's package.json lives.
 *
 * Live bug (bbs.uprough.net, 2026-08-24): executeTypeScriptDoor probed the
 * manifest at dirname(entryFile). In development the entry is the door
 * root's index.ts, so dirname happened to BE the door root and everything
 * worked. In production the entry resolves to dist/server.js, dirname is
 * dist/ - which has no package.json - so hybrid detection silently failed:
 * the sysop saw a red "Invalid TypeScript door: execute is undefined"
 * flash, the client bundle still ran the game, and the server-side RPC
 * handlers (highscores, score webhooks) were never registered.
 *
 * The manifest belongs to the DOOR ROOT, which the entry resolution already
 * knows whenever door.path is a directory. dirname(entry) remains only as
 * the fallback for doors registered as a bare file path.
 */

import * as path from 'path';

export function doorManifestPath(doorRootDir: string | null, entryPath: string): string {
  if (doorRootDir) {
    return path.join(doorRootDir, 'package.json');
  }
  return path.join(path.dirname(entryPath), 'package.json');
}

export default doorManifestPath;
