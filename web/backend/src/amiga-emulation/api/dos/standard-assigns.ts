/**
 * The board's AmigaDOS assigns - the one table.
 *
 * Four tables used to answer "what is C:?" and they disagreed: the emulator's
 * PathManager (C: = System/C), utils/path-util findAssign (C: = Commands,
 * SYS: = /usr/local/amiexpress, T: = /tmp), DosPathResolver's own fallback
 * branches (T: = RAM:T) and the batch runner's override map. A 68K program
 * asked for C:LHA and got System/C, where LhA is not; the BBS side looked up
 * the same name somewhere else again.
 *
 * AmigaOS semantics kept here:
 *  - An assign may name SEVERAL directories (`Assign C: BBS:C ADD`). A lookup
 *    searches them in order and takes the first that has the name; a file
 *    that exists nowhere yet is created in the first directory.
 *  - C: is the board's own C/ (LhA, LZX, UnZip, DMS ...) and then System/C
 *    (Avail, Date, Info). L: is the board's L/ (LZX.Keyfile) then System/L.
 *    LIBS: is System/Libs then Libs/, the order LibraryManager already loads
 *    68K libraries in.
 *  - T: is RAM:T, as every Startup-Sequence assigns it, and it exists: the
 *    table's user creates it (PathManager does at construction).
 */
import * as path from 'path';
import * as amigafs from '../../../utils/amigafs';
import { amigaEnvArchiveDir, amigaEnvDir, amigaRamDir } from '../../utils/env-paths';

/** Assign name, lower case with its colon ("c:") -> directories, searched in order. */
export type AssignTable = Map<string, string[]>;

/** RAM:T - the directory T: names. */
export function amigaTempDir(): string {
  return path.join(amigaRamDir(), 'T');
}

/** The Doors directory as the board spells it (repo: "Doors", some boards "doors"). */
function doorsDir(bbsRoot: string): string {
  const upper = path.join(bbsRoot, 'Doors');
  if (amigafs.existsSync(upper)) return upper;
  const lower = path.join(bbsRoot, 'doors');
  if (amigafs.existsSync(lower)) return lower;
  return amigafs.resolvePath(lower) || lower;
}

export function standardAssigns(bbsRoot: string): AssignTable {
  const at = (...parts: string[]) => path.join(bbsRoot, ...parts);
  const table: AssignTable = new Map<string, string[]>([
    // BBS assigns
    ['bbs:', [bbsRoot]],
    ['doors:', [doorsDir(bbsRoot)]],
    ['data:', [at('data')]],
    ['screens:', [at('Screens')]],
    ['bulletins:', [at('Bulletins')]],
    ['s:', [at('S')]],
    ['work:', [bbsRoot]],
    ['sami:', [at('S')]],
    ['env:', [amigaEnvDir()]],
    // ENVARC: is the on-disk half of the environment (see utils/env-paths.ts).
    ['envarc:', [amigaEnvArchiveDir(bbsRoot)]],
    // A running program's PROGDIR: is set per program; this is the default.
    ['progdir:', [bbsRoot]],
    // System assigns
    ['sys:', [at('System')]],
    ['c:', [at('C'), at('System', 'C')]],
    ['l:', [at('L'), at('System', 'L')]],
    ['libs:', [at('System', 'Libs'), at('Libs')]],
    ['devs:', [at('System', 'Devs')]],
    ['fonts:', [at('System', 'Fonts')]],
    ['locale:', [at('System', 'Locale')]],
    ['prefs:', [at('System', 'Prefs')]],
    ['classes:', [at('System', 'Classes')]],
    // RexxMast loads its interpreter (rx / rxc) from here.
    ['rexx:', [at('System', 'Rexxc')]],
    ['ram:', [amigaRamDir()]],
    ['t:', [amigaTempDir()]],
  ]);
  return table;
}

/** "c" / "C:" / "c:" -> "c:" */
export function assignKey(name: string): string {
  const lower = name.toLowerCase();
  return lower.endsWith(':') ? lower : `${lower}:`;
}

/**
 * Look `relative` up in an assign's directories, AmigaDOS-style: the first
 * directory that has it (case-insensitively) wins. Returns null when none has
 * it; the caller decides where a new file goes (the first directory).
 */
export function findInAssignDirs(dirs: string[], relativeComponents: string[]): string | null {
  for (const dir of dirs) {
    const candidate = relativeComponents.length ? path.join(dir, ...relativeComponents) : dir;
    const found = amigafs.resolvePath(candidate);
    if (found) return found;
  }
  return null;
}
