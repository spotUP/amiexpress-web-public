import { classifyFirstKeypress } from '../../src/utils/c64-detect.util';

describe('classifyFirstKeypress', () => {
  it('PETSCII DEL ($14) identifies a C64', () =>
    expect(classifyFirstKeypress(Buffer.from([0x14]))).toBe('petscii'));
  it('shifted PETSCII letters ($C1-$DA) identify a C64', () =>
    expect(classifyFirstKeypress(Buffer.from([0xC1]))).toBe('petscii'));
  it('ASCII BS/DEL identifies an ASCII terminal', () => {
    expect(classifyFirstKeypress(Buffer.from([0x08]))).toBe('ascii');
    expect(classifyFirstKeypress(Buffer.from([0x7F]))).toBe('ascii');
  });
  it('ASCII lowercase identifies an ASCII terminal', () =>
    expect(classifyFirstKeypress(Buffer.from([0x61]))).toBe('ascii'));
  it('RETURN is ambiguous (same byte in both encodings)', () =>
    expect(classifyFirstKeypress(Buffer.from([0x0D]))).toBe('ambiguous'));
});
