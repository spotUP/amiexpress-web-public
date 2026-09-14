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
