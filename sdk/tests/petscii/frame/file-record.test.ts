/**
 * The 40-column file record, rendered through the SHIPPED template.
 *
 * The columns asserted here are the spec's table, and the point of the test is
 * that they are produced by `Prompts/FILEVIEW.40` and by nothing else - move a
 * `~t31|` in that file and the date moves, which is the whole promise of
 * layout-as-data. Nothing in the interpreter knows what column a date belongs
 * in.
 *
 * The field set is C*Base's (bbs.bas:5420-5427), with two documented changes:
 * `K` instead of 254-byte blocks, and a one-column status marker where C*Base
 * has a three-column file type.
 */
import {
  formatBlocks,
  formatNarrowSize,
  renderFileBlock,
  renderFileRow,
  renderTemplateLine,
  squeezeProse,
  type FileRecordFields,
} from '../../../petscii/frame/file-record';

/** The `[ROW]` line of the shipped default, verbatim. */
const ROW = ['~c7|~4F_NUM|~t05|~c2|~6F_SIZE|~t11|~c3|~1F_FLAG|~1F_NEW|~t13|~c6|~12F_NAME|~t31|~c4|~9F_DATE|'];

/** The `[RECORD]` block of the shipped default, verbatim. */
const BLOCK = [
  '~c6|~F_GROUP|',
  '~c7|~F_DESC|',
  '~c3|~F_NAME| ~F_VERSION|',
  '~c2|~F_SIZE| ~F_FLAG|~t31|~c4|~F_DATE|',
];

const FILE: FileRecordFields = {
  num: 12,
  name: 'OTL-DOOR.LHA',
  sizeBytes: 40960,
  flag: 'P',
  isNew: true,
  date: '03-28-18',
  version: '2.1',
  desc: 'A door from the Outlaws',
  group: 'Outlaws',
};

/** Strip the pens, which occupy no column, to read the glyphs a caller sees. */
const glass = (line: string) => line.replace(/~[^|]*\|/g, '');

describe('the LIST row, at the spec\'s columns', () => {
  const row = glass(renderFileRow(FILE, ROW));

  it('puts every field where the table says', () => {
    expect(row.indexOf('12')).toBe(0);        // ordinal, columns 0-3
    expect(row.indexOf('40K')).toBe(5);       // size, 5-10
    expect(row[11]).toBe('P');                // marker, 11
    expect(row[12]).toBe('*');                // new-file flag, 12
    expect(row.indexOf('OTL-DOOR.LHA')).toBe(13);  // filename, 13-24
    expect(row.indexOf('03-28-18')).toBe(31);      // date, 31-39
  });

  it('is ONE row and never wider than the screen', () => {
    expect(row).not.toMatch(/[\r\n]/);
    expect(row.length).toBeLessThanOrEqual(40);
  });

  it('holds the flag column open for a file the caller has seen', () => {
    // A space, not nothing: otherwise the filename shifts left by one for
    // every already-seen file and the column stops being a column.
    const seen = glass(renderFileRow({ ...FILE, isNew: false }, ROW));
    expect(seen[12]).toBe(' ');
    expect(seen.indexOf('OTL-DOOR.LHA')).toBe(13);
  });

  it('CLIPS a description in a list row rather than growing a second row', () => {
    const withDesc = renderFileRow(FILE, ['~4F_NUM| ~F_DESC|'], 40);
    expect(withDesc).not.toMatch(/[\r\n]/);
    expect(glass(withDesc).length).toBeLessThanOrEqual(40);
  });

  it('follows the TEMPLATE, not a hardcoded layout', () => {
    // The assertion that proves layout-as-data: a different template moves the
    // date, and nothing in the interpreter had an opinion about it.
    const moved = glass(renderFileRow(FILE, ['~4F_NUM|~t20|~9F_DATE|']));
    expect(moved.indexOf('03-28-18')).toBe(20);
  });
});

describe('the SINGLE-record block', () => {
  it('renders the sysop\'s field order, description first', () => {
    const rows = renderFileBlock(FILE, BLOCK).map(glass);
    expect(rows[0]).toBe('OUTLAWS');
    expect(rows[1]).toContain('A door from the Outlaws');
    expect(rows[2]).toBe('OTL-DOOR.LHA v2.1');
    expect(rows[3].indexOf('03-28-18')).toBe(31);
  });

  it('DROPS a row whose every field is empty', () => {
    // What makes "omit the group row when the group is unknown" fall out of
    // the data rather than out of a branch in the renderer.
    const rows = renderFileBlock({ ...FILE, group: null, desc: null }, BLOCK).map(glass);
    expect(rows.some((r) => r.includes('OUTLAWS'))).toBe(false);
    expect(rows[0]).toBe('OTL-DOOR.LHA v2.1');
  });

  it('wraps a long description, capped, indented to where it started', () => {
    const long = 'A very long description of this release which goes on well past one row of forty columns and then some more';
    const rows = renderFileBlock({ ...FILE, desc: long }, BLOCK).map(glass);
    const descRows = rows.filter((r) => r.includes('very long') || /^ +\w/.test(r));
    expect(descRows.length).toBeLessThanOrEqual(2);
    for (const r of rows) expect(r.length).toBeLessThanOrEqual(40);
  });

  it('does not print a version twice for one that already has its v', () => {
    const rows = renderFileBlock({ ...FILE, version: 'v3.0' }, BLOCK).map(glass);
    expect(rows.some((r) => r.includes('vv3.0'))).toBe(false);
    expect(rows.some((r) => r.includes('v3.0'))).toBe(true);
  });
});

describe('the two size units', () => {
  it('K is the shipped one, and it rounds up', () => {
    expect(formatNarrowSize(40960)).toBe('40K');
    expect(formatNarrowSize(1)).toBe('1K');
    expect(formatNarrowSize(null)).toBe('');
  });

  it('BLOCKS is the C*Base column, offered as data rather than as a rebuild', () => {
    // A sysop who wants 254-byte blocks edits one line of FILEVIEW.40.
    expect(formatBlocks(254)).toBe('1');
    expect(formatBlocks(40960)).toBe('162');
    const row = glass(renderFileRow(FILE, ['~5F_BLOCKS|']));
    expect(row.trim()).toBe('162');
  });
});

describe('the tab, inside a template line', () => {
  it('pads forward and never truncates an overrun field', () => {
    const line = renderTemplateLine('~12F_NAME|~t05|X', { name: 'OVERLONGNAME.LHA' }, { columns: 40 });
    expect(glass(line ?? '')).toBe('OVERLONGNAMEX');
  });

  it('counts MCI tokens as zero columns', () => {
    // A pen is a control byte, not a glyph; counting it would push every later
    // column out by one per colour change.
    const line = renderTemplateLine('~c7|AB~t05|X', {}, { columns: 40 });
    expect(glass(line ?? '')).toBe('AB   X');
  });
});

describe('squeezeProse', () => {
  it('collapses runs but keeps the indent', () => {
    expect(squeezeProse('  a  b   c ')).toBe('  a b c');
  });
});
