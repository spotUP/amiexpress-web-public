/**
 * MISSION mode - the select screen.
 *
 * Free selection: every mission in the pack is playable from the start, and
 * the list doubles as a progress board - a cleared mission shows its best
 * time. HeborisCE's own mission screen is a browser over a pack too
 * (mission.c:47-171 walks the entries with the same left/right keys).
 */
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { Mission, MissionPack } from '../core/mission-types';
import type { MissionProgress } from '../core/mission-progress';
/** mm:ss for a clear time. */
export declare function formatClearTime(seconds: number): string;
/**
 * One row per mission: number, name, objective, and the best time if this
 * player has cleared it. Exported so a test can assert what the list SAYS
 * without building a terminal.
 */
export declare function missionRows(pack: MissionPack, clears: Record<string, {
    seconds: number;
}>): string[];
/**
 * Show the pack and return the chosen mission, or null if the player quit.
 */
/**
 * What the select screen came back with: a mission, nothing, or - for a
 * sysop, who is the only one offered it - the editor.
 */
export type MissionChoice = Mission | 'edit' | null;
export declare function showMissionSelect(screen: Screen, pack: MissionPack, progress: MissionProgress, playerName: string, 
/** Sysops get one extra key. Everyone else is not told about it. */
canEdit?: boolean): Promise<MissionChoice>;
//# sourceMappingURL=mission-select.d.ts.map