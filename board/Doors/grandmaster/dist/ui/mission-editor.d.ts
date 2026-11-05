/**
 * MISSION mode - the sysop's editor.
 *
 * The reference ships an editor and this door shipped a JSON file, so a
 * sysop who wanted a mission of their own had to leave the board, find the
 * file and know the schema. This is that editor, in the door.
 *
 * Two screens, both lists, because that is what this door already uses:
 * the pack (its missions, plus a row to add one) and one mission (its
 * fields). Cycled fields step with LEFT/RIGHT; typed ones ask.
 *
 * Nothing is written until S. The rules live in core/mission-edit.ts, and
 * every save goes through parseMissionPack (core/mission-store.ts), so the
 * editor cannot produce a pack the game would refuse to load.
 */
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { MissionPack } from '../core/mission-types';
export interface MissionEditorResult {
    /** The file written, when the sysop saved. */
    savedTo?: string;
}
/**
 * Edit a pack.
 *
 * `pack` is a starting point - the shipped pack is content and is never
 * written to, so a save always produces a sysop pack under the data
 * directory, named after the pack.
 */
export declare function showMissionEditor(screen: Screen, pack: MissionPack, dataDir: string): Promise<MissionEditorResult>;
//# sourceMappingURL=mission-editor.d.ts.map