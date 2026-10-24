/**
 * Regression: no screen the board serves may set a black background.
 *
 * In macOS Terminal the default background is transparent, so an explicit
 * black background (SGR 40, 48;5;0, 48;5;16, 48;2;0;0;0) shows as black
 * blocks beside transparent cells. Art must use the default background
 * (SGR 49). Black foreground (30) and reverse video (7) are untouched.
 *
 * Scans every tracked screen file (git ls-files) under the board's screen
 * directories and the door art directories the board streams as text.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const REPO = path.resolve(__dirname, '..', '..', '..');
const SGR = /\x1b\[([0-9;]*)m/g;
const SERVED = [
  /^Bulletins\//, /^Conf\d+\//, /^Node\d+\//, /^Screens\//, /^Themes\//,
  /^Doors\/Kickboxing\/KB\.Trophy$/, /^Doors\/glc-viewer\/art\//,
  /^Doors\/super-qix\/backgrounds\//,
];
const SKIP_EXT = /\.(seq|ttx|info|lha|lzx|zip|bin)$/i;

/** Number of black-background parameters in one SGR parameter list. */
function blackBackgrounds(params: string): number {
  const p = params.split(';');
  let n = 0;
  for (let i = 0; i < p.length; ) {
    const v = Number(p[i] || 0);
    if (v === 38 && p[i + 1] === '5') { i += 3; continue; }
    if (v === 38 && p[i + 1] === '2') { i += 5; continue; }
    if (v === 48 && p[i + 1] === '5') {
      if ([0, 16].includes(Number(p[i + 2] || 0))) n++;
      i += 3; continue;
    }
    if (v === 48 && p[i + 1] === '2') {
      if (p.slice(i + 2, i + 5).every((x) => Number(x || 0) === 0)) n++;
      i += 5; continue;
    }
    if (v === 40) n++;
    i++;
  }
  return n;
}

describe('shipped screens never set a black background', () => {
  it('has no SGR 40 / 48;5;0 / 48;5;16 / 48;2;0;0;0 in any served screen', () => {
    const files = execFileSync('git', ['ls-files', '-z'], { cwd: REPO, maxBuffer: 64 * 1024 * 1024 })
      .toString('latin1').split('\0')
      .filter((f) => f && !SKIP_EXT.test(f) && SERVED.some((re) => re.test(f)));
    expect(files.length).toBeGreaterThan(50); // sentinel: the scan really ran

    const offenders: string[] = [];
    for (const f of files) {
      const data = fs.readFileSync(path.join(REPO, f)).toString('latin1');
      for (const m of data.matchAll(SGR)) {
        if (blackBackgrounds(m[1]) > 0) { offenders.push(`${f}: ESC[${m[1]}m`); break; }
      }
    }
    expect(offenders).toEqual([]);
  });

  // Third-party 68K doors carry their colours as string literals in the
  // executable (zOOsTAtS, DreamStats, WarOLM...). They were patched in place,
  // 40 to 49, which keeps every offset; this keeps a re-imported copy honest.
  it('has no black background in any tracked Amiga door executable', () => {
    const files = execFileSync('git', ['ls-files', '-z', 'Doors'], { cwd: REPO, maxBuffer: 64 * 1024 * 1024 })
      .toString().split('\0').filter(Boolean);
    const offenders: string[] = [];
    let executables = 0;
    for (const f of files) {
      let data: Buffer;
      try { data = fs.readFileSync(path.join(REPO, f)); } catch { continue; }
      if (data.length < 4 || data.readUInt32BE(0) !== 0x3f3) continue; // HUNK_HEADER
      executables++;
      for (const m of data.toString('latin1').matchAll(SGR)) {
        if (blackBackgrounds(m[1]) > 0) { offenders.push(`${f}: ESC[${m[1]}m`); break; }
      }
    }
    expect(executables).toBeGreaterThan(20); // sentinel: the scan really ran
    expect(offenders).toEqual([]);
  });

  it('the detector flags the black forms and leaves foreground and reverse alone', () => {
    expect(blackBackgrounds('40')).toBe(1);
    expect(blackBackgrounds('1;37;40')).toBe(1);
    expect(blackBackgrounds('48;5;0')).toBe(1);
    expect(blackBackgrounds('48;5;16')).toBe(1);
    expect(blackBackgrounds('48;2;0;0;0')).toBe(1);
    expect(blackBackgrounds('30')).toBe(0);
    expect(blackBackgrounds('7')).toBe(0);
    expect(blackBackgrounds('38;5;0')).toBe(0);
    expect(blackBackgrounds('41;49')).toBe(0);
  });
});
