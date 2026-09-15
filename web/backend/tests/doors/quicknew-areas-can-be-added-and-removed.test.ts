/**
 * A sysop can add and remove QuickNew areas, not just edit the ones there.
 *
 * The templates became editable in the admin (quicknew-templates-are-editable);
 * the list of AREAS itself was the half left over. An area is four lines in
 * the config - header template, statistics template, `#`, directory - and the
 * count is whatever the sysop configured, so adding one means writing those
 * four lines at the right offset and nothing else.
 *
 * What these tests are really guarding is the offset arithmetic. Every area
 * below an edit is addressed by its POSITION, so a splice that is one line out
 * silently re-points each remaining area at the directory below its own - a
 * config that still parses, still looks right in the admin, and lists the
 * wrong files to callers.
 */

import {
  parseQuickNewBlocks,
  addQuickNewArea,
  removeQuickNewArea,
} from '../../src/doors/quicknew-config';

/** The shape of the file, built the way the door reads it. */
function aConfig(areas: Array<[string, string, string]>, eol = '\n'): string {
  const preamble = ['\x1b[0m', '\x1b[35m', '2', '\f'];
  const blocks = areas.flatMap(([header, stats, dir]) => [header, stats, '#', dir]);
  return [...preamble, ...blocks].join(eol) + eol;
}

const AREAS: Array<[string, string, string]> = [
  ['Last @D Days >> Warez <<', 'Yesterday: @Y', 'BBS:Conf2/Dir1'],
  ['Last @D Days >> C64 <<', 'Yesterday: @Y', 'BBS:Conf3/Dir1'],
];

describe('adding an area', () => {
  it('appends it after the existing ones', () => {
    const blocks = parseQuickNewBlocks(addQuickNewArea(aConfig(AREAS), 'BBS:Conf9/Dir1'));

    expect(blocks).toHaveLength(3);
    expect(blocks[2].dirPath).toBe('BBS:Conf9/Dir1');
    expect(blocks[2].index).toBe(2);
  });

  it('leaves the areas above it pointing where they did', () => {
    // The offset test. A splice one line out re-points these silently.
    const blocks = parseQuickNewBlocks(addQuickNewArea(aConfig(AREAS), 'BBS:Conf9/Dir1'));

    expect(blocks[0].dirPath).toBe('BBS:Conf2/Dir1');
    expect(blocks[0].header).toBe('Last @D Days >> Warez <<');
    expect(blocks[1].dirPath).toBe('BBS:Conf3/Dir1');
    expect(blocks[1].header).toBe('Last @D Days >> C64 <<');
  });

  it('copies the last area wording, so the new one matches the board', () => {
    // Every board words these differently; an area that does not match the
    // ones above it is a screen the sysop then has to fix by hand.
    const blocks = parseQuickNewBlocks(addQuickNewArea(aConfig(AREAS), 'BBS:Conf9/Dir1'));

    expect(blocks[2].header).toBe('Last @D Days >> C64 <<');
    expect(blocks[2].stats).toBe('Yesterday: @Y');
  });

  it('works on a config that has no areas yet', () => {
    const blocks = parseQuickNewBlocks(addQuickNewArea(aConfig([]), 'BBS:Conf1/Dir1'));

    expect(blocks).toHaveLength(1);
    expect(blocks[0].dirPath).toBe('BBS:Conf1/Dir1');
    expect(blocks[0].header).toContain('@D');
  });

  it('keeps the file CRLF when the file is CRLF', () => {
    // These come off real Amiga boards. Rewriting the endings would show up
    // as a whole-file diff and destroy the sysop's own line discipline.
    const out = addQuickNewArea(aConfig(AREAS, '\r\n'), 'BBS:Conf9/Dir1');

    expect(out).toContain('BBS:Conf9/Dir1\r\n');
    expect(out.split('\n').filter(l => l.length > 0).every(l => l.endsWith('\r'))).toBe(true);
  });

  it('refuses an empty directory', () => {
    expect(() => addQuickNewArea(aConfig(AREAS), '   ')).toThrow(/directory/i);
  });

  it('leaves the preamble alone', () => {
    // Line 3 is a display mode as a digit, line 4 a form feed - nothing here
    // understands them and nothing here may touch them.
    const out = addQuickNewArea(aConfig(AREAS), 'BBS:Conf9/Dir1');

    expect(out.split('\n').slice(0, 4)).toEqual(['\x1b[0m', '\x1b[35m', '2', '\f']);
  });
});

describe('removing an area', () => {
  it('takes out the one named and no other', () => {
    const blocks = parseQuickNewBlocks(removeQuickNewArea(aConfig(AREAS), 0));

    expect(blocks).toHaveLength(1);
    expect(blocks[0].dirPath).toBe('BBS:Conf3/Dir1');
    expect(blocks[0].header).toBe('Last @D Days >> C64 <<');
  });

  it('renumbers what is left, because position IS the name', () => {
    // The remaining area moves up to index 0; the section names the admin
    // uses are built from that index, so this is what keeps a later edit
    // addressing the area the sysop clicked.
    const blocks = parseQuickNewBlocks(removeQuickNewArea(aConfig(AREAS), 0));

    expect(blocks[0].index).toBe(0);
  });

  it('can remove the last one and leave a valid, empty config', () => {
    let text = aConfig(AREAS);
    text = removeQuickNewArea(text, 1);
    text = removeQuickNewArea(text, 0);

    expect(parseQuickNewBlocks(text)).toHaveLength(0);
    expect(text.split('\n').slice(0, 4)).toEqual(['\x1b[0m', '\x1b[35m', '2', '\f']);
  });

  it('refuses an index that is not there', () => {
    // The caller is an admin route acting on a list it just read; a miss
    // means the file moved underneath it and the sysop should be told.
    expect(() => removeQuickNewArea(aConfig(AREAS), 7)).toThrow(/no block 7/);
  });

  it('survives a half-written area at the end of the file', () => {
    // Real boards are hand-edited. The parser ignores a malformed tail, and
    // an edit must not delete it - it is usually the area being written.
    const text = aConfig(AREAS) + 'Last @D Days >> half written\n';
    const out = removeQuickNewArea(text, 0);

    expect(out).toContain('half written');
    expect(parseQuickNewBlocks(out)).toHaveLength(1);
  });
});

describe('add and remove together', () => {
  it('round-trips back to the file it started from', () => {
    const before = aConfig(AREAS);
    const after = removeQuickNewArea(addQuickNewArea(before, 'BBS:Conf9/Dir1'), 2);

    expect(after).toBe(before);
  });
});
