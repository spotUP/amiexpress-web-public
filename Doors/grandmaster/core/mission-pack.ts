/**
 * MISSION mode - reading a pack off disk.
 *
 * A pack is JSON, the same shape the reference's editor writes row by row
 * (mission.c:182-265): one entry per mission, carrying its objective, its
 * norm, its clock, its starting level, its garbage and its modifiers.
 *
 * The loader is strict on purpose. An unknown objective is not a mission that
 * plays oddly - it is a mission that can never be completed - so it is
 * rejected by name, with the pack and index that carried it, rather than
 * loaded and left for a player to discover.
 */

import {
  MISSION_OBJECTIVES, type Mission, type MissionObjective, type MissionPack,
  type RequiredPiece,
} from './mission-types';
import type { HiddenMode } from './types';

/** The GRADE forms an "erase exactly N" objective can be counted in. */
const STRICTNESS: ReadonlyArray<NonNullable<Mission['strictness']>> = [
  'exact', 'atLeast', 'exactOrReset',
];

/** The objectives that read it (mission.c:841-866 - DOUBLE and TRIPLE). */
const STRICT_OBJECTIVES: ReadonlyArray<MissionObjective> = [
  // DOUBLE ORDER is here because mission.c:1019 reads opt_1 for it too, even
  // though that door's editor labels the slot "NO OPTION".
  'single', 'double', 'triple', 'tetris', 'b2bTetris', 'doubleOrder',
];

/** The ORDER family: every one of them is about a named piece. */
const ORDER_OBJECTIVES: ReadonlyArray<MissionObjective> = [
  'blockOrder', 'singleOrder', 'doubleOrder', 'tripleOrder', 'reTripleOrder',
];

/** The timings a mission may name (core/mission-types.ts's MissionSpeed). */
const SPEED_FIELDS: readonly string[] = ['gravity', 'are', 'lineClear', 'lockDelay', 'das'];

/** What `requiredPiece` may say (mission.c:354-362). */
const REQUIRED_PIECES: ReadonlyArray<RequiredPiece> = [
  'I', 'O', 'T', 'S', 'Z', 'J', 'L', 'LJ', 'SZ',
];

const HIDDEN_MODES: readonly HiddenMode[] = ['OFF', 'SLOW', 'FAST', 'FASTEST'];

export class MissionPackError extends Error {}

function fail(where: string, message: string): never {
  throw new MissionPackError(`${where}: ${message}`);
}

function asPositiveInt(value: unknown, where: string, field: string, fallback?: number): number {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || Math.floor(value) !== value) {
    fail(where, `${field} must be a whole number of 0 or more, got ${JSON.stringify(value)}`);
  }
  return value as number;
}

/** Parse a pack that has already been read into memory. */
export function parseMissionPack(raw: unknown, source = 'mission pack'): MissionPack {
  if (typeof raw !== 'object' || raw === null) fail(source, 'expected a JSON object');
  const pack = raw as Record<string, unknown>;

  const name = typeof pack.name === 'string' && pack.name.trim() ? pack.name.trim() : 'MISSIONS';
  if (!Array.isArray(pack.missions) || pack.missions.length === 0) {
    fail(source, 'missions must be a non-empty array');
  }

  const seen = new Set<string>();
  const missions: Mission[] = (pack.missions as unknown[]).map((entry, index) => {
    const where = `${source} #${index + 1}`;
    if (typeof entry !== 'object' || entry === null) fail(where, 'expected an object');
    const m = entry as Record<string, unknown>;

    const objective = m.objective as MissionObjective;
    if (!MISSION_OBJECTIVES.includes(objective)) {
      fail(where, `objective "${String(m.objective)}" is not one this engine can judge `
        + `(have: ${MISSION_OBJECTIVES.join(', ')})`);
    }

    const id = typeof m.id === 'string' && m.id.trim() ? m.id.trim() : String(index + 1).padStart(2, '0');
    if (seen.has(id)) fail(where, `duplicate mission id "${id}"`);
    seen.add(id);

    const timeLimitSeconds = asPositiveInt(m.timeLimitSeconds, where, 'timeLimitSeconds', 0);
    if (objective === 'survive' && timeLimitSeconds <= 0) {
      fail(where, 'a survive mission needs a timeLimitSeconds to outlast');
    }

    /*
     * 'cycle' used to be judged against a hardcoded four, so a pack written
     * against this door may leave its norm out entirely. Four is what that
     * meant, and it is still what it means - the norm is read now, but an
     * absent one keeps every existing pack playing the same mission.
     */
    const normDefault = objective === 'survive' ? 0 : objective === 'cycle' ? 4 : undefined;
    const norm = asPositiveInt(m.norm, where, 'norm', normDefault);
    if (objective !== 'survive' && norm <= 0) {
      fail(where, `objective "${objective}" needs a norm of 1 or more`);
    }
    // 'cycle' counts DISTINCT clear sizes and there are exactly four of them,
    // so a norm of five is a mission nobody can finish. The judge compares
    // against the norm (mission.c:874-879); the loader is where an
    // unplayable one is refused.
    if (objective === 'cycle' && norm > 4) {
      fail(where, 'a cycle mission cannot ask for more than the four clear sizes');
    }

    /*
     * The GRADE option (mission_opt_1). Only the "erase exactly N" family
     * reads it, and BTOB 4L's strictness is part of what that objective IS -
     * a pack asking for a softer one is asking for a different mission, so
     * it is refused rather than quietly ignored.
     */
    const strictness = m.strictness as Mission['strictness'] | undefined;
    if (strictness !== undefined && !STRICTNESS.includes(strictness)) {
      fail(where, `strictness must be one of ${STRICTNESS.join(', ')}`);
    }
    if (strictness !== undefined && !STRICT_OBJECTIVES.includes(objective)) {
      fail(where, `objective "${objective}" does not take a strictness`);
    }
    if (strictness !== undefined && objective === 'b2bTetris' && strictness !== 'exactOrReset') {
      fail(where, 'b2bTetris IS the exactOrReset form; a softer one is a tetris mission');
    }

    const ignoreSingles = m.ignoreSingles;
    if (ignoreSingles !== undefined && typeof ignoreSingles !== 'boolean') {
      fail(where, 'ignoreSingles must be true or false');
    }
    if (ignoreSingles !== undefined && objective !== 'combo') {
      fail(where, `objective "${objective}" does not take ignoreSingles`);
    }

    /*
     * The ORDER family is ABOUT the piece, so a pack that does not name one
     * is not a mission this engine can judge - the same reasoning that
     * refuses an unknown objective. 'LJ' and 'SZ' on RE TRIPLE ORDER are the
     * reference's own special case: there they count every triple
     * (mission.c:1044-1048), and that is worth writing down rather than
     * discovering in play.
     */
    const requiredPiece = m.requiredPiece as RequiredPiece | undefined;
    if (requiredPiece !== undefined && !REQUIRED_PIECES.includes(requiredPiece)) {
      fail(where, `requiredPiece must be one of ${REQUIRED_PIECES.join(', ')}`);
    }
    if (ORDER_OBJECTIVES.includes(objective) && requiredPiece === undefined) {
      fail(where, `objective "${objective}" needs a requiredPiece to be about`);
    }
    if (requiredPiece !== undefined && !ORDER_OBJECTIVES.includes(objective)) {
      fail(where, `objective "${objective}" does not take a requiredPiece`);
    }

    const requireHold = m.requireHold;
    if (requireHold !== undefined && typeof requireHold !== 'boolean') {
      fail(where, 'requireHold must be true or false');
    }
    if (requireHold !== undefined && !ORDER_OBJECTIVES.includes(objective)) {
      fail(where, `objective "${objective}" does not take requireHold`);
    }

    /*
     * A mission's own timings. Frames, and a gravity in cells per frame -
     * the units core/gravity.ts already speaks. Each is checked because a
     * pack that asks for a lock delay of -1 is a mission nobody can play,
     * and finding that at load is this loader's whole job.
     */
    const rawSpeed = (m.speed ?? undefined) as Record<string, unknown> | undefined;
    let speed: Mission['speed'];
    if (rawSpeed !== undefined) {
      if (typeof rawSpeed !== 'object' || rawSpeed === null || Array.isArray(rawSpeed)) {
        fail(where, 'speed must be an object of timings');
      }
      const timings: Record<string, number> = {};
      for (const [field, value] of Object.entries(rawSpeed)) {
        if (!SPEED_FIELDS.includes(field)) {
          fail(where, `speed.${field} is not a timing this engine reads `
            + `(${SPEED_FIELDS.join(', ')})`);
        }
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
          fail(where, `speed.${field} must be a number of 0 or more, got ${JSON.stringify(value)}`);
        }
        timings[field] = value;
      }
      if (Object.keys(timings).length === 0) {
        fail(where, 'speed names no timing at all; leave it out instead');
      }
      speed = timings as Mission['speed'];
    }

    const rawModifiers = (m.modifiers ?? {}) as Record<string, unknown>;
    const hidden = rawModifiers.hidden as HiddenMode | undefined;
    if (hidden !== undefined && !HIDDEN_MODES.includes(hidden)) {
      fail(where, `modifiers.hidden must be one of ${HIDDEN_MODES.join(', ')}`);
    }

    /*
     * The rising floor is a NUMBER of pieces, and the reference defaults its
     * option to twenty when a pack leaves it at zero (mission.c:1396-1398).
     * A rise of zero written on purpose is the same as not asking for one,
     * so it is the absent case that gets the default, not the written zero.
     */
    const rawRise = rawModifiers.riseEveryPieces;
    if (rawRise !== undefined
      && (typeof rawRise !== 'number' || !Number.isInteger(rawRise) || rawRise < 1)) {
      fail(where, 'modifiers.riseEveryPieces must be a whole number of pieces, 1 or more');
    }

    return {
      ...(strictness !== undefined ? { strictness } : {}),
      ...(ignoreSingles !== undefined ? { ignoreSingles: ignoreSingles as boolean } : {}),
      ...(requiredPiece !== undefined ? { requiredPiece } : {}),
      ...(requireHold !== undefined ? { requireHold: requireHold as boolean } : {}),
      ...(speed !== undefined ? { speed } : {}),
      id,
      name: typeof m.name === 'string' && m.name.trim() ? m.name.trim() : `MISSION ${id}`,
      objective,
      norm,
      timeLimitSeconds,
      startLevel: asPositiveInt(m.startLevel, where, 'startLevel', 0),
      garbageRows: asPositiveInt(m.garbageRows, where, 'garbageRows', 0),
      modifiers: {
        big: rawModifiers.big === true,
        hidden,
        hideNext: rawModifiers.hideNext === true,
        rollRoll: rawModifiers.rollRoll === true,
        rotateLock: rawModifiers.rotateLock === true,
        blind: rawModifiers.blind === true,
        reverse: rawModifiers.reverse === true,
        xray: rawModifiers.xray === true,
        mirror: rawModifiers.mirror === true,
        color: rawModifiers.color === true,
        ...(rawRise !== undefined ? { riseEveryPieces: rawRise as number } : {}),
      },
      hint: typeof m.hint === 'string' ? m.hint : undefined,
    };
  });

  return { name, missions };
}

/**
 * Read a pack from disk. Kept separate from parsing so the parser stays
 * testable without a filesystem, and so a door that must never resolve paths
 * from `process.cwd()` can hand in one it worked out itself.
 */
export function loadMissionPack(filePath: string): MissionPack {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require('fs') as typeof import('fs');
  let text: string;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new MissionPackError(`cannot read mission pack ${filePath}: ${(error as Error).message}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new MissionPackError(`${filePath} is not valid JSON: ${(error as Error).message}`);
  }
  return parseMissionPack(raw, filePath);
}
