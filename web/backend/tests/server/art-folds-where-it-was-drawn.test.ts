/**
 * ART WITH NO LINE BREAKS FOLDS AT 80, NOT AT THE BROWSER'S WIDTH.
 *
 * "damnit... got a cut off logoff logo now again" / "logoff is still cut off"
 * (sysop, 2026-09-14). His logoff logo is drawn 80 columns wide and carries no
 * line terminators at all - it trusts the terminal to fold it, which a real
 * caller's 80-column terminal always did. His browser terminal is about 125
 * columns, so it folded in the wrong places.
 *
 * The file was never damaged, which is why looking for a corrupt writer found
 * nothing: every byte arrived and a terminal folded them wrong.
 */
import {
  foldAtColumns,
  needsAuthoredWrap,
  applyAuthoredWrap,
} from '../../src/screens/authored-wrap';

/** A row of art exactly `n` columns wide. */
const row = (ch: string, n: number) => ch.repeat(n);

describe('art folds where it was drawn', () => {
  test('folds a single unbroken line every 80 columns', () => {
    const art = row('A', 80) + row('B', 80) + row('C', 40);
    expect(foldAtColumns(art, 80)).toEqual([row('A', 80), row('B', 80), row('C', 40)]);
  });

  test('a colour code costs no columns, so the fold does not move', () => {
    const art = '\x1b[35m' + row('A', 80) + '\x1b[0m' + row('B', 10);
    const folded = foldAtColumns(art, 80);
    expect(folded).toHaveLength(2);
    // The first row still holds 80 glyphs - the escapes are free.
    expect(folded[0].replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')).toHaveLength(80);
  });

  test('a cursor-forward DOES cost columns, because the terminal moves', () => {
    // ESC[5C is how much of this board's art does its spacing. Counting it as
    // zero width folds the line five columns late.
    const art = row('A', 75) + '\x1b[5C' + row('B', 10);
    const folded = foldAtColumns(art, 80);
    expect(folded).toHaveLength(2);
    // 75 glyphs plus a five-column gap IS a full 80-column row: the gap stays
    // a cursor move rather than becoming spaces, so the row carries 75 glyphs.
    expect(folded[0].replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')).toHaveLength(75);
    expect(folded[0].endsWith('\x1b[5C')).toBe(true);
    // Counting the gap as zero width would have kept five B's on row one.
    expect(folded[1].replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')).toHaveLength(10);
  });

  test('a screen that carries its own line breaks comes back byte for byte', () => {
    // The 200-column BBSTITLE is 68 lines of about 200 columns each. Folding
    // those at 80 would destroy it, so the trigger is "one art line", never
    // "a line is wider than 80".
    const wide = Array.from({ length: 5 }, () => row('X', 200)).join('\r\n');
    expect(needsAuthoredWrap(wide)).toBe(false);
    expect(applyAuthoredWrap(wide)).toBe(wide);
  });

  test('ordinary art inside the margin is untouched', () => {
    const normal = ['  /\\__', ' /    \\', '/______\\'].join('\n');
    expect(needsAuthoredWrap(normal)).toBe(false);
    expect(applyAuthoredWrap(normal)).toBe(normal);
  });

  test('the screen head is not the drawing, and is not folded', () => {
    // `~f` clears; the art is the one long line under it.
    const screen = '~f\n' + row('A', 200);
    expect(needsAuthoredWrap(screen)).toBe(true);
    const out = applyAuthoredWrap(screen);
    expect(out.split('\n')[0]).toBe('~f');
    expect(out.split('\n').filter(l => l.startsWith('A'))).toHaveLength(3);
  });
});
