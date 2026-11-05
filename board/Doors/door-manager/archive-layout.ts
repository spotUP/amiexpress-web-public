/**
 * Doors that ship as an overlay of the BBS: the archive holds the same
 * tree the BBS keeps, and the author's install text says "copy this here,
 * that there".
 *
 *   Commands/BBSCmd/SENT.info          -> BBS:Commands/BBSCmd/
 *   Commands/SysCmd/EXAMINE.info       -> BBS:Commands/SysCmd/
 *   Doors/FileDescription/...          -> BBS:Doors/FileDescription/
 *
 * The command icon says LOCATION=DOORS:FileDescription/FileDescription.x, so
 * the door only runs when it lands at Doors/FileDescription/ - under the
 * author's own name, not under the command. Extracting the whole archive into
 * Doors/<command>/ (what the installer did) nests all of it a level too deep:
 * the icon points at a file that is not there, the SysCmd icon is never
 * installed, and the install still reports success (MST-FD11.LHA, File
 * Description 1.1, 2026-09-29).
 *
 * This module only reads and decides. Nothing here installs.
 */

import * as fs from 'fs';
import * as path from 'path';
import { isUsableCommand } from './archive-command';

export interface OverlayCommand {
  /** The command, as the archive spells it. */
  command: string;
  /** Absolute path of the archive's own icon. */
  infoPath: string;
  /** Which command directory the icon belongs in. */
  kind: 'BBSCmd' | 'SysCmd';
}

export interface ArchiveOverlay {
  /** The directory the archive's Commands/ and Doors/ sit in. */
  root: string;
  commands: OverlayCommand[];
  /** Absolute paths of the directories directly under the archive's Doors/. */
  doorDirs: string[];
}

function listDirs(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/** A directory entry by name, in any case - the Amiga does not tell them apart. */
export function childNamed(dir: string, name: string): string | null {
  const wanted = name.toLowerCase();
  const found = listDirs(dir).find((e) => e.name.toLowerCase() === wanted);
  return found ? path.join(dir, found.name) : null;
}

function findRoot(dir: string, depth: number): string | null {
  if (depth > 4) return null;
  if (childNamed(dir, 'Commands') && childNamed(dir, 'Doors')) return dir;
  for (const entry of listDirs(dir)) {
    if (!entry.isDirectory()) continue;
    const found = findRoot(path.join(dir, entry.name), depth + 1);
    if (found) return found;
  }
  return null;
}

/**
 * The overlay an extracted archive holds, or null when it is not one - a
 * flat door (binary and icon side by side) has no Commands/ beside a Doors/.
 */
export function findOverlay(extractedDir: string): ArchiveOverlay | null {
  const root = findRoot(extractedDir, 0);
  if (!root) return null;
  const commandsDir = childNamed(root, 'Commands') as string;
  const doorsDir = childNamed(root, 'Doors') as string;

  const commands: OverlayCommand[] = [];
  for (const kind of ['BBSCmd', 'SysCmd'] as const) {
    const dir = childNamed(commandsDir, kind);
    if (!dir) continue;
    for (const entry of listDirs(dir)) {
      const match = /^(.+)\.info$/i.exec(entry.name);
      if (!entry.isFile() || !match || !isUsableCommand(match[1])) continue;
      commands.push({ command: match[1], infoPath: path.join(dir, entry.name), kind });
    }
  }
  const doorDirs = listDirs(doorsDir)
    .filter((e) => e.isDirectory())
    .map((e) => path.join(doorsDir, e.name));

  if (commands.length === 0 || doorDirs.length === 0) return null;
  return { root, commands, doorDirs };
}

/**
 * A tooltype's value out of an Amiga icon (binary) or a text .info.
 *
 * In a real icon each tooltype is a big-endian u32 length followed by that
 * many bytes, the last one a NUL: `\0\0\0\x32LOCATION=DOORS:...\0`. The
 * length's last byte is a printable character as often as not ("1LOCATION=" in
 * strings(1)), so "the key follows a non-letter" is no test for where an entry
 * starts. The length is: an entry is real only when the four bytes before it
 * say exactly how long it is and it ends in a NUL there.
 */
export function readTooltype(infoPath: string, key: string): string | null {
  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(infoPath);
  } catch {
    return null;
  }
  const needle = Buffer.from(`${key.toUpperCase()}=`, 'latin1');
  const upper = Buffer.from(bytes.toString('latin1').toUpperCase(), 'latin1');
  for (let at = upper.indexOf(needle); at >= 0; at = upper.indexOf(needle, at + 1)) {
    if (at >= 4) {
      const length = bytes.readUInt32BE(at - 4);
      if (length > needle.length && at + length <= bytes.length && bytes[at + length - 1] === 0) {
        return bytes.subarray(at + needle.length, at + length - 1).toString('latin1').trim();
      }
    }
    // A text .info: the key opens a line.
    if (at === 0 || bytes[at - 1] === 0x0a || bytes[at - 1] === 0x0d) {
      let end = at;
      while (end < bytes.length && bytes[end] !== 0x0a && bytes[end] !== 0x0d && bytes[end] !== 0) end++;
      return bytes.subarray(at + needle.length, end).toString('latin1').trim();
    }
  }
  return null;
}

/**
 * LOCATION=DOORS:FileDescription/FileDescription.x as a path under Doors/.
 * Any volume prefix goes ("DOORS:", "BBS:Doors/"); the rest is the path.
 */
export function locationUnderDoors(location: string): string | null {
  const afterVolume = location.replace(/^[^:/]*:/, '').replace(/\\/g, '/').replace(/^\/+/, '');
  const rel = afterVolume.replace(/^doors\//i, '');
  if (!rel || rel.split('/').some((part) => part === '..' || part === '')) return null;
  return rel;
}

/** A relative path resolved one component at a time, in any case. */
export function resolveInsensitive(base: string, rel: string): string | null {
  let current = base;
  for (const part of rel.split('/')) {
    const next = childNamed(current, part);
    if (!next) return null;
    current = next;
  }
  return current;
}

const CPU_ORDER = ['000', '010', '020', '030', '040', '060'];

/**
 * A door that ships one binary per CPU and expects the sysop to copy the
 * right one to the name the icon uses: FileDescription000.x and
 * FileDescription020.x, icon LOCATION=...FileDescription.x, install text
 * "Copy FileDescription020.x FileDescription.x". Returns the build to copy -
 * the plain 68000 one when there is a choice, since it runs on every CPU -
 * or null when the directory holds no such variant.
 */
export function cpuVariantOf(dir: string, binaryName: string): string | null {
  const dot = binaryName.lastIndexOf('.');
  const stem = dot > 0 ? binaryName.slice(0, dot) : binaryName;
  const ext = dot > 0 ? binaryName.slice(dot) : '';
  const names = listDirs(dir).filter((e) => e.isFile()).map((e) => e.name);
  for (const cpu of CPU_ORDER) {
    const wanted = `${stem}${cpu}${ext}`.toLowerCase();
    const found = names.find((n) => n.toLowerCase() === wanted);
    if (found) return found;
  }
  return null;
}

/**
 * Whether an extracted overlay really is one: at least one command icon has a
 * LOCATION that leads into the archive's own Doors/ (directly, or to a
 * per-CPU build the sysop is meant to copy). An archive with a Commands/ and
 * a Doors/ whose icons lead nowhere in it is not something this can place, and
 * is left to the flat install.
 */
export function overlayBinaryFor(overlay: ArchiveOverlay, command: OverlayCommand): { doorsDir: string; rel: string } | null {
  const doorsDir = childNamed(overlay.root, 'Doors');
  const location = readTooltype(command.infoPath, 'LOCATION');
  const rel = location ? locationUnderDoors(location) : null;
  if (!doorsDir || !rel) return null;
  if (resolveInsensitive(doorsDir, rel)) return { doorsDir, rel };
  const dir = resolveInsensitive(doorsDir, path.posix.dirname(rel));
  if (dir && cpuVariantOf(dir, path.posix.basename(rel))) return { doorsDir, rel };
  return null;
}
