/**
 * "THERE IS NO MENU BAR ... THE TEXTS ARE BLACK WHEN NOT HOVERED."
 *
 * The sysop on LIVE CHAT at forty columns, 2026-09-23. The bar is drawn the
 * way he asked for it in 2026-09-03 - "the menu bg color should be the primary
 * theme color and the texts and slashes black" - so every label is dark ink on
 * a coloured cell, and a C64 has no coloured cell to put it on. The labels
 * were not dim, they were on black. Hovering swaps the two colours, which is
 * why the hovered menu was the only one he could see.
 *
 * This drives the REAL widget on a real forty-column screen, takes the bytes
 * it renders, and reads them off a C64's glass: the label cells must carry the
 * bar's colour and the reverse bit, which is the one fill the machine has.
 */
import { Screen } from '../../engines/ui/blessed/core/screen';
import { MenuBar } from '../../engines/ui/blessed/widgets/menu-bar';
import { AnsiToPetsciiTransducer } from '../../petscii/ansi-to-petscii';
import { PetsciiMachine } from '../../petscii/petscii-machine';

const ITEMS = [
  { label: 'Chat', items: [{ label: 'Help (F1)', action: () => {} }] },
  { label: 'Tools', items: [{ label: 'Emoji (F4)', action: () => {} }] },
];

/** The door's first frame at `width`, as the bytes a terminal receives. */
function firstFrame(width: number): string {
  const writes: string[] = [];
  const screen = new Screen({
    title: 'bar', width, height: 25, responsive: true,
    output: (d: string) => writes.push(d),
  } as any);
  try {
    new MenuBar({ screen: screen as never, items: ITEMS as never } as never);
    screen.render();
    return writes.join('');
  } finally {
    try { (screen as any).destroy(); } catch { /* leaving anyway */ }
  }
}

/** Row 0 as a C64 draws it. */
function topRow(frame: string) {
  const machine = new PetsciiMachine();
  machine.feed(new AnsiToPetsciiTransducer().transduce(frame));
  return (x: number) => ({
    pen: machine.state.colorRam[x],
    filled: (machine.state.screen[x] & 0x80) !== 0,
    blank: (machine.state.screen[x] & 0x7f) === 0x20,
  });
}

describe('the menu bar on a C64', () => {
  it('is a bar the caller can see, not black ink on a black screen', () => {
    const cell = topRow(firstFrame(40));

    // ' Chat ' starts at column 0; the label's own letters are cells 1-4.
    const label = [1, 2, 3, 4].map(cell);
    for (const c of label) {
      // Filled, in ONE colour, and that colour is not the screen's own black -
      // which is exactly what "the texts are black" was.
      expect({ filled: c.filled, black: c.pen === 0 }).toEqual({ filled: true, black: false });
      expect(c.pen).toBe(label[0].pen);
    }
    expect(label.some((c) => !c.blank)).toBe(true);
  });

  it('paints the gap between two menus in the bar colour too', () => {
    const cell = topRow(firstFrame(40));
    expect(cell(6).filled).toBe(true);
  });
});
