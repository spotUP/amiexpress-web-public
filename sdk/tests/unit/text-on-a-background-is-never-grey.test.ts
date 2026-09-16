/**
 * TEXT ON A COLOURED BACKGROUND IS WHITE OR BLACK, NEVER GREY.
 *
 * "we need an sdk level ui fix, texts drawn on bg colors needs to be white or
 * black to look good never grey like here" - the card lobby's menu bar, grey
 * "Views  System" on a pink bar - and "this goes for menus and list
 * highlights and such" (sysop, 2026-09-16).
 *
 * Grey against a themed background is an accident: the grey is fixed, the
 * background is whatever the theme chose, and on a mid-tone they sit almost
 * on top of each other. White and black are the two colours that cannot be
 * muddy against anything, because one of them is always furthest away.
 *
 * The rule is pure, so it is asked directly here rather than through a
 * screen.
 */

import { luminance, isGrey, readableOn, snapToReadable } from '../../engines/ui/blessed/core/contrast';

describe('reading a colour', () => {
  it('knows black from white', () => {
    expect(luminance('black')).toBeLessThan(0.1);
    expect(luminance('white')).toBeGreaterThan(0.6);
  });

  it('weights green over blue, the way an eye does', () => {
    // A plain average calls these equal and then picks the wrong text colour
    // for both.
    expect(luminance('green')).toBeGreaterThan(luminance('blue'));
  });
});

describe('the greys', () => {
  it('names them', () => {
    expect(isGrey('gray')).toBe(true);
    expect(isGrey('grey')).toBe(true);
    expect(isGrey(8)).toBe(true);
  });

  it('does not count black or white as a problem - they are the answer', () => {
    expect(isGrey('black')).toBe(false);
    expect(isGrey('white')).toBe(false);
  });

  it('leaves a real hue alone', () => {
    for (const colour of ['red', 'green', 'blue', 'yellow', 'cyan', 'magenta']) {
      expect(isGrey(colour)).toBe(false);
    }
  });
});

describe('what to draw on a background', () => {
  it('puts black on a light one and white on a dark one', () => {
    expect(readableOn('white')).toBe('black');
    expect(readableOn('yellow')).toBe('black');
    expect(readableOn('black')).toBe('white');
    expect(readableOn('blue')).toBe('white');
  });

  it('assumes dark when the terminal chooses the background', () => {
    // Every board here runs on a dark terminal, and white is right there.
    expect(readableOn(undefined)).toBe('white');
    expect(readableOn('')).toBe('white');
  });

  it('never answers grey', () => {
    for (const bg of ['red', 'green', 'blue', 'yellow', 'cyan', 'magenta', 'white', 'black', 'gray']) {
      expect(['white', 'black']).toContain(readableOn(bg));
    }
  });
});

describe('snapping a colour that was given to us', () => {
  it('replaces grey on a coloured bar', () => {
    // The sysop's menu bar, exactly: grey text on pink.
    expect(snapToReadable('gray', 'magenta')).toBe('white');
    expect(snapToReadable('grey', 'white')).toBe('black');
  });

  it('keeps a colour that means something', () => {
    // A door asking for a red warning on a dark bar means it.
    expect(snapToReadable('red', 'black')).toBe('red');
    expect(snapToReadable('yellow', 'blue')).toBe('yellow');
  });

  it('replaces a colour too close to the background to read', () => {
    // Not grey, but invisible - which is the same problem.
    expect(snapToReadable('white', 'white')).toBe('black');
    expect(snapToReadable('black', 'black')).toBe('white');
  });

  it('answers with something when given nothing', () => {
    expect(snapToReadable(undefined, 'magenta')).toBe('white');
    expect(snapToReadable(null, 'yellow')).toBe('black');
  });
});

/**
 * The widget half: a list highlight is a coloured background by definition,
 * so the row drawn on it obeys the same rule.
 *
 * A List renders its tags to ANSI before `getContent()` can be read, so the
 * assertions are on SGR codes rather than on `{white-bg}`: 30 is a black
 * foreground, 37/97 white, 33 yellow, 90 the bright black that a terminal
 * draws `gray` as, and 4x the backgrounds.
 */
describe('a list highlight', () => {
  const ESC = String.fromCharCode(27);
  const sgr = (code: number) => `${ESC}[${code}m`;

  const rowFor = (selected: Record<string, string>): string => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { List } = require('../../engines/ui/blessed/widgets/list');
    const list: any = new List({
      items: ['Skitgubbe'],
      width: 40,
      height: 10,
      interactive: true,
      wrapItems: false,
      style: { selected },
    } as never);
    list.selected = 0;
    list._updateContent();
    return String(list.getContent());
  };

  it('gives the row a readable colour when the style sets only a background', () => {
    // It used to leave the row's own colours on top of the highlight, which
    // is the unreadable row by another route.
    const row = rowFor({ bg: 'white' });
    expect(row).toContain(sgr(47));          // white background
    expect(row).toContain(sgr(30));          // and black text on it
  });

  it('replaces a grey foreground on the highlight', () => {
    const row = rowFor({ bg: 'blue', fg: 'gray' });
    expect(row).not.toContain(sgr(90));      // not the grey it was given
    expect(row).toContain(sgr(44));          // blue background
  });

  it('keeps a foreground that means something', () => {
    const row = rowFor({ bg: 'black', fg: 'yellow' });
    expect(row).toContain(sgr(33));          // the door meant yellow
  });
});
