/**
 * A closable widget's [X] must still be on the glass after the widget has
 * finished building itself.
 *
 * "i am testing on localhost the [X] is still just an ]" (sysop, 2026-09-14,
 * reading a bulletin in CARDLOBBY). Every window that door opens is a
 * DocModal, and DocModal is `closable: true`, so Element draws the button in
 * its constructor at `top: 0, right: 1` - three cells wide. DocModal then
 * appends an OPAQUE scrollable content area at the same `top: 0`, `left: 0`,
 * `width: '100%-2'`. Blessed paints in tree order, so the later child wins:
 * 76 of the 78 inner columns get repainted with content, burying `[` and `X`
 * and leaving the third cell - a lone red `]` - showing past its right edge.
 *
 * The button is CHROME, so it is painted LAST among its siblings - whatever
 * the widget appends to itself afterwards. It cannot move onto the frame
 * instead: Screen._renderElement re-paints a parent's border after all its
 * children, so a button hung at `top: -1` is drawn and then erased. That is
 * exactly what happened to CategoryPicker's, which nobody had ever seen.
 */

import { Screen } from '../../engines/ui/blessed/core/screen';
import { DocModal } from '../../engines/ui/blessed/widgets/doc-modal';
import { Box } from '../../engines/ui/blessed/widgets/box';

function screenOf(width = 80, height = 24): any {
  return new Screen({ title: 'close button', width, height } as any);
}

/** Every element under a node, in paint order. */
function inPaintOrder(node: any): any[] {
  return [node, ...((node.children ?? []).flatMap(inPaintOrder))];
}

/** The close button Element the closable feature created. */
function closeButtonOf(root: any): any {
  return inPaintOrder(root).find(
    (el: any) => el !== root && typeof el.getContent === 'function' && el.getContent?.() === '[X]',
  );
}

/** What is actually painted in the cells the button occupies. */
function paintedAt(screen: any, coords: { xi: number; xl: number; yi: number }): string {
  const row = screen.buffer[coords.yi];
  if (!row) return '';
  return row
    .slice(coords.xi, coords.xl)
    .map((c: [number, string]) => c[1])
    .join('');
}

describe('a closable modal shows its whole close button', () => {
  let screen: any;
  afterEach(() => screen?.destroy());

  it('paints [X], not the tail of it, after the content area is built', () => {
    screen = screenOf();
    const modal = new DocModal({
      parent: screen,
      title: 'Bulletins',
      content: 'Nothing has been posted yet.',
    } as any);
    modal.display();
    screen.render();

    const button = closeButtonOf(modal);
    expect(button).toBeTruthy();
    // The whole glyph, from the screen buffer - not the content string,
    // which said '[X]' the entire time the sysop was looking at an ']'.
    expect(paintedAt(screen, button._getCoords())).toBe('[X]');
  });

  it('wins over a first line long enough to run under it', () => {
    screen = screenOf();
    const modal = new DocModal({
      parent: screen,
      title: 'Achievements',
      // A first line long enough to reach the right-hand chrome.
      content: 'X'.repeat(78),
    } as any);
    modal.display();
    screen.render();

    const button = closeButtonOf(modal);
    const coords = button._getCoords();
    // Inside the frame, on the first content row - the border row is not
    // available to a child, so this is where the chrome lives.
    expect(coords.yi).toBe((modal as any)._getCoords().yi + 1);
    expect(paintedAt(screen, coords)).toBe('[X]');
  });

  it('stays above a sibling the widget appends afterwards', () => {
    screen = screenOf();
    const modal = new DocModal({
      parent: screen,
      title: 'Leaderboard',
      content: 'nothing yet',
    } as any);
    modal.display();

    // Whatever the door adds to the modal later must not bury the chrome.
    new Box({
      parent: modal as any,
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      ch: ' ',
      content: 'Y'.repeat(70),
    } as any);
    screen.render();

    const button = closeButtonOf(modal);
    expect(paintedAt(screen, button._getCoords())).toBe('[X]');
  });
});

/**
 * A borderless closable element puts the button on the same row 0, and must
 * still be painted last.
 */
describe('a borderless closable element keeps its button on row 0', () => {
  let screen: any;
  afterEach(() => screen?.destroy());

  it('draws [X] on its first row, above later siblings', () => {
    screen = screenOf();
    const panel = new Box({
      parent: screen,
      top: 2,
      left: 2,
      width: 30,
      height: 6,
      ch: ' ',
      closable: true,
    } as any);
    new Box({
      parent: panel,
      top: 0,
      left: 0,
      width: '100%',
      height: 1,
      ch: ' ',
      content: 'Z'.repeat(30),
    } as any);
    screen.render();

    const button = closeButtonOf(panel);
    expect(button).toBeTruthy();
    const coords = button._getCoords();
    expect(coords.yi).toBe((panel as any)._getCoords().yi);
    expect(paintedAt(screen, coords)).toBe('[X]');
  });
});

/**
 * CategoryPicker draws its own [X] rather than using `closable`, and had the
 * same two faults at once: hung on the border row (erased by the border
 * re-paint) and appended before the two lists that then covered it. Nobody
 * reported it because nobody ever saw the button at all.
 */
describe('the category picker shows its close button', () => {
  let screen: any;
  afterEach(() => screen?.destroy());

  it('paints [X] over the lists it was built before', () => {
    const { CategoryPicker } = require('../../engines/ui/blessed/widgets/category-picker');
    screen = screenOf();
    const picker = new CategoryPicker({
      parent: screen,
      top: 0,
      left: 0,
      width: 60,
      height: 16,
      categories: ['Demos', 'Music'],
      getItems: () => [{ label: 'something' }],
      onSelect: () => {},
      onCancel: () => {},
    } as any);
    picker.display();
    screen.render();

    const button = closeButtonOf(picker);
    expect(button).toBeTruthy();
    const coords = button._getCoords();
    // One row, three cells: a padded Button had a single cell to print
    // '[X]' into and swallowed three rows of the list behind it.
    expect(coords.yl - coords.yi).toBe(1);
    expect(paintedAt(screen, coords)).toBe('[X]');
    picker.destroy?.();
  });
});
