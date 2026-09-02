/**
 * MISSION mode - the briefing.
 *
 * The select screen names a mission and its one-line hint; that is not enough
 * to play one. A mission carries an objective, a norm, a clock, a starting
 * speed, a stack of garbage and up to four rule changes, and the player meets
 * all of them at once when the first piece falls. This is the screen that
 * says so first.
 *
 * The text is built by a pure function so the wording can be tested without a
 * terminal - the same reason core/mission-run.ts judges away from the engine.
 */
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { Mission, MissionPack } from '../core/mission-types';
import type { MissionClear } from '../core/mission-progress';
/** One sentence saying what the player has to do. */
export declare function missionObjectiveText(mission: Mission): string;
/** Every rule this mission changes, in the order a player meets them. */
export declare function missionConditions(mission: Mission): string[];
/**
 * The whole briefing as lines, ready to paint. Exported for the same reason
 * the pieces above are: what the player is told is worth a test.
 */
export declare function missionBriefingLines(mission: Mission, clear: MissionClear | null): string[];
/**
 * Pick a mission and read its briefing, until the player either starts one or
 * leaves the pack.
 *
 * The loop lives here rather than in app.ts so it can be driven in a test:
 * backing out of a briefing has to return to the LIST, not to the menu, and
 * that is the part a player notices when it is wrong.
 */
export declare function pickMission(pack: MissionPack, clearFor: (missionId: string) => MissionClear | null, dialogs: {
    select: (pack: MissionPack) => Promise<Mission | null>;
    brief: (mission: Mission, clear: MissionClear | null) => Promise<boolean>;
}): Promise<Mission | null>;
/**
 * Show the briefing. Resolves true to start the mission, false to go back to
 * the pack - the player has to be able to change their mind after reading
 * what they picked.
 */
export declare function showMissionBriefing(screen: Screen, mission: Mission, clear: MissionClear | null): Promise<boolean>;
//# sourceMappingURL=mission-briefing.d.ts.map