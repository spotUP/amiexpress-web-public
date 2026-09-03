/**
 * MISSION mode - where packs live, and how a sysop's pack gets written.
 *
 * The door ships one pack as content (`assets/missions/starter.json`, which
 * is tracked and reaches the board with the door). A pack a SYSOP writes
 * cannot live there: assets/ is part of the door's checkout, and the Doors
 * volume sync only ever adds files, so an edit made on the board would be
 * overwritten by the next deploy and a new file would outlive the door that
 * created it. Sysop packs go to the door's data directory instead, which is
 * runtime state and is exactly what it is for.
 *
 * Both are offered. A pack is only ever accepted through parseMissionPack -
 * the same loader the shipped pack goes through - so an editor cannot write
 * a pack the player would be unable to finish.
 */

import * as fs from 'fs';
import * as path from 'path';

import { parseMissionPack, MissionPackError } from './mission-pack';
import type { MissionPack } from './mission-types';

/** A pack on disk, with where it came from. */
export interface StoredPack {
  pack: MissionPack;
  /** The file it was read from. */
  file: string;
  /** Shipped with the door, or written by a sysop on this board. */
  origin: 'shipped' | 'sysop';
}

/** File name rules: a pack the sysop names must not become a path. */
export function packFileName(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${slug || 'pack'}.json`;
}

/** Where a sysop's packs are kept. */
export function sysopPackDir(dataDir: string): string {
  return path.join(dataDir, 'missions');
}

/**
 * Every pack this board can offer, shipped first.
 *
 * A pack that will not parse is skipped rather than thrown: one bad file a
 * sysop is halfway through writing must not take MISSION mode away from
 * every player. The reason comes back in `problems` so it can be shown.
 */
export function listPacks(doorRoot: string, dataDir: string): {
  packs: StoredPack[];
  problems: string[];
} {
  const packs: StoredPack[] = [];
  const problems: string[] = [];

  const read = (file: string, origin: StoredPack['origin']): void => {
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      packs.push({ pack: parseMissionPack(raw, path.basename(file)), file, origin });
    } catch (error) {
      problems.push(`${path.basename(file)}: ${(error as Error).message}`);
    }
  };

  const shipped = path.join(doorRoot, 'assets', 'missions', 'starter.json');
  if (fs.existsSync(shipped)) read(shipped, 'shipped');

  const dir = sysopPackDir(dataDir);
  if (fs.existsSync(dir)) {
    for (const entry of fs.readdirSync(dir).sort()) {
      if (entry.toLowerCase().endsWith('.json')) read(path.join(dir, entry), 'sysop');
    }
  }

  return { packs, problems };
}

/**
 * Write a sysop's pack.
 *
 * Validated first, through the loader the game uses: a pack that would be
 * rejected on load is rejected here, where the sysop is still looking at it
 * and can fix it. Returns the file it was written to.
 */
export function saveSysopPack(dataDir: string, pack: MissionPack): string {
  // Round-trip it: what is written must be what the game will accept, and
  // parseMissionPack is the only thing that decides that.
  const checked = parseMissionPack(JSON.parse(JSON.stringify(pack)), pack.name);

  const dir = sysopPackDir(dataDir);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, packFileName(checked.name));

  // Written whole and replaced, not appended: a half-written pack is a pack
  // that will not parse, and the reader above would drop it silently.
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(checked, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, file);
  return file;
}

/** Remove a sysop's pack. The shipped one is content and is not deletable. */
export function deleteSysopPack(dataDir: string, name: string): boolean {
  const file = path.join(sysopPackDir(dataDir), packFileName(name));
  if (!fs.existsSync(file)) return false;
  fs.unlinkSync(file);
  return true;
}

export { MissionPackError };
