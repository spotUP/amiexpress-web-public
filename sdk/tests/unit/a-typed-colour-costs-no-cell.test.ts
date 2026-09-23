/**
 * A COLOUR A CALLER TYPED COSTS NO COLUMN.
 *
 * "it writes a square for every ctrl+number that gets removed after a delay",
 * "in the input line i see a colored hej and a grey cursor that doesnt blink",
 * "the output change in the input if its focused or not ... it's a proper mess
 * with shitloads of bugs" (the sysop, 2026-09-23, LIVE CHAT in PETSCII mode).
 *
 * One mismatch under all of it. A pen the caller picked travels as `U+E200 +
 * vic` (`sdk/petscii/pua.ts`), which is ZERO CELLS on the glass - the
 * transducer turns it into a colour byte and prints nothing. Blessed counts
 * every codepoint as one cell, so a widget holding a marker measured one
 * column more than it painted: the frame drifted, the right edge duplicated,
 * and a cursor drawn at `value[cursorPos]` landed on the marker itself.
 *
 * Blessed already has a zero-width spelling for colour - it parses SGR inside
 * content into cell attributes and re-emits it - so the marker is folded to
 * SGR on the way INTO a widget. Storage and the wire keep the marker, because
 * chat strips ESC out of every message; only the cell buffer is spared it.
 */
import { Screen } from '../../engines/ui/blessed/core/screen';
import { Box } from '../../engines/ui/blessed/widgets/box';
import { Textbox } from '../../engines/ui/blessed/widgets/textbox';
import { AnsiToPetsciiTransducer } from '../../petscii/ansi-to-petscii';
import { PetsciiMachine } from '../../petscii/petscii-machine';
import { colourMarker } from '../../petscii/pua';
import { SCREENCODE_TO_UNICODE } from '../../petscii/screencode-unicode';
import { printableLength, wrapLineToWidth } from '../../petscii/wrap';

const ORANGE = 8;

/** What a C64 shows for what the widget wrote. */
function glass(writes: string[]) {
  const machine = new PetsciiMachine();
  machine.feed(Array.from(new AnsiToPetsciiTransducer().transduce(writes.join(''))));
  const text = (y: number, width: number) => {
    let out = '';
    for (let x = 0; x < width; x++) {
      const sc = machine.state.screen[y * 40 + x] ?? 32;
      out += SCREENCODE_TO_UNICODE[1][sc & 0x7f] ?? '?';
    }
    return out;
  };
  return { machine, text };
}

describe('a pen marker inside a widget', () => {
  let screen: any;
  let writes: string[];

  beforeEach(() => {
    writes = [];
    screen = new Screen({ width: 80, height: 25, responsive: true, output: (d: string) => writes.push(d) } as any);
    screen.resize(40, 25);
    writes.length = 0;
  });

  afterEach(() => { try { screen?.destroy(); } catch { /* leaving anyway */ } });

  it('never reaches the cell buffer as a character', () => {
    const box: any = new Box({ parent: screen, top: 0, left: 0, width: 40, height: 3 } as any);
    box.setContent(`hej${colourMarker(ORANGE)}da`);
    screen.render();

    expect(writes.join('')).not.toContain(colourMarker(ORANGE));
  });

  it('costs the row no column', () => {
    const box: any = new Box({ parent: screen, top: 0, left: 0, width: 40, height: 3 } as any);
    box.setContent(`hej${colourMarker(ORANGE)}da`);
    screen.render();

    expect(glass(writes).text(0, 5)).toBe('hejda');
  });

  it('still colours what follows it', () => {
    const box: any = new Box({ parent: screen, top: 0, left: 0, width: 40, height: 3 } as any);
    box.setContent(`hej${colourMarker(ORANGE)}da`);
    screen.render();

    const { machine } = glass(writes);
    expect(machine.state.colorRam[3]).toBe(ORANGE);
    expect(machine.state.colorRam[0]).not.toBe(ORANGE);
  });

  it('leaves a GLYPH marker alone - that one really is a cell', () => {
    const box: any = new Box({ parent: screen, top: 0, left: 0, width: 40, height: 3 } as any);
    const glyph = String.fromCodePoint(0xe100 + 0x51);   // a filled circle
    box.setContent(`a${glyph}b`);
    screen.render();

    expect(writes.join('')).toContain(glyph);
  });
});


describe('a line a caller is typing', () => {
  let screen: any;
  let writes: string[];
  let input: any;

  beforeEach(() => {
    writes = [];
    screen = new Screen({ width: 80, height: 25, responsive: true, output: (d: string) => writes.push(d) } as any);
    screen.resize(40, 25);
    input = new Textbox({ parent: screen, top: 0, left: 0, width: 40, height: 1 } as any);
    input.focus();
    input.setValue('');
    writes.length = 0;
  });

  afterEach(() => { try { screen?.destroy(); } catch { /* leaving anyway */ } });

  /** Ctrl+8 then h, e, j - the chord arrives as the authored marker. */
  function typeOrangeHej() {
    input.insertChar(colourMarker(ORANGE));
    for (const ch of 'hej') input.insertChar(ch);
    screen.render();
  }

  it('keeps the pen in the value, which is what gets sent', () => {
    typeOrangeHej();
    expect(input.getValue()).toBe(`${colourMarker(ORANGE)}hej`);
  });

  it('paints the letters where they were typed, not one column along', () => {
    typeOrangeHej();
    expect(glass(writes).text(0, 3)).toBe('hej');
  });

  it('colours them', () => {
    typeOrangeHej();
    expect(glass(writes).machine.state.colorRam[0]).toBe(ORANGE);
  });

  it('leaves the cursor on the cell after the last letter', () => {
    typeOrangeHej();
    const { machine } = glass(writes);
    // The cursor cell is drawn reversed; a reversed cell has bit 7 set.
    expect(machine.state.screen[3] & 0x80).not.toBe(0);
    expect(machine.state.screen[2] & 0x80).toBe(0);
  });

  it('backspaces a letter, not a colour', () => {
    typeOrangeHej();
    input.deleteChar();
    screen.render();
    expect(input.getValue()).toBe(`${colourMarker(ORANGE)}he`);
  });
});


describe('a wrapped line a caller coloured', () => {
  it('is measured in columns, not in codepoints', () => {
    expect(printableLength(`${colourMarker(ORANGE)}hej`)).toBe(3);
  });

  it('breaks where the same line without colour breaks', () => {
    const plain = 'aaaa bbbb cccc';
    const coloured = `${colourMarker(ORANGE)}aaaa bbbb ${colourMarker(2)}cccc`;

    expect(wrapLineToWidth(coloured, 9).map((line) => printableLength(line)))
      .toEqual(wrapLineToWidth(plain, 9).map((line) => printableLength(line)));
  });

  it('keeps every pen it was given', () => {
    const coloured = `${colourMarker(ORANGE)}aaaa bbbb ${colourMarker(2)}cccc`;
    const wrapped = wrapLineToWidth(coloured, 9).join('');

    expect(wrapped).toContain(colourMarker(ORANGE));
    expect(wrapped).toContain(colourMarker(2));
  });
});
