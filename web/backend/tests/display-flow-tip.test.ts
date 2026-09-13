/**
 * TIP runs last, right before the menu - once per login, never on
 * quick ('Q') logins, never when the door is not installed, and never
 * when the caller could not have opened it from the DOORS menu.
 */
import { tipDoorBeforeMenu } from '../src/handlers/command.handler';

function session(extra: Record<string, unknown> = {}): any {
  return { tempData: {}, user: { secLevel: 10 }, currentConf: 1, ...extra };
}

const TIP = [{ command: 'TIP', enabled: true, accessLevel: 0 }];
const NO_TIP = [
  { command: 'WHIP', enabled: true, accessLevel: 0 },
  { command: 'DOORS', enabled: true, accessLevel: 0 },
];

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
    expect(tipDoorBeforeMenu(session(), [{ command: 'tip', enabled: true, accessLevel: 0 }])).toBe(true);
  });

  // The admin switches a door off by PARKING its ACCESS - the registry
  // hardcodes enabled:true - so the level is what a disabled door looks
  // like from here. Both are checked; both must stop the login hook.
  test('does not run a door parked above the caller by the admin', () => {
    const parked = [{ command: 'TIP', enabled: true, accessLevel: 255 }];
    expect(tipDoorBeforeMenu(session(), parked)).toBe(false);
  });
  test('does not run a door the admin switched off outright', () => {
    const off = [{ command: 'TIP', enabled: false, accessLevel: 0 }];
    expect(tipDoorBeforeMenu(session(), off)).toBe(false);
  });
  test('runs for a caller at exactly the door access level', () => {
    const gated = [{ command: 'TIP', enabled: true, accessLevel: 10 }];
    expect(tipDoorBeforeMenu(session(), gated)).toBe(true);
  });
  test('does not run a conference-scoped TIP from another conference', () => {
    const conf3 = [{ command: 'TIP', enabled: true, accessLevel: 0, conferenceId: 3 }];
    expect(tipDoorBeforeMenu(session(), conf3)).toBe(false);
    expect(tipDoorBeforeMenu(session({ currentConf: 3 }), conf3)).toBe(true);
  });
  test('a caller with no user record is level 0, not unlimited', () => {
    const gated = [{ command: 'TIP', enabled: true, accessLevel: 5 }];
    expect(tipDoorBeforeMenu(session({ user: undefined }), gated)).toBe(false);
  });
});
