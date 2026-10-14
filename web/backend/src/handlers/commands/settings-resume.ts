/** The W door's resume record - see W6 for the driver. One entry per session. */
import type { BBSSession } from '../../index';
export interface SettingsResume { command: string; row: number; phase: 'armed' | 'resuming' }
const records = new WeakMap<object, SettingsResume>();
export function armSettingsResume(session: BBSSession, command: string, row: number): void {
  records.set(session, { command: command.toUpperCase(), row, phase: 'armed' });
}
export function takeSettingsResumeRow(session: BBSSession): number | null {
  const r = records.get(session);
  if (!r || r.phase !== 'resuming') return null;
  records.delete(session);
  return r.row;
}
export function settingsResumeOf(session: BBSSession): SettingsResume | undefined { return records.get(session); }
export function clearSettingsResume(session: BBSSession): void { records.delete(session); }
