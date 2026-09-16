/**
 * REPLACING LONG CONTENT WITH SHORT CONTENT CANNOT LEAVE THE VIEW SCROLLED OFF IT.
 *
 * "when i delete more than one door in doorman the list and descriptions gets
 * offset" (the sysop, 2026-09-16).
 *
 * The scroll offset belongs to the ELEMENT, not to the text in it. DOORMAN's
 * info panel shows a growing progress log while a door is deleted - long
 * enough to scroll - and then goes back to the short description of whichever
 * door the list moved to. The offset from the log was still in force, so the
 * panel painted from a line the description does not have: blank rows, with
 * the text sitting unread above the viewport.
 *
 * Measured on the real widget before the fix: a 40-line log scrolled to 30,
 * replaced by a 3-line description, left `getScroll()` at 30 against a
 * `getScrollHeight()` of 0.
 *
 * Driven against a real ScrollableBox on a fake-output Screen.
 */
import { Screen, ScrollableBox } from '../../engines/ui/blessed';

function makeScreen() {
  return new Screen({
    output: () => {},
    input: {
      on: () => {}, once: () => {}, removeListener: () => {},
      setRawMode: () => {}, resume: () => {}, pause: () => {}, isTTY: true,
    },
    terminal: 'xterm-256color',
  } as any) as any;
}

const lines = (n: number, tag = 'log line') =>
  Array.from({ length: n }, (_, i) => `${tag} ${i}`).join('\n');

describe('an element whose content is replaced by something shorter', () => {
  it('cannot stay scrolled past the end of what it now holds', () => {
    const screen = makeScreen();
    const box: any = new ScrollableBox({
      parent: screen, top: 0, left: 0, width: 40, height: 8,
      border: { type: 'line' }, tags: true, scrollable: true, keys: true,
    } as any);

    box.setContent(lines(40));
    screen.render();
    box.setScroll(30);
    screen.render();
    expect(box.getScroll()).toBeGreaterThan(0);

    // The delete finishes and the panel describes the selected door again.
    box.setContent('Name:    DOORX\nCommand: X\nType:    TS');
    screen.render();

    expect(box.getScroll()).toBeLessThanOrEqual(box.getScrollHeight());

    box.destroy();
    screen.destroy();
  });

  it('leaves an unscrolled element alone', () => {
    const screen = makeScreen();
    const box: any = new ScrollableBox({
      parent: screen, top: 0, left: 0, width: 40, height: 8,
      border: { type: 'line' }, tags: true, scrollable: true,
    } as any);

    box.setContent(lines(3));
    screen.render();
    expect(box.getScroll()).toBe(0);

    box.setContent(lines(2));
    screen.render();
    expect(box.getScroll()).toBe(0);

    box.destroy();
    screen.destroy();
  });

  it('keeps a scroll the new content can still reach', () => {
    const screen = makeScreen();
    const box: any = new ScrollableBox({
      parent: screen, top: 0, left: 0, width: 40, height: 8,
      border: { type: 'line' }, tags: true, scrollable: true,
    } as any);

    box.setContent(lines(60));
    screen.render();
    box.setScroll(5);
    screen.render();
    expect(box.getScroll()).toBe(5);

    // Still far taller than the window: line 5 is a line it has, so the
    // reader stays where they were rather than being yanked to the top.
    box.setContent(lines(50));
    screen.render();
    expect(box.getScroll()).toBe(5);

    box.destroy();
    screen.destroy();
  });
});
