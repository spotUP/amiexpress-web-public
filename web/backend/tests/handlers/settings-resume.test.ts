const processCommand = jest.fn(async () => 'SUCCESS');
jest.mock('../../src/handlers/command.handler', () => ({ processCommand: (...a: unknown[]) => processCommand(...(a as [])) }));

import {
  armSettingsResume, takeSettingsResumeRow, resumeSettingsHub, runReturnedCommand, settingsResumeOf, clearSettingsResume, settleSettingsResume,
} from '../../src/handlers/commands/settings-resume';

beforeEach(() => processCommand.mockClear());

test('nothing armed: nothing runs', async () => {
  expect(await resumeSettingsHub({}, {} as any)).toBe(false);
  expect(processCommand).not.toHaveBeenCalled();
});

test('an armed resume runs W as a typed command and hands the row over once', async () => {
  const session: any = {};
  armSettingsResume(session, 'w', 21);
  expect(takeSettingsResumeRow(session)).toBeNull(); // not before the board resumes
  processCommand.mockImplementationOnce(async () => { expect(takeSettingsResumeRow(session)).toBe(21); return 'SUCCESS'; });
  expect(await resumeSettingsHub({ id: 's' }, session)).toBe(true);
  expect(processCommand).toHaveBeenCalledWith({ id: 's' }, session, 'W', '');
  expect(takeSettingsResumeRow(session)).toBeNull();
});

test('a resume armed INSIDE the resumed W survives the outer one finishing', async () => {
  const session: any = {};
  armSettingsResume(session, 'W', 3);
  processCommand.mockImplementationOnce(async () => {
    takeSettingsResumeRow(session);
    armSettingsResume(session, 'W', 9); // the second visit picked another door
    return 'SUCCESS';
  });
  await resumeSettingsHub({}, session);
  expect(settingsResumeOf(session)).toMatchObject({ row: 9, phase: 'armed' });
  clearSettingsResume(session);
  expect(settingsResumeOf(session)).toBeUndefined();
});

describe('one-shot: the record dies unless the W door itself exits with a returned command', () => {
  test('an unrelated door exiting discards it, so W never reopens later', async () => {
    const session: any = {};
    armSettingsResume(session, 'W', 4);
    settleSettingsResume(session, 'CHESS', true);
    expect(settingsResumeOf(session)).toBeUndefined();
    expect(await resumeSettingsHub({}, session)).toBe(false);
    expect(processCommand).not.toHaveBeenCalled();
  });

  test('the W door exiting WITHOUT a returned command discards it', () => {
    const session: any = {};
    armSettingsResume(session, 'W', 4);
    settleSettingsResume(session, 'W', false);
    expect(settingsResumeOf(session)).toBeUndefined();
  });

  test('the W door exiting with a returned command keeps it, and the settings door it runs does not discard it', async () => {
    const session: any = {};
    armSettingsResume(session, 'W', 4);
    settleSettingsResume(session, 'w', true);          // W door's exit
    settleSettingsResume(session, 'THEME', false);    // the returned settings door's exit
    expect(settingsResumeOf(session)).toMatchObject({ row: 4, phase: 'returning' });
    expect(await resumeSettingsHub({}, session)).toBe(true);
  });

  test('a later unrelated door after a completed resume finds nothing to reopen', async () => {
    const session: any = {};
    armSettingsResume(session, 'W', 4);
    settleSettingsResume(session, 'W', true);
    await resumeSettingsHub({}, session);
    processCommand.mockClear();
    settleSettingsResume(session, 'CHESS', true);
    expect(await resumeSettingsHub({}, session)).toBe(false);
    expect(processCommand).not.toHaveBeenCalled();
  });
});

describe('the account was erased inside the settings door', () => {
  test('the door-exit tail does not reopen W for a caller the board has dropped', async () => {
    const session: any = { state: 'await', user: undefined };   // what performErasure leaves (gdpr.handler.ts)
    armSettingsResume(session, 'W', 21);
    settleSettingsResume(session, 'W', true);
    await expect(resumeSettingsHub({}, session)).resolves.toBe(false);
    expect(processCommand).not.toHaveBeenCalled();
    expect(settingsResumeOf(session)).toBeUndefined();
  });
});

describe('the caller is leaving while the settings door runs', () => {
  const { LoggedOnSubState, BBSState } = require('../../src/constants/bbs-states');
  test.each([
    ['logoff started', { subState: LoggedOnSubState.LOGOFF }],
    ['logging off', { state: BBSState.LOGGING_OFF }],
    ['carrier lost', { state: BBSState.HANGUP }],
  ])('%s: W is not reopened and the record is dropped', async (_n, flags) => {
    const session: any = { ...flags };
    armSettingsResume(session, 'W', 21);
    settleSettingsResume(session, 'W', true);
    await expect(resumeSettingsHub({}, session)).resolves.toBe(false);
    expect(processCommand).not.toHaveBeenCalled();
    expect(settingsResumeOf(session)).toBeUndefined();
  });
});

describe('each W -> settings door -> W round trip does not nest the call stack', () => {
  /**
   * Plays the board: W is a door whose exit tail (door.handler.ts) hands its returned
   * command to runReturnedCommand; the reopened W (processCommand) does the same.
   * `depth` counts the frames of door runs and returned commands stacked at once.
   */
  async function play(roundTrips: number): Promise<{ maxDepth: number; settingsRuns: number; wRuns: number }> {
    const session: any = {};
    let depth = 0, maxDepth = 0, settingsRuns = 0, wRuns = 0;
    const enter = () => { depth++; maxDepth = Math.max(maxDepth, depth); };
    const wDoor = async () => {
      enter(); wRuns++;
      if (wRuns <= roundTrips) {
        armSettingsResume(session, 'W', 17);
        session.returnCommand = 'THEME';
        settleSettingsResume(session, 'W', true);
        await runReturnedCommand({}, session, session.returnCommand, runCommand);   // the tail
      } else {
        settleSettingsResume(session, 'W', false);
      }
      depth--;
    };
    const runCommand = async () => { enter(); settingsRuns++; settleSettingsResume(session, 'THEME', false); depth--; };
    processCommand.mockImplementation(wDoor as never);
    await wDoor();          // the first W, opened from the menu
    return { maxDepth, settingsRuns, wRuns };
  }
  afterEach(() => processCommand.mockImplementation(async () => 'SUCCESS'));

  test('the stack is as deep after six round trips as after one', async () => {
    const one = await play(1);
    const six = await play(6);
    expect(six.settingsRuns).toBe(6);            // every trip really ran its settings door
    expect(six.wRuns).toBe(7);                   // and W was reopened after each
    expect(six.maxDepth).toBe(one.maxDepth);
    expect(six.maxDepth).toBeLessThanOrEqual(3);
  });

  test('a settings door that throws drops the record', async () => {
    const session: any = {};
    armSettingsResume(session, 'W', 4);
    settleSettingsResume(session, 'W', true);
    await expect(runReturnedCommand({}, session, 'THEME', async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(settingsResumeOf(session)).toBeUndefined();
  });
});
