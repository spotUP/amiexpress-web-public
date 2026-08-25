/**
 * Restoring a saved panel layout.
 *
 * A DockablePanel remembers where the user put it. The BBS terminal is 80
 * columns, but the same door also runs in a browser window several times
 * that wide, so a panel saved on a wide screen gets restored onto a narrow
 * one - and it has to be made to FIT rather than hang off the edge.
 *
 * Reported live as "the chat log is too wide" (2026-08-25): a restored width
 * was clamped against the screen width but not against where the panel
 * started, so an 80-wide panel restored at column 22 ran to column 102. Its
 * right border was painted off-screen and so was invisible, while the top
 * and bottom edges still filled to the screen edge - which is why it looked
 * like a missing border rather than an oversized panel.
 */

import { Screen } from '../../engines/ui/blessed/core/screen';
import { DockablePanel } from '../../engines/ui/blessed/widgets/dockable-panel';

function makeScreen(width = 80, height = 24): any {
  return new Screen({ title: 'restore', width, height } as any);
}

function makePanel(screen: any, left: number, width: number): any {
  return new DockablePanel({
    parent: screen,
    title: ' Chat ',
    top: 1,
    left,
    width,
    height: 20,
    dockPosition: 'float',
    border: { type: 'line' },
  } as any);
}

/** The rightmost column the panel paints on. */
function rightEdge(panel: any): number {
  return (panel.position.left as number) + (panel.position.width as number) - 1;
}

describe('restoring a layout saved on a bigger screen', () => {
  let screen: any;

  afterEach(() => screen?.destroy());

  it('keeps the panel on screen when the saved width is too wide for its column', async () => {
    screen = makeScreen(80, 24);
    const panel = makePanel(screen, 22, 58);

    // Saved when the same door ran in a 119-column browser window.
    await panel.setState({ width: 97 });

    expect(rightEdge(panel)).toBeLessThanOrEqual(79);
  });

  it('leaves a layout that already fits alone', async () => {
    screen = makeScreen(80, 24);
    const panel = makePanel(screen, 22, 58);

    await panel.setState({ width: 58 });

    expect(panel.position.width).toBe(58);
    expect(rightEdge(panel)).toBe(79);
  });

  it('fits a restored panel that also moves, using the position it moves to', async () => {
    screen = makeScreen(80, 24);
    const panel = makePanel(screen, 0, 40);

    await panel.setState({ x: 30, width: 70 });

    expect(rightEdge(panel)).toBeLessThanOrEqual(79);
  });

  it('keeps the panel on screen vertically too', async () => {
    screen = makeScreen(80, 24);
    const panel = makePanel(screen, 0, 40);

    await panel.setState({ y: 10, height: 40 });

    const bottom = (panel.position.top as number) + (panel.position.height as number) - 1;
    expect(bottom).toBeLessThanOrEqual(23);
  });

  it('never shrinks a panel below something usable', async () => {
    screen = makeScreen(80, 24);
    const panel = makePanel(screen, 78, 5);

    await panel.setState({ width: 40 });

    expect(panel.position.width as number).toBeGreaterThanOrEqual(5);
  });
});
