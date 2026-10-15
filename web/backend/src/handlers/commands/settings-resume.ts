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
  // The caller erased their account inside the settings door: performErasure
  // (gdpr.handler.ts) has dropped the session ('await', no user) and the line
  // closes in half a second. There is no menu to go back to.
  if ((session as { state?: string }).state === 'await') { records.delete(session); return false; }
  // The caller is leaving (time up, kick, carrier lost, logoff started) while the settings
  // door ran: nobody is left to reopen W for. One predicate, the board's own (door.handler.ts).
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { theCallerIsLeaving } = require('../door.handler') as typeof import('../door.handler');
  if (theCallerIsLeaving(session)) { records.delete(session); return false; }
  record.phase = 'resuming';
  looping.add(session);
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { processCommand } = require('../command.handler') as typeof import('../command.handler');
    await processCommand(socket as never, session, record.command, '');
  } finally {
    looping.delete(session);
    if (records.get(session) === record) records.delete(session);
  }
  return true;
}

/** Sessions whose W is being reopened by the loop in runReturnedCommand right now. */
const looping = new WeakSet<object>();

/**
 * The door-exit tail's way to run a door's RETURNCOMMAND (door.handler.ts). The
 * W door hands a settings door back as its returned command and asks to be
 * reopened; reopening is a LOOP here, not a call from inside the returned
 * command's tail: a W reopened by the loop exits through the same tail, and that
 * inner tail must not run the next settings door and reopen W again (each round
 * trip would nest one more processCommand frame - 8 stacked seen live). The inner
 * tail parks its returned command back on the session and returns; this loop
 * picks it up, so the call depth is the same for the first round trip and the
 * hundredth.
 */
export async function runReturnedCommand(
  socket: unknown, session: BBSSession, cmd: string,
  runCommand: (cmd: string, isReturn: boolean) => Promise<void>,
): Promise<void> {
  const s = session as { returnCommand?: string };
  if (looping.has(session)) { s.returnCommand = cmd; return; }   // the running loop runs it
  let next: string | undefined = cmd;
  try {
    while (next) {
      s.returnCommand = undefined;
      await runCommand(next, true);
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      if (!(await resumeSettingsHub(socket, session))) break;
      next = s.returnCommand;     // parked by the reopened W's own exit tail, if it handed a door back
    }
  } catch (err) {
    clearSettingsResume(session);
    throw err;
  } finally {
    s.returnCommand = undefined;
  }
}
