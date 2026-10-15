/**
 * A door's row that fills the line EXACTLY and is followed by a zero-width escape sequence must not be broken.
 *
 * Found by the BULLETINS screen proof (plan M17): the bottom row of the menu door ends in its key bar, which
 * is right-aligned to column 80 and followed by ESC[?25l (hide the cursor). The board's wrapLine took the
 * exact fit as "line full" and cut BEFORE the sequence, and its CSI pattern did not know the `?` of a
 * private-mode sequence, so the cut landed between the ESC and the `[`: the wire carried `ESC CR LF [?25l`.
 * A caller saw the stray text `[?25l` and the whole screen scrolled up one row. Two faults, one symptom:
 * the wrap must be lazy (only a following VISIBLE character needs a new row) and a CSI sequence must be
 * recognised by its whole grammar (parameter bytes 0x30-0x3F, intermediates 0x20-0x2F, final 0x40-0x7E).
 */
import { wrapLine } from '../../src/amiga-emulation/xim/line-wrap.util';

const ESC = '\x1b';

describe('wrapLine on a row that fills the line exactly', () => {
  it('keeps a private-mode sequence (ESC[?25l) that follows a full row on that row', () => {
    const row = 'x'.repeat(80) + `${ESC}[?25l`;
    expect(wrapLine(row, 80)).toEqual([row]);
  });

  it('keeps any zero-width sequence that follows a full row on that row', () => {
    const row = 'x'.repeat(80) + `${ESC}[0m${ESC}7${ESC}[2;1H`;
    expect(wrapLine(row, 80)).toEqual([row]);
  });

  it('never breaks inside a private-mode sequence in the middle of a row', () => {
    const row = `abc${ESC}[?25l${ESC}[?1003h${ESC}[?1006hdef`;
    expect(wrapLine(row, 80)).toEqual([row]);
    // and the visible text still wraps around it
    expect(wrapLine('a'.repeat(79) + `${ESC}[?25lbc`, 80)).toEqual(['a'.repeat(79) + `${ESC}[?25lb`, 'c']);
  });

  it('still wraps a row that really is longer than the line', () => {
    expect(wrapLine('x'.repeat(81), 80)).toEqual(['x'.repeat(80), 'x']);
    expect(wrapLine('x'.repeat(160), 80)).toEqual(['x'.repeat(80), 'x'.repeat(80)]);
  });

  it('a full row alone is one segment', () => {
    expect(wrapLine('x'.repeat(80), 80)).toEqual(['x'.repeat(80)]);
  });
});
