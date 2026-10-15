/**
 * The 40-column file view's layout is DATA, and this is the contract that
 * makes that safe: NEVER A BROKEN LISTING.
 *
 * Three states, exhaustively (the design's "When the file is missing or
 * malformed"): the file is absent, a section is absent, a section is
 * malformed. All three end with a usable layout, and a refused section is
 * refused WHOLE - never rendered with a hole, because a hole in a listing is
 * the identity-field loss the whole file view exists to stop.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  BUILT_IN_FILEVIEW_LAYOUT,
  compileFileLayout,
  parseFileLayout,
  sectionFault,
  getFileViewLayout,
  resetFileViewLayoutCache,
  fileViewLayoutPath,
} from '../../src/services/file-layout.service';

const DEFAULT = compileFileLayout(undefined);

describe('the built-in default', () => {
  it('carries all four sections', () => {
    expect(DEFAULT.header.length).toBeGreaterThan(0);
    expect(DEFAULT.row.length).toBe(1);
    expect(DEFAULT.footer.length).toBeGreaterThan(0);
    expect(DEFAULT.record.length).toBeGreaterThan(0);
  });

  it('puts the list row on ONE line, which is what a list row is', () => {
    // Decision 2 of the design, and what the adapter's rung relies on: a
    // record is one row, twenty-plus to a screen, C*Base-native.
    expect(DEFAULT.row).toHaveLength(1);
  });

  it('is valid by its own rules', () => {
    for (const name of ['header', 'row', 'footer', 'record'] as const) {
      expect(sectionFault(name, DEFAULT[name])).toBeUndefined();
    }
  });

  it('is frozen, so a listing pass cannot be handed a mutated layout', () => {
    expect(Object.isFrozen(DEFAULT)).toBe(true);
    expect(Object.isFrozen(DEFAULT.row)).toBe(true);
  });
});

describe('a comment, and the escape for a line that starts with one', () => {
  it('drops a line whose first character is a semicolon', () => {
    const { sections } = parseFileLayout('[ROW]\n; not a template line\n~F_NAME|');
    expect(sections.row).toEqual(['~F_NAME|']);
  });

  it('keeps a template line that opens with ~t00| before its semicolon', () => {
    // The documented escape: a tab to column 0 emits nothing when the cursor
    // is already there, so it costs no bytes and needs no new syntax.
    const { sections } = parseFileLayout('[ROW]\n~t00|; a literal semicolon');
    expect(sections.row).toEqual(['~t00|; a literal semicolon']);
  });
});

describe('state 1 - the file is absent', () => {
  it('uses the built-in default and calls nothing wrong', () => {
    const layout = compileFileLayout(undefined);
    expect(layout.fellBack).toEqual([]);
    expect(layout.diagnostics).toEqual([]);
    expect(layout.row).toEqual(DEFAULT.row);
  });
});

describe('state 2 - a section is absent', () => {
  it('honours what the sysop wrote and defaults only the rest', () => {
    const layout = compileFileLayout('[ROW]\n~F_NAME| ~F_SIZE|\n');
    expect(layout.row).toEqual(['~F_NAME| ~F_SIZE|']);
    expect(layout.header).toEqual(DEFAULT.header);
    expect(layout.fellBack).toEqual(expect.arrayContaining(['header', 'footer', 'record']));
    expect(layout.fellBack).not.toContain('row');
  });
});

describe('state 3 - a section is malformed, and is refused WHOLE', () => {
  it('refuses an unknown field code', () => {
    const layout = compileFileLayout('[ROW]\n~F_NAME| ~F_COLOUR|\n');
    expect(layout.row).toEqual(DEFAULT.row);
    expect(layout.fellBack).toContain('row');
    expect(layout.diagnostics.join(' ')).toMatch(/unknown field ~F_COLOUR/);
  });

  it('refuses a column tab that is not two digits in 00..39', () => {
    expect(compileFileLayout('[ROW]\n~t5|X\n').fellBack).toContain('row');
    expect(compileFileLayout('[ROW]\n~t40|X\n').fellBack).toContain('row');
    expect(compileFileLayout('[ROW]\n~t39|X\n').fellBack).not.toContain('row');
  });

  it('refuses a section that overruns its line budget', () => {
    // [ROW] is exactly one line by definition - a second row would break the
    // one-record-one-row promise the pagination and the adapter both rely on.
    const layout = compileFileLayout('[ROW]\n~F_NAME|\n~F_SIZE|\n');
    expect(layout.row).toEqual(DEFAULT.row);
    expect(layout.diagnostics.join(' ')).toMatch(/budget/);
  });

  it('refuses the WHOLE FILE when a section header is not one of the four', () => {
    const layout = compileFileLayout('[BANNER]\nwhatever\n[ROW]\n~F_NAME|\n');
    expect(layout.row).toEqual(DEFAULT.row);
    expect(layout.header).toEqual(DEFAULT.header);
    expect(layout.diagnostics.join(' ')).toMatch(/unknown section \[BANNER\]/);
  });

  it('never renders a refused section with a hole in it', () => {
    // The whole point of refusing whole: half a row is worse than the default.
    const layout = compileFileLayout('[ROW]\n~F_NAME|~t99|~F_NOPE|\n');
    expect(layout.row).toEqual(DEFAULT.row);
    expect(layout.row.join('')).not.toContain('F_NOPE');
  });
});

describe('the sha1 is the identity two renderers compare', () => {
  it('differs when the source differs', () => {
    const a = compileFileLayout('[ROW]\n~F_NAME|\n');
    const b = compileFileLayout('[ROW]\n~F_SIZE|\n');
    expect(a.sha1).not.toBe(b.sha1);
  });

  it('is the default\'s own sha when the file is absent', () => {
    expect(compileFileLayout(undefined).sha1).toBe(compileFileLayout(BUILT_IN_FILEVIEW_LAYOUT).sha1);
  });
});

describe('the mtime guard', () => {
  let tmp = '';

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fileview-layout-'));
    resetFileViewLayoutCache();
  });

  afterEach(() => {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* noop */ }
    resetFileViewLayoutCache();
  });

  it('reads the sysop\'s file when there is one', () => {
    fs.mkdirSync(path.join(tmp, 'Prompts'));
    fs.writeFileSync(path.join(tmp, 'Prompts', 'FILEVIEW.40'), '[ROW]\n~F_NAME|\n', 'utf8');
    expect(getFileViewLayout(tmp).row).toEqual(['~F_NAME|']);
  });

  it('finds the file whatever case it is written in', () => {
    // AmigaDOS is case-insensitive and this volume is not; every other path
    // on this board resolves the same way.
    fs.mkdirSync(path.join(tmp, 'Prompts'));
    fs.writeFileSync(path.join(tmp, 'Prompts', 'fileview.40'), '[ROW]\n~F_SIZE|\n', 'utf8');
    expect(fileViewLayoutPath(tmp).toLowerCase()).toMatch(/fileview\.40$/);
    expect(getFileViewLayout(tmp).row).toEqual(['~F_SIZE|']);
  });

  it('picks up an edit without a restart', () => {
    const dir = path.join(tmp, 'Prompts');
    fs.mkdirSync(dir);
    const file = path.join(dir, 'FILEVIEW.40');
    fs.writeFileSync(file, '[ROW]\n~F_NAME|\n', 'utf8');
    expect(getFileViewLayout(tmp).row).toEqual(['~F_NAME|']);

    fs.writeFileSync(file, '[ROW]\n~F_SIZE|\n', 'utf8');
    fs.utimesSync(file, new Date(Date.now() + 2000), new Date(Date.now() + 2000));
    expect(getFileViewLayout(tmp).row).toEqual(['~F_SIZE|']);
  });

  it('falls back to the built-in default when there is no Prompts/ at all', () => {
    expect(getFileViewLayout(tmp).row).toEqual(DEFAULT.row);
  });
});
