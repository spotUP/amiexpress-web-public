/**
 * A screen file with nothing in it is not a screen.
 *
 * express.e:6773 - `displayScreen` answers TRUE for any file it could OPEN,
 * and every caller reads that as "the screen was shown". A zero-byte file
 * therefore clears the terminal, prints nothing, and pauses for a key, which
 * is what the sysop sees as "blank screen and a pointless pause". The file is
 * not corrupt and nothing logs a problem, so the symptom reads as a missing
 * theme or a bad path and is chased there. It cost three rounds of "log in
 * again" on 2026-09-14.
 *
 * Resolution is where the rule belongs, not display: `findSecurityScreen`
 * walks security levels and scopes and takes the first NAME that is present,
 * so a hollow `Logon100.txt` beats a perfectly good `Logon.txt` beside it.
 * Refusing hollow files at the point a candidate is accepted means the walk
 * simply continues - the next level, the next scope - and if nothing anywhere
 * has content the loader answers null and the caller skips the screen in
 * silence, exactly as it does for a file that is absent.
 *
 * It also makes emptying a file a usable way to suppress a screen for one
 * theme, which is what a sysop who empties one is already trying to say.
 *
 * Only these two shapes count as hollow, deliberately:
 *
 *   - zero bytes;
 *   - at most two bytes that are nothing but the MCI gate `~` and line
 *     endings (`~\n`) - the stub shape the seeder and the theme editor write.
 *
 * Anything longer is somebody's content, including a file that is only MCI
 * commands (`~f|\n~SS_BBS:Bulletins/bull7.txt` does real work and shows
 * nothing itself).
 */

import * as fs from 'fs';

/** The largest file this will ever call hollow. */
const HOLLOW_MAX_BYTES = 2;

/** `~`, CR, LF - the only bytes a hollow stub is allowed to contain. */
const STUB_BYTES = new Set([0x7e, 0x0d, 0x0a]);

/**
 * True when `bytes` is a screen file with nothing to show.
 *
 * Takes bytes rather than a path so a caller that has already read the file
 * (the seeder compares content it is holding) does not read it twice.
 */
export function isHollowScreenContent(bytes: Buffer): boolean {
  if (bytes.length === 0) return true;
  if (bytes.length > HOLLOW_MAX_BYTES) return false;
  for (const byte of bytes) {
    if (!STUB_BYTES.has(byte)) return false;
  }
  return true;
}

/**
 * True when the file at `filePath` has nothing to show.
 *
 * A file that cannot be read is NOT hollow: this must never turn a permission
 * error or a race into a silently skipped screen. Resolution has already
 * decided the name is present; an unreadable file is a different fault and
 * belongs to the loader's own error handling.
 *
 * The size is taken first so the common case - a screen with content - costs
 * one `stat` and never reads the file.
 */
export function isHollowScreenFile(filePath: string): boolean {
  try {
    const size = fs.statSync(filePath).size;
    if (size === 0) return true;
    if (size > HOLLOW_MAX_BYTES) return false;
    return isHollowScreenContent(fs.readFileSync(filePath));
  } catch {
    return false;
  }
}
