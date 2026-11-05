/**
 * The Empire sectioned config driver (Bulls.CFG, joincnf.cfg).
 *
 * The load-bearing property is byte-identity: parsing the shipped files and
 * serializing them back must produce the exact input bytes — comments,
 * padding, delimiter tails, section case (`[Title_END]` vs `[TITLE_END]`),
 * unknown sections and numbering quirks (no Conference 9) all survive.
 * A sysop hand-editing beside the admin must never find the admin rewrote
 * their file.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  parseEmpireFile,
  serializeEmpireFile,
  getKv,
  setKv,
  getBullRows,
  setBullRow,
  appendBullRow,
  getMaskRows,
  setMaskRow,
  appendMaskRow,
  getSectionBody,
  setSectionBody,
} from '../../src/doors/text-cfg/empire';

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const bullsCfg = fs.readFileSync(path.join(repoRoot, 'board', 'Doors', 'emp_tools', 'Bulls.CFG'));
const joinCfg = fs.readFileSync(path.join(repoRoot, 'board', 'Doors', 'emp_tools', 'joincnf.cfg'));

/*
 * The shipped Bulls.CFG is the live board's file and the sysop edits it, so
 * its row counts and mask text change over time. Nothing below pins a tally:
 * the expected values are read from the parsed section bodies (the structure
 * that produces them), and the tests assert the properties that must hold for
 * ANY valid file - bulletin N sits on row N, a mask row has twenty flags, the
 * getters agree with the sections.
 */
const MASK_FLAGS = 20;
function sectionLines(raw: Buffer, name: string, kind: 'bull' | 'mask') {
  const sec = parseEmpireFile(raw).sections.find((s) => s.name === name);
  return (sec?.body ?? []).filter((l) => l.kind === kind);
}

describe('Empire text-cfg driver', () => {
  test('Bulls.CFG round-trips byte-identical', () => {
    expect(serializeEmpireFile(parseEmpireFile(bullsCfg))).toBe(bullsCfg.toString('latin1'));
  });

  test('joincnf.cfg round-trips byte-identical', () => {
    expect(serializeEmpireFile(parseEmpireFile(joinCfg))).toBe(joinCfg.toString('latin1'));
  });

  test('init toggles read and flip in place', () => {
    const file = parseEmpireFile(bullsCfg);
    expect(getKv(file, 'init_end', 'DUAL_LISTING')).toBe('YES');
    expect(getKv(file, 'init_end', 'CURSOR_KEYS')).toBe('YES');
    expect(setKv(file, 'init_end', 'DUAL_LISTING', 'NO')).toBe(true);
    expect(getKv(file, 'init_end', 'DUAL_LISTING')).toBe('NO');
    const out = serializeEmpireFile(file);
    expect(out).toContain('DUAL_LISTING       NO');
    // The comment and the other toggle survive the edit.
    expect(out).toContain('; Use 2 Listings [YES/NO]');
    expect(out).toContain('CURSOR_KEYS        YES');
  });

  test('unknown key is refused, not appended', () => {
    const file = parseEmpireFile(bullsCfg);
    expect(setKv(file, 'init_end', 'NO_SUCH_KEY', 'YES')).toBe(false);
    expect(serializeEmpireFile(file)).toBe(bullsCfg.toString('latin1'));
  });

  test('bull rows map title and file by index', () => {
    const file = parseEmpireFile(bullsCfg);
    const rows = getBullRows(file);
    const parsed = sectionLines(bullsCfg, 'bullnames_end', 'bull');
    expect(parsed.length).toBeGreaterThan(0);
    expect(rows).toHaveLength(parsed.length);
    // A mask row has twenty flags, so a 21st name could never be switched on.
    expect(rows.length).toBeLessThanOrEqual(MASK_FLAGS);
    // Position is identity: row i is bulletin i+1.
    rows.forEach((r, i) => expect(r.file).toBe(`bull${i + 1}.txt`));
    const [first, second] = rows;
    expect(setBullRow(file, 0, { title: 'New Uploads' })).toBe(true);
    expect(setBullRow(file, 1, { file: 'bull2new.txt' })).toBe(true);
    expect(getBullRows(file)[0]).toEqual({ title: 'New Uploads', file: first.file });
    expect(getBullRows(file)[1]).toEqual({ title: second.title, file: 'bull2new.txt' });
    // Out of range is refused, never scaffolded silently.
    expect(setBullRow(file, rows.length, { title: 'x' })).toBe(false);
    expect(setBullRow(file, 99, { title: 'x' })).toBe(false);
  });

  test('mask rows keep their Conference comments (numbering quirks included)', () => {
    const file = parseEmpireFile(bullsCfg);
    const masks = getMaskRows(file);
    const parsed = sectionLines(bullsCfg, 'cnfaccess_end', 'mask');
    expect(parsed.length).toBeGreaterThan(30);
    expect(masks).toHaveLength(parsed.length);
    for (const m of masks) {
      expect(m).toHaveLength(MASK_FLAGS);
      expect(m).toMatch(/^[X-]+$/);
    }
    const original = parsed[0] as { maskRaw: string; comment: string };
    expect(masks[0]).toBe(original.maskRaw.trim());
    expect(original.comment).toContain('Conference 1');
    expect(setMaskRow(file, 0, 'X'.repeat(MASK_FLAGS))).toBe(true);
    const out = serializeEmpireFile(file);
    const row = new RegExp(`^X{${MASK_FLAGS}} +; Conference 1\\s*$`, 'm').exec(out);
    expect(row).not.toBeNull();
    // The edit pads in place: the comment column does not move.
    expect(row![0].indexOf(';')).toBe(original.maskRaw.length);
    expect(setMaskRow(file, 999, 'X')).toBe(false);
  });

  test('title art body reads and writes as raw lines', () => {
    const file = parseEmpireFile(bullsCfg);
    const body = getSectionBody(file, 'title_end');
    expect(body).toBeDefined();
    expect(body!.length).toBeGreaterThan(5);
    expect(body!.join('\n')).toContain('____');
    const replacement = ['line one', 'line two'];
    expect(setSectionBody(file, 'title_end', replacement)).toBe(true);
    expect(getSectionBody(file, 'title_end')).toEqual(replacement);
  });

  test('joincnf init keys and CNF passwords parse; unknown sections pass through', () => {
    const file = parseEmpireFile(joinCfg);
    expect(getKv(file, 'init_end', 'NRCONFLINES')).toBe('11');
    expect(getKv(file, 'init_end', 'DUAL_LISTING')).toBe('NO');
    expect(getKv(file, 'cnf_end', 'CNF_PASS.21')).toBe('PASSWORD');
    expect(setKv(file, 'init_end', 'NRCONFLINES', '15')).toBe(true);
    const out = serializeEmpireFile(file);
    expect(out).toContain('NRCONFLINES        15');
    // Password and art sections survive untouched.
    expect(out).toContain('CNF_PASS.21=PASSWORD');
    expect(out).toContain('[TITLE_END]');
    expect(out).toContain('[LINES_END]');
    expect(out).toContain('[CURCNF_END]');
  });

  test('append helpers grow short files canonically', () => {
    const file = parseEmpireFile(bullsCfg);
    const bullsBefore = getBullRows(file).length;
    expect(appendBullRow(file, { title: 'Extra', file: 'bull20.txt' })).toBe(true);
    expect(getBullRows(file)).toHaveLength(bullsBefore + 1);
    expect(appendMaskRow(file, '--------------------', '; Conference 41')).toBe(true);
    expect(getMaskRows(file)).toHaveLength(getMaskRows(parseEmpireFile(bullsCfg)).length + 1);
  });
});
