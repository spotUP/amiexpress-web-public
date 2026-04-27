// @ts-nocheck
import { checkConfAccess } from '../../../src/handlers/message/message-scan.handler';

function makeUser(overrides: any = {}): any {
  return {
    username: 'testuser',
    secLevel: 20,
    confAccess: 'XXX__',
    ...overrides,
  };
}

describe('checkConfAccess — X/_ format', () => {
  test('returns false for null user', () => {
    expect(checkConfAccess(null, 1)).toBe(false);
  });

  test('returns true when confAccess has X at conference position', () => {
    const user = makeUser({ confAccess: 'XXX__' });
    // confAccess[0]='X' → conf 1 granted
    expect(checkConfAccess(user, 1)).toBe(true);
    // confAccess[1]='X' → conf 2 granted
    expect(checkConfAccess(user, 2)).toBe(true);
    // confAccess[2]='X' → conf 3 granted
    expect(checkConfAccess(user, 3)).toBe(true);
  });

  test('returns false when confAccess has _ at conference position', () => {
    const user = makeUser({ confAccess: 'XXX__' });
    // confAccess[3]='_' → conf 4 denied
    expect(checkConfAccess(user, 4)).toBe(false);
    // confAccess[4]='_' → conf 5 denied
    expect(checkConfAccess(user, 5)).toBe(false);
  });

  test('returns false when conferenceId exceeds confAccess length', () => {
    const user = makeUser({ confAccess: 'X' });
    // Only conf 1 defined; conf 2 out of bounds
    expect(checkConfAccess(user, 2)).toBe(false);
  });

  test('returns false when confAccess is empty string', () => {
    const user = makeUser({ confAccess: '' });
    expect(checkConfAccess(user, 1)).toBe(false);
  });

  test('returns false when confAccess is undefined', () => {
    const user = makeUser({ confAccess: undefined });
    expect(checkConfAccess(user, 1)).toBe(false);
  });

  test('single X grants only that conference', () => {
    const user = makeUser({ confAccess: '_X_' });
    expect(checkConfAccess(user, 1)).toBe(false);
    expect(checkConfAccess(user, 2)).toBe(true);
    expect(checkConfAccess(user, 3)).toBe(false);
  });

  test('all X grants all conferences in range', () => {
    const user = makeUser({ confAccess: 'XXXXX' });
    for (let i = 1; i <= 5; i++) {
      expect(checkConfAccess(user, i)).toBe(true);
    }
  });
});

describe('checkConfAccess — area-name format', () => {
  test('returns false for area-name access (not yet supported)', () => {
    // Area-name format: confAccess contains characters other than X and _
    const user = makeUser({ confAccess: 'Conf.1|Conf.2' });
    // express.e:8511-8512 — web version defaults to no access for area-based format
    expect(checkConfAccess(user, 1)).toBe(false);
  });
});
