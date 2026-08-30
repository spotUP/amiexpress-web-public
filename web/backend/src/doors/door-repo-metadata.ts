/**
 * Door metadata from the door repo, for doors this BBS did not install
 * through it.
 *
 * getDoorList() overlays name/description/category/version from
 * door_installs - this node's snapshot of the repo, written when a door is
 * installed through DOORMAN or DOORREPO. Doors that were put on disk any
 * other way have no such row, and on this board `door_installs` does not
 * exist at all, so every one of the 365 commands reaches the doors menu with
 * an empty description.
 *
 * The repo knows what most of them are. This module asks it - once, cached -
 * and offers the answer to anything rendering a door list. It never
 * overwrites what a door's own .info says; it only fills what is empty - with
 * one exception: a NAME that is not a name at all (ASCII art, mojibake, an
 * echo of the command) loses to the catalog's title. See
 * ./door-name-plausibility for that call.
 *
 * Matching is deliberately narrow, because a wrong description is worse than
 * none:
 *
 *   1. a door with an install record is matched by its recorded archive name,
 *      exactly - nothing else is trusted for it
 *   2. otherwise, the door's name equals a catalog entry's name, ignoring
 *      case and punctuation
 *   3. otherwise, the door's command equals an archive's base name, same
 *      comparison
 *
 * Anything less certain than that is left alone.
 */

import { isPlausibleDoorName } from './door-name-plausibility';

export interface RepoDoorMetadata {
  archiveName: string;
  name: string | null;
  description: string | null;
  category: string | null;
  author: string | null;
  releaseGroup: string | null;
  doorType: string | null;
}

/** Ten minutes: the catalog changes when somebody curates it, not per call. */
export const METADATA_TTL_MS = 10 * 60 * 1000;

interface CacheEntry {
  byKey: Map<string, RepoDoorMetadata>;
  fetchedAt: number;
}

let cache: CacheEntry | null = null;

/** `Some Door v2!` and `SOMEDOOR-V2` compare equal. */
export function metadataKey(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** `-D-CALC.LHA` -> `dcalc`. */
export function archiveKey(archiveName: string): string {
  return metadataKey(archiveName.replace(/\.(lha|lzx|zip|lzh)$/i, ''));
}

export function buildMetadataIndex(doors: RepoDoorMetadata[]): Map<string, RepoDoorMetadata> {
  const byKey = new Map<string, RepoDoorMetadata>();

  for (const door of doors) {
    // The archive name is the stable identity; a display name may repeat
    // across releases, and the first one indexed wins rather than the last.
    const archive = archiveKey(door.archiveName);
    if (archive && !byKey.has(archive)) byKey.set(archive, door);

    const name = metadataKey(door.name);
    if (name && !byKey.has(name)) byKey.set(name, door);
  }

  return byKey;
}

/** The configured door server, or null when this BBS has none. */
function doorServerUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = (env.DOOR_SERVER_URL ?? '').replace(/\/+$/, '');
  return raw.length > 0 ? raw : null;
}

/**
 * The repo's door metadata, indexed for lookup.
 *
 * Returns an empty index when no door server is configured or it cannot be
 * reached - a door list must render either way, just without the extra
 * description.
 */
export async function getRepoMetadataIndex(
  now: number = Date.now(),
  fetchImpl: typeof fetch = fetch
): Promise<Map<string, RepoDoorMetadata>> {
  if (cache && now - cache.fetchedAt < METADATA_TTL_MS) return cache.byKey;

  const base = doorServerUrl();
  if (!base) return new Map();

  try {
    const response = await fetchImpl(`${base}/api/door-repo/manifest`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return cache?.byKey ?? new Map();

    const manifest = (await response.json()) as { doors?: RepoDoorMetadata[] };
    const byKey = buildMetadataIndex(manifest.doors ?? []);
    cache = { byKey, fetchedAt: now };
    return byKey;
  } catch {
    // Keep serving the last good index rather than dropping descriptions the
    // moment the door server hiccups.
    return cache?.byKey ?? new Map();
  }
}

/** Forget the cached index. For tests, and for a catalog that just changed. */
export function clearRepoMetadataCache(): void {
  cache = null;
}

export interface EnrichableDoor {
  command?: string;
  name?: string;
  description?: string;
  category?: string;
  [key: string]: unknown;
}

/**
 * Fill a door's empty fields from the repo.
 *
 * What the door itself says always wins, except for a NAME that is not a
 * name at all - see ./door-name-plausibility.
 */
export function applyRepoMetadata<T extends EnrichableDoor>(
  door: T,
  index: Map<string, RepoDoorMetadata>,
  link?: { archiveName: string | null }
): T {
  if (index.size === 0) return door;

  // A door installed through DOORMAN or DOORREPO records the archive it came
  // from, so it is looked up by that and nothing else. The name/command
  // heuristics below exist only for the doors that predate the recorder.
  const match = link?.archiveName
    ? index.get(archiveKey(link.archiveName)) ?? null
    : index.get(metadataKey(door.name)) ?? index.get(metadataKey(door.command)) ?? null;
  if (!match) return door;

  // The repo's name wins when the door's own is not a name at all - art,
  // mojibake, or an echo of the command. Anything a sysop plainly wrote is
  // kept, which is why this asks a predicate rather than testing for empty.
  const keepOwnName = isPlausibleDoorName(door.name, {
    command: door.command,
    archiveName: link?.archiveName ?? null,
  });

  return {
    ...door,
    name: keepOwnName ? door.name : (match.name || door.name),
    description: door.description || match.description || '',
    category: door.category || match.category || undefined,
  };
}
