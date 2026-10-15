/**
 * Backend view of the ONE ASCII -> PETSCII table (plan
 * `thoughts/shared/plans/2026-09-02-mci-in-petscii-seq.md`, Task 2).
 *
 * These assertions run against the SDK barrel the backend actually imports
 * (`@amiexpress/bbs-door-sdk/petscii` -> `sdk/dist/petscii/index.js`), so a
 * source-only SDK edit that was never rebuilt fails here rather than at
 * runtime. `convertAsciiToPetsciiOutput` is now a delegate over the same
 * table; its retired body's mappings that CHANGED are listed in the plan and
 * re-asserted in `tests/utils/petscii.util.test.ts`.
 */
import {
  asciiToPetsciiByte,
  encodePetsciiValue,
  AnsiToPetsciiTransducer,
} from '@amiexpress/bbs-door-sdk/petscii';
import { convertAsciiToPetsciiOutput, convertAnsiToPetscii } from '../../src/utils/petscii.util';

describe('asciiToPetsciiByte (via the SDK barrel)', () => {
  it('bank 1 keeps the shifted-charset case convention', () => {
    expect(encodePetsciiValue('Ab', 1)).toEqual([0xC1, 0x42]);
  });

  it('bank 0 folds both cases up and emits nothing in $C1-$DA', () => {
    const bytes = encodePetsciiValue('Ab', 0);
    expect(bytes).toEqual([0x41, 0x42]);
    for (const b of bytes) expect(b >= 0xC1 && b <= 0xDA).toBe(false);
  });

  it('emits no charset switch, reverse toggle or colour byte for plain text', () => {
    const bytes = encodePetsciiValue('Sysop 42', 1);
    for (const b of bytes) {
      expect([0x0E, 0x8E, 0x12, 0x92, 0x05, 0x1C, 0x1E, 0x1F, 0x81, 0x90, 0x9E]).not.toContain(b);
    }
  });

  it('collapses \\r\\n to one $0D', () => {
    expect(encodePetsciiValue('a\r\nb', 1)).toEqual([0x41, 0x0D, 0x42]);
  });

  it('exposes the raw byte mapping for the renderer', () => {
    expect(asciiToPetsciiByte(0x41, 1).byte).toBe(0xC1);
    expect(asciiToPetsciiByte(0x41, 0).byte).toBe(0x41);
  });
});

describe('transducer byte-identity pin', () => {
  it('transduce("Hello") is unchanged by the printChar extraction', () => {
    const bytes = Array.from(new AnsiToPetsciiTransducer().transduce('Hello'));
    expect(bytes).toEqual([0x0E, 0xC8, 0x45, 0x4C, 0x4C, 0x4F]);
  });
});

describe('convertAsciiToPetsciiOutput delegates to the SDK table', () => {
  it('produces exactly encodePetsciiValue(text, 1) with no prelude', () => {
    const text = 'Hello World! 42';
    expect(Array.from(convertAsciiToPetsciiOutput(text))).toEqual(encodePetsciiValue(text, 1));
  });

  it('produces $0E + the same bytes with the prelude', () => {
    const text = 'Hi';
    expect(Array.from(convertAnsiToPetscii(text))).toEqual([0x0E, ...encodePetsciiValue(text, 1)]);
  });
});
