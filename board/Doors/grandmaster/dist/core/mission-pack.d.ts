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
import { type MissionPack } from './mission-types';
export declare class MissionPackError extends Error {
}
/** Parse a pack that has already been read into memory. */
export declare function parseMissionPack(raw: unknown, source?: string): MissionPack;
/**
 * Read a pack from disk. Kept separate from parsing so the parser stays
 * testable without a filesystem, and so a door that must never resolve paths
 * from `process.cwd()` can hand in one it worked out itself.
 */
export declare function loadMissionPack(filePath: string): MissionPack;
//# sourceMappingURL=mission-pack.d.ts.map