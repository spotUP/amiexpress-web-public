import { adaptFrame, adaptRows, chooseRule, cropRow, gutterRow, reflowRow, splitRow, deindentRow, narrowRow, isCroppable, applyRule, AdaptRule } from '../../../petscii/frame/adapt';
import { textToFrame, makeFrame, frameText, Cell } from '../../../petscii/frame/types';
import { contentWidth, columnParts } from '../../../petscii/frame/classify';
import { wrapLineToWidth } from '../../../petscii/wrap';

const row = (s: string) => textToFrame([s], 80, 1).cells[0];
const str = (cells: ReadonlyArray<Cell>) => cells.map((c) => c.ch).join('').replace(/ +$/, '');
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);
const multiset = (cells: ReadonlyArray<Cell>) => cells.map((c) => c.ch).filter((ch) => ch !== ' ').sort();

const PROSE = 'the quick brown fox jumps over the lazy dog again and again';
/** Classifies as 'table' (indent < 4, one symbol, three gutters); collapses to exactly 40 characters. */
const TABLE = 'Sysop            Local Console              1234 calls   ratio 1:3';
const TABLE_COLLAPSED = 'Sysop Local Console 1234 calls ratio 1:3';
const WIDE_TABLE = '| Handle: Sysop                      || Location: Local Console              |';
const ART = '|__|_____|_____|__| cOLORWALL v1.3 (w) bY sHADOW mAN/aFL `94 |__|_____|_____|__|';
const RULE = '='.repeat(78);

describe('chooseRule', () => {
  it('fits -> crop; blank right half -> crop; repeated border -> crop; columns -> narrow; prose -> reflow', () => {
    expect(chooseRule(row('short'), 40)).toBe('crop');
    expect(chooseRule(row('x'.repeat(40)), 40)).toBe('crop');
    expect(chooseRule(row(RULE), 40)).toBe('crop');
    // Both were 'split' / 'gutter' before Phase 3 Task 2: a row with column
    // structure now narrows in place instead of being cut in half.
    expect(chooseRule(row(ART), 40)).toBe('narrow');
    expect(chooseRule(row(TABLE), 40)).toBe('narrow');
    expect(chooseRule(row(PROSE), 40)).toBe('reflow');
  });

  /** The ladder, in order: crop (incl. rules) -> deindent -> narrow -> reflow/split. */
  it('a horizontal rule crops, an over-wide row that fits once de-indented de-indents', () => {
    expect(chooseRule(row('.' + '-'.repeat(76) + '.'), 40)).toBe('crop');
    expect(chooseRule(row('`' + '-'.repeat(76) + "'"), 40)).toBe('crop');
    expect(chooseRule(row(' '.repeat(24) + '----->>>> uSEr StAtS <<<<-----'), 40)).toBe('deindent');
    expect(chooseRule(row(' '.repeat(30) + 'centred title'), 40)).toBe('deindent');
    // a rule that lives entirely right of column 40 must not crop to nothing
    expect(chooseRule(row(' '.repeat(45) + '.-----------------------------.'), 40)).toBe('deindent');
  });

  /**
   * The DECLINE path: fifteen three-character columns cannot fit in 40 cells
   * even at the two-cell floor (15 * 2 + 14 separators = 44), so `narrowRow`
   * returns null and the ladder falls back to what the row had before -
   * `gutter` when there are gutters to squeeze, `split` otherwise.
   */
  it('a row narrow cannot fit falls back to gutter (or split), never to a dropped column', () => {
    const MANY = 'abc  '.repeat(15).trimEnd();
    expect(narrowRow(row(MANY), 40)).toBeNull();
    expect(chooseRule(row(MANY), 40)).toBe('gutter');
    expect(applyRule('narrow', row(MANY), 40).applied).toBe('split');   // a PINNED narrow falls back too
    const bordered = '|' + 'ab|'.repeat(18);
    expect(narrowRow(row(bordered), 40)).toBeNull();
    expect(chooseRule(row(bordered), 40)).toBe('split');
  });

  /**
   * The widened crop is LOSSY for a decorative row: `----->>>>` at 40 columns
   * keeps its left half and drops the right, with no truncation mark - a rule
   * carries no content to lose, and spending a second row of a 25-row screen
   * on the tail of a decoration is the worse trade. Pinned here so the loss is
   * a decision on the record, not a surprise.
   */
  it('cropping a rule drops its right-hand decoration unmarked', () => {
    const decoration = '-'.repeat(40) + '<<<<' + '>>>>' + '-'.repeat(4);
    expect(isCroppable(row(decoration), 40)).toBe(false);          // mixed glyphs: the old test says no
    expect(chooseRule(row(decoration), 40)).toBe('crop');          // the rule test says yes
    const out = str(cropRow(row(decoration), 40).rows[0]);
    expect(out).toBe('-'.repeat(40));
    expect(out).not.toContain('<');                                // '<' and '>' are gone...
    expect(out).not.toContain('>');                                // ...with no truncation mark to say so
    expect(multiset(row(decoration)).length).toBeGreaterThan(multiset(cropRow(row(decoration), 40).rows[0]).length);
  });

  it('a row with no column structure that cannot be de-indented still reflows or splits', () => {
    expect(chooseRule(row('  ' + PROSE), 40)).toBe('reflow');
    expect(chooseRule(row('/\\'.repeat(30)), 40)).toBe('crop');            // a rule of its own
    expect(chooseRule(row('aB'.repeat(30)), 40)).toBe('reflow');
  });

  it('isCroppable: right half must be blank or one repeated non-alphanumeric glyph', () => {
    expect(isCroppable(row('a'.repeat(41)), 40)).toBe(false);
    expect(isCroppable(row('title ' + '-'.repeat(74)), 40)).toBe(true);
    expect(isCroppable(row('x'.repeat(39) + ' ' + '-'.repeat(39) + '='), 40)).toBe(false);
  });

  it('isCroppable: a REVERSE-VIDEO border in the right half is content, not a repeated glyph to throw away', () => {
    const plain = row('x'.repeat(40) + '-'.repeat(40));
    expect(isCroppable(plain, 40)).toBe(true);
    const reversed = row('x'.repeat(40) + '-'.repeat(40));
    for (let x = 40; x < 80; x++) (reversed[x] as Cell).rvs = true;
    expect(isCroppable(reversed, 40)).toBe(false);
    expect(chooseRule(reversed, 40)).not.toBe('crop');
  });
});

describe('cropRow', () => {
  it('keeps columns 0-39 and maps the cursor into them', () => {
    const r = cropRow(row(RULE), 40);
    expect(r.rows.length).toBe(1);
    expect(str(r.rows[0])).toBe('='.repeat(40));
    expect(r.map(5)).toEqual({ row: 0, x: 5 });
    expect(r.map(70)).toEqual({ row: 0, x: 39 });
    expect(r.applied).toBe('crop');
  });
});

describe('gutterRow', () => {
  it('collapses gutters to one space and keeps every non-space character', () => {
    const src = row(TABLE);
    const r = gutterRow(src, 40);
    expect(r.rows.length).toBe(1);
    expect(str(r.rows[0])).toBe(TABLE_COLLAPSED);
    expect(multiset(r.rows[0])).toEqual(multiset(src));
    expect(r.applied).toBe('gutter');
  });

  it('splits a row that is still wide after compression and reports split', () => {
    const src = row(WIDE_TABLE + ' extra words to keep it over forty columns wide');
    const r = gutterRow(src, 40);
    expect(r.rows.length).toBeGreaterThan(1);
    for (const out of r.rows) expect(contentWidth(out)).toBeLessThanOrEqual(40);
    expect(r.rows.flatMap(multiset).sort()).toEqual(multiset(src));
    expect(r.applied).toBe('split');
  });

  it('maps a cursor inside a collapsed gutter to the surviving space', () => {
    const r = gutterRow(row('ab      cd'), 40);
    expect(r.map(0)).toEqual({ row: 0, x: 0 });
    expect(r.map(4)).toEqual({ row: 0, x: 2 });
    expect(r.map(8)).toEqual({ row: 0, x: 3 });
  });
});

describe('reflowRow (same breaks as wrapLineToWidth in the full-canvas Task 10 tests)', () => {
  it('wraps at word boundaries, never past the width, keeping word order', () => {
    const r = reflowRow(row(PROSE), 20);
    expect(r.rows.map(str)).toEqual(['the quick brown fox', 'jumps over the lazy', 'dog again and again']);
    expect(words(r.rows.map(str).join(' '))).toEqual(words(PROSE));
    expect(r.applied).toBe('reflow');
  });

  /**
   * The brief's fixture asked for 3 rows from `'A'.repeat(90)` at width 40.
   * It cannot exist: a Frame row IS 80 cells (`padRow` in types.ts cuts
   * there), so the 90-character word reaches the rule as 80 A's and 80/40 is
   * two rows. The rule is right, the fixture was impossible - so the same
   * hard break is pinned at a width the 80-cell row can actually overflow
   * three times.
   */
  it('hard-breaks a word longer than the width', () => {
    const r = reflowRow(row('A'.repeat(90)), 40);
    expect(r.rows.length).toBe(2);
    expect(str(r.rows[0])).toBe('A'.repeat(40));
    expect(str(r.rows[1])).toBe('A'.repeat(40));

    const three = reflowRow(row('A'.repeat(90)), 30);
    expect(three.rows.length).toBe(3);
    expect(three.rows.map(str)).toEqual(['A'.repeat(30), 'A'.repeat(30), 'A'.repeat(20)]);
  });

  it('keeps the leading indent on the first row only and carries cell colours with their characters', () => {
    const src = row('    ' + PROSE);
    for (let x = 0; x < 80; x++) (src[x] as Cell).fg = x % 16;
    const r = reflowRow(src, 30);
    expect(str(r.rows[0]).startsWith('    the')).toBe(true);
    expect(str(r.rows[1]).startsWith(' ')).toBe(false);
    const first = r.rows[0][4];
    expect(first).toMatchObject({ ch: 't', fg: 4 });
  });

  it('maps the cursor to the wrapped position', () => {
    const r = reflowRow(row(PROSE), 20);
    expect(r.map(0)).toEqual({ row: 0, x: 0 });
    expect(r.map(20)).toEqual({ row: 1, x: 0 });
    expect(r.map(79)).toEqual({ row: 2, x: 19 });
  });

  it('a short row is a single row', () => {
    expect(reflowRow(row('short'), 40).rows.map(str)).toEqual(['short']);
  });
});

/**
 * A reverse-video space PAINTS (a coloured block), so `isBlank` calls it
 * content. The text wrapper would call it a gap and is free to delete a gap
 * at a break - which would silently eat a cell. `reflowRow` therefore hands
 * the wrapper a substituted character for it and re-attaches the original
 * cells afterwards. These pin that substitution.
 */
describe('reflowRow and reverse-video spaces', () => {
  it('never deletes a reverse space at a break - it is part of its word', () => {
    const src = row('A'.repeat(20) + ' BBBB');
    (src[20] as Cell).rvs = true;
    const r = reflowRow(src, 20);
    expect(r.rows.length).toBe(2);
    expect(str(r.rows[0])).toBe('A'.repeat(20));
    expect(r.rows[1][0]).toMatchObject({ ch: ' ', rvs: true });
    expect(r.rows[1].slice(1, 5).map((c) => c.ch).join('')).toBe('BBBB');
    const rvsCount = (cs: ReadonlyArray<Cell>) => cs.filter((c) => c.rvs).length;
    expect(r.rows.reduce((n, out) => n + rvsCount(out), 0)).toBe(rvsCount(src));
  });

  it('carries fg AND rvs per output column, following the characters through the wrap', () => {
    const src = row('alpha BB CC delta and more words here');
    for (let x = 0; x < 80; x++) (src[x] as Cell).fg = x % 16;
    for (let x = 6; x <= 11; x++) (src[x] as Cell).rvs = true;   // 'BB CC ' - the two spaces inside PAINT
    const r = reflowRow(src, 20);
    expect(r.rows[0].slice(0, 12).map((c) => c.ch).join('')).toBe('alpha BB CC ');
    for (let x = 0; x <= 11; x++) {
      expect(r.rows[0][x].fg).toBe(x % 16);
      expect(r.rows[0][x].rvs).toBe(x >= 6 && x <= 11);
    }
    const rvsCount = (cs: ReadonlyArray<Cell>) => cs.filter((c) => c.rvs).length;
    expect(r.rows.reduce((n, out) => n + rvsCount(out), 0)).toBe(6);
  });
});

describe('reflowRow and an indent wider than the screen', () => {
  it('does not spend a row on nothing (the one deliberate divergence from wrapLineToWidth)', () => {
    const line = ' '.repeat(25) + 'word more words after a very wide indent';
    const r = reflowRow(row(line), 20);
    expect(r.rows.map(str)[0]).toBe('word more words');
    expect(r.rows.map(str)).not.toContain('');
    // wrapLineToWidth itself breaks on the unfittable indent and emits an
    // empty first line; reflowRow drops exactly that one line and nothing else.
    expect(wrapLineToWidth(line.slice(0, 80), 20)[0]).toBe('');
    expect(r.rows.map(str)).toEqual(wrapLineToWidth(line.slice(0, 80), 20).slice(1).map((l) => l.replace(/ +$/, '')));
    for (const out of r.rows) expect(out.length).toBe(20);
    // the dropped indent columns still map somewhere real
    expect(r.map(0)).toEqual({ row: 0, x: 0 });
    expect(r.map(24)).toEqual({ row: 0, x: 0 });
    expect(r.map(25)).toEqual({ row: 0, x: 0 });
  });
});

/**
 * The plan's binding decision: the cell wrapper does not fork a second
 * word-wrap algorithm, it consumes wrapLineToWidth's break decisions. These
 * cases include the exact sentences web/backend/tests/utils/wrap-for-session.util.test.ts
 * pins (that file re-exports THIS wrapLineToWidth), so the door adapter and
 * the session-width wrap can never drift.
 */
describe('reflowRow == wrapLineToWidth (break-decision equality pin)', () => {
  const cases: Array<[string, number]> = [
    [PROSE, 20],
    [PROSE, 40],
    ['A'.repeat(90), 40],
    ['A'.repeat(90), 30],
    ['short line', 40],
    ['    ' + PROSE, 30],
    ['word '.repeat(12).trim(), 20],
    ['a bb ccc dddd eeeee ffffff ggggggg hhhhhhhh', 12],
    ['supercalifragilistic ' + PROSE, 15],
  ];
  it.each(cases)('%p at width %p breaks exactly where wrapLineToWidth breaks', (line, width) => {
    const produced = reflowRow(row(line), width).rows.map(str);
    // slice(0, 80): a Frame row is 80 cells, so that is the text the rule saw.
    const expected = wrapLineToWidth(line.slice(0, 80), width).map((l) => l.replace(/ +$/, ''));
    expect(produced).toEqual(expected);
  });
});

/**
 * `deindent` is the LOSSLESS rung of the ladder: it drops leading blanks and
 * nothing else, which is what saves a centred banner from being split in half.
 */
describe('deindentRow', () => {
  const BANNER = ' '.repeat(24) + '----->>>> uSEr StAtS <<<<-----';

  it('shifts the row left by its indent and keeps every non-blank cell', () => {
    const r = deindentRow(row(BANNER), 40);
    expect(r.rows.length).toBe(1);
    expect(str(r.rows[0])).toBe(BANNER.trim());
    expect(multiset(r.rows[0])).toEqual(multiset(row(BANNER)));
    expect(r.applied).toBe('deindent');
  });

  it('carries the cells themselves, colours and all, and maps the cursor left', () => {
    const src = row(BANNER);
    for (let x = 0; x < 80; x++) (src[x] as Cell).fg = x % 16;
    const r = deindentRow(src, 40);
    expect(r.rows[0][0]).toMatchObject({ ch: '-', fg: 24 % 16 });
    expect(r.map(24)).toEqual({ row: 0, x: 0 });
    expect(r.map(30)).toEqual({ row: 0, x: 6 });
    expect(r.map(0)).toEqual({ row: 0, x: 0 });          // inside the dropped indent
    expect(r.map(79)).toEqual({ row: 0, x: 39 });
  });

  it('a row with no indent is unchanged', () => {
    expect(str(deindentRow(row('no indent here'), 40).rows[0])).toBe('no indent here');
  });
});

/**
 * `narrow` is the LOSSY rung that keeps a table a table: one row out, every
 * column still there and in order, paid for in characters. A shortened column
 * ends in '>' - a plain PETSCII glyph, unlike an ellipsis.
 */
describe('narrowRow', () => {
  const MENU = ' [U] - UPLOAD FILE(S)         [D] - DOWNLOAD FILE(S)   [RZ] - ZMODEM UPLOAD';
  const partsOf = (line: string) => columnParts(row(line)).map((p) => p.map((c) => c.ch).join(''));

  it('emits exactly one row, no wider than the screen', () => {
    const r = narrowRow(row(MENU), 40)!;
    expect(r).not.toBeNull();
    expect(r.rows.length).toBe(1);
    expect(r.rows[0].length).toBe(40);
    expect(contentWidth(r.rows[0])).toBeLessThanOrEqual(40);
    expect(r.applied).toBe('narrow');
  });

  it('keeps the number and ORDER of the columns, each a prefix of its source column', () => {
    const out = str(narrowRow(row(MENU), 40)!.rows[0]);
    const parts = partsOf(MENU);
    expect(parts.length).toBe(3);
    const segments = out.split(' ').length;                    // sanity: the row is not empty
    expect(segments).toBeGreaterThan(1);
    let at = 0;
    for (const p of parts) {
      const kept = out.indexOf(p.slice(0, 2), at);
      expect(kept).toBeGreaterThanOrEqual(at);                 // in order
      at = kept + 1;
    }
    for (const seg of out.split(/(?<=>) /)) expect(seg.length).toBeGreaterThanOrEqual(2);
  });

  it("marks a shortened column with '>' and leaves an untouched column unmarked", () => {
    const r = narrowRow(row('ab  ' + 'X'.repeat(50) + '  cd'), 40)!;
    const out = str(r.rows[0]);
    expect(out.length).toBe(40);
    expect(out).toBe('ab ' + 'X'.repeat(33) + '> cd');         // narrow columns untouched and unmarked
  });

  /**
   * ONE gutter is not column structure - a sentence with double spacing has
   * one too - so a two-column gutter row is left to reflow/split. A BORDER is
   * structure even with a single column inside it, which is what carries
   * WHAT's title row (see the single-bordered-column case below).
   */
  it('needs two interior gutters, or a border', () => {
    expect(narrowRow(row('ab  ' + 'X'.repeat(50)), 40)).toBeNull();
    expect(narrowRow(row('| ' + 'X'.repeat(50) + ' |'), 40)).not.toBeNull();
  });

  it('shrinks the WIDEST column first, so a short column survives whole', () => {
    const r = narrowRow(row('short  ' + 'Y'.repeat(30) + '  ' + 'Z'.repeat(30)), 40)!;
    const out = str(r.rows[0]);
    expect(out.startsWith('short ')).toBe(true);
    const [a, b, c] = out.split(' ');
    expect(a).toBe('short');
    expect(Math.abs(b.length - c.length)).toBeLessThanOrEqual(1);
  });

  it('a single bordered column narrows too - the border is the structure', () => {
    const title = '| WHAT: Transfer Activities v2.0 [REL 2] Copyright (c)1994-95 Bobo/Mystic! |';
    expect(partsOf(title).length).toBe(1);
    const out = str(narrowRow(row(title), 40)!.rows[0]);
    expect(out.length).toBe(40);
    expect(out.endsWith('>')).toBe(true);
    expect(title).toContain(out.slice(0, -1));
  });

  it('DECLINES rather than dropping a column or cutting one below two cells', () => {
    expect(narrowRow(row('abc  '.repeat(15).trimEnd()), 40)).toBeNull();
    expect(narrowRow(row(PROSE), 40)).toBeNull();              // no column structure at all
    expect(narrowRow(row(''), 40)).toBeNull();
  });

  it('the cursor map is total and lands on the surviving cell of its own column', () => {
    const r = narrowRow(row(MENU), 40)!;
    for (let x = 0; x < 80; x++) {
      const m = r.map(x);
      expect(m.row).toBe(0);
      expect(m.x).toBeGreaterThanOrEqual(0);
      expect(m.x).toBeLessThan(40);
    }
    expect(r.map(1).x).toBe(0);                                // '[' of the first column
  });
});

describe('splitRow', () => {
  it('yields plain halves, keeps every cell, drops an all-blank second half', () => {
    const r = splitRow(row(ART), 40);
    expect(r.rows.length).toBe(2);
    expect(r.rows.map(str)).toEqual([ART.slice(0, 40).replace(/ +$/, ''), ART.slice(40).replace(/ +$/, '')]);
    expect(r.rows.flatMap(multiset).sort()).toEqual(multiset(row(ART)));
    expect(splitRow(row('x'.repeat(40)), 40).rows.length).toBe(1);
    expect(r.map(45)).toEqual({ row: 1, x: 5 });
    expect(r.applied).toBe('split');
  });

  it('carries no continuation glyph at column 39 - the halves are plain', () => {
    const r = splitRow(row(ART), 40);
    expect(r.rows[0][39].ch).toBe(ART[39]);
    expect(r.rows[1][0].ch).toBe(ART[40]);
  });
});

describe('rule invariants over a synthetic row corpus', () => {
  const corpus: string[] = [
    '',
    'short',
    'x'.repeat(40),
    RULE,
    'title ' + '-'.repeat(74),
    PROSE,
    '    ' + PROSE,
    TABLE,
    WIDE_TABLE,
    ART,
    'uSeR nAME: Sysop        cALLS tODaY: 12        dOWNLoADeD tODaY: 0 bYTeS',
    'a'.repeat(41),
    'word '.repeat(16).trim(),
    '  indented prose that runs on well past the fortieth column of the screen',
    'abc  '.repeat(15).trimEnd(),          // fifteen narrow columns: narrowRow declines, the ladder falls back
  ];
  const rules: AdaptRule[] = ['crop', 'deindent', 'gutter', 'narrow', 'reflow', 'split'];

  it.each(corpus)('every rule emits rows of exactly 40 cells for %p', (line) => {
    for (const rule of rules) {
      const r = applyRule(rule, row(line), 40);
      expect(r.rows.length).toBeGreaterThan(0);
      for (const out of r.rows) {
        expect(out.length).toBe(40);
        expect(contentWidth(out)).toBeLessThanOrEqual(40);
      }
    }
  });

  it.each(corpus)('the cursor map is total over columns 0..79 and lands inside the produced rows for %p', (line) => {
    for (const rule of rules) {
      const r = applyRule(rule, row(line), 40);
      for (let x = 0; x < 80; x++) {
        const m = r.map(x);
        expect(m.row).toBeGreaterThanOrEqual(0);
        expect(m.row).toBeLessThan(r.rows.length);
        expect(m.x).toBeGreaterThanOrEqual(0);
        expect(m.x).toBeLessThan(40);
      }
    }
  });

  it.each(corpus)('gutter and split preserve the non-space multiset of %p; reflow preserves character order', (line) => {
    const src = row(line);
    expect(gutterRow(src, 40).rows.flatMap(multiset).sort()).toEqual(multiset(src));
    expect(splitRow(src, 40).rows.flatMap(multiset).sort()).toEqual(multiset(src));
    // Reflow deletes the whitespace it breaks on and hard-breaks an over-long
    // word, so the pinned invariant is the non-space character SEQUENCE:
    // nothing dropped, nothing reordered.
    const bare = (t: string) => t.replace(/ /g, '');
    expect(bare(reflowRow(src, 40).rows.map(str).join(''))).toEqual(bare(line.slice(0, 80)));
    // Word order too, wherever no word is wider than the row.
    if (!words(line).some((w) => w.length > 40)) {
      expect(words(reflowRow(src, 40).rows.map(str).join(' '))).toEqual(words(line.slice(0, 80)));
    }
  });

  it.each(corpus.filter((l) => isCroppable(row(l), 40)))('crop keeps every distinct glyph of the croppable row %p', (line) => {
    const src = row(line);
    const out = cropRow(src, 40).rows[0];
    expect(new Set(multiset(out))).toEqual(new Set(multiset(src)));
    if (contentWidth(src) <= 40) expect(multiset(out)).toEqual(multiset(src));
  });
});

describe('adaptRows / adaptFrame', () => {
  const src = textToFrame([RULE, PROSE, TABLE, ART, '', 'Press RETURN:'], 80, 25);

  it('every adapted row fits, rules are recorded per source row, blanks stay blank', () => {
    const { rows } = adaptRows(src);
    for (const r of rows) { expect(r.cells.length).toBe(40); expect(contentWidth(r.cells)).toBeLessThanOrEqual(40); }
    expect(rows.filter((r) => r.source === 0).map((r) => r.rule)).toEqual(['crop']);
    expect(rows.filter((r) => r.source === 1).map((r) => r.rule)).toEqual(['reflow', 'reflow']);
    // ART is a '|'-bordered row: it narrows to ONE row now (was ['split', 'split']).
    expect(rows.filter((r) => r.source === 3).map((r) => r.rule)).toEqual(['narrow']);
    expect(rows.filter((r) => r.source === 4).length).toBe(1);
  });

  it('region pins override the automatic rule', () => {
    const { rows } = adaptRows(src, { regions: [{ rows: [1, 1], rule: 'crop' }, { rows: [3, 3], rule: 'gutter' }] });
    expect(rows.filter((r) => r.source === 1).map((r) => r.rule)).toEqual(['crop']);
    expect(str(rows.find((r) => r.source === 1)!.cells)).toBe(PROSE.slice(0, 40).replace(/ +$/, ''));
    expect(rows.filter((r) => r.source === 3).every((r) => r.rule === 'split' || r.rule === 'gutter')).toBe(true);
  });

  it('a pinned rule applies unconditionally, including to a row that already fits', () => {
    const fitting = textToFrame(['Name    Sysop    Node  1'], 80, 1);
    expect(str(adaptRows(fitting).rows[0].cells)).toBe('Name    Sysop    Node  1');
    const pinned = adaptRows(fitting, { regions: [{ rows: [0, 0], rule: 'gutter' }] });
    expect(pinned.rows[0].rule).toBe('gutter');
    expect(str(pinned.rows[0].cells)).toBe('Name Sysop Node 1');
  });

  it("an 'auto' pin is the same as no pin at all", () => {
    const pinned = adaptRows(src, { regions: [{ rows: [0, 24], rule: 'auto' }] });
    expect(pinned.rows.map((r) => [r.source, r.rule, str(r.cells)])).toEqual(adaptRows(src).rows.map((r) => [r.source, r.rule, str(r.cells)]));
  });

  it('the cursor follows its source row into adapted coordinates', () => {
    const f = makeFrame(80, 25, src.cells, { x: 13, y: 5 });
    const { rows, cursor } = adaptRows(f);
    const promptRow = rows.findIndex((r) => r.source === 5);
    expect(cursor).toEqual({ x: 13, y: promptRow });
  });

  it('adaptFrame pages the LAST 25 rows when splits and reflow overflow, and the cursor stays on its row', () => {
    const lines = Array.from({ length: 24 }, (_, i) => `${i} ` + PROSE);
    lines.push('prompt>');
    const f = makeFrame(80, 25, textToFrame(lines, 80, 25).cells, { x: 7, y: 24 });
    const out = adaptFrame(f);
    expect([out.cols, out.rows]).toEqual([40, 25]);
    expect(frameText(out)[24]).toBe('prompt>');
    expect(out.cursor).toEqual({ x: 7, y: 24 });
    expect(frameText(out)[0]).not.toBe('0 the quick brown fox jumps over the');
  });

  it('adaptFrame shows exactly the tail adaptRows produced, in order', () => {
    const lines = Array.from({ length: 24 }, (_, i) => `${i} ` + PROSE);
    lines.push('prompt>');
    const f = makeFrame(80, 25, textToFrame(lines, 80, 25).cells, { x: 7, y: 24 });
    const all = adaptRows(f).rows;
    expect(all.length).toBeGreaterThan(25);
    expect(frameText(adaptFrame(f))).toEqual(all.slice(all.length - 25).map((r) => str(r.cells)));
  });

  it('a cursor whose source row scrolled off the top clamps to row 0', () => {
    const lines = Array.from({ length: 25 }, (_, i) => `${i} ` + PROSE);
    const f = makeFrame(80, 25, textToFrame(lines, 80, 25).cells, { x: 3, y: 0 });
    expect(adaptRows(f).cursor).toEqual({ x: 3, y: 0 });
    expect(adaptFrame(f).cursor).toEqual({ x: 3, y: 0 });
  });

  it('adaptFrame of a frame that already fits is the identity on text and cursor', () => {
    const f = makeFrame(80, 25, textToFrame(['fits', 'also fits'], 80, 25).cells, { x: 2, y: 1 });
    const out = adaptFrame(f);
    expect(frameText(out).slice(0, 2)).toEqual(['fits', 'also fits']);
    expect(out.cursor).toEqual({ x: 2, y: 1 });
  });

  it('honours a non-default cols/rows viewport', () => {
    const f = textToFrame([RULE, PROSE, TABLE], 80, 25);
    const out = adaptFrame(f, { cols: 22, rows: 10 });
    expect([out.cols, out.rows]).toEqual([22, 10]);
    for (const r of out.cells) expect(r.length).toBe(22);
  });

  it('never produces content at the bottom-right cell that the renderer would have to skip silently', () => {
    const f = textToFrame([...Array(24).fill(''), 'x'.repeat(40)], 80, 25);
    const out = adaptFrame(f);
    expect(out.cells[24][39].ch).toBe('x');   // the ADAPTER keeps it; renderDiff is what refuses to paint it - documented, not hidden
  });
});
