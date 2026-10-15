/**
 * The news bulletin has to be readable on forty columns and on eighty.
 *
 * "i needs to work in 40 and 80 columns" (sysop, 2026-09-14), after the SVT
 * news came out with a line running off the left of his screen.
 *
 * A C64 caller has forty. Text written for eighty is folded by the board when
 * it arrives, and a fold lands mid-word in the middle of a headline; text
 * written for FORTY reads correctly at both widths, which is why forty is the
 * one to write for.
 *
 * SVT Text is itself 40x24 - a teletext page - so the content already fitted.
 * What did not was this file's own furniture: `--- page 100: <title> ---` ran
 * to 56 characters, and the widest line in the bulletin was always one we
 * wrote ourselves.
 */
import { foldLine, foldBulletin, BULLETIN_COLUMNS } from '../../src/services/news-bulletins';

const widest = (text: string) => Math.max(...text.split('\n').map(l => l.length));

describe('folding a line onto a C64 screen', () => {
  it('leaves a line that already fits alone, byte for byte', () => {
    expect(foldLine('  Centerpartiet: Redo att regera med S')).toEqual([
      '  Centerpartiet: Redo att regera med S',
    ]);
  });

  it('breaks between words, never through one', () => {
    const rows = foldLine('--- page 100: Oppositionen i ledning med tre mandat ---');

    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) expect(row.length).toBeLessThanOrEqual(BULLETIN_COLUMNS);
    // Every word survives, in order, with nothing invented.
    expect(rows.join(' ').split(/ +/).filter(Boolean))
      .toEqual('--- page 100: Oppositionen i ledning med tre mandat ---'.split(/ +/).filter(Boolean));
  });

  it('keeps a teletext indent on the first row and does not repeat it', () => {
    // Teletext centres a headline with spaces. Repeating that indent on every
    // continuation row would centre nothing and spend the width twice.
    const rows = foldLine('        a centred headline that is far too long for a narrow screen');

    expect(rows[0].startsWith('        ')).toBe(true);
    expect(rows[1].startsWith(' ')).toBe(false);
  });

  it('cuts a word that cannot fit at all, rather than overflowing', () => {
    const rows = foldLine('https://example.com/' + 'x'.repeat(80));

    for (const row of rows) expect(row.length).toBeLessThanOrEqual(BULLETIN_COLUMNS);
  });

  it('keeps a blank line blank', () => {
    expect(foldLine('')).toEqual(['']);
  });
});

describe('the bulletin as a whole', () => {
  const bulletin = [
    'SVT Text news headlines',
    'Updated 2026-09-14T20:52:54.094Z',
    '',
    '--- page 100: Oppositionen i ledning med tre mandat ---',
    '100 SVT Text mandag 14 sep 2026',
    '  Oppositionen i ledning med tre mandat',
    '  V och C i SVT: Roda linjerna kvarstar',
    '  Centerpartiet: Redo att regera med S',
    '',
    'Source: SVT Text via texttv.nu (unofficial mirror)',
  ].join('\n');

  it('fits forty columns everywhere', () => {
    expect(widest(bulletin)).toBeGreaterThan(BULLETIN_COLUMNS);   // the premise

    expect(widest(foldBulletin(bulletin))).toBeLessThanOrEqual(BULLETIN_COLUMNS);
  });

  it('loses no words doing it', () => {
    const before = bulletin.split(/\s+/).filter(Boolean);
    const after = foldBulletin(bulletin).split(/\s+/).filter(Boolean);

    expect(after).toEqual(before);
  });

  it('keeps the blank lines that separate the sections', () => {
    const blanks = (s: string) => s.split('\n').filter(l => l.trim() === '').length;

    expect(blanks(foldBulletin(bulletin))).toBe(blanks(bulletin));
  });
});

/**
 * SVT Text in its own colours, on the board's own grid.
 *
 * "some text-tv coloring would be nice" and "the centering is a bit weird"
 * (sysop, 2026-09-14) - one cause, one fix. `content_plain` threw away both
 * the colour and the spacing; the API's `content` field is the page as
 * teletext draws it, 40 columns, a span per run and a class per colour.
 */
import { teletextToAnsi } from '../../src/services/news-bulletins';

const ESC = '\x1b';

describe('a teletext page as ANSI', () => {
  it('carries SVT\'s colours over', () => {
    const html = '<span class="line"><span class="bgBl W">100 </span>'
      + '<span class="bgBl Y">SVT Text</span></span>';

    const out = teletextToAnsi(html);

    expect(out).toContain(`${ESC}[40m${ESC}[1;37m100 `);
    expect(out).toContain(`${ESC}[1;33mSVT Text`);
  });

  it('closes its colours at the end of every row', () => {
    // A bulletin is included INTO another screen. A pen left on would paint
    // whatever the board draws next.
    const out = teletextToAnsi('<span class="line"><span class="Y">news</span></span>');

    expect(out!.endsWith(`${ESC}[0m`)).toBe(true);
  });

  it('keeps a mosaic\'s width and colour, having no way to keep its shape', () => {
    // A `bgImg` span is a 2x3 block served as a gif; the shape is in the
    // image. What survives on a terminal is the colour and the width.
    const out = teletextToAnsi(
      '<span class="line"><span class="bgB W bgImg" style="background: url(x.gif)"> </span></span>',
    );

    expect(out).toContain(`${ESC}[44m`);
    expect(out!.replace(/\x1b\[[0-9;]*m/g, '')).toBe(' ');
  });

  it('finds a double-height headline, which writes its class AFTER its style', () => {
    /*
     * SVT writes a double-height row as
     *   <span style="...scaleY(2)..." class="line DH">
     * so a split on the literal `<span class="line` missed every one and
     * folded it into the row above - three 80-column lines in a 40-column
     * page, which is what "the centering is a bit weird" looked like.
     */
    const html =
      '<span class="line"><span class="bgBl">one</span></span>'
      + '<span style="transform:scaleY(2);" class="line DH"><span class="bgBl Y">two</span></span>';

    const rows = teletextToAnsi(html)!.split('\n');

    expect(rows).toHaveLength(2);
    expect(rows[0].replace(/\x1b\[[0-9;]*m/g, '')).toBe('one');
    expect(rows[1].replace(/\x1b\[[0-9;]*m/g, '')).toBe('two');
  });

  it('gives back nothing for markup it does not recognise, so the caller can fall back', () => {
    expect(teletextToAnsi('<p>something else entirely</p>')).toBeNull();
  });

  it('is forty columns of VISIBLE text, whatever the codes cost', () => {
    const row = '<span class="line">'
      + '<span class="Y">' + 'x'.repeat(20) + '</span>'
      + '<span class="W">' + 'y'.repeat(20) + '</span></span>';

    const out = teletextToAnsi(row)!;

    expect(out.replace(/\x1b\[[0-9;]*m/g, '')).toHaveLength(40);
    // ...and the fold leaves it alone, because it measures what is SEEN.
    expect(foldLine(out)).toEqual([out]);
  });
});

/**
 * And it fits the screen's HEIGHT, not only its width.
 *
 * An SVT teletext page is 32 rows, which is what these bulletins came out at -
 * so the board paginated its own news, putting `(Pause)...More(y/n/ns)?`
 * through the headlines. A bulletin is one composed screen and should not need
 * a page break; a caller who wants the whole page has the Text-TV door.
 *
 * The same class as the Last Callers bulletin, found the same way: by
 * measuring the files on the board rather than trusting that they fitted.
 */
import { fitNewsBulletin, BULLETIN_ROWS } from '../../src/services/news-bulletins';
import { renderedRows, paginatesAt, SHORTEST_TERMINAL_ROWS } from '../../src/screens/screen-rows';

const newsPage = (headlines: number) =>
  [
    'SVT Text news headlines',
    'Updated 2026-09-15T00:00:00.000Z',
    '',
    ...Array.from({ length: headlines }, (_, i) => `${100 + i} A headline about something`),
    '',
    'Source: SVT Text via texttv.nu (unofficial mirror)',
  ].join('\n') + '\n';

describe('a news bulletin taller than the screen', () => {
  it('is trimmed to the budget', () => {
    const fitted = fitNewsBulletin(newsPage(40), BULLETIN_ROWS);

    expect(renderedRows(fitted)).toBeLessThanOrEqual(BULLETIN_ROWS);
  });

  it('does not paginate on the shortest screen it must fit', () => {
    // Asked the way screen.handler's needsPaging asks it, against 24 - the
    // board's own default height and the sysop's real terminal. A bulletin is
    // generated with nobody on the board, so it cannot ask.
    expect(paginatesAt(fitNewsBulletin(newsPage(40), BULLETIN_ROWS), SHORTEST_TERMINAL_ROWS))
      .toBe(false);
  });

  it('keeps the title, the freshness line and the attribution', () => {
    const fitted = fitNewsBulletin(newsPage(40), BULLETIN_ROWS);

    expect(fitted).toContain('SVT Text news headlines');
    expect(fitted).toContain('Updated 2026-09-15');
    expect(fitted).toContain('Source: SVT Text via texttv.nu');
  });

  it('drops the OLDEST headlines - the tail of the page, not the top', () => {
    const fitted = fitNewsBulletin(newsPage(40), BULLETIN_ROWS);

    expect(fitted).toContain('100 A headline');       // the first survives
    expect(fitted).not.toContain('139 A headline');   // the last does not
  });

  it('leaves a page that already fits completely alone', () => {
    const short = newsPage(5);

    expect(fitNewsBulletin(short, BULLETIN_ROWS)).toBe(short);
  });

  it('does not end on a blank line left behind by the cut', () => {
    const fitted = fitNewsBulletin(newsPage(40), BULLETIN_ROWS).split('\n');
    const sourceAt = fitted.findIndex((l) => l.startsWith('Source:'));

    // The blank before Source: is the frame's own, not a cut artefact.
    expect(fitted[sourceAt - 2]?.trim()).not.toBe('');
  });

  it('hands back a bulletin it cannot fit rather than gutting it', () => {
    // No room for a single headline: too tall and readable beats fitted and
    // empty, and it tells the sysop the budget is wrong for this page.
    const text = newsPage(40);

    expect(fitNewsBulletin(text, 3)).toBe(text);
  });
});
