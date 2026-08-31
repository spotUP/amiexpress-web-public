/**
 * The installed-door list, and the one place its display rules are applied.
 *
 * Extracted from BBSApi.getDoorList on 2026-08-31 for phase B of
 * `docs/superpowers/specs/2026-08-30-doorrepo-parity-design.md`. The logic was
 * already session-free apart from where the BBS root came from; it lived on a
 * session-bound class only because its first caller had a session.
 *
 * Three callers now share it: BBSApi.getDoorList (DOORMAN and every other
 * in-process door), GET /api/door-admin/installed (the DoorRepo C door), and
 * the tests. That is the point - the spec's rule is "two front ends must
 * never carry two rules", and the precedence between a door's own .info and
 * the catalog is decided here and nowhere else.
 */

import * as path from 'path';
import * as amigafs from '../utils/amigafs';
import { getInstallByCommand, DoorInstall } from './door-installs.repository';
import { applyRepoMetadata, getRepoMetadataIndex } from './door-repo-metadata';

/** One row of the installed-door list, as both doors render it. */
export interface DoorListEntry {
  id: string;
  command: string;
  name: string;
  description: string;
  type: string;
  doorType?: string;
  size: number;
  accessLevel: number;
  enabled: boolean;
  category?: string;
  location: string;
  resolvedPath?: string;
  /** Present once an install record exists; the catalog join key. */
  archiveName?: string;
}

/**
 * Overlay the metadata captured when a door was installed.
 *
 * Defined here rather than in BBSApi so the door list and its metadata rule
 * sit together; BBSApi re-exports it, which is the import path the existing
 * callers and tests use.
 */
export function applyInstallMetadata<T extends Record<string, unknown>>(
  door: T,
  match: DoorInstall | null
): T {
  if (!match) return door;
  return {
    ...door,
    name: match.name || door.name,
    description: match.description || door.description,
    category: match.category || door.category,
    version: match.version || undefined,
    releaseGroup: match.release_group || undefined,
  } as T;
}

/**
 * Build the installed-door list for a board rooted at `bbsRoot`.
 *
 * @param bbsRoot absolute path to the BBS data directory
 */
export async function buildDoorList(bbsRoot: string): Promise<DoorListEntry[]> {
  const { getDoors } = require('../handlers/door.handler');
  const allDoors = getDoors();

  const mapped = allDoors.map((door: any) => {
    let doorSize = door.size || 0;
    let resolvedPath: string | undefined;

    const doorPath = door.path || door.location || '';
    if (doorPath) {
      try {
        // Compute absolute path to the door's directory for the file explorer.
        // door.path may point to a file (e.g. AquaScan.020) or a directory.
        const candidates = [
          path.join(bbsRoot, doorPath),
          path.join(bbsRoot, 'Doors', door.id || door.command),
          path.join(bbsRoot, 'Doors', (door.command || door.id || '').toLowerCase()),
        ];
        for (const testPath of candidates) {
          if (amigafs.existsSync(testPath)) {
            const stats = amigafs.statSync(testPath);
            if (doorSize === 0) doorSize = stats.size;
            resolvedPath = stats.isDirectory() ? testPath : path.dirname(testPath);
            break;
          }
        }
      } catch (_) { /* ignore */ }
    }

    return {
      id: door.id || door.command,
      command: door.command || door.id,
      name: door.name || door.command || door.id,
      description: door.description || '',
      type: door.type || 'AMI',
      doorType: door.type,
      size: doorSize,
      accessLevel: door.accessLevel || 0,
      enabled: door.enabled !== false,
      category: door.category || undefined,
      location: doorPath,
      resolvedPath,
    };
  });

  // getInstallByCommand opens and closes its own better-sqlite3 connection
  // per call (door-installs.repository.ts) - with 370 registered commands,
  // calling it twice per door here meant 740 open/close cycles per render.
  // Fetched once per door below and threaded into both overlays instead.
  const installByCommand = new Map<string, DoorInstall | null>();
  const withMetadata = mapped.map((door: any) => {
    // Overlay the metadata captured when this door was installed. It used
    // to come from door_catalog; the shared catalog now lives in the door
    // server, and door_installs holds this node's snapshot of it (keyed by
    // command, so no installed_as matching is needed any more).
    let installRow: DoorInstall | null = null;
    try {
      installRow = getInstallByCommand(door.command);
    } catch { /* catalog not yet built */ }
    installByCommand.set(door.command, installRow);
    const archiveName = installRow?.archive_name ?? undefined;
    try {
      return { ...applyInstallMetadata(door, installRow), archiveName };
    } catch { /* catalog not yet built — return door as-is */ }
    return { ...door, archiveName };
  });

  // Doors put on disk any other way have no install record - and on this
  // board door_installs does not exist at all, so every command reaches
  // the doors menu with an empty description. Ask the repo for the ones it
  // recognises. Only empty fields are filled: what a door's own .info says
  // always wins.
  try {
    const repoIndex = await getRepoMetadataIndex();
    return withMetadata.map((door: any) => {
      const archiveName = installByCommand.get(door.command)?.archive_name ?? null;
      return applyRepoMetadata(door, repoIndex, { archiveName });
    });
  } catch {
    return withMetadata;
  }
}
