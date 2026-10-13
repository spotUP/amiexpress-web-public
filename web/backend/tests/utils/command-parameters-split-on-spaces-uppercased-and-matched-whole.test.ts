/**
 * parseParams / parseList / paramsContains, express.e:8709-8756.
 *
 * parseParams(s) clears parsedParams and parseList splits s on spaces
 * (8709-8740), upper-casing each item and dropping empty ones; paramsContains
 * (8747-8756) is TRUE when some item equals the argument exactly (StrCmp),
 * never a prefix or substring. The port is ParamsUtil.parse / hasFlag.
 * Callers (zippy 26143/26170, NS in 25076 ...) use it through the command
 * handlers; the property lives in the util.
 */
import { ParamsUtil } from '../../src/utils/params.util';

export {};

describe('command parameters', () => {
  test('are split on runs of spaces and upper-cased (parseList 8709-8740)', () => {
    expect(ParamsUtil.parse('ns  r   myfile.txt ')).toEqual(['NS', 'R', 'MYFILE.TXT']);
    expect(ParamsUtil.parse('')).toEqual([]);
    expect(ParamsUtil.parse('   ')).toEqual([]);
    expect(ParamsUtil.parse('only')).toEqual(['ONLY']);
  });

  test('a new parse replaces the previous one (parsedParams.clear 8743)', () => {
    ParamsUtil.parse('A B');
    expect(ParamsUtil.parse('C')).toEqual(['C']);
  });

  test('a flag matches a whole item, not a prefix or part of one (paramsContains 8747-8756)', () => {
    const p = ParamsUtil.parse('nsx r 1-10');
    expect(ParamsUtil.hasFlag(p, 'NS')).toBe(false);
    expect(ParamsUtil.hasFlag(p, 'NSX')).toBe(true);
    expect(ParamsUtil.hasFlag(p, 'R')).toBe(true);
    expect(ParamsUtil.hasFlag([], 'NS')).toBe(false);
  });
});
