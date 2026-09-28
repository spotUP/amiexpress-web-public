/**
 * "add the petscii font variant setting to W" - the sysop, 2026-09-13.
 *
 * The Swedish character set was built and could not be switched on: nothing
 * set the session flag, so the variant was dormant for everyone. W is where a
 * caller changes what the board does for them, and row 21 is already the
 * PETSCII palette - so the set belongs at row 22, beside it.
 *
 * These pin the numbering and the persistence, which is where this kind of
 * change goes wrong: a new row that pushes the settings doors down by one
 * without anyone noticing, or a preference that is shown but never saved.
 *
 * Driven through the REAL W menu (info-commands.handler, mocked the way
 * tests/handlers/w-menu-settings-doors.test.ts mocks it: the index stub, a
 * database whose updateUser records the write, and ACS let through) and the
 * REAL graphics-prompt answer (pre-login.applyGraphicsAnswer).
 */
jest.mock('../../src/index', () => {
  const states = require('../../src/constants/bbs-states');
  return { BBSState: states.BBSState, LoggedOnSubState: states.LoggedOnSubState, BBSSession: {} };
});
jest.mock('../../src/handlers/command-handler/dependency-injection', () => ({
  getDoors: () => [],
}));
const mockUpdateUser = jest.fn(async (..._args: unknown[]) => undefined);
jest.mock('../../src/database', () => ({ db: { updateUser: (...a: unknown[]) => mockUpdateUser(...a) } }));
jest.mock('../../src/utils/acs.util', () => ({
  ...jest.requireActual('../../src/utils/acs.util'),
  checkSecurity: () => true,
}));

import { LoggedOnSubState } from '../../src/constants/bbs-states';
import { flushOutput } from '../../src/utils/output.util';
import {
  FIRST_SETTINGS_DOOR_OPTION,
  handleWriteUserParamsCommand,
  handleWOptionSelectInput,
} from '../../src/handlers/commands/info-commands.handler';
import { applyGraphicsAnswer } from '../../src/handlers/command-handler/pre-login';

let seq = 0;
function driver(user: Record<string, unknown> = {}) {
  const text: string[] = [];
  const events: Array<[string, unknown]> = [];
  const session: any = { nodeId: 1, currentConf: 1, tempData: {}, user: { id: 'u22', username: 'SPOT', secLevel: 255, ...user } };
  const socket: any = {
    id: `w22-${seq++}`, session,
    emit(event: string, data: unknown) {
      if (event === 'ansi-output') text.push(String(data)); else events.push([event, data]);
      return true;
    },
    on() { return socket; },
  };
  // The row's own line, colours stripped.
  const row22 = () => {
    flushOutput(socket);
    const plain = text.join('').replace(/\x1b\[[0-9;]*m/g, '');
    return plain.split(/\r?\n/).find((l) => /\b22\]/.test(l)) ?? '';
  };
  return { socket, session, events, row22 };
}

beforeEach(() => mockUpdateUser.mockClear());

describe('W row 22', () => {
  it('leaves room for itself before the settings doors', () => {
    // 21 is the palette, 22 is the character set, and the doors start after.
    expect(FIRST_SETTINGS_DOOR_OPTION).toBe(23);
  });

  it('is shown with the value the caller has', () => {
    // Both states are named, so the row reads as a choice rather than a flag.
    const standard = driver();
    handleWriteUserParamsCommand(standard.socket, standard.session);
    expect(standard.row22()).toMatch(/PETSCII CHARACTER SET\.*\s+STANDARD/);

    const swedish = driver({ petsciiCharset: 'swedish' });
    handleWriteUserParamsCommand(swedish.socket, swedish.session);
    expect(swedish.row22()).toMatch(/PETSCII CHARACTER SET\.*\s+SWEDISH/);
  });

  it('saves the choice, and tells the screen at once', async () => {
    const d = driver({ petsciiCharset: 'standard' });
    d.session.subState = LoggedOnSubState.W_OPTION_SELECT;
    await handleWOptionSelectInput(d.socket, d.session, '22');
    // Persisted like the palette beside it...
    expect(mockUpdateUser).toHaveBeenCalledWith('u22', { petsciiCharset: 'swedish' });
    expect(d.session.user.petsciiCharset).toBe('swedish');
    // ...and applied without making the caller reconnect.
    expect(d.events).toContainEqual(['petscii-charset', { charset: 'swedish' }]);

    // And back again.
    await handleWOptionSelectInput(d.socket, d.session, '22');
    expect(mockUpdateUser).toHaveBeenLastCalledWith('u22', { petsciiCharset: 'standard' });
  });

  it('travels on the mode event, so a reconnecting caller keeps it', () => {
    const mode = (user: Record<string, unknown>) => {
      const d = driver(user);
      d.session.connectionType = 'web';
      applyGraphicsAnswer(d.socket, d.session, 'P');
      return (d.events.find(([e]) => e === 'petscii-mode')?.[1] as { charset?: string } | undefined)?.charset;
    };
    expect(mode({ petsciiCharset: 'swedish' })).toBe('swedish');
    expect(mode({})).toBe('standard');
  });

  /*
   * REWRITTEN 2026-09-16. This used to assert that `user-repository.ts`
   * contained one exact ternary, character for character - a test that a
   * reformatting breaks and that a WRONG default would pass unchanged, as
   * long as the wrong default was spelled the same way.
   *
   * The mapper is reachable, so ask it. `mapUserFromDb` is private, which
   * is a visibility rule for callers rather than a claim that it cannot be
   * tested; the row it takes is the shape node-postgres hands back.
   */
  it('is standard unless the caller asked otherwise - $5C is the pound sign', () => {
    const { UserRepository } = require('../../src/database/user-repository');
    const map = (row: Record<string, unknown>) =>
      (UserRepository.prototype as any).mapUserFromDb.call(
        Object.create(UserRepository.prototype),
        { id: 1, name: 'test', ...row },
      ).petsciiCharset;

    // The one value that opts in.
    expect(map({ petsciicharset: 'swedish' })).toBe('swedish');

    // Everything else is the standard set, because $5C is the POUND SIGN
    // there and a board that guessed wrong would print it as a backslash.
    expect(map({ petsciicharset: 'standard' })).toBe('standard');
    expect(map({ petsciicharset: null })).toBe('standard');
    expect(map({ petsciicharset: undefined })).toBe('standard');
    expect(map({ petsciicharset: 'SWEDISH' })).toBe('standard');
    expect(map({})).toBe('standard');
  });
});
