/**
 * Security levels as the BBS actually stores them: Access/ACS.<level>.info.
 *
 * The admin Security page wrote a `security_level_access` DATABASE table while
 * the BBS reads these files through utils/acs-access-loader, so nothing
 * configured there ever took effect - "i tried to add one for users at 30, it
 * didnt let me pick a number it just added users at 100 and now i can't remove
 * it". It also offered a hardcoded [10, 20, 50, 100, 200, 255], which matches
 * neither the files on disk (10, 20, 50, 255) nor the users (30 accounts sit
 * at level 30).
 *
 * Flags are Amiga tooltypes: present and enabled means granted, wrapped in
 * parentheses or valued NO means denied - the same rule acs-access-loader
 * applies when the BBS asks whether somebody may do something.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Tooltype } from '../../utils/info-file.util';

/** `ACS.<level>.info`, and nothing else in the Access directory. */
const ACS_FILE_RE = /^ACS\.(\d+)\.info$/i;

export function accessDir(bbsRoot: string): string {
  return path.join(bbsRoot, 'Access');
}

/** Where the loader looks for a level's flags. */
export function acsLevelFilePath(bbsRoot: string, level: number): string {
  return path.join(accessDir(bbsRoot), `ACS.${level}.info`);
}

/**
 * The levels that actually exist, ascending.
 *
 * AREA.*.info and Default.info live in the same directory and are not levels.
 */
export function listAcsLevels(bbsRoot: string): number[] {
  const dir = accessDir(bbsRoot);
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .map(name => ACS_FILE_RE.exec(name))
    .filter((m): m is RegExpExecArray => m !== null)
    .map(m => parseInt(m[1], 10))
    .filter(n => Number.isFinite(n))
    .sort((a, b) => a - b);
}

/**
 * Which ACS file actually serves a user at this level.
 *
 * The rule itself lives in acs-level-serving.ts, with no disk in it, because
 * the admin has to apply the same rule in a browser. Re-exported here so
 * callers that already read this service keep one import.
 *
 * The Security page listed the FILES and nothing else, so a sysop whose new
 * users are level 30 saw four levels, none of them 30, and no way to tell
 * which one their users were actually getting.
 */
export { acsLevelServing } from './acs-level-serving';

/**
 * Which permissions a level grants.
 *
 * Mirrors acs-access-loader: granted when the tooltype is present, not
 * commented, and not valued NO.
 */
export function tooltypesToFlags(tooltypes: Tooltype[]): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  for (const tt of tooltypes) {
    if (!tt.key.toUpperCase().startsWith('ACS.')) continue;
    flags[tt.key.toUpperCase()] = !tt.commented && tt.value.toUpperCase() !== 'NO';
  }
  return flags;
}

/**
 * Flags written `=NO`, which THIS PORT denies and AmiExpress grants.
 *
 * `checkToolTypeExists` (tooltypes.e:204-218) looks only at whether the key
 * is present - it never inspects the value - so on a real AmiExpress
 * `ACS.DOWNLOAD=NO` GRANTS download. The parenthesised form is the one that
 * genuinely denies, and it is what this admin writes.
 *
 * The divergence is deliberate and it is not going to be closed by matching
 * express.e: doing that would silently GRANT every permission a sysop has
 * written `=NO` on a live board. Fail closed, and say so - a value that means
 * the opposite thing on the two systems is worth a sysop's attention, and it
 * can only get into a file by hand.
 */
export function ambiguouslyDeniedFlags(tooltypes: Tooltype[]): string[] {
  return tooltypes
    .filter(tt => tt.key.toUpperCase().startsWith('ACS.'))
    .filter(tt => !tt.commented && tt.value.toUpperCase() === 'NO')
    .map(tt => tt.key.toUpperCase());
}

/**
 * Apply granted/denied changes to a level's tooltypes.
 *
 * Denied entries are written in the Amiga parenthesised form, which is what
 * these files already use and what express.e reads. Flags not mentioned are
 * left exactly as they were, so saving one permission cannot disturb another.
 */
export function flagsToTooltypes(
  existing: Tooltype[],
  changes: Record<string, boolean>
): Tooltype[] {
  const out = existing.map(t => ({ ...t }));
  const invented: string[] = [];

  for (const [rawFlag, granted] of Object.entries(changes)) {
    const flag = rawFlag.toUpperCase();
    const found = out.find(t => t.key.toUpperCase() === flag);

    if (found) {
      found.commented = !granted;
      found.commentStyle = granted ? found.commentStyle : '()';
      // A tooltype valued NO is denied however it is written; clear it so the
      // enabled/disabled state is the only thing that decides.
      if (found.value.toUpperCase() === 'NO') found.value = '';
      found.originalLine = granted ? found.key : `(${found.key})`;
    } else {
      // A key the file does not have is only worth writing if it is one
      // AmiExpress reads, and those are ACS.<NAME> - express.e spells them
      // ACS.CENSORED, ACS.DOWNLOAD, ACS.BREAK_CHAT, and everything that reads
      // this file filters on that prefix (see tooltypesToFlags below).
      //
      // The admin has two security endpoints and they name flags differently:
      // the file-backed one this writes for says ACS.CENSORED, while the
      // database mirror says CENSORED. Sending the mirror's spelling used to
      // add a tooltype nobody reads - the save reported success, the board
      // was unchanged, and the file grew a line that means nothing.
      if (!flag.startsWith('ACS.')) {
        invented.push(rawFlag);
        continue;
      }

      out.push({
        key: flag,
        value: '',
        commented: !granted,
        commentStyle: granted ? undefined : '()',
        prefix: '',
        originalLine: granted ? flag : `(${flag})`,
      });
    }
  }

  if (invented.length > 0) {
    throw new Error(
      `Not an ACS flag this file can hold: ${invented.join(', ')}. ` +
      `AmiExpress reads ACS.<NAME> (express.e), so a new flag has to be named that way - ` +
      `'CENSORED' is the database mirror's spelling of 'ACS.CENSORED'.`
    );
  }

  return out;
}
