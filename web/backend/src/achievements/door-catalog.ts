/**
 * A door's OWN achievements, published to the server from its manifest.
 *
 * A door declares them in its package.json - `amiexpress.achievements` (the
 * design spec's key) or `door.achievements` (the key the game doors already
 * use for their metadata) - and the board pushes them under the door's
 * command with PUT /catalog/doors/<command>. Ids must be
 * `door.<command>.<slug>`; the server refuses anything else, and a
 * published id is immutable, so a changed definition is a 409 and the
 * original stands.
 *
 * WHEN. Once per process, the first time the flusher runs with a configured
 * board - not per door launch, and not at boot (a board is often configured
 * after it started). A door whose manifest has no achievements is skipped
 * entirely, so this costs one directory scan on a board that has none.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { DoorAchievementsApi } from './door-api';
import { apiRequest } from './client';
import type { FetchLike } from './client';
import type { AchievementsSettings } from './config';

export interface DoorAchievementDef {
  id: string;
  name: string;
  description: string;
  family?: string;
  tier: string;
  points: number;
  hidden?: boolean;
  rule: Record<string, unknown>;
}

export interface DoorManifest {
  /** The door's command, lowercased - the URL segment the server files it under. */
  command: string;
  dir: string;
  achievements: DoorAchievementDef[];
}

/** Where the doors live, relative to the backend's own source tree. */
export function doorsRoot(): string {
  return process.env.DOORS_ROOT || path.resolve(__dirname, '..', '..', '..', '..', 'Doors');
}

interface RawManifest {
  bbsCommand?: string;
  amiexpress?: { command?: string; achievements?: DoorAchievementDef[] };
  door?: { command?: string; achievements?: DoorAchievementDef[] };
}

/** The command and the achievements a manifest declares, or null for neither. */
export function manifestOf(dir: string, read: (p: string) => string = (p) => fs.readFileSync(p, 'utf-8')): DoorManifest | null {
  let pkg: RawManifest;
  try {
    pkg = JSON.parse(read(path.join(dir, 'package.json'))) as RawManifest;
  } catch {
    return null;
  }
  const achievements = pkg.amiexpress?.achievements ?? pkg.door?.achievements;
  if (!Array.isArray(achievements) || achievements.length === 0) return null;
  const command = (pkg.amiexpress?.command ?? pkg.door?.command ?? pkg.bbsCommand ?? '').trim().toLowerCase();
  if (!command) return null;
  return { command, dir, achievements };
}

/** Every door manifest under `root` that declares achievements. */
export function doorManifests(root: string = doorsRoot()): DoorManifest[] {
  let names: string[];
  try {
    names = fs.readdirSync(root);
  } catch {
    return [];
  }
  const out: DoorManifest[] = [];
  for (const name of names.sort()) {
    const m = manifestOf(path.join(root, name));
    if (m) out.push(m);
  }
  return out;
}

/** The manifest digest the server stores, so an unchanged manifest is a no-op. */
export function manifestDigest(defs: DoorAchievementDef[]): string {
  return 'sha256:' + crypto.createHash('sha256').update(JSON.stringify(defs)).digest('hex');
}

/** command -> the digest this process already pushed (or gave up on). */
const pushed = new Map<string, string>();

export function _resetDoorCatalogCacheForTests(): void {
  pushed.clear();
}

export interface RegisterResult {
  pushed: string[];
  unchanged: string[];
  refused: { command: string; error: string }[];
}

/**
 * Push every door's definitions once. A 409 (an id published with a
 * different definition) is logged once and cached like a success: retrying
 * it every five seconds would say the same thing for ever.
 */
export async function registerDoorCatalogs(
  settings: AchievementsSettings,
  manifests: DoorManifest[] = doorManifests(),
  fetchImpl: FetchLike = fetch,
  log: (line: string) => void = (line) => console.log(line)
): Promise<RegisterResult> {
  const result: RegisterResult = { pushed: [], unchanged: [], refused: [] };
  if (!settings.enabled) return result;
  for (const m of manifests) {
    const digest = manifestDigest(m.achievements);
    if (pushed.get(m.command) === digest) {
      result.unchanged.push(m.command);
      continue;
    }
    const res = await apiRequest(settings, 'PUT', `/catalog/doors/${encodeURIComponent(m.command)}`, { digest, achievements: m.achievements }, fetchImpl);
    if (res.status === 200) {
      pushed.set(m.command, digest);
      result.pushed.push(m.command);
      const body = res.body as { added?: number; unchanged?: number } | null;
      if (body?.added) log(`[OK] achievements: ${m.command} published ${body.added} achievements`);
      continue;
    }
    if (res.status === 409 || (res.status >= 400 && res.status < 500)) {
      // Terminal: the definitions are wrong or already published
      // differently. Say so once and stop asking.
      pushed.set(m.command, digest);
      result.refused.push({ command: m.command, error: res.error ?? String(res.status) });
      log(`[WARN] achievements: ${m.command}'s achievements were refused (${res.error ?? res.status}${res.detail ? ': ' + res.detail : ''})`);
      continue;
    }
    // A server that is down: try again on the next pass.
    result.refused.push({ command: m.command, error: res.error ?? String(res.status) });
    return result;
  }
  return result;
}

/** For a door API caller that wants the same push on demand. */
export async function registerDoorCatalogsVia(api: DoorAchievementsApi): Promise<void> {
  void api;
}
