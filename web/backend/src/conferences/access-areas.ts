/**
 * Conference access AREAS - the named grants a user's access field can point at.
 *
 * AmiExpress decides conference access two ways, and `checkConfAccess`
 * (express.e:8499-8512) picks between them per user:
 *
 *   FLAGS  `user.conferenceAccess` is one character per conference. `X` grants
 *          conference n at position n-1; anything else denies.
 *   AREA   the same field holds a NAME, and the grants live in
 *          `Access/AREA.<name>.info` as a `Conf.<n>` tooltype per conference.
 *
 * The switch is `isConfAccessAreaName` (express.e:458-465): if ANY character of
 * the field is neither `X` nor `_`, the whole field is read as an area name.
 * There is no flag and no setting - the shape of the value decides. That also
 * means the two cannot be mixed on one account.
 *
 * Areas are the better mechanism for anything but a trivial board: membership
 * becomes one named thing instead of a character position the sysop has to
 * count to, and the flag string caps out at nine conferences (axobjects.e), so
 * a board that grows past nine has to move anyway.
 *
 * This module owns the FILES. Who is in an area is a property of the users, so
 * it is counted where the users are read.
 */

import * as fs from 'fs';
import * as path from 'path';
import { applyTooltypes, parseInfoFile } from '../utils/info-file.util';

/**
 * Does this access field hold an area NAME rather than per-conference flags?
 *
 * express.e:458-465 isConfAccessAreaName: any character that is neither `X`
 * nor `_` makes the whole field a name. An empty field is flags (granting
 * nothing).
 */
export function isConfAccessAreaName(access: string | null | undefined): boolean {
  return /[^X_]/.test(access ?? '');
}

/** `AREA.<name>.info`, and `<name>` is what a user's access field holds. */
const AREA_FILE = /^AREA\.(.+)\.info$/i;

/**
 * What a name may be.
 *
 * It becomes a FILENAME and it is compared against a user's access field, so
 * it must survive both. No separators, no dots (the dot delimits the icon's
 * own name), and nothing that would read as a flag string - a name of `XX`
 * would be parsed back as flags by `isConfAccessAreaName` and silently mean
 * conferences 1 and 2 instead.
 */
const VALID_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,30}$/;

export interface AccessArea {
  /** The name a user's access field holds, e.g. `Internal`. */
  name: string;
  /** Conference numbers this area grants, ascending. */
  conferences: number[];
}

function areaPath(bbsRoot: string, name: string): string {
  return path.join(bbsRoot, 'Access', `AREA.${name}.info`);
}

/**
 * Refuse a name that cannot work, before anything is written.
 *
 * `looksLikeFlags` is the one worth spelling out: a name made only of `X` and
 * `_` is indistinguishable from a flag string once it is on a user, so the
 * area would be created and could never be pointed at.
 */
export function assertUsableAreaName(name: string): void {
  if (!VALID_NAME.test(name)) {
    throw new Error(
      `"${name}" cannot be an area name: use letters, digits, dash or underscore, starting with a letter or digit.`,
    );
  }
  const looksLikeFlags = /^[X_]+$/i.test(name);
  if (looksLikeFlags) {
    throw new Error(
      `"${name}" cannot be an area name: a name of only X and _ is read as a conference flag string (express.e:458-465), not as a name.`,
    );
  }
}

/** The conferences one area grants, or null when there is no such area. */
export function readAccessArea(bbsRoot: string, name: string): AccessArea | null {
  const file = areaPath(bbsRoot, name);
  if (!fs.existsSync(file)) return null;

  const conferences: number[] = [];
  try {
    for (const tt of parseInfoFile(file).tooltypes) {
      // A commented tooltype is not a grant - express.e's checkToolTypeExists
      // skips them, so the admin must not count them either.
      if (tt.commented) continue;
      const m = /^CONF\.(\d+)$/i.exec(tt.key.trim());
      if (m) conferences.push(parseInt(m[1], 10));
    }
  } catch {
    return null;   // an unreadable icon grants nothing rather than everything
  }
  return { name, conferences: [...new Set(conferences)].sort((a, b) => a - b) };
}

/** Every area the board has, by name. */
export function listAccessAreas(bbsRoot: string): AccessArea[] {
  const dir = path.join(bbsRoot, 'Access');
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }

  const out: AccessArea[] = [];
  for (const entry of entries) {
    const m = AREA_FILE.exec(entry);
    if (!m) continue;
    const area = readAccessArea(bbsRoot, m[1]);
    if (area) out.push(area);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Write one area's grants, creating it if it does not exist.
 *
 * `removeKeys` owns the whole `Conf.n` series: un-ticking a conference has to
 * DELETE its tooltype, because a grant is presence-only and there is no way to
 * write "not granted". Every other tooltype in the icon - a name, a comment,
 * anything a sysop put there - survives untouched.
 */
export function writeAccessArea(bbsRoot: string, name: string, conferences: number[]): AccessArea {
  assertUsableAreaName(name);

  const clean = [...new Set(conferences)]
    .filter(n => Number.isInteger(n) && n >= 1)
    .sort((a, b) => a - b);

  applyTooltypes(
    areaPath(bbsRoot, name),
    clean.map(n => [`Conf.${n}`, ''] as [string, string]),
    { removeKeys: (key) => /^CONF\.\d+$/i.test(key) },
  );
  return { name, conferences: clean };
}

/**
 * Delete an area.
 *
 * The caller must prove nobody is using it: a user whose access field names a
 * missing area gets `checkToolTypeExists` on a file that is not there, which
 * is FALSE for every conference - so deleting an area in use locks its members
 * out of the whole board silently.
 */
export function deleteAccessArea(bbsRoot: string, name: string, membersUsingIt: number): void {
  assertUsableAreaName(name);
  if (membersUsingIt > 0) {
    throw new Error(
      `Refusing to delete area "${name}": ${membersUsingIt} user(s) still point at it, and they would lose every conference.`,
    );
  }
  const file = areaPath(bbsRoot, name);
  if (fs.existsSync(file)) fs.rmSync(file, { force: true });
}
