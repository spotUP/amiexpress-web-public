/**
 * What the sysop set, made safe to use. Same wrapper shape as every other
 * door (see Doors/bbs-dashboard/settings.ts).
 */
import { readDoorSettings } from '@amiexpress/bbs-door-sdk/settings';

export interface QuizSettings {
  /** How many questions in a round. */
  questions: number;
  /** Pack id to play, or '' to use every installed pack together. */
  pack: string;
  /** Whether V may uncover the answer (a revealed question never scores). */
  allowReveal: boolean;
}

export const DEFAULT_SETTINGS: QuizSettings = { questions: 10, pack: '', allowReveal: true };

function clampInt(raw: unknown, def: number, min: number, max: number): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function applySettings(raw: Record<string, string | number | boolean>): QuizSettings {
  return {
    questions: clampInt(raw.questions, DEFAULT_SETTINGS.questions, 3, 30),
    pack: String(raw.pack ?? '').trim(),
    allowReveal: raw.allowReveal === undefined ? DEFAULT_SETTINGS.allowReveal : Boolean(raw.allowReveal),
  };
}

export function loadSettings(): QuizSettings {
  try {
    return applySettings(readDoorSettings(__dirname));
  } catch (error) {
    console.error('[TeletextQuiz] settings:', (error as Error).message);
    return DEFAULT_SETTINGS;
  }
}
