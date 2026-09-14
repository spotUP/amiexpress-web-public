/**
 * Is this door's LOCATION an AmigaDOS SCRIPT rather than a 68K executable?
 *
 * AmigaDOS decides what to do with a file by looking at the FILE. An
 * executable begins with HUNK_HEADER (0x000003F3) and is LoadSeg'd; anything
 * else with the `s` protection bit is handed to the shell as a script. The
 * tooltype never enters into it, which is why a board can carry
 * `TYPE=SIM` on a command whose LOCATION is a batch file and have it work.
 *
 * This port routed every SIM through the 68K emulator, so on this board the
 * six `Commands/SysCmd/LOGOFF<n>.info` commands - each `TYPE=SIM` with
 * `LOCATION=BBS:Batch<n>` - started a door, found no manifest, and exited
 * without executing a single line. That is the logoff batch: MultiTop rebuilds
 * `bull1`-`bull5` from it and SAmiLog rebuilds `bull6`, so none of them ever
 * regenerated. "this is a bug we have had for ages, bulls not generating when
 * they should" (the sysop, 2026-09-14).
 *
 * The test is the header, not the name: a file called `Batch2` is not special,
 * and a door whose binary happens to live beside one must still be LoadSeg'd.
 * A file that cannot be read is NOT a script - that must never turn a
 * permission error into a silently skipped door.
 *
 * `.rexx`/`.rx` is handled before this, by the AREXX route.
 *
 * AND THE LOOKUP IS CASE-INSENSITIVE, because AmigaDOS is. `LOGOFF2.info`
 * says `LOCATION=BBS:Batch2` with a capital B; the file on the volume is
 * `batch2`. On the Amiga those are the same file and on Linux they are not,
 * so the first version of this - a plain `existsSync` - answered "not a
 * script" for every LOGOFF<n> on the board and fell straight back to the
 * emulator, which is the bug it was written to fix. Every other path here
 * goes through `amigafs` for this reason; so does this one now.
 */

import * as fs from 'fs';
import * as path from 'path';

import { config } from '../config';
import * as amigafs from '../utils/amigafs';
import { resolveAssignPath } from '../utils/path-util';

/** The first four bytes of every AmigaDOS executable. */
const HUNK_HEADER = 0x000003f3;

/** How much of the file the header check needs. */
const MAGIC_BYTES = 4;

/**
 * The absolute path of `location` when it names a script, otherwise null.
 *
 * Returns the PATH rather than a boolean so the caller does not resolve the
 * same assign twice, and so "is a script" and "where is it" cannot disagree.
 */
export function amigaDosScriptPath(location: string | undefined | null): string | null {
  if (!location) return null;

  const candidates = [
    resolveAssignPath(location),
    path.join(config.getConfig().dataDir, location),
  ];

  for (const raw of candidates) {
    // The name AmigaDOS would have opened, whatever case the tooltype used.
    const candidate = amigafs.resolvePath(raw) ?? raw;
    let handle: number | undefined;
    try {
      if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) continue;

      const magic = Buffer.alloc(MAGIC_BYTES);
      handle = fs.openSync(candidate, 'r');
      const read = fs.readSync(handle, magic, 0, MAGIC_BYTES, 0);

      // Shorter than a hunk header: not an executable, and a batch file of one
      // short line is a real thing.
      if (read < MAGIC_BYTES) return candidate;
      if (magic.readUInt32BE(0) === HUNK_HEADER) return null;
      return candidate;
    } catch {
      // Unreadable is not "a script" - leave it to the door path, which has
      // its own error handling.
      return null;
    } finally {
      if (handle !== undefined) {
        try { fs.closeSync(handle); } catch { /* already gone */ }
      }
    }
  }

  return null;
}
