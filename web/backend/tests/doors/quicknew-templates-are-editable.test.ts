/**
 * QuickNew's templates are what the caller sees, so the sysop edits them.
 *
 * "add the config templates to the web admin ui and make them editable in the
 * ansi editor" - the sysop, 2026-09-15. The door prints these lines verbatim
 * with its `@` placeholders substituted, so the config IS the screen.
 *
 * The file is not the `[Section_END]` shape the rest of the art plumbing
 * reads, and the number of areas is whatever the sysop configured - so the
 * sections are discovered from the file rather than listed in a manifest.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  parseQuickNewBlocks,
  quickNewSectionName,
  parseQuickNewSectionName,
  quickNewSectionLabel,
  replaceQuickNewTemplate,
} from '../../src/doors/quicknew-config';

const REPO = path.join(__dirname, '..', '..', '..', '..');
const REAL = path.join(REPO, 'Doors', 'QuickNew', 'QuickNew.Config1');

/** The shape of the file, built the way the door reads it. */
function aConfig(areas: Array<[string, string, string]>): string {
  const preamble = ['\x1b[0m', '\x1b[35m', '2', '\f'];
  const blocks = areas.flatMap(([header, stats, dir]) => [header, stats, '#', dir]);
  return [...preamble, ...blocks].join('\n') + '\n';
}

describe('reading QuickNew templates', () => {
  it('finds a block per configured area', () => {
    const text = aConfig([
      ['Last @D Days >> Warez <<', 'Yesterday: @Y', 'BBS:Conf2/Dir1'],
      ['Last @D Days >> C64 <<', 'Yesterday: @Y', 'BBS:Conf3/Dir1'],
    ]);

    const blocks = parseQuickNewBlocks(text);

    expect(blocks).toHaveLength(2);
    expect(blocks[0].dirPath).toBe('BBS:Conf2/Dir1');
    expect(blocks[1].header).toBe('Last @D Days >> C64 <<');
  });

  it('reads the real config on this board', () => {
    const blocks = parseQuickNewBlocks(fs.readFileSync(REAL, 'latin1'));

    expect(blocks.length).toBeGreaterThan(5);
    // Every block names a directory and carries both templates.
    for (const b of blocks) {
      expect(b.dirPath).toMatch(/^BBS:/i);
      expect(b.header).toContain('@D');
      expect(b.stats).toContain('@Y');
    }
  });

  it('keeps ESC bytes intact, because these lines are ANSI', () => {
    const blocks = parseQuickNewBlocks(fs.readFileSync(REAL, 'latin1'));

    expect(blocks[0].header).toContain('\x1b[');
  });

  it('ignores a half-written block rather than refusing the whole file', () => {
    // Hand-edited on real boards. Nine good areas must stay editable.
    const text = aConfig([['H', 'S', 'BBS:Conf2/Dir1']]) + 'a stray line\n';

    expect(parseQuickNewBlocks(text)).toHaveLength(1);
  });

  it('names and labels a section by the area it belongs to', () => {
    const blocks = parseQuickNewBlocks(aConfig([['H', 'S', 'BBS:Conf2/Dir1']]));

    expect(quickNewSectionName(0, 'header')).toBe('block0.header');
    expect(parseQuickNewSectionName('block0.stats')).toEqual({ index: 0, which: 'stats' });
    expect(parseQuickNewSectionName('title')).toBeNull();
    expect(quickNewSectionLabel(blocks[0], 'header')).toContain('BBS:Conf2/Dir1');
  });
});

describe('writing a QuickNew template back', () => {
  const text = aConfig([
    ['Last @D Days >> Warez <<', 'Yesterday: @Y', 'BBS:Conf2/Dir1'],
    ['Last @D Days >> C64 <<', 'Yesterday: @Z', 'BBS:Conf3/Dir1'],
  ]);

  it('replaces the line the sysop edited', () => {
    const out = replaceQuickNewTemplate(text, 1, 'header', 'Last @D Days >> Commodore <<');

    expect(parseQuickNewBlocks(out)[1].header).toBe('Last @D Days >> Commodore <<');
  });

  it('leaves every other line exactly as it was', () => {
    const out = replaceQuickNewTemplate(text, 1, 'header', 'changed');
    const before = parseQuickNewBlocks(text);
    const after = parseQuickNewBlocks(out);

    expect(after[0]).toEqual(before[0]);
    expect(after[1].stats).toBe(before[1].stats);
    expect(after[1].dirPath).toBe(before[1].dirPath);
    // The preamble carries a form feed and two colour prefixes nothing here
    // understands; they are the sysop's and must survive untouched.
    expect(out.split('\n').slice(0, 4)).toEqual(text.split('\n').slice(0, 4));
  });

  it('refuses to let a newline re-point every area after it', () => {
    // A template is ONE line. Two would shift the `#` markers and silently
    // attach each heading to the wrong conference.
    const out = replaceQuickNewTemplate(text, 0, 'header', 'one\ntwo');

    expect(parseQuickNewBlocks(out)).toHaveLength(2);
    expect(parseQuickNewBlocks(out)[0].header).toBe('one two');
    expect(parseQuickNewBlocks(out)[1].dirPath).toBe('BBS:Conf3/Dir1');
  });

  it('says so when the block does not exist', () => {
    expect(() => replaceQuickNewTemplate(text, 9, 'header', 'x')).toThrow(/block 9/);
  });
});
