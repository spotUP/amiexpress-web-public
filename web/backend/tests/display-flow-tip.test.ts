/**
 * TIP runs last, right before the menu - once per login, never on
 * quick ('Q') logins, never when the door is not installed.
 */
import { tipDoorBeforeMenu } from '../src/handlers/command.handler';

function session(extra: Record<string, unknown> = {}): any {
  return { tempData: {}, ...extra };
}

const TIP = [{ command: 'TIP' }];
const NO_TIP = [{ command: 'WHIP' }, { command: 'DOORS' }];

describe('tipDoorBeforeMenu', () => {
  test('runs when TIP is installed and nothing shown yet', () => {
    expect(tipDoorBeforeMenu(session(), TIP)).toBe(true);
  });
  test('runs once per login', () => {
    expect(tipDoorBeforeMenu(session({ tempData: { tipShown: true } }), TIP)).toBe(false);
  });
  test('skips quick logins', () => {
    expect(tipDoorBeforeMenu(session({ quickFlag: true }), TIP)).toBe(false);
  });
  test('skips silently when TIP is not installed', () => {
    expect(tipDoorBeforeMenu(session(), NO_TIP)).toBe(false);
    expect(tipDoorBeforeMenu(session(), [])).toBe(false);
  });
  test('matches command case-insensitively', () => {
    expect(tipDoorBeforeMenu(session(), [{ command: 'tip' }])).toBe(true);
  });
});
