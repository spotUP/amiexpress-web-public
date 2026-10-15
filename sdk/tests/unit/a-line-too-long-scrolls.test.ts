/**
 * A LINE TOO LONG FOR ITS ROW SCROLLS INSTEAD OF BEING CUT.
 *
 * "Showing the cards in front of you. V shows ." - the card lobby's status
 * bar, clipped mid-sentence by `StatusBar._fit` (sysop's screenshot,
 * 2026-09-16). "in places like this when its hard to fit the text it could
 * use a scrolltext", then "add scrolltext support at sdk level".
 *
 * The controller is pure - a frame is a function of a step - so everything
 * that matters is asserted here without a screen, a timer or a door:
 * whether it should animate at all, that the whole sentence eventually
 * arrives, and that blessed markup survives being cut in the middle.
 */

import { createScrollText, visibleLength } from '../../engines/ui/text/scroll-text';

const LINE = 'Showing the cards in front of you. V shows your hand.';

describe('a line that fits', () => {
  it('does not overflow, so nothing should animate', () => {
    const scroll = createScrollText({ text: 'short', width: 20 });
    expect(scroll.overflows).toBe(false);
    expect(scroll.steps).toBe(1);
    expect(scroll.frame(0)).toBe('short');
    expect(scroll.frame(99)).toBe('short');
  });

  it('is left alone when it is exactly the width it has', () => {
    const scroll = createScrollText({ text: '1234567890', width: 10 });
    expect(scroll.overflows).toBe(false);
  });
});

describe('a line too long for its row', () => {
  it('says so, and every frame is exactly the width it was given', () => {
    const scroll = createScrollText({ text: LINE, width: 20 });
    expect(scroll.overflows).toBe(true);
    for (let step = 0; step < scroll.steps; step += 1) {
      expect(visibleLength(scroll.frame(step))).toBe(20);
    }
  });

  it('starts at the beginning of the sentence', () => {
    const scroll = createScrollText({ text: LINE, width: 20 });
    expect(scroll.frame(0)).toBe(LINE.slice(0, 20));
  });

  it('shows every character of the sentence across one full cycle', () => {
    // The point of the whole thing: nothing is lost, it just arrives late.
    const scroll = createScrollText({ text: LINE, width: 20 });
    const seen = new Set<string>();
    for (let step = 0; step < scroll.steps; step += 1) {
      for (const ch of scroll.frame(step)) seen.add(ch);
    }
    for (const ch of LINE) expect(seen.has(ch)).toBe(true);
  });

  it('comes back to where it started, so the cycle is seamless', () => {
    const scroll = createScrollText({ text: LINE, width: 20 });
    expect(scroll.frame(scroll.steps)).toBe(scroll.frame(0));
    expect(scroll.frame(-1)).toBe(scroll.frame(scroll.steps - 1));
  });

  it('keeps the words apart when it wraps round', () => {
    // Without a gap the last word runs into the first and reads as one.
    const scroll = createScrollText({ text: 'ALPHA BETA', width: 6, gap: '   ' });
    const frames = Array.from({ length: scroll.steps }, (_, step) => scroll.frame(step));
    expect(frames.some((f) => f.includes('   '))).toBe(true);
  });
});

describe('a bounce', () => {
  it('walks to the end and back rather than wrapping', () => {
    const scroll = createScrollText({ text: 'ABCDEFGH', width: 4, mode: 'bounce' });
    expect(scroll.frame(0)).toBe('ABCD');
    // Out to the end...
    expect(scroll.frame(4)).toBe('EFGH');
    // ...and home again, without the text ever wrapping round.
    expect(scroll.frame(8)).toBe('ABCD');
  });

  it('never shows the start of the line joined to its end', () => {
    const scroll = createScrollText({ text: 'ABCDEFGH', width: 4, mode: 'bounce' });
    for (let step = 0; step < scroll.steps; step += 1) {
      expect('ABCDEFGH').toContain(scroll.frame(step));
    }
  });
});

describe('blessed markup', () => {
  it('costs no columns', () => {
    expect(visibleLength('{cyan-fg}abc{/}')).toBe(3);
    expect(visibleLength('{bold}{red-fg}x{/red-fg}{/bold}')).toBe(1);
  });

  it('is never cut in half by the window', () => {
    const text = '{cyan-fg}PICK A CARD{/} and press ENTER to play it';
    const scroll = createScrollText({ text, width: 12 });
    for (let step = 0; step < scroll.steps; step += 1) {
      const frame = scroll.frame(step);
      // Every brace that opens a tag closes again inside the same frame.
      const opens = (frame.match(/\{/g) || []).length;
      const closes = (frame.match(/\}/g) || []).length;
      expect(opens).toBe(closes);
      expect(frame).not.toMatch(/\{[^}]*$/);
    }
  });

  it('re-opens a colour the window starts inside of', () => {
    // The window lands in the middle of the coloured run: the frame has to
    // say so itself, or the text arrives in the wrong colour.
    const text = '{cyan-fg}ABCDEFGHIJ{/} tail';
    const scroll = createScrollText({ text, width: 4 });
    expect(scroll.frame(2)).toContain('{cyan-fg}');
    expect(visibleLength(scroll.frame(2))).toBe(4);
  });

  it('counts the visible width of a frame, not its markup', () => {
    const text = '{red-fg}a{/}{green-fg}b{/}{blue-fg}c{/}{yellow-fg}d{/}';
    const scroll = createScrollText({ text, width: 2 });
    expect(scroll.overflows).toBe(true);
    for (let step = 0; step < scroll.steps; step += 1) {
      expect(visibleLength(scroll.frame(step))).toBe(2);
    }
  });
});

describe('a width of nothing', () => {
  it('does not try to animate', () => {
    const scroll = createScrollText({ text: LINE, width: 0 });
    expect(scroll.overflows).toBe(false);
  });
});
