/**
 * A LIST BEHIND AN OPEN PANEL MUST NOT MOVE.
 *
 * Reported against the ACHIEVE door, 2026-09-08: "when i scroll up/down to
 * read for example the catalog, by family in the achieve door the menu
 * cursor moves as well in the menu". Scrolling the panel walked the menu
 * behind it, so leaving the panel landed on a different row than the one
 * that was opened.
 *
 * A blessed List built with `keys: true` binds up/down/j/k at CONSTRUCTION
 * and acts on them whenever it has focus, and a door that scrolls its panel
 * with `screen.key` is heard by both. This is a property of the pattern, so
 * the fix lives beside `createList` rather than in one door.
 */
import { Screen, List } from '../../engines/ui/blessed';
import { borrowListKeys } from '../../utils/blessed-helpers';

/**
 * The list DEBOUNCES navigation keys at 50 ms (list.ts's `_lastKeyTime`), so
 * that holding an arrow does not scroll past the bottom before the eye can
 * follow. A test that presses twice in the same millisecond has its second
 * press dropped - and dropped is reported as HANDLED, so it looks exactly
 * like a listener that is not there. The clock moves between presses here.
 */
let clock = 1_000_000;
beforeEach(() => {
  clock = 1_000_000;
  jest.spyOn(Date, 'now').mockImplementation(() => clock);
});
afterEach(() => {
  jest.restoreAllMocks();
});
const aMomentLater = (): void => { clock += 100; };

function bench() {
  const screen: any = new Screen({
    output: ((_s: string) => true) as any,
    input: {
      on: () => {}, once: () => {}, removeListener: () => {},
      setRawMode: () => {}, resume: () => {}, pause: () => {}, isTTY: true,
    },
    terminal: 'xterm-256color',
  } as any);
  const list: any = new List({
    parent: screen, top: 0, left: 0, width: 40, height: 6,
    keys: true, vi: true,
    items: ['one', 'two', 'three', 'four'],
  } as any);
  list.select(0);
  list.focus();
  /** What a caller pressing Down sends to the focused element. */
  const pressDown = () => { aMomentLater(); list.emit('keypress', undefined, { name: 'down' }); };
  const pressK = () => { aMomentLater(); list.emit('keypress', 'k', { name: 'k' }); };
  return { screen, list, pressDown, pressK };
}

describe('a list whose keys are borrowed', () => {
  it('moves on Down while it owns them - the behaviour being suspended', () => {
    const { list, pressDown } = bench();

    pressDown();

    expect(list.selected).toBe(1);
  });

  it('does not move while a panel has them', () => {
    const { list, pressDown } = bench();
    pressDown();
    expect(list.selected).toBe(1);

    borrowListKeys(list);
    pressDown();
    pressDown();

    // The panel scrolled; the menu stayed on the row the caller opened.
    expect(list.selected).toBe(1);
  });

  it('moves again once they are given back, from where it was left', () => {
    const { list, pressDown } = bench();
    pressDown();
    const restore = borrowListKeys(list);
    pressDown();

    restore();
    pressDown();

    expect(list.selected).toBe(2);
  });

  it('gives back vi keys too, and only once however often it is called', () => {
    const { list, pressK, pressDown } = bench();
    pressDown();
    pressDown();
    expect(list.selected).toBe(2);

    const restore = borrowListKeys(list);
    restore();
    restore();
    restore();

    pressK();
    expect(list.selected).toBe(1);
    // Restoring three times must not have attached three copies: one press,
    // one row.
    pressK();
    expect(list.selected).toBe(0);
  });

  it('is safe against a list that is already gone', () => {
    expect(() => borrowListKeys(null)()).not.toThrow();
    expect(() => borrowListKeys(undefined)()).not.toThrow();
    expect(() => borrowListKeys({})()).not.toThrow();
  });
});
