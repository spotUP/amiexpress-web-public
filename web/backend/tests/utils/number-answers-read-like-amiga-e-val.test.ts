/**
 * Every number answer reads through the one E Val (utils/e-val.util): decimal,
 * sign, $hex, %binary, leading blanks, and how many characters it consumed.
 */
import { eVal, eValRead } from '../../src/utils/await-input';
import { eVal as eValDirect } from '../../src/utils/e-val.util';
import { isDigit } from '../../src/handlers/message/read-msg';
import { getExpressMajorVer } from '../../src/utils/express-version.util';

describe('E Val', () => {
  it('reads decimal, signed, hex and binary numbers with the characters read', () => {
    expect(eValRead('42')).toEqual({ value: 42, read: 2 });
    expect(eValRead('-7x')).toEqual({ value: -7, read: 2 });
    expect(eValRead('$1f')).toEqual({ value: 31, read: 3 });
    expect(eValRead('-$10')).toEqual({ value: -16, read: 4 });
    expect(eValRead('%101')).toEqual({ value: 5, read: 4 });
    expect(eValRead('  9')).toEqual({ value: 9, read: 3 });
  });

  it('reads 0 characters when there is no number', () => {
    for (const t of ['', 'abc', '-', '$', '%2', '+']) expect(eValRead(t)).toEqual({ value: 0, read: 0 });
    expect(eVal('abc')).toBe(0);
  });

  it('wraps to a 32-bit LONG', () => {
    expect(eVal('4294967295')).toBe(-1);
  });

  it('is the one implementation behind every caller', () => {
    expect(eValDirect).toBe(eVal);
    expect(isDigit('$1f')).toBe(true);
    expect(isDigit('abc')).toBe(false);
    expect(getExpressMajorVer(undefined, 'v5.6')).toBe('v5.6');
  });
});
