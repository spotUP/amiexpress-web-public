const processCommand = jest.fn(async () => 'SUCCESS');
jest.mock('../../src/handlers/command.handler', () => ({ processCommand: (...a: unknown[]) => processCommand(...(a as [])) }));

import {
  armSettingsResume, takeSettingsResumeRow, resumeSettingsHub, settingsResumeOf, clearSettingsResume, settleSettingsResume,
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
    settleSettingsResume(session, 'THEMEC', false);    // the returned settings door's exit
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
