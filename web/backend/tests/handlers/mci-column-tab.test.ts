/**
 * `~t<nn>|` - the column tab, and the two rules that make it usable as a
 * LAYOUT primitive rather than a cursor toy.
 *
 * It exists because the C64 file view puts its layout in a sysop-editable file
 * (docs/superpowers/specs/2026-09-03-c64-file-view-design.md, "The layout is
 * data"), the way C*Base does: a listing row is a template of fields and tabs,
 * and re-columnising the whole listing is one edited line. C*Base's own is
 * `£t04` (ml1.o.asm:1464-1490); this is the same thing in the MCI this board
 * already has.
 *
 * FORWARD-ONLY, PADDING WITH SPACES. Never a cursor move: a move leaves the
 * skipped cells holding whatever the previous row wrote there, and the
 * internal listing path builds plain strings with no machine to resolve a MOVE
 * sentinel against. Spaces are the only form both paths can emit, and the
 * design requires them to emit the same one.
 */
import { columnTabPadding, printableColumn } from '../../src/utils/mci-column.util';

describe('the column a tab is measured from', () => {
  it('counts glyphs, not the ANSI escapes around them', () => {
    expect(printableColumn('\x1b[32mFILE.LHA\x1b[0m', false)).toBe(8);
  });

  it('counts glyphs, not the PETSCII pen BYTES around them', () => {
    // A C64 pen is a raw byte in the stream, not an escape sequence: $05 is
    // white, $1C red, $9B light grey. `printableLength()` strips ANSI only, so
    // it would count all three as glyphs and put every later column out.
    const row = '\x05FILE.LHA\x1c\x9b';
    expect(printableColumn(row, true)).toBe(8);
    expect(printableColumn(row, false)).toBe(11); // what the ANSI rule sees
  });

  it('counts $A0-$FF as glyphs, because on a C64 they are', () => {
    // $A3 is the horizontal rule the file-view header draws with.
    expect(printableColumn('\xa3\xa3\xa3', true)).toBe(3);
  });

  it('restarts at a row break, so a tab is never file-absolute', () => {
    expect(printableColumn('a long first row\r\nAB', false)).toBe(2);
    expect(printableColumn('a long first row\rAB', true)).toBe(2);
  });
});

describe('what the tab emits', () => {
  it('pads forward to the target column', () => {
    expect(columnTabPadding('12', 5, false)).toBe('   ');
  });

  it('emits nothing when the row is already past the column', () => {
    // C*Base's behaviour, and the reason its filenames are capped: an overrun
    // field butts up against the next one rather than being cut or wrapped.
    expect(columnTabPadding('OVERLONG-FIELD', 5, false)).toBe('');
  });

  it('emits nothing when the row is exactly at the column', () => {
    expect(columnTabPadding('12345', 5, false)).toBe('');
  });

  it('emits nothing for a target off the row, which would wrap it', () => {
    // Padding to column 40 on a 40-column screen costs a row.
    expect(columnTabPadding('', 40, true)).toBe('');
    expect(columnTabPadding('', 39, true)).toBe(' '.repeat(39));
  });

  it('measures a PETSCII row by its glyphs when it pads', () => {
    // Pen, four glyphs, pen. Column 4, so a tab to 9 is five spaces - not the
    // three it would be if the pens counted.
    expect(columnTabPadding('\x05FILE\x1c', 9, true)).toBe('     ');
  });
});

/**
 * And through the REAL pipeline, because a unit-tested helper that the
 * dispatch never calls is the failure mode this repo has a rule about.
 */
describe('~t through parseMciCodes, the way a screen reaches a caller', () => {
  const screenHandler = require('../../src/handlers/screen.handler');
  /** parseMciCodes answers a result object; the rendered text is `parsed`. */
  const render = async (template: string): Promise<string> =>
    (await screenHandler.parseMciCodes(template, session, 'BBS', 'Sysop', 'Loc')).parsed;

  const session: any = {
    user: { id: 1, username: 'Tabber', secLevel: 255 },
    currentConf: 1,
    tempData: {},
  };

  it('lays a row out at the columns the template names', async () => {
    const out = await render('#1~t05|4K~t13|FILE.LHA');
    expect(out).toBe('#1   4K      FILE.LHA');
    // The fields START where the template said, which is the whole point.
    expect(out.indexOf('4K')).toBe(5);
    expect(out.indexOf('FILE.LHA')).toBe(13);
  });

  it('leaves an overrun field butted against the next, never cut', async () => {
    const out = await render('OVERLONGNAME~t05|X');
    expect(out).toBe('OVERLONGNAMEX');
  });

  it('restarts the origin after a row break in the same template', async () => {
    const out = await render('LONG FIRST ROW~n1|#~t04|X');
    const rows = out.split(/\r?\n/);
    expect(rows[rows.length - 1]).toBe('#   X');
  });

  it('leaves a malformed tab to express.e fall-through, visibly', async () => {
    // Not two digits: the design says a mistyped code must print as itself so
    // the sysop sees it on the glass rather than getting a plausible-looking
    // layout.
    const out = await render('A~t5|B');
    expect(out).toContain('B');
    expect(out).not.toMatch(/A {2,}B/);
  });
});
