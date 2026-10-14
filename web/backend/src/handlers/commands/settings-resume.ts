/** The W door's resume record - see W6 for the driver. One entry per session. */
import type { BBSSession } from '../../index';
export interface SettingsResume { command: string; row: number; phase: 'armed' | 'returning' | 'resuming' }
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

/**
 * One-shot: called when ANY door exits, before its returned command runs. An
 * armed record survives only the exit of the door that armed it, and only when
 * that door returned a command (the settings door). Every other exit discards
 * it, so it can never reopen W after an unrelated door. A record already
 * in phase 'returning' belongs to the W tail that is running the returned
 * command; the settings door run by it exits through here too and must not
 * discard it.
 */
export function settleSettingsResume(session: BBSSession, exitingCommand: string, returnsCommand: boolean): void {
  const record = records.get(session);
  if (!record || record.phase !== 'armed') return;
  if (returnsCommand && record.command === exitingCommand.toUpperCase()) {
    record.phase = 'returning';
    return;
  }
  records.delete(session);
}

/**
 * After a returned command has run: if the W door armed a resume, run W
 * again (a typed W, so BBSCMD outranks the internal tier as express.e's
 * processCommand does - express.e:28252-28256) and let the new door take the
 * row. WEB_: new board support, express.e has no way back from a returned
 * command.
 */
export async function resumeSettingsHub(socket: unknown, session: BBSSession): Promise<boolean> {
  const record = records.get(session);
  if (!record || (record.phase !== 'armed' && record.phase !== 'returning')) return false;
  record.phase = 'resuming';
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { processCommand } = require('../command.handler') as typeof import('../command.handler');
    await processCommand(socket as never, session, record.command, '');
  } finally {
    if (records.get(session) === record) records.delete(session);
  }
  return true;
}
