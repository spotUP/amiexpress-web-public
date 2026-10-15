/**
 * MISSION mode - the editable shape of a mission, and its rules.
 *
 * The reference has a mission editor (mission.c:182-265 reads the rows one
 * by one, mission_info.c names the fields) and this door had a JSON file and
 * a sysop with a text editor. This module is the part of an editor that can
 * be tested without a terminal: what the fields are, what a field may hold,
 * and how one is stepped.
 *
 * The rules live here rather than in the screen so the screen cannot invent
 * a mission the loader would reject - and every save still goes through
 * parseMissionPack, which is the one authority on whether a mission can be
 * played at all.
 */
import { type Mission } from './mission-types';
import type { HiddenMode } from './types';
/** The HIDDEN speeds, in the order the editor cycles them. */
export declare const HIDDEN_MODES: readonly HiddenMode[];
/** A field of a mission, as the editor presents it. */
export type MissionField = 'name' | 'objective' | 'norm' | 'timeLimitSeconds' | 'startLevel' | 'garbageRows' | 'big' | 'hidden' | 'hideNext' | 'rollRoll' | 'hint';
export interface FieldSpec {
    field: MissionField;
    label: string;
    /** How it is edited: cycled through values, or typed. */
    kind: 'choice' | 'number' | 'text';
    /** For numbers: the range the loader will accept. */
    min?: number;
    max?: number;
    /** One line under the editor, saying what the field does. */
    help: string;
}
/**
 * The fields, in the order a mission is read out loud: what it is called,
 * what you must do, how much, how long, and then the rules.
 */
export declare const MISSION_FIELDS: readonly FieldSpec[];
/** A new mission: the smallest one that is valid and playable. */
export declare function blankMission(index: number): Mission;
/** What a field currently reads as, for the editor's list. */
export declare function fieldValue(mission: Mission, field: MissionField): string;
/**
 * Step a cycled field, in either direction.
 *
 * Returns a NEW mission: the editor keeps the original until a save, so
 * leaving without saving really does leave the pack alone.
 */
export declare function cycleField(mission: Mission, field: MissionField, step: number): Mission;
/**
 * Put a typed value into a field.
 *
 * Rejects rather than clamps: a sysop who typed 5000 for a time limit meant
 * something, and silently storing 3600 is how a pack stops matching what its
 * author believes it says. Returns the reason when it will not take.
 */
export declare function setField(mission: Mission, field: MissionField, typed: string): {
    mission: Mission;
} | {
    error: string;
};
//# sourceMappingURL=mission-edit.d.ts.map