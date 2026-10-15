/**
 * M20: B is the BULLETINS door, Bulls stays as its fallback. Properties of the
 * repo's own Commands/BBSCmd (scanned read-only; no bytes pinned) and of the
 * script step that gets it there.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { scanCommandDirectory, CommandType } from '../../src/utils/amiga-command-parser.util';
import { readTooltypeMap, applyTooltypes } from '../../src/utils/info-file.util';
import { INTERNAL_COMMAND_NAMES } from '../../src/handlers/command-handler/internal-command-names';
import { STEPS } from '../../src/scripts/register-menu-doors';

const repoRoot = path.resolve(__dirname, '../../../..');
const bInfo = path.join(repoRoot, 'Commands', 'BBSCmd', 'B.info');

describe('the repo registers B as the bulletins door', () => {
  const tt = readTooltypeMap(bInfo);

  it('points B at the bulletins door with Bulls as the fallback', () => {
    expect(tt.get('LOCATION')).toMatch(/BULLETINS\/bulletins$/);
    expect(tt.get('FALLBACK')).toBe('BULLS');
    expect(tt.get('MIN_COLUMNS')).toBe('40');
    expect(tt.get('MULTINODE')).toBe('YES');
  });

  it('drops the C64 frame adapter: the door is native at forty columns', () => {
    expect(tt.has('C64_ADAPT')).toBe(false);
    expect(tt.has('REDACTED')).toBe(false);
  });

  it('keeps the sysop-owned access', () => {
    expect(tt.get('ACCESS')).toBe('1');
  });

  it('keeps Bulls registered as BULLS, adapted, for the fallback', () => {
    const bulls = readTooltypeMap(path.join(repoRoot, 'Commands', 'BBSCmd', 'BULLS.info'));
    expect(bulls.get('LOCATION')).toMatch(/Bulls$/);
    expect(bulls.get('C64_ADAPT')).toBe('40');
  });

  it('the bulletins binary is committed, so B is the new door in the registry', () => {
    expect(fs.existsSync(path.join(repoRoot, 'Doors', 'BULLETINS', 'bulletins'))).toBe(true);
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const b = scanCommandDirectory(repoRoot, CommandType.BBSCMD, undefined, 0).get('B');
    log.mockRestore();
    expect(b?.location).toMatch(/BULLETINS\/bulletins$/);
  });

  it('B still has an internal equivalent, so a teletext caller gets the internal B', () => {
    expect(INTERNAL_COMMAND_NAMES).toContain('B');
  });
});

describe('the bulletins step edits an existing binary B.info in place', () => {
  const sample = fs.readFileSync(bInfo);
  let root: string;
  const target = () => path.join(root, 'Commands', 'BBSCmd', 'B.info');

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'b-bulletins-'));
    fs.mkdirSync(path.dirname(target()), { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  function oldB(): void {
    fs.writeFileSync(target(), sample);
    applyTooltypes(target(), [
      ['LOCATION', 'DOORS:EmP_Tools/Bulls'], ['C64_ADAPT', '40'], ['REDACTED', '1'],
      ['ACCESS', '7'], ['DESCRIPTION', 'sysop text'],
    ], { removeKeys: k => k === 'FALLBACK' || k === 'MIN_COLUMNS' });
  }

  it('sets the door tooltypes, keeps the sysop ones, and is idempotent', () => {
    oldB();
    STEPS.bulletins(root);
    const once = fs.readFileSync(target());
    const map = readTooltypeMap(target());
    expect(map.get('LOCATION')).toBe('Doors/BULLETINS/bulletins');
    expect(map.get('FALLBACK')).toBe('BULLS');
    expect(map.get('STACK')).toBe('8192');
    expect(map.has('C64_ADAPT')).toBe(false);
    expect(map.has('REDACTED')).toBe(false);
    expect(map.get('ACCESS')).toBe('7');
    expect(map.get('DESCRIPTION')).toBe('sysop text');
    STEPS.bulletins(root);
    expect(fs.readFileSync(target()).equals(once)).toBe(true);
  });

  it('keeps the icon image bytes ahead of the tooltypes', () => {
    oldB();
    const before = fs.readFileSync(target());
    STEPS.bulletins(root);
    const after = fs.readFileSync(target());
    expect(after.subarray(0, 4)).toEqual(before.subarray(0, 4));
    expect(after.length).toBeGreaterThan(900);
  });

  it('registers B fresh when none exists', () => {
    STEPS.bulletins(root);
    expect(readTooltypeMap(target()).get('FALLBACK')).toBe('BULLS');
  });
});
