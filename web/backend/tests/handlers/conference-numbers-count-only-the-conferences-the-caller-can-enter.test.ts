/**
 * relConf and getInverse (express.e:8558-8582): under TOGGLES_CONFRELATIVE a
 * caller counts only the conferences he can enter; relConf turns an absolute
 * number into his number, getInverse turns his number back. With the toggle off
 * both are the identity, except getInverse(cn, force=TRUE) which still walks.
 */
import { relConf, getInverse, setUserCommandsDependencies } from '../../src/handlers/commands/user-commands.handler';

export {};

const ACCESS = new Set([1, 3, 4]); // conferences 2 and 5 are closed to him

beforeAll(() => {
  setUserCommandsDependencies({
    conferences: [1, 2, 3, 4, 5].map(id => ({ id, name: `C${id}` })) as any,
    messageBases: [] as any,
    db: {} as any,
    joinConference: jest.fn() as any,
    checkConfAccess: ((_u: any, n: number) => ACCESS.has(n)) as any,
    displayScreen: jest.fn() as any,
    displayUploadInterface: jest.fn() as any,
  });
});

describe('conference numbers (express.e:8558-8582)', () => {
  test('relConf counts only enterable conferences when relative', () => {
    expect(relConf(1, {}, true)).toBe(1);
    expect(relConf(3, {}, true)).toBe(2);
    expect(relConf(4, {}, true)).toBe(3);
    expect(relConf(5, {}, true)).toBe(3);
  });

  test('relConf is the number itself when not relative', () => {
    expect(relConf(5, {}, false)).toBe(5);
  });

  test('getInverse maps his number back to the absolute one, 0 when out of range', () => {
    expect(getInverse(1, {}, true)).toBe(1);
    expect(getInverse(2, {}, true)).toBe(3);
    expect(getInverse(3, {}, true)).toBe(4);
    expect(getInverse(4, {}, true)).toBe(0);
    expect(getInverse(0, {}, true)).toBe(0);
    expect(getInverse(-1, {}, false)).toBe(0);
  });

  test('getInverse is the identity when not relative, unless forced', () => {
    expect(getInverse(2, {}, false)).toBe(2);
    expect(getInverse(2, {}, false, true)).toBe(3);
  });
});
