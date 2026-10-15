/**
 * A padded box hides what is behind it.
 *
 * Screen._renderContent filled a box's background from the content origin,
 * inside the padding and below any valign offset. A padded or vertically
 * centred box drawn over other content let that content show through its
 * padding ring - WHIP's "Task title cannot be empty!" message drew with the
 * dialog behind it bleeding through (2026-09-28). The background now covers
 * everything inside the border, as blessed's own render does.
 *
 * And a `width: 'shrink'` Message is sized from its text: blessed's shrink
 * measures an element's own content, a Message keeps its text in a child,
 * so it measured zero columns and drew nothing.
 */
import { Screen, Box } from '../../engines/ui/blessed';
import { Message } from '../../engines/ui/blessed/widgets/message';

function rowText(screen: any, y: number, x1: number, x2: number): string {
  return screen.buffer[y].slice(x1, x2).map((c: any) => c[1]).join('');
}

describe('what a box paints', () => {
  it('its padding ring and the rows a valign skips cover the content behind', () => {
    const screen: any = new Screen({ width: 40, height: 12 } as any);
    new Box({ parent: screen, top: 0, left: 0, width: 40, height: 12, content: 'X'.repeat(40 * 12) } as any);
    new Box({
      parent: screen, top: 2, left: 5, width: 20, height: 8,
      border: { type: 'line' }, padding: 1, valign: 'middle', content: 'hi',
      style: { bg: 'blue' },
    } as any);
    screen.render();

    // Inside the border: rows 3..8, columns 6..23. Not one X survives.
    for (let y = 3; y <= 8; y++) {
      expect(`row ${y}: ${rowText(screen, y, 6, 24).includes('X')}`).toBe(`row ${y}: false`);
    }
    screen.destroy();
  });

  it("a 'shrink' message is as wide as its text needs", () => {
    const screen: any = new Screen({ width: 80, height: 24 } as any);
    const text = 'Task title cannot be empty!';
    const message: any = new Message({ parent: screen, width: 'shrink', label: ' Error ' } as any);
    message.display(text, () => {});
    screen.render();

    const pos = message._getCoords();
    expect(pos.xl - pos.xi).toBeGreaterThanOrEqual(text.length + 4);
    screen.destroy();
  });
});
