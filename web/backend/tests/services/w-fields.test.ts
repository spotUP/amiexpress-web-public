/**
 * The seventeen W fields, as express.e:25712-26092 has them, in the one place
 * the internal W and the W door both ask.
 */
jest.mock('../../src/utils/acs-access-loader');
const findUserFromName = jest.fn(() => 0);
jest.mock('../../src/handlers/message/msg-names', () => ({
  ...jest.requireActual('../../src/handlers/message/msg-names'),
  findUserFromName: (...a: unknown[]) => findUserFromName(...(a as [])),
  useWildcards: () => true,
}));
const saveAccount = jest.fn(async () => undefined);
jest.mock('../../src/services/account.service', () => ({
  changeAccount: jest.fn(async (session: any, updates: any) => { Object.assign(session.user, updates); }),
  saveAccount: (...a: unknown[]) => saveAccount(...(a as [])),
}));
jest.mock('../../src/utils/computer-types.util', () => ({
  computerTypeChoices: async () => ['Amiga 500', 'Amiga 1200', 'PC'],
}));
jest.mock('../../src/services/background-file-check.service', () => ({
  userMayToggleBackgroundFileCheck: (node: number) => node === 1,
}));

import { applyWField, wFieldState, wFieldValue, W_FIELDS } from '../../src/services/user-settings/w-fields';

const everything = 'T'.repeat(128);
function caller(overrides: Record<string, unknown> = {}): any {
  return {
    nodeId: 1,
    screenHeight: 25,
    user: {
      id: 7, username: 'Spot', realname: 'Johan', internetName: 'spot', email: 'a@b.se',
      location: 'Old Town', phone: '555-1234', secLevel: 10, securityFlags: everything,
      userFlags: 0, editor: 'Prompt', zoomType: 0, availableForChat: true, protocol: 'zmodem',
      ...overrides,
    },
  };
}

beforeEach(() => { saveAccount.mockClear(); findUserFromName.mockReset(); findUserFromName.mockReturnValue(0); });

describe('the express.e limits', () => {
  test('a location of 30 characters is kept as 29, the length express.e reads (25983)', async () => {
    const s = caller();
    const out = await applyWField(s, 4, 'x'.repeat(30));
    expect(out).toEqual({ kind: 'stored', value: 'x'.repeat(29) });
    expect(s.user.location).toBe('x'.repeat(29));
  });
  test('a 100-character email is kept as 49, AstrCopy 50 (25935)', async () => {
    const s = caller();
    const out = await applyWField(s, 1, 'e'.repeat(100));
    expect(out).toEqual({ kind: 'stored', value: 'e'.repeat(49) });
  });
  test('a location of exactly 29 characters is kept whole, one past it is cut', async () => {
    const s = caller();
    expect(await applyWField(s, 4, 'y'.repeat(29))).toEqual({ kind: 'stored', value: 'y'.repeat(29) });
    expect(await applyWField(s, 4, 'z'.repeat(31))).toEqual({ kind: 'stored', value: 'z'.repeat(29) });
  });
  test('an email of exactly 49 characters is kept whole; a phone of 13 is kept as 12', async () => {
    const s = caller();
    expect(await applyWField(s, 1, 'e'.repeat(49))).toEqual({ kind: 'stored', value: 'e'.repeat(49) });
    expect(await applyWField(s, 5, '1'.repeat(13))).toEqual({ kind: 'stored', value: '1'.repeat(12) });
  });
  test('a name over its limit is cut to it before the checks (login 30, real 25, internet 9)', async () => {
    const s = caller();
    expect(await applyWField(s, 2, 'n'.repeat(40))).toEqual({ kind: 'stored', value: 'n'.repeat(25) });
    expect(await applyWField(s, 3, 'i'.repeat(12))).toEqual({ kind: 'stored', value: 'i'.repeat(9) });
    expect(await applyWField(s, 0, 'L'.repeat(35))).toEqual({ kind: 'stored', value: 'L'.repeat(30) });
  });
  test('phone 12, real name 25, internet name 9, login name 30', () => {
    expect([W_FIELDS[5].maxLen, W_FIELDS[2].maxLen, W_FIELDS[3].maxLen, W_FIELDS[0].maxLen]).toEqual([12, 25, 9, 30]);
  });
});

describe('empty and unchanged input', () => {
  test('an empty location changes nothing and does not save (25985 JUMP cant)', async () => {
    const s = caller();
    expect(await applyWField(s, 4, '')).toEqual({ kind: 'unchanged' });
    expect(s.user.location).toBe('Old Town');
    expect(saveAccount).not.toHaveBeenCalled();
  });
  test('an empty email and an empty phone change nothing and do not save', async () => {
    const s = caller();
    expect(await applyWField(s, 1, '')).toEqual({ kind: 'unchanged' });
    expect(await applyWField(s, 5, '')).toEqual({ kind: 'unchanged' });
    expect(s.user.email).toBe('a@b.se');
    expect(s.user.phone).toBe('555-1234');
    expect(saveAccount).not.toHaveBeenCalled();
  });
  test('an empty lines, computer or protocol answer is no change; an empty name is no change', async () => {
    const s = caller();
    expect(await applyWField(s, 7, '')).toEqual({ kind: 'unchanged' });
    expect(await applyWField(s, 8, '')).toEqual({ kind: 'unchanged' });
    expect(await applyWField(s, 11, '')).toEqual({ kind: 'unchanged' });
    expect(await applyWField(s, 2, 'johan')).toEqual({ kind: 'unchanged' });
    expect(findUserFromName).not.toHaveBeenCalled();
  });
  test('the login name typed again in another case is no change (25910 StriCmp)', async () => {
    const s = caller();
    expect(await applyWField(s, 0, 'SPOT')).toEqual({ kind: 'unchanged' });
    expect(findUserFromName).not.toHaveBeenCalled();
  });
});

describe('the name rules and their texts', () => {
  test('NEW is not allowed, and the text is express.e\'s (11244)', async () => {
    expect(await applyWField(caller(), 0, 'new')).toEqual({ kind: 'refused', refusal: 'Username not allowed!!', retry: true });
  });
  test('a wildcard is refused after the duplicate check is announced', async () => {
    const checking = jest.fn();
    const out = await applyWField(caller(), 0, 'Sp*t', { onChecking: checking });
    expect(checking).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ kind: 'refused', refusal: 'No wildcards allowed in a name.', retry: true });
  });
  test('a name another account holds is refused', async () => {
    findUserFromName.mockReturnValue(3);
    expect(await applyWField(caller(), 2, 'Rebel')).toEqual({ kind: 'refused', refusal: 'Already in use!, try another.', retry: true });
  });
  test('a new login name saves at once (25928); a real name does not', async () => {
    const s = caller();
    expect(await applyWField(s, 0, 'Phantasm')).toEqual({ kind: 'stored', value: 'Phantasm' });
    expect(saveAccount).toHaveBeenCalledTimes(1);
    await applyWField(s, 2, 'Johan S');
    expect(saveAccount).toHaveBeenCalledTimes(1);
  });
  test('the internet name compares with the REAL name, as express.e does (25966)', async () => {
    expect(await applyWField(caller({ realname: 'spot' }), 3, 'SPOT')).toEqual({ kind: 'unchanged' });
  });
});

describe('access', () => {
  test('a field without its ACS is disabled and a write is denied', async () => {
    const flags = everything.split('');
    // ACS_EDIT_USER_LOCATION = 16 (constants/acs-permissions.ts:30)
    flags[16] = 'F';
    const s = caller({ securityFlags: flags.join('') });
    expect(wFieldState(s, 4)).toBe('disabled');
    expect(await applyWField(s, 4, 'Nowhere')).toEqual({ kind: 'denied' });
    expect(s.user.location).toBe('Old Town');
  });
  test('the translator row is hidden, not disabled, without its ACS (25871)', () => {
    const flags = everything.split('');
    flags[73] = 'F'; // ACS_TRANSLATION = 73
    expect(wFieldState(caller({ securityFlags: flags.join('') }), 15)).toBe('hidden');
  });
  test('background file check is disabled where the node does not offer it (25876)', () => {
    expect(wFieldState({ ...caller(), nodeId: 2 }, 16)).toBe('disabled');
  });
  test('the password is never a field write', async () => {
    expect(await applyWField(caller(), 6, 'secret')).toEqual({ kind: 'denied' });
  });
});

describe('choices, lines and toggles', () => {
  test('a computer out of range asks again; in range stores the name and index', async () => {
    const s = caller();
    expect(await applyWField(s, 8, '9')).toEqual({ kind: 'again' });
    expect(await applyWField(s, 8, '2')).toEqual({ kind: 'stored', value: 'Amiga 1200' });
    expect(s.user.computerIndex).toBe(1);
  });
  test('lines over 255 asks again (11313); 0 is Auto', async () => {
    const s = caller();
    expect(await applyWField(s, 7, '256')).toEqual({ kind: 'again' });
    const out = await applyWField(s, 7, '0');
    expect(out.kind).toBe('stored');
  });
  test('screen clear flips USER_SCRNCLR and reads back YES', async () => {
    const s = caller();
    expect(await applyWField(s, 10, '')).toEqual({ kind: 'stored', value: 'YES' });
    expect(s.user.userFlags & 8).toBe(8);
  });
  test('the editor cycles PROMPT -> LINE EDITOR -> FULLSCREEN EDITOR -> PROMPT (26059)', async () => {
    const s = caller();
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      const out = await applyWField(s, 12, '');
      seen.push(out.kind === 'stored' ? out.value : out.kind);
    }
    expect(seen).toEqual(['LINE EDITOR', 'FULLSCREEN EDITOR', 'PROMPT']);
  });
  test('the value a row shows is the one the menu paints', () => {
    expect(wFieldValue(caller(), 6)).toBe('ENCRYPTED');
    expect(wFieldValue(caller({ linesPerScreen: 0 }), 7)).toBe('Auto');
    expect(wFieldValue(caller(), 14)).toBe('YES');
  });
});
