import { printablePetsciiToScreenCode, screenCodeToPetscii } from '../../petscii/screen-codes';

describe('PETSCII <-> screen code remap (reference doc section 2)', () => {
  it('maps the four printable quadrants and pi', () => {
    expect(printablePetsciiToScreenCode(0x20)).toBe(0x20);
    expect(printablePetsciiToScreenCode(0x41)).toBe(0x01); // unshifted A
    expect(printablePetsciiToScreenCode(0x60)).toBe(0x40);
    expect(printablePetsciiToScreenCode(0xA1)).toBe(0x61); // left half block
    expect(printablePetsciiToScreenCode(0xC1)).toBe(0x41); // shifted A
    expect(printablePetsciiToScreenCode(0xFF)).toBe(0x5E); // pi
  });
  it('screenCodeToPetscii is the inverse on the 0x00-0x7F glyph domain', () => {
    for (const sc of [0x00, 0x01, 0x1F, 0x20, 0x3F, 0x40, 0x5F, 0x60, 0x7F]) {
      expect(printablePetsciiToScreenCode(screenCodeToPetscii(sc))).toBe(sc);
    }
    expect(screenCodeToPetscii(0x81)).toBe(0x20); // reverse bit is the caller's job
  });
});
