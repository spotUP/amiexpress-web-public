/** AEW_USERNOTE (11200): the note lands in the user's notes file, signed by the calling session. */
const getUserByUsername = jest.fn();
jest.mock('../../src/database', () => ({ db: { getUserByUsername: (...a: unknown[]) => getUserByUsername(...a) } }));
const appendUserNote = jest.fn(() => true);
jest.mock('../../src/utils/user-notes.util', () => ({ appendUserNote: (...a: unknown[]) => appendUserNote(...(a as [])) }));
jest.mock('../../src/services/bbs-config-file.service', () => ({ getBoardConfig: () => ({ sysop_name: 'TheSysop' }) }));

import { userNoteAnswer } from '../../src/amiga-emulation/xim/user-note';
import { ASYNC_OUTPUT_COMMANDS } from '../../src/amiga-emulation/session/lifecycle/door-message-callbacks';
import { XIMCommand } from '../../src/amiga-emulation/xim/types';

const session: any = { user: { username: 'Spot' } };

beforeEach(() => { getUserByUsername.mockReset(); appendUserNote.mockClear(); appendUserNote.mockReturnValue(true); });

test('OK path signs the note with the session user, latin1 text intact, controls stripped', async () => {
  getUserByUsername.mockResolvedValue({ slotNumber: 12 });
  expect(await userNoteAnswer('NOTE\tBob\tG\xf6teborg\x1b[2J ok', session)).toBe('OK');
  expect(getUserByUsername).toHaveBeenCalledWith('Bob');
  expect(appendUserNote).toHaveBeenCalledTimes(1);
  expect(appendUserNote).toHaveBeenCalledWith(12, 'Spot', 'G\xf6teborg[2J ok');
});

test('no session user: signed with the board sysop name', async () => {
  getUserByUsername.mockResolvedValue({ slotNumber: 3 });
  expect(await userNoteAnswer('NOTE\tBob\thi', { user: null } as any)).toBe('OK');
  expect(appendUserNote).toHaveBeenCalledWith(3, 'TheSysop', 'hi');
});

test('unknown user -> NO and nothing written', async () => {
  getUserByUsername.mockResolvedValue(undefined);
  expect(await userNoteAnswer('NOTE\tNobody\thi', session)).toBe('NO');
  expect(appendUserNote).not.toHaveBeenCalled();
});

test('save failure -> NO', async () => {
  getUserByUsername.mockResolvedValue({ slotNumber: 1 });
  appendUserNote.mockReturnValue(false);
  expect(await userNoteAnswer('NOTE\tBob\thi', session)).toBe('NO');
});

test('empty username or text, or a malformed request -> NO', async () => {
  expect(await userNoteAnswer('NOTE\tBob\t  \x01', session)).toBe('NO');
  expect(await userNoteAnswer('NOTE\t\thi', session)).toBe('NO');
  expect(await userNoteAnswer('NOTE\tBob', session)).toBe('NO');
  expect(getUserByUsername).not.toHaveBeenCalled();
});

test('the command is routed as asynchronous output', () => {
  expect(ASYNC_OUTPUT_COMMANDS).toContain(XIMCommand.AEW_USERNOTE);
});
