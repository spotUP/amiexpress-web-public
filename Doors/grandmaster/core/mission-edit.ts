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

import { MISSION_OBJECTIVES, type Mission, type MissionObjective } from './mission-types';
import type { HiddenMode } from './types';

/** The HIDDEN speeds, in the order the editor cycles them. */
export const HIDDEN_MODES: readonly HiddenMode[] = ['OFF', 'SLOW', 'FAST', 'FASTEST'];

/** A field of a mission, as the editor presents it. */
export type MissionField =
  | 'name'
  | 'objective'
  | 'norm'
  | 'timeLimitSeconds'
  | 'startLevel'
  | 'garbageRows'
  | 'big'
  | 'hidden'
  | 'hideNext'
  | 'rollRoll'
  | 'hint';

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
export const MISSION_FIELDS: readonly FieldSpec[] = [
  { field: 'name', kind: 'text', label: 'Name',
    help: 'What the player sees in the list.' },
  { field: 'objective', kind: 'choice', label: 'Objective',
    help: 'What has to be done. Only objectives this engine can judge are offered.' },
  { field: 'norm', kind: 'number', label: 'How many', min: 0, max: 9999,
    help: 'The count the objective needs. SURVIVE ignores it.' },
  { field: 'timeLimitSeconds', kind: 'number', label: 'Time limit', min: 0, max: 3600,
    help: 'Seconds. 0 is no clock - except SURVIVE, which needs one.' },
  { field: 'startLevel', kind: 'number', label: 'Start level', min: 0, max: 999,
    help: 'Starting speed. 500 and up is near-20G.' },
  { field: 'garbageRows', kind: 'number', label: 'Garbage rows', min: 0, max: 19,
    help: 'Rows of rubbish the field starts with.' },
  { field: 'big', kind: 'choice', label: 'BIG pieces',
    help: 'Every piece is double size.' },
  { field: 'hidden', kind: 'choice', label: 'HIDDEN',
    help: 'Locked blocks fade out. The faster the setting, the sooner.' },
  { field: 'hideNext', kind: 'choice', label: 'Hide NEXT',
    help: 'The preview is not drawn.' },
  { field: 'rollRoll', kind: 'choice', label: 'ROLL ROLL',
    help: 'The piece rotates by itself every half second.' },
  { field: 'hint', kind: 'text', label: 'Hint',
    help: 'One line shown under the objective. Optional.' },
];

/** A new mission: the smallest one that is valid and playable. */
export function blankMission(index: number): Mission {
  return {
    id: String(index + 1).padStart(2, '0'),
    name: `MISSION ${index + 1}`,
    objective: 'lines',
    norm: 10,
    timeLimitSeconds: 0,
    startLevel: 0,
    garbageRows: 0,
    modifiers: {},
    hint: '',
  };
}

/** What a field currently reads as, for the editor's list. */
export function fieldValue(mission: Mission, field: MissionField): string {
  switch (field) {
    case 'name': return mission.name;
    case 'objective': return mission.objective;
    case 'norm': return mission.objective === 'survive' ? '-' : String(mission.norm);
    case 'timeLimitSeconds':
      return mission.timeLimitSeconds > 0 ? `${mission.timeLimitSeconds}s` : 'none';
    case 'startLevel': return String(mission.startLevel);
    case 'garbageRows': return String(mission.garbageRows);
    case 'big': return mission.modifiers.big ? 'on' : 'off';
    case 'hidden': return mission.modifiers.hidden ?? 'OFF';
    case 'hideNext': return mission.modifiers.hideNext ? 'on' : 'off';
    case 'rollRoll': return mission.modifiers.rollRoll ? 'on' : 'off';
    case 'hint': return mission.hint ?? '';
    default: return '';
  }
}

/**
 * Step a cycled field, in either direction.
 *
 * Returns a NEW mission: the editor keeps the original until a save, so
 * leaving without saving really does leave the pack alone.
 */
export function cycleField(mission: Mission, field: MissionField, step: number): Mission {
  const next: Mission = { ...mission, modifiers: { ...mission.modifiers } };

  switch (field) {
    case 'objective': {
      const at = MISSION_OBJECTIVES.indexOf(mission.objective);
      const to = (at + step + MISSION_OBJECTIVES.length) % MISSION_OBJECTIVES.length;
      next.objective = MISSION_OBJECTIVES[to] as MissionObjective;
      // SURVIVE is the one objective that cannot end without a clock, so
      // choosing it gives the mission one rather than leaving a pack that
      // will not load.
      if (next.objective === 'survive' && next.timeLimitSeconds <= 0) {
        next.timeLimitSeconds = 60;
      }
      break;
    }
    case 'hidden': {
      const at = HIDDEN_MODES.indexOf(next.modifiers.hidden ?? 'OFF');
      const to = (at + step + HIDDEN_MODES.length) % HIDDEN_MODES.length;
      const mode = HIDDEN_MODES[to];
      if (mode === 'OFF') delete next.modifiers.hidden;
      else next.modifiers.hidden = mode;
      break;
    }
    case 'big':
      if (next.modifiers.big) delete next.modifiers.big; else next.modifiers.big = true;
      break;
    case 'hideNext':
      if (next.modifiers.hideNext) delete next.modifiers.hideNext; else next.modifiers.hideNext = true;
      break;
    case 'rollRoll':
      if (next.modifiers.rollRoll) delete next.modifiers.rollRoll; else next.modifiers.rollRoll = true;
      break;
    default:
      // Numbers and text are typed, not stepped.
      break;
  }

  return next;
}

/**
 * Put a typed value into a field.
 *
 * Rejects rather than clamps: a sysop who typed 5000 for a time limit meant
 * something, and silently storing 3600 is how a pack stops matching what its
 * author believes it says. Returns the reason when it will not take.
 */
export function setField(
  mission: Mission,
  field: MissionField,
  typed: string,
): { mission: Mission } | { error: string } {
  const spec = MISSION_FIELDS.find((entry) => entry.field === field);
  if (!spec) return { error: `no such field: ${field}` };

  const next: Mission = { ...mission, modifiers: { ...mission.modifiers } };

  if (spec.kind === 'number') {
    const value = Number(typed.trim());
    if (!Number.isFinite(value) || Math.floor(value) !== value) {
      return { error: `${spec.label} must be a whole number` };
    }
    if (value < (spec.min ?? 0) || value > (spec.max ?? Number.MAX_SAFE_INTEGER)) {
      return { error: `${spec.label} must be between ${spec.min ?? 0} and ${spec.max}` };
    }
    if (field === 'norm') next.norm = value;
    else if (field === 'timeLimitSeconds') next.timeLimitSeconds = value;
    else if (field === 'startLevel') next.startLevel = value;
    else if (field === 'garbageRows') next.garbageRows = value;

    if (next.objective === 'survive' && next.timeLimitSeconds <= 0) {
      return { error: 'SURVIVE needs a time limit - that is the whole mission' };
    }
    return { mission: next };
  }

  const text = typed.trim();
  if (field === 'name') {
    if (!text) return { error: 'a mission needs a name' };
    next.name = text.slice(0, 40);
  } else if (field === 'hint') {
    next.hint = text.slice(0, 60);
  }
  return { mission: next };
}
