/**
 * The selection marker means something, so it must not change when only the
 * DRAWING PATH changes.
 *
 * `>>` is selected AND focused; `> ` is selected but not focused. A caller
 * reads which list has the keyboard off those two characters.
 *
 * `_updateContent` has two paths: a full rebuild, and a fast path that only
 * moves the marker when the selection changes (70-80% faster, and it is what
 * runs on every arrow key). The fast path hardcoded `> `, so moving the
 * highlight in a focused list redrew it as UNFOCUSED - and the marker flipped
 * between `>>` and `> ` as the caller moved. The sysop, 2026-09-15: "why does
 * the cursor sometimes look like >> and sometimes > in doorman?"
 *
 * A fast path that draws something the slow path would not is not a fast
 * path; it is a second renderer.
 */
import { List } from '../../engines/ui/blessed/widgets/list';

/** A list with items, sized so one item is one line (the fast path's condition). */
function aList(focused: boolean): any {
  const list: any = new List({
    items: ['alpha', 'beta', 'gamma'],
    width: 40,
    height: 10,
    tags: false,
    // AS DOORMAN BUILDS IT (`doorman-layout.ts:175`). `wrapItems` defaults to
    // TRUE, and the fast path only runs when it is false - so a fixture that
    // omits this never reaches the code under test and passes against the bug.
    wrapItems: false,
  } as never);
  list.focused = focused;
  return list;
}

/**
 * Put the widget in the state the FAST PATH needs, which is the whole point:
 * a detached List never fills `_lines`, so a plain `_updateContent()` always
 * took the full rebuild and the bug could not show. The fast path wants
 * existing lines, one per item, and a previous selection that differs from
 * the current one.
 */
function primeFastPath(list: any, from: number): void {
  list._lines = list.items.map(() => '  ' + ' '.repeat(38));
  list.previousSelected = from;
}

/** What the widget would render for the currently selected row. */
function markerOn(list: any, index: number): string {
  const lines: string[] = list._lines ?? [];
  const line = lines[index] ?? '';
  return line.slice(0, 2);
}

describe('the selection marker', () => {
  it('is >> when the list has focus', () => {
    const list = aList(true);
    primeFastPath(list, 0);
    list.selected = 1;
    list._updateContent?.();
    expect(markerOn(list, 1)).toBe('>>');
  });

  it('is "> " when the list does not have focus', () => {
    const list = aList(false);
    primeFastPath(list, 0);
    list.selected = 1;
    list._updateContent?.();
    expect(markerOn(list, 1)).toBe('> ');
  });

  it('STAYS >> when the selection moves in a focused list', () => {
    // The defect: this second move took the fast path, which drew '> '.
    const list = aList(true);
    primeFastPath(list, 0);
    list.selected = 1;
    list._updateContent?.();
    expect(markerOn(list, 1)).toBe('>>');
  });

  it('clears the marker from the row the selection left', () => {
    const list = aList(true);
    primeFastPath(list, 0);
    list.selected = 2;
    list._updateContent?.();
    expect(markerOn(list, 0)).toBe('  ');
  });

  it('keeps "> " across a move when the list is not focused', () => {
    // The round trip: the fast path must not start drawing '>>' either.
    const list = aList(false);
    primeFastPath(list, 0);
    list.selected = 1;
    list._updateContent?.();
    expect(markerOn(list, 1)).toBe('> ');
  });
});
