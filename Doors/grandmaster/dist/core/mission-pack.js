"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MissionPackError = void 0;
exports.parseMissionPack = parseMissionPack;
exports.loadMissionPack = loadMissionPack;
const mission_types_1 = require("./mission-types");
const HIDDEN_MODES = ['OFF', 'SLOW', 'FAST', 'FASTEST'];
class MissionPackError extends Error {
}
exports.MissionPackError = MissionPackError;
function fail(where, message) {
    throw new MissionPackError(`${where}: ${message}`);
}
function asPositiveInt(value, where, field, fallback) {
    if (value === undefined && fallback !== undefined)
        return fallback;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || Math.floor(value) !== value) {
        fail(where, `${field} must be a whole number of 0 or more, got ${JSON.stringify(value)}`);
    }
    return value;
}
/** Parse a pack that has already been read into memory. */
function parseMissionPack(raw, source = 'mission pack') {
    if (typeof raw !== 'object' || raw === null)
        fail(source, 'expected a JSON object');
    const pack = raw;
    const name = typeof pack.name === 'string' && pack.name.trim() ? pack.name.trim() : 'MISSIONS';
    if (!Array.isArray(pack.missions) || pack.missions.length === 0) {
        fail(source, 'missions must be a non-empty array');
    }
    const seen = new Set();
    const missions = pack.missions.map((entry, index) => {
        const where = `${source} #${index + 1}`;
        if (typeof entry !== 'object' || entry === null)
            fail(where, 'expected an object');
        const m = entry;
        const objective = m.objective;
        if (!mission_types_1.MISSION_OBJECTIVES.includes(objective)) {
            fail(where, `objective "${String(m.objective)}" is not one this engine can judge `
                + `(have: ${mission_types_1.MISSION_OBJECTIVES.join(', ')})`);
        }
        const id = typeof m.id === 'string' && m.id.trim() ? m.id.trim() : String(index + 1).padStart(2, '0');
        if (seen.has(id))
            fail(where, `duplicate mission id "${id}"`);
        seen.add(id);
        const timeLimitSeconds = asPositiveInt(m.timeLimitSeconds, where, 'timeLimitSeconds', 0);
        if (objective === 'survive' && timeLimitSeconds <= 0) {
            fail(where, 'a survive mission needs a timeLimitSeconds to outlast');
        }
        const norm = asPositiveInt(m.norm, where, 'norm', objective === 'survive' ? 0 : undefined);
        if (objective !== 'survive' && objective !== 'cycle' && norm <= 0) {
            fail(where, `objective "${objective}" needs a norm of 1 or more`);
        }
        const rawModifiers = (m.modifiers ?? {});
        const hidden = rawModifiers.hidden;
        if (hidden !== undefined && !HIDDEN_MODES.includes(hidden)) {
            fail(where, `modifiers.hidden must be one of ${HIDDEN_MODES.join(', ')}`);
        }
        return {
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
function loadMissionPack(filePath) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    let text;
    try {
        text = fs.readFileSync(filePath, 'utf8');
    }
    catch (error) {
        throw new MissionPackError(`cannot read mission pack ${filePath}: ${error.message}`);
    }
    let raw;
    try {
        raw = JSON.parse(text);
    }
    catch (error) {
        throw new MissionPackError(`${filePath} is not valid JSON: ${error.message}`);
    }
    return parseMissionPack(raw, filePath);
}
//# sourceMappingURL=mission-pack.js.map