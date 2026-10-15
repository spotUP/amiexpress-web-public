/**
 * What is installed on the board: the machine's ROMs, and the software.
 *
 * Kept apart from the door so it can be tested without a terminal, and so
 * the two questions it answers stay separate - "can this board run a BBC
 * Micro at all" and "what is there to run".
 */
import * as fs from 'fs';
import * as path from 'path';
import { resolveBbsRoot } from '@amiexpress/bbs-door-sdk/settings';
import { MODEL, emulatorUrl } from '@amiexpress/bbs-door-sdk/beeb/emulator-url';

/** Disc and tape images the emulator can load. */
const DISC_EXTENSIONS = new Set(['.ssd', '.dsd', '.adf', '.adl']);
const TAPE_EXTENSIONS = new Set(['.uef', '.csw']);

/**
 * The three files a Model B needs, by the exact names the emulator asks
 * for (jsbeeb `src/models.js`: `os.rom`, `BASIC.ROM`, `b/DFS-1.2.rom`).
 * Getting one of these names wrong is a black screen, not an error.
 */
export const REQUIRED_ROMS = ['os.rom', 'BASIC.ROM', path.join('b', 'DFS-1.2.rom')];

/**
 * The machine, named explicitly rather than left to the emulator's default.
 *
 * jsbeeb knows several models and they want DIFFERENT ROMs - `B` and
 * `B-DFS0.9` and `B1770` and `Master` each ask for their own set, and
 * `Master` wants `master/mos3.20`, which is nothing like the three files
 * this board tells a sysop to install. Leaving the model to the default
 * means the emulator asks for a ROM nobody was told about and shows "failed
 * to find a ROM" over a board that is correctly set up.
 *
 * So the model is pinned, and REQUIRED_ROMS above is exactly its ROM set.
 * The two must be changed together - which is why the pin itself lives in
 * the SDK now: the TELETEXT door sends callers to the same machine, and two
 * doors disagreeing about the model is two different sets of missing ROMs.
 */
export { MODEL };

/**
 * The DFS version the pinned model's 8271 disc controller expects.
 *
 * A 1770-era DFS (2.2x and later) on this model cannot drive the emulated
 * controller, and the failure looks like a missing file rather than a
 * mismatched ROM.
 */
export const EXPECTED_DFS_VERSION = '1.2';

export interface RomIdentity {
  /** The ROM's own title, from its sideways header. */
  title: string;
  /** Its version string, when it carries one. */
  version: string;
}

export interface RomCheck {
  /** Required ROMs that are not on disc at all. */
  missing: string[];
  /** ROMs whose own header disagrees with the name they were filed under. */
  mismatched: { file: string; expected: string; found: string }[];
}

export interface Title {
  /** The filename, which is also what the emulator is told to load. */
  file: string;
  /** Tidied for the list. */
  name: string;
  kind: 'disc' | 'tape';
  bytes: number;
}

export function beebRoot(startDir: string = __dirname): string {
  return path.join(resolveBbsRoot(startDir), 'Beeb');
}

export function romsDir(startDir?: string): string {
  return path.join(beebRoot(startDir), 'roms');
}

export function softwareDir(startDir?: string): string {
  return path.join(beebRoot(startDir), 'software');
}

/**
 * Which required ROMs are missing.
 *
 * Empty means the machine will boot. Anything else and the emulator shows
 * a black screen with no explanation, so the door says so first - there is
 * no open-source BBC ROM and never has been, so this is the normal state of
 * a board nobody has set up yet, not a fault.
 */
export function missingRoms(startDir?: string): string[] {
  const dir = romsDir(startDir);
  return REQUIRED_ROMS.filter(name => {
    try {
      return !fs.statSync(path.join(dir, name)).isFile();
    } catch {
      return true;
    }
  });
}

/**
 * What a ROM says it is.
 *
 * A sideways ROM carries its own title and version as plain text after the
 * language entry vectors - the title from offset 9, NUL-terminated, then
 * the version. Reading it is how the door can tell that a file called
 * `DFS-1.2.rom` is actually DFS 2.42, which is the difference between a
 * disc that boots and a "File not found" nobody can explain.
 *
 * Returns null for a ROM with no readable header, which is normal for the
 * OS ROM - it is not a sideways ROM and has no such string.
 */
export function romIdentity(file: string): RomIdentity | null {
  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(file);
  } catch {
    return null;
  }
  if (bytes.length < 0x50) return null;

  const parts = bytes
    .subarray(9, 0x50)
    .toString('latin1')
    .split('\u0000')
    .map(part => part.trim())
    .filter(part => /^[\x20-\x7e]{2,}$/.test(part));

  if (parts.length === 0) return null;
  const version = parts.find(part => /^[0-9]+\.[0-9]+/.test(part)) ?? '';
  return { title: parts[0], version };
}

/**
 * The ROMs, checked for what they ARE and not only that they exist.
 *
 * A sysop who files a 1770-era DFS under the name of an 8271-era one has a
 * board that boots to BASIC and then cannot read a disc, and nothing
 * anywhere says why.
 */
export function checkRoms(startDir?: string): RomCheck {
  const dir = romsDir(startDir);
  const missing: string[] = [];
  const mismatched: { file: string; expected: string; found: string }[] = [];

  for (const name of REQUIRED_ROMS) {
    const full = path.join(dir, name);
    try {
      if (!fs.statSync(full).isFile()) {
        missing.push(name);
        continue;
      }
    } catch {
      missing.push(name);
      continue;
    }

    // Only the DFS is checked: it is the one whose version has to match the
    // disc controller the model emulates, and the one people mislabel.
    if (!/DFS/i.test(name)) continue;
    const identity = romIdentity(full);
    if (!identity) continue;

    const wanted = EXPECTED_DFS_VERSION;
    if (identity.version && !identity.version.startsWith(wanted)) {
      mismatched.push({
        file: name,
        expected: `DFS ${wanted}x`,
        found: `${identity.title} ${identity.version}`.trim(),
      });
    }
  }
  return { missing, mismatched };
}

/** Everything in the board's software folder the emulator could load. */
export function listTitles(startDir?: string): Title[] {
  const dir = softwareDir(startDir);
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const titles: Title[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const extension = path.extname(entry.name).toLowerCase();
    const kind = DISC_EXTENSIONS.has(extension)
      ? 'disc'
      : TAPE_EXTENSIONS.has(extension)
        ? 'tape'
        : null;
    if (!kind) continue;

    let bytes = 0;
    try {
      bytes = fs.statSync(path.join(dir, entry.name)).size;
    } catch {
      // Listed but unreadable: still show it, with an unknown size.
    }
    titles.push({ file: entry.name, name: prettyName(entry.name), kind, bytes });
  }
  return titles.sort((a, b) => a.name.localeCompare(b.name));
}

/** The URL that runs one title, through the SDK's shared builder. */
export function urlFor(
  title: Title,
  options: { autoboot?: boolean; token?: string } = {},
): string {
  return emulatorUrl({
    file: title.file,
    kind: title.kind,
    autoboot: options.autoboot,
    token: options.token,
  });
}

/** An empty machine, for a caller who just wants BASIC. */
export function bareUrl(token?: string): string {
  return emulatorUrl({ token });
}

function prettyName(file: string): string {
  return file
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
