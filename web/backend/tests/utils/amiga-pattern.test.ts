/**
 * One AmigaDOS pattern matcher for dos.library, LhA member arguments and
 * rexxarplib (utils/amiga-pattern).
 *
 * The three copies it replaces each read a different subset of the grammar:
 * dos.library's tokenised matcher dropped whatever followed an OR group and
 * let `~` eat one character; rexxarplib's regex did not know `*` and turned
 * `~` into a regex anchor; LhA's knew only `#?`, `*` and `?`.
 */
process.env.SKIP_DB_INIT = '1';

import { matchAmigaPattern, parseAmigaPattern } from '../../src/utils/amiga-pattern';
import { DosLibrary } from '../../src/amiga-emulation/api/DosLibrary';
import { CPURegister } from '../../src/amiga-emulation/cpu/MoiraEmulator';

describe('AmigaDOS patterns', () => {
  it.each([
    ['#?.diz', 'FILE_ID.DIZ', true],
    ['*.diz', 'file_id.diz', true],
    ['file_id.?iz', 'file_id.diz', true],
    ['(file_id|desc).diz', 'desc.diz', true],
    ['(file_id|desc).diz', 'readme.diz', false],
    ['~(#?.info)', 'Door.info', false],
    ['~(#?.info)', 'Door', true],
    ['a~(b)c', 'axyc', true],
    ['a~(b)c', 'abc', false],
    ['#a', '', true],
    ['#a', 'aaa', true],
    ['#(ab)', 'abab', true],
    ['#(ab)', 'aba', false],
    ['[a-c]x', 'bx', true],
    ['[~a-c]x', 'bx', false],
    ['%', '', true],
    ["'?", '?', true],
    ["'?", 'x', false],
  ])('%s against %s is %s (no case)', (pattern, text, expected) => {
    expect(matchAmigaPattern(pattern, text, true)).toBe(expected);
  });

  it('tells case apart unless asked not to', () => {
    expect(matchAmigaPattern('File', 'FILE')).toBe(false);
    expect(matchAmigaPattern('File', 'FILE', true)).toBe(true);
  });

  it('knows a plain name has no wildcards', () => {
    expect(parseAmigaPattern('FILE_ID.DIZ').wild).toBe(false);
    expect(parseAmigaPattern('#?.DIZ').wild).toBe(true);
  });
});

describe('a door matching with dos.library', () => {
  function makeEmulator() {
    const regs = new Map<number, number>();
    const mem = new Map<number, number>();
    return {
      getRegister: (r: number) => regs.get(r) ?? 0,
      setRegister: (r: number, v: number) => { regs.set(r, v); },
      readMemory: (a: number) => mem.get(a) ?? 0,
      writeMemory: (a: number, v: number) => { mem.set(a, v & 0xff); },
      readString: (addr: number, max = 256) => {
        let out = '';
        for (let i = 0; i < max; i++) {
          const b = mem.get(addr + i) ?? 0;
          if (b === 0) break;
          out += String.fromCharCode(b);
        }
        return out;
      },
      writeString: (addr: number, text: string) => {
        for (let i = 0; i < text.length; i++) mem.set(addr + i, text.charCodeAt(i));
        mem.set(addr + text.length, 0);
      },
    } as any;
  }

  const SOURCE = 0x40000;
  const PARSED = 0x40100;
  const NAME = 0x40200;

  function doorMatches(pattern: string, name: string, destLength = 64): { parsed: number; matched: number } {
    const emulator = makeEmulator();
    const dos = new DosLibrary(emulator);
    emulator.writeString(SOURCE, pattern);
    emulator.setRegister(CPURegister.D1, SOURCE);
    emulator.setRegister(CPURegister.D2, PARSED);
    emulator.setRegister(CPURegister.D3, destLength);
    dos.ParsePatternNoCase();
    const parsed = emulator.getRegister(CPURegister.D0);
    emulator.writeString(NAME, name);
    emulator.setRegister(CPURegister.D1, PARSED);
    emulator.setRegister(CPURegister.D2, NAME);
    dos.MatchPatternNoCase();
    return { parsed, matched: emulator.getRegister(CPURegister.D0) };
  }

  it('matches what follows an OR group', () => {
    expect(doorMatches('(file_id|desc).diz', 'FILE_ID.DIZ')).toEqual({ parsed: 1, matched: 1 });
  });

  it('still rejects a name the pattern does not cover', () => {
    expect(doorMatches('(file_id|desc).diz', 'readme.txt').matched).toBe(0);
  });

  it('refuses a buffer too small for the pattern', () => {
    expect(doorMatches('#?.diz', 'x.diz', 4).parsed).toBe(-1);
  });
});
