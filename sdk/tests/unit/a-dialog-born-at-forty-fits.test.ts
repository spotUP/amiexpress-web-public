/**
 * A WIDGET BORN BELOW THE FOLD.
 *
 * Every responsive widget in this engine sizes itself in
 * `_handleBreakpointChange`, and that only ran when the breakpoint CHANGED.
 * A browser dragged narrower got it; a DOOR OPENED AT FORTY never did,
 * because forty was where it started - so its dialogs kept the desktop
 * width they were constructed with and hung off the right of the screen.
 * Measured on the real LiveChat door at 40x25, 2026-09-22: the emoji picker
 * ended at column 45, the connection-error modal at 47.
 *
 * The pin is the SHAPE, not the door: a dialog constructed on a 40-column
 * screen is inside it, and the same dialog on eighty is untouched.
 */
import { Screen } from '../../engines/ui/blessed';
import { ConfirmModal } from '../../engines/ui/blessed/widgets/confirm-modal';
import { Message } from '../../engines/ui/blessed/widgets/message';

function screenOf(width: number, height: number): any {
  return new Screen({ width, height, responsive: true } as any);
}

/**
 * The initial pass lands on the next tick - a widget's children do not
 * exist while its base constructor runs. A door repaints continuously and
 * never notices; a test has to wait for it.
 */
const settled = () => new Promise(resolve => setImmediate(resolve));

describe('a dialog constructed on a C64 screen', () => {
  it('a confirm modal is inside forty columns without a resize ever happening', async () => {
    const screen = screenOf(40, 25);
    const modal = new ConfirmModal({ parent: screen, message: 'Quit?' } as any);
    await settled();
    screen.render();

    const coords = (modal as any)._getCoords();
    expect(coords.xl).toBeLessThanOrEqual(40);
    screen.destroy();
  });

  it('a message box is too', async () => {
    const screen = screenOf(40, 25);
    const message = new Message({ parent: screen } as any);
    (message as any).display?.('Connection lost', 0, () => {});
    await settled();
    screen.render();

    const coords = (message as any)._getCoords();
    expect(coords.xl).toBeLessThanOrEqual(40);
    screen.destroy();
  });
});

describe('the same dialogs on the board’s own eighty columns', () => {
  it('keep the widths they have always had', async () => {
    const screen = screenOf(80, 24);
    const modal = new ConfirmModal({ parent: screen, message: 'Quit?' } as any);
    await settled();
    screen.render();

    // 60 is this widget's desktop width, and an 80-column caller is not
    // mobile - nothing about him changed.
    expect(modal.width).toBe(60);
    screen.destroy();
  });
});
