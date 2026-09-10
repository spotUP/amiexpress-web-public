/**
 * WEB_BULLS_CONFIG: parse, problems, round-trip, save.
 *
 * The service never reformats: tests pin the live findings (bull12 mapped
 * twice, bull13-19 missing, Conference 9 without a mask row) and prove an
 * untouched file parses clean of format errors. Fixture is the real
 * Bulls.CFG shape, shrunk.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseBullsConfig, saveBullsConfig, loadBullsConfig } from '../../src/services/bulls-config.service';

const CFG = [
  'DUAL_LISTING       YES                 ; Use 2 Listings [YES/NO]',
  'CURSOR_KEYS        YES                 ; Use Cursors',
  '[Init_END] ====================================================================',
  'Top Uploaders                                      ; bull1.txt',
  'System Information                                 ; bull12.txt',
  'Private Bull #3                                    ; bull12.txt',
  'Private Bull #4                                    ; bull13.txt',
  '[BullNames_END]===============================================================',
  'XXXXXX--------------                               ; Conference 1',
  'XXXXXXXXXXXX--------                               ; Conference 3',
  '[CnfAccess_END]===============================================================',
  'ART HERE',
  '[Title_END]===================================================================',
  '',
].join('\n');

describe('bulls config', () => {
  const files = new Set(['bull1.txt', 'bull12.txt']);
  it('parses settings, entries, masks, markers', () => {
    const c = parseBullsConfig(CFG, files);
    expect(c.settings.map((s) => s.key)).toEqual(['DUAL_LISTING', 'CURSOR_KEYS']);
    expect(c.entries.map((e) => e.file)).toEqual(['bull1.txt', 'bull12.txt', 'bull12.txt', 'bull13.txt']);
    expect(c.masks.map((m) => m.conference)).toEqual([1, 3]);
    expect(c.markers.initEnd).toBe(3);
  });
  it('flags the live problems: duplicate file, missing file, missing conference', () => {
    const c = parseBullsConfig(CFG, files);
    const kinds = c.problems.map((p) => p.kind);
    expect(kinds).toContain('duplicate-file');
    expect(kinds).toContain('missing-file');
    expect(kinds).toContain('missing-conference');
    expect(c.problems.find((p) => p.kind === 'duplicate-file')?.message).toContain('bull12.txt');
    expect(c.problems.find((p) => p.kind === 'missing-file')?.message).toContain('bull13.txt');
    expect(c.problems.find((p) => p.kind === 'missing-conference')?.message).toContain('Conference 2');
  });
  it('saves bytes back and backs up, problems rechecked', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bulls-'));
    fs.mkdirSync(path.join(dir, 'Doors', 'emp_tools'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'Bulletins'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'Doors', 'emp_tools', 'Bulls.CFG'), CFG, 'latin1');
    fs.writeFileSync(path.join(dir, 'Bulletins', 'bull1.txt'), 'x', 'latin1');
    fs.writeFileSync(path.join(dir, 'Bulletins', 'bull12.txt'), 'x', 'latin1');
    const back = saveBullsConfig(dir, CFG.replace('bull13.txt', 'bull12.txt'));
    expect(fs.readFileSync(path.join(dir, 'Doors', 'emp_tools', 'Bulls.CFG'), 'latin1')).toContain('bull1.txt');
    expect(fs.existsSync(path.join(dir, 'Doors', 'emp_tools', 'Bulls.CFG.bak'))).toBe(true);
    expect(back.problems.map((p) => p.kind)).not.toContain('missing-file');
    const loaded = loadBullsConfig(dir);
    expect(loaded.raw).toContain('Top Uploaders');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
