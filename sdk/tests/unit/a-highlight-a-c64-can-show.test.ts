/**
 * A LIST'S HIGHLIGHT ON A SCREEN WITH NO BACKGROUNDS.
 *
 * PETSCII colour is per-cell FOREGROUND only, so a highlight written the way
 * every door writes one - a background with a contrasting foreground - used to
 * reach a forty-column caller as `fg: ground` alone: BLACK TEXT ON A BLACK
 * SCREEN, and his own row was the one he could not read (the sysop, 2026-09-22,
 * on WHIP: "the active row is black").
 *
 * The first fix was here, in the List: at forty columns a background became
 * reverse video. That was the right symptom at the wrong level. Every coloured
 * bar on a C64 had the same defect, and the menu bar was next - "there is no
 * menu bar i think the texts are black when not hovered" (2026-09-23). So the
 * fill moved to the one place that knows what a C64 can draw: the transducer
 * renders a background that is not the screen's own as reverse video in that
 * colour.
 *
 * Which is why this test asserts what lands ON THE GLASS rather than which
 * tags the widget wrote: the highlight is a FILLED ROW IN THE DOOR'S OWN
 * ACCENT, at forty columns and at eighty.
 */
import { Screen } from '../../engines/ui/blessed/core/screen';
import { List } from '../../engines/ui/blessed/widgets/list';
import { AnsiToPetsciiTransducer } from '../../petscii/ansi-to-petscii';
import { PetsciiMachine } from '../../petscii/petscii-machine';
import { parseTags } from '../../engines/ui/blessed/core/colors';

/** The first item's rendered line, tags and all. */
function firstRow(width: number, style: Record<string, unknown>): string {
  const screen = new Screen({ width, height: 25, responsive: true } as any);
  try {
    const list = new List({
      parent: screen, top: 0, left: 0, width: '100%', height: 5,
      items: ['one', 'two'], interactive: true, keys: true,
      style,
    } as any);
    list.select(0);
    return String((list as any).content ?? '').split('\n')[0];
  } finally {
    try { (screen as any).destroy(); } catch { /* leaving anyway */ }
  }
}

/** That row as a C64 draws it: colour RAM and the reverse bit, per cell. */
function onTheGlass(row: string) {
  const machine = new PetsciiMachine();
  machine.feed(new AnsiToPetsciiTransducer().transduce(parseTags(row)));
  return (x: number) => ({
    pen: machine.state.colorRam[x],
    filled: (machine.state.screen[x] & 0x80) !== 0,
  });
}

const CYAN = 3;
const HIGHLIGHT = { selected: { bg: 'cyan', fg: 'black' }, item: { fg: 'white' } };
const ESC = String.fromCharCode(27);

describe('a highlight on a forty-column screen', () => {
  it('is a filled row in the colour the door asked for', () => {
    const cell = onTheGlass(firstRow(40, HIGHLIGHT));
    // Column 0 is the List's own selection marker; the label starts after it.
    expect(cell(3)).toEqual({ pen: CYAN, filled: true });
  });

  it('keeps the door\'s background instead of trading it for a white one', () => {
    const row = parseTags(firstRow(40, HIGHLIGHT));
    expect(row).toContain(`${ESC}[46m`);       // the door's cyan, still asked for
    expect(row).not.toContain(`${ESC}[7m`);    // not traded for a white fill
  });
});

describe('a highlight on an eighty-column board', () => {
  it('is the door\'s own colours, exactly as before', () => {
    const row = firstRow(80, HIGHLIGHT);

    expect(parseTags(row)).toContain(`${ESC}[46m`);
    expect(parseTags(row)).toContain(`${ESC}[30m`);
    expect(parseTags(row)).not.toContain(`${ESC}[7m`);
  });
});

describe('a door that asks for reverse itself', () => {
  it('gets it at either width', () => {
    for (const width of [40, 80]) {
      expect(parseTags(firstRow(width, { selected: { inverse: true }, item: { fg: 'white' } })))
        .toContain(`${ESC}[7m`);
    }
  });
});
