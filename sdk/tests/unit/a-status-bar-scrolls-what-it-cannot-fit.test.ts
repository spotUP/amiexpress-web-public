/**
 * A STATUS BAR THAT CANNOT FIT ITS LAST SECTION SCROLLS IT.
 *
 * "Showing the cards in front of you. V shows ." (sysop's screenshot,
 * 2026-09-16). The bar is one row and does not wrap, so `_fit` drops the tail
 * of the last section and marks the cut with a full stop - fine for two
 * missing characters, useless for half a sentence. "in places like this when
 * its hard to fit the text it could use a scrolltext", then "add scrolltext
 * support at sdk level".
 *
 * The windowing itself is pinned next door in `a-line-too-long-scrolls`.
 * What is pinned HERE is the widget's half of the bargain:
 *
 *   - the fields in front keep their room; only the commentary travels,
 *   - a bar that FITS is never animated, and a bar that does not opt in
 *     behaves exactly as it always did,
 *   - and the timer cannot outlive what it draws. A door whose status bar
 *     keeps repainting a hidden widget - or keeps the process alive after
 *     teardown - is the shape behind the DOORMAN freeze.
 */

import { StatusBar } from '../../engines/ui/blessed/widgets/status-bar';

const NOTICE = 'Showing the cards in front of you. V shows your hand.';

/**
 * A bar the size the card lobby gives it, with a fake screen.
 *
 * A detached widget has no screen and would refuse to animate (correctly), so
 * one is supplied - counting renders, which is also how the test sees a tick
 * happen at all.
 */
function aBar(options: Record<string, unknown> = {}): any {
  const bar: any = new StatusBar({
    width: 40,
    sections: [
      { id: 'who', content: 'sysop' },
      { id: 'notice', content: NOTICE },
    ],
    ...options,
  } as never);
  /*
   * The width is set AFTER construction on purpose: StatusBar's own
   * constructor forces `width: '100%'` over whatever it was given, and a
   * percentage resolves to a number only once the bar is on a real screen.
   * `Number('100%')` is NaN, so a fixture that skips this measures a bar zero
   * columns wide - which neither clips nor scrolls, and passes against the
   * bug.
   */
  bar.width = 40;
  bar.screen = {
    render: () => { bar.__renders = (bar.__renders || 0) + 1; },
    // `destroy` clears the region the widget occupied before it goes.
    clearRegion: () => {},
  };
  return bar;
}

afterEach(() => {
  jest.useRealTimers();
});

describe('a bar that does not ask for scrolling', () => {
  it('still clips, exactly as it always did', () => {
    const bar = aBar();
    bar._render();
    expect(bar.getContent()).toContain('.');
    expect(bar.getContent()).not.toContain('your hand');
    expect(bar._scrollTimer).toBeNull();
  });
});

describe('a bar that asks for scrolling', () => {
  it('shows the start of the notice first, and keeps the fields in front', () => {
    const bar = aBar({ scroll: true });
    bar._render();

    const content = bar.getContent();
    expect(content).toContain('sysop');
    expect(content).toContain('Showing');
    // Not the clip: the sentence is travelling, not truncated with a stop.
    expect(content.endsWith('. ')).toBe(false);
  });

  it('moves the window on each tick, and comes back round', () => {
    jest.useFakeTimers();
    const bar = aBar({ scroll: { intervalMs: 100 } });
    bar._render();

    const first = bar.getContent();
    jest.advanceTimersByTime(100);
    const second = bar.getContent();
    expect(second).not.toBe(first);

    // A full cycle returns to the beginning: the scroll is seamless.
    const steps = bar._scroller.steps;
    jest.advanceTimersByTime(100 * (steps - 1));
    expect(bar.getContent()).toBe(first);
  });

  it('never animates a bar whose text fits', () => {
    jest.useFakeTimers();
    const bar: any = new StatusBar({
      sections: [{ id: 'who', content: 'sysop' }],
      scroll: true,
    } as never);
    bar.width = 40;
    bar.screen = { render: () => {} };
    bar._render();

    expect(bar._scrollTimer).toBeNull();
    const content = bar.getContent();
    jest.advanceTimersByTime(5000);
    expect(bar.getContent()).toBe(content);
  });

  it('gives up its timer the moment the bar is hidden', () => {
    jest.useFakeTimers();
    const bar = aBar({ scroll: true });
    bar._render();
    expect(bar._scrollTimer).not.toBeNull();

    bar.hide();
    expect(bar._scrollTimer).toBeNull();

    // And nothing repaints a widget nobody can see.
    const renders = bar.__renders;
    jest.advanceTimersByTime(5000);
    expect(bar.__renders).toBe(renders);
  });

  it('gives it up when the bar is destroyed', () => {
    jest.useFakeTimers();
    const bar = aBar({ scroll: true });
    bar._render();
    expect(bar._scrollTimer).not.toBeNull();

    bar.destroy();
    expect(bar._scrollTimer).toBeNull();
  });

  it('starts the new notice from its beginning', () => {
    jest.useFakeTimers();
    const bar = aBar({ scroll: { intervalMs: 100 } });
    bar._render();
    jest.advanceTimersByTime(300);

    bar.setSection('notice', 'A different notice, also far too long for this row.');
    expect(bar._scrollStep).toBe(0);
    expect(bar.getContent()).toContain('A different');
  });
});

describe('an empty section', () => {
  it('takes neither a separator nor any room', () => {
    // "sysop | Chips: 658 | Table #8 |" - a door keeps a slot for a notice
    // and leaves it blank until there is one (sysop's screenshot,
    // 2026-09-16). The bar ended with a separator and nothing after it.
    const bar: any = new StatusBar({
      sections: [
        { id: 'who', content: 'sysop' },
        { id: 'where', content: 'Table #8' },
        { id: 'notice', content: '' },
      ],
    } as never);
    bar.width = 40;
    bar.screen = { render: () => {} };
    bar._render();

    expect(bar.getContent()).toBe(' sysop | Table #8 ');
    expect(bar.getContent().trimEnd().endsWith('|')).toBe(false);
  });

  it('does not make the bar scroll when the rest fits', () => {
    const bar: any = new StatusBar({
      sections: [
        { id: 'who', content: 'sysop' },
        { id: 'notice', content: '' },
      ],
      scroll: true,
    } as never);
    bar.width = 40;
    bar.screen = { render: () => {} };
    bar._render();

    expect(bar._scrollTimer).toBeNull();
  });
});
