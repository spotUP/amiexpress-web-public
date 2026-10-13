/**
 * express.e checkPasswordStrength 908-934: MIN_PASSWORD_LENGTH -> 1;
 * MIN_PASSWORD_STRENGTH (capped at 4) counts lower/upper/digit/other classes
 * -> 2 when fewer; otherwise TRUE. Zero disables a check.
 */
import { checkPasswordStrength } from '../../src/utils/password-strength.util';

describe('checkPasswordStrength', () => {
  it('returns 1 when shorter than the minimum length, 2 when too few character classes, else true', () => {
    expect(checkPasswordStrength('abc', 4, 0)).toBe(1);
    expect(checkPasswordStrength('abcd', 4, 0)).toBe(true);
    expect(checkPasswordStrength('abcdef', 0, 2)).toBe(2);
    expect(checkPasswordStrength('abcdeF', 0, 2)).toBe(true);
    expect(checkPasswordStrength('aB1', 0, 3)).toBe(true);
    expect(checkPasswordStrength('aB1', 0, 4)).toBe(2);
    expect(checkPasswordStrength('aB1!', 0, 9)).toBe(true); // strength capped at 4
    expect(checkPasswordStrength('ab', 3, 2)).toBe(1);      // length is checked first
    expect(checkPasswordStrength('', 0, 0)).toBe(true);
  });
});
