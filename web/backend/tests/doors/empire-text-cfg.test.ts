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
const bullsCfg = fs.readFileSync(path.join(repoRoot, 'Doors', 'emp_tools', 'Bulls.CFG'));
const joinCfg = fs.readFileSync(path.join(repoRoot, 'Doors', 'emp_tools', 'joincnf.cfg'));

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
    expect(rows.length).toBe(20);
    expect(rows[0]).toEqual({ title: 'Top Uploaders', file: 'bull1.txt' });
    expect(setBullRow(file, 0, { title: 'New Uploads' })).toBe(true);
    expect(setBullRow(file, 1, { file: 'bull2new.txt' })).toBe(true);
    expect(getBullRows(file)[0]).toEqual({ title: 'New Uploads', file: 'bull1.txt' });
    expect(getBullRows(file)[1]).toEqual({ title: 'Top Downloaders', file: 'bull2new.txt' });
    // Out of range is refused, never scaffolded silently.
    expect(setBullRow(file, 99, { title: 'x' })).toBe(false);
  });

  test('mask rows keep their Conference comments (numbering quirks included)', () => {
    const file = parseEmpireFile(bullsCfg);
    const masks = getMaskRows(file);
    expect(masks.length).toBeGreaterThan(30);
    expect(masks[0]).toBe('XXXXXX--------------');
    expect(setMaskRow(file, 0, 'XXXXXXXXXXXXXXXXXXXX')).toBe(true);
    const out = serializeEmpireFile(file);
    expect(out).toContain('XXXXXXXXXXXXXXXXXXXX                               ; Conference 1');
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
    expect(appendBullRow(file, { title: 'Extra', file: 'bull20.txt' })).toBe(true);
    expect(getBullRows(file)).toHaveLength(21);
    expect(appendMaskRow(file, '--------------------', '; Conference 41')).toBe(true);
    expect(getMaskRows(file)).toHaveLength(getMaskRows(parseEmpireFile(bullsCfg)).length + 1);
  });
});
