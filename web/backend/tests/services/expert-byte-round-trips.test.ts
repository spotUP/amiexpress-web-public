/** An expert flag set by the sysop reaches user.data as 'X', not as 'N'. */
import { expertLetter, expertToByte, byteToExpert } from '../../src/services/expert-mode';

describe('expert byte', () => {
  it('maps every caller spelling of on to X and off to N', () => {
    for (const on of [true, 1, '1', 'X', 'x']) expect(expertLetter(on)).toBe('X');
    for (const off of [false, 0, '0', 'N', '', undefined, null]) expect(expertLetter(off)).toBe('N');
  });
  it('round-trips the two bytes express.e stores and rejects the old 0x01', () => {
    expect(byteToExpert(expertToByte(true))).toBe('X');
    expect(byteToExpert(expertToByte(false))).toBe('N');
    expect(byteToExpert(0x01)).toBe('');
  });
});
