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

/**
 * ...and it has to CLOSE the thing when it is clicked.
 *
 * Two faults stood between the button and the close, and the door looked
 * alive through both: the menu bar still drew, the entries still highlighted,
 * and every window after the first one refused to open. "theme is dead",
 * "leaders is dead" (sysop, 2026-09-14).
 *
 *   1. Mouse hit-testing reads Screen's spatial index, which is built from
 *      walkVisible - so a hidden element and its whole subtree are absent
 *      from it. show() said nothing about the element having appeared, so a
 *      modal opened over a board painted perfectly and took no clicks at
 *      all: those cells still belonged to the panels underneath.
 *
 *   2. The button calls Element.close(), which hides and emits 'close'.
 *      DocModal deliberately does not listen to its own 'close' - that is
 *      what made closing recurse until the stack died - so the caller's
 *      onClose never ran. CARD LOBBY clears its `modalActive` there, and a
 *      door that thinks a modal is still up refuses to open another.
 */
describe('the close button actually closes the modal', () => {
  let screen: any;
  afterEach(() => screen?.destroy());

  /** A click, the way Program delivers one. */
  function click(s: any, x: number, y: number): void {
    s.program.emit('mouse', { x, y, action: 'mousedown', button: 'left', shift: false, ctrl: false, meta: false });
    s.program.emit('mouse', { x, y, action: 'mouseup', button: 'left', shift: false, ctrl: false, meta: false });
  }

  it('runs the caller onClose when the [X] is clicked', () => {
    screen = screenOf();
    // Something under the modal, so the stale index has an owner for those
    // cells - which is exactly the board the modal opens over.
    new Box({ parent: screen, top: 0, left: 0, width: '100%', height: '100%', ch: ' ', mouse: true, clickable: true } as any);
    // Build the index while the modal is still hidden, the way a door does:
    // the caller has been moving the mouse over the board all along.
    screen.render();
    click(screen, 5, 5);

    let closed = 0;
    const modal = new DocModal({
      parent: screen,
      title: 'Player Profile',
      content: 'Player: sysop',
      onClose: () => { closed += 1; },
    } as any);
    modal.display();
    screen.render();

    const button = closeButtonOf(modal);
    const coords = button._getCoords();
    click(screen, coords.xi + 1, coords.yi);

    expect(closed).toBe(1);
    expect((modal as any).hidden).toBe(true);
  });

  it('closes once, however many times the button is clicked', () => {
    screen = screenOf();
    let closed = 0;
    const modal = new DocModal({
      parent: screen, title: 'Bulletins', content: 'nothing yet',
      onClose: () => { closed += 1; },
    } as any);
    modal.display();
    screen.render();

    const coords = closeButtonOf(modal)._getCoords();
    click(screen, coords.xi + 1, coords.yi);
    click(screen, coords.xi + 1, coords.yi);
    expect(closed).toBe(1);
  });
});

/**
 * The hit-test index has to learn that an element appeared.
 *
 * This is the half that reaches every dialog on the board, not just this
 * one: anything shown after the index was built was invisible to the mouse.
 */
describe('an element shown after the index was built still takes clicks', () => {
  let screen: any;
  afterEach(() => screen?.destroy());

  it('gets the click instead of what was under it', () => {
    screen = screenOf();
    const board: any = new Box({
      parent: screen, top: 0, left: 0, width: '100%', height: '100%',
      ch: ' ', mouse: true, clickable: true,
    } as any);
    let boardClicks = 0;
    board.on('click', () => { boardClicks += 1; });

    screen.render();
    // First mouse event of the session builds the index over the board.
    screen.program.emit('mouse', { x: 10, y: 10, action: 'mousedown', button: 'left' });
    expect(boardClicks).toBe(1);

    const dialog: any = new Box({
      parent: screen, top: 8, left: 8, width: 20, height: 5,
      ch: ' ', mouse: true, clickable: true, hidden: true,
    } as any);
    let dialogClicks = 0;
    dialog.on('click', () => { dialogClicks += 1; });

    // Rebuild the index with the dialog still hidden - a render invalidates,
    // a mouse query rebuilds - and then show it WITHOUT rendering, which is
    // what a door does when it opens something from inside a mouse handler.
    screen.render();
    screen.program.emit('mouse', { x: 1, y: 1, action: 'mousemove' });
    dialog.show();

    screen.program.emit('mouse', { x: 10, y: 10, action: 'mousedown', button: 'left' });
    expect(dialogClicks).toBe(1);
    // And the board no longer hears a click that landed on the dialog.
    expect(boardClicks).toBe(1);
  });
});
