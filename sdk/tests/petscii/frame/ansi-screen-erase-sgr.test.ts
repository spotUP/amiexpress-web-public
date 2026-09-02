import { FrameReconstructor } from '../../../petscii/frame/ansi-screen';
import { Frame } from '../../../petscii/frame/types';
import { AnsiToPetsciiTransducer } from '../../../petscii/ansi-to-petscii';

const text = (f: Frame, y: number) => f.cells[y].map((c) => c.ch).join('').replace(/ +$/, '');
const at = (f: Frame, x: number, y: number) => f.cells[y][x];
function run(...chunks: string[]) {
  const r = new FrameReconstructor();
  for (const c of chunks) r.write(c);
  return { r, f: r.snapshot() };
}
/** Fill 3 rows with letters and park the cursor mid-screen. */
const PAINTED = '\x1b[1;1H' + 'a'.repeat(80) + '\x1b[2;1H' + 'b'.repeat(80) + '\x1b[3;1H' + 'c'.repeat(80) + '\x1b[2;41H';

describe('FrameReconstructor erase (cursor never moves)', () => {
  it('ED 0 clears from the cursor to the end of the screen', () => {
    const { f } = run(PAINTED + '\x1b[J');
    expect(text(f, 0)).toBe('a'.repeat(80));
    expect(text(f, 1)).toBe('b'.repeat(40));
    expect(text(f, 2)).toBe('');
    expect(f.cursor).toEqual({ x: 40, y: 1 });
  });

  it('ED 1 clears from the top through the cursor', () => {
    const { f } = run(PAINTED + '\x1b[1J');
    expect(text(f, 0)).toBe('');
    expect(text(f, 1)).toBe(' '.repeat(41) + 'b'.repeat(39));
    expect(text(f, 2)).toBe('c'.repeat(80));
  });

  it('ED 2 and ED 3 clear everything and keep the cursor where it was', () => {
    for (const seq of ['\x1b[2J', '\x1b[3J']) {
      const { f } = run(PAINTED + seq);
      expect(f.cells.every((row) => row.every((c) => c.ch === ' '))).toBe(true);
      expect(f.cursor).toEqual({ x: 40, y: 1 });
    }
  });

  it('EL 0/1/2 clear to end, from start, whole row', () => {
    expect(text(run(PAINTED + '\x1b[K').f, 1)).toBe('b'.repeat(40));
    expect(text(run(PAINTED + '\x1b[1K').f, 1)).toBe(' '.repeat(41) + 'b'.repeat(39));
    expect(text(run(PAINTED + '\x1b[2K').f, 1)).toBe('');
  });

  it('ECH blanks n cells from the cursor', () => {
    const { f } = run(PAINTED + '\x1b[5X');
    expect(text(f, 1)).toBe('b'.repeat(40) + ' '.repeat(5) + 'b'.repeat(35));
    expect(f.cursor).toEqual({ x: 40, y: 1 });
  });

  it('erase resets the cells to the default attributes, not the current pen', () => {
    const { f } = run('\x1b[41;32;1;7m' + 'z'.repeat(10) + '\x1b[2K');
    expect(at(f, 0, 0)).toEqual({ ch: ' ', fg: 1, bg: 0, bold: false, rvs: false });
  });

  it('erase settles a pending wrap: the next printable lands in the erased last column, not on the next row', () => {
    const { r } = run('a'.repeat(80) + '\x1b[K');
    r.write('Z');
    const f = r.snapshot();
    expect(text(f, 0)).toBe('a'.repeat(79) + 'Z');
    expect(at(f, 0, 1).ch).toBe(' ');
  });
});

describe('FrameReconstructor SGR resolves into the VIC index space', () => {
  it('basic colours, bold-before-colour brightens, bold-after-colour does not (resolved at set time, like the transducer)', () => {
    expect(at(run('\x1b[31mX').f, 0, 0).fg).toBe(2);
    expect(at(run('\x1b[1;31mX').f, 0, 0).fg).toBe(10);
    expect(at(run('\x1b[31;1mX').f, 0, 0).fg).toBe(2);
    expect(at(run('\x1b[91mX').f, 0, 0).fg).toBe(10);
    expect(at(run('\x1b[31m\x1b[39mX').f, 0, 0).fg).toBe(1);
    expect(at(run('\x1b[1;31mX').f, 0, 0).bold).toBe(true);
    expect(at(run('\x1b[1;22;31mX').f, 0, 0).fg).toBe(2);
  });

  it('256-colour and truecolor snap to the nearest Colodore entry', () => {
    expect(at(run('\x1b[38;5;10mX').f, 0, 0).fg).toBe(13);
    expect(at(run('\x1b[38;2;129;51;56mX').f, 0, 0).fg).toBe(2);
    expect(at(run('\x1b[48;2;0;0;0mX').f, 0, 0).bg).toBe(0);
  });

  // 49 restores the DEFAULT background, which is black (types.ts DEFAULT_BG):
  // a C64 terminal powers on black and has no per-cell background at all.
  // SGR 44 is still an explicit blue background and still resolves to VIC 6.
  it('backgrounds are consumed into bg and never leak into fg; 49 restores the default black', () => {
    const c = at(run('\x1b[44;33mX').f, 0, 0);
    expect(c.bg).toBe(6);
    expect(c.fg).toBe(7);
    expect(at(run('\x1b[41m\x1b[49mX').f, 0, 0).bg).toBe(0);
  });

  it('reverse video is a cell attribute; SGR 0 clears everything', () => {
    const { f } = run('\x1b[7mR\x1b[27mN\x1b[1;31;7mB\x1b[0mP');
    expect(at(f, 0, 0).rvs).toBe(true);
    expect(at(f, 1, 0).rvs).toBe(false);
    expect(at(f, 2, 0)).toMatchObject({ rvs: true, bold: true, fg: 10 });
    expect(at(f, 3, 0)).toEqual({ ch: 'P', fg: 1, bg: 0, bold: false, rvs: false });
  });

  it('a truncated extended colour ends the SGR without treating its tail as a reset', () => {
    expect(at(run('\x1b[31m\x1b[38;2;255;0mX').f, 0, 0).fg).toBe(2);
  });

  it('picks the SAME VIC index the transducer picks for every SGR it understands', () => {
    const sgrs = ['\x1b[30m', '\x1b[31m', '\x1b[32m', '\x1b[33m', '\x1b[34m', '\x1b[35m', '\x1b[36m', '\x1b[37m',
      '\x1b[1;30m', '\x1b[1;31m', '\x1b[1;32m', '\x1b[1;33m', '\x1b[1;34m', '\x1b[1;35m', '\x1b[1;36m', '\x1b[1;37m',
      '\x1b[90m', '\x1b[97m', '\x1b[39m', '\x1b[0m', '\x1b[38;5;208m', '\x1b[38;5;244m', '\x1b[38;2;10;200;10m', '\x1b[44;33m'];
    for (const sgr of sgrs) {
      const frame = run(sgr + 'X').f;
      const t = new AnsiToPetsciiTransducer();
      t.transduce(sgr + 'X');
      expect({ sgr, fg: at(frame, 0, 0).fg }).toEqual({ sgr, fg: t.machine.state.colorRam[0] });
    }
  });
});

describe('FrameReconstructor save/restore, alternate screen, strings', () => {
  it('ESC 7 / ESC 8 and CSI s / u save and restore the cursor', () => {
    expect(run('\x1b[5;5H\x1b7\x1b[10;10H\x1b8').f.cursor).toEqual({ x: 4, y: 4 });
    expect(run('\x1b[5;5H\x1b[s\x1b[10;10H\x1b[u').f.cursor).toEqual({ x: 4, y: 4 });
    expect(run('\x1b[3;3H\x1b8').f.cursor).toEqual({ x: 2, y: 2 });
  });

  it('?1049h / ?47l clear the screen and home the cursor', () => {
    for (const seq of ['\x1b[?1049h', '\x1b[?47l', '\x1b[?1049l']) {
      const { f } = run(PAINTED + seq);
      expect(text(f, 0)).toBe('');
      expect(f.cursor).toEqual({ x: 0, y: 0 });
    }
  });

  it('RIS resets the grid and attributes', () => {
    const { f } = run('\x1b[31m' + PAINTED + '\x1bcX');
    expect(text(f, 1)).toBe('');
    expect(at(f, 0, 0)).toEqual({ ch: 'X', fg: 1, bg: 0, bold: false, rvs: false });
  });

  it('OSC / DCS are swallowed through BEL or ST, held across chunks, dropped at the 256-byte cap', () => {
    expect(text(run('\x1b]0;title\x07X').f, 0)).toBe('X');
    expect(text(run('\x1bPq#0\x1b\\Y').f, 0)).toBe('Y');
    expect(text(run('\x1b]0;ti', 'tle\x07Z').f, 0)).toBe('Z');
    const { r } = run('\x1b]' + 'a'.repeat(300));
    r.write('W');
    expect(text(r.snapshot(), 0)).toBe('W');
  });

  it('an unterminated string that hits a newline lets the newline through', () => {
    const { f } = run('\x1b]lost\r\nnext');
    expect(text(f, 1)).toBe('next');
  });

  it('ESC M at the top scrolls the screen down; ESC D indexes; ESC E is a newline', () => {
    const { f } = run('top\x1bMX');
    expect(text(f, 1)).toBe('top');
    expect(at(f, 3, 0).ch).toBe('X');
    expect(run('ab\x1bD').f.cursor).toEqual({ x: 2, y: 1 });
    expect(run('ab\x1bE').f.cursor).toEqual({ x: 0, y: 1 });
  });
});
