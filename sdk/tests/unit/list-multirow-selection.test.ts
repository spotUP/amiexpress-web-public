/**
 * A selected item that spans several rows is highlighted on every row.
 *
 * An item may hold `\n`, and the list drew it over several rows - but it
 * wrapped the selection style round the whole item once, and the rows are
 * split out of the PARSED text, so only the first row started inside the
 * style. WHIP's kanban cards are word-wrapped titles: a selected card lit its
 * first row and left the rest dark (sysop, 2026-09-28). An empty row inside an
 * item (a spacer between cards) stays unlit.
 */
import { Screen, List } from '../../engines/ui/blessed';

function paint(items: string[], selected: number): { screen: any; list: any } {
  const screen: any = new Screen({
    output: () => {},
    input: {
      on: () => {}, once: () => {}, removeListener: () => {},
      setRawMode: () => {}, resume: () => {}, pause: () => {}, isTTY: true,
    },
    terminal: 'xterm-256color',
  } as any);
  const list: any = new List({
    parent: screen, top: 0, left: 0, width: 30, height: 10, tags: true,
    items, style: { selected: { fg: 'black', bg: 'green' } },
  } as any);
  list.select(selected);
  screen.render();
  return { screen, list };
}

/** The attribute of the first text cell of a buffer row (after the marker). */
function attrOfRow(screen: any, y: number): number {
  return screen.buffer[y][2][0];
}

describe('a multi-row item', () => {
  it('is highlighted on every one of its rows when selected', () => {
    const { screen } = paint(['first card', 'second card\nwraps onto\nthree rows\n', 'third'], 1);
    // rows: 0 first card, 1 second card, 2 wraps onto, 3 three rows, 4 spacer, 5 third
    const lit = attrOfRow(screen, 1);
    expect(lit).not.toBe(attrOfRow(screen, 0));
    expect(attrOfRow(screen, 2)).toBe(lit);
    expect(attrOfRow(screen, 3)).toBe(lit);
  });

  it('leaves its empty spacer row and the other items unlit', () => {
    const { screen } = paint(['first card\n', 'second card\n', 'third'], 1);
    // rows: 0 first, 1 spacer, 2 second (selected), 3 spacer, 4 third
    const plain = attrOfRow(screen, 0);
    expect(attrOfRow(screen, 2)).not.toBe(plain);
    expect(attrOfRow(screen, 3)).toBe(attrOfRow(screen, 1));
    expect(attrOfRow(screen, 4)).toBe(plain);
  });
});
