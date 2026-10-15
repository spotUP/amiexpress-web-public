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
import { MissionPackError } from './mission-pack';
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
export declare function packFileName(name: string): string;
/** Where a sysop's packs are kept. */
export declare function sysopPackDir(dataDir: string): string;
/**
 * Every pack this board can offer, shipped first.
 *
 * A pack that will not parse is skipped rather than thrown: one bad file a
 * sysop is halfway through writing must not take MISSION mode away from
 * every player. The reason comes back in `problems` so it can be shown.
 */
export declare function listPacks(doorRoot: string, dataDir: string): {
    packs: StoredPack[];
    problems: string[];
};
/**
 * Write a sysop's pack.
 *
 * Validated first, through the loader the game uses: a pack that would be
 * rejected on load is rejected here, where the sysop is still looking at it
 * and can fix it. Returns the file it was written to.
 */
export declare function saveSysopPack(dataDir: string, pack: MissionPack): string;
/** Remove a sysop's pack. The shipped one is content and is not deletable. */
export declare function deleteSysopPack(dataDir: string, name: string): boolean;
export { MissionPackError };
//# sourceMappingURL=mission-store.d.ts.map