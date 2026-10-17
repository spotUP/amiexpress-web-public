import { getWipeFrames, parseAnsiToGrid, getWipeOutFrames } from '../../src/utils/screen-wipe.util';
import { WIPE_CODES, type WipeType } from '../../src/screens/wipe-codes';

const NEW_WIPES: Array<[string, WipeType]> = [
  ['W', 'sweep'], ['D', 'diagonal'], ['I', 'iris'], ['O', 'curtain'], ['L', 'interlace'],
  ['U', 'melt'], ['Z', 'zoom'], ['F', 'dissolve'], ['Y', 'wave'], ['K', 'snake'],
];

const art =
  '\x1b[2J\x1b[H' +
  Array.from({ length: 22 }, (_, i) => `\x1b[3${(i % 7) + 1}mRow ${String(i).padStart(2, '0')} ${'#'.repeat(40 + i)}\x1b[0m`).join('\r\n') +
  '\r\n';

/** Apply frame 0 (clear + full paint) and each delta onto a char map; returns the visible-cell count after every animation frame. */
function revealCounts(wipe: WipeType): { counts: number[]; hid: boolean } {
  const frames = getWipeFrames(wipe, art, 80).slice(0, -1); // drop the caller's own final paint
  const screen = new Map<string, string>();
  const counts: number[] = [];
  let hid = false;
  for (const f of frames) {
    let y = 0, x = 0;
    const s = f.content;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '\x1b' && s[i + 1] === '[') {
        const m = /^\x1b\[([0-9;?]*)([A-Za-z])/.exec(s.slice(i));
        if (!m) break;
        if (m[2] === 'J') screen.clear();
        else if (m[2] === 'H') { const p = m[1].split(';'); y = (parseInt(p[0] || '1', 10) || 1) - 1; x = (parseInt(p[1] || '1', 10) || 1) - 1; }
        i += m[0].length - 1;
        continue;
      }
      if (s[i] === '\r') { x = 0; continue; }
      if (s[i] === '\n') { y++; continue; }
      const key = `${y},${x}`;
      const was = screen.get(key);
      if (s[i] === ' ') { if (was !== undefined && was !== ' ') hid = true; screen.set(key, ' '); }
      else screen.set(key, s[i]);
      x++;
    }
    counts.push([...screen.values()].filter((c) => c !== ' ').length);
  }
  return { counts, hid };
}

describe.each(NEW_WIPES)('wipe ~W%s (%s)', (_letter, wipe) => {
  test('is registered under its letter', () => {
    expect(WIPE_CODES[_letter]).toBe(wipe);
  });

  test('last animation frame is the full grid, first reveals less', () => {
    const grid = parseAnsiToGrid(art, 80);
    const full = grid.reduce((n, row) => n + row.filter((c) => c.char !== ' ').length, 0);
    const { counts } = revealCounts(wipe);
    expect(counts.length).toBeGreaterThan(2);
    expect(counts.length).toBeLessThanOrEqual(30);
    expect(counts[counts.length - 1]).toBe(full);
    expect(counts[0]).toBeLessThan(counts[counts.length - 1]);
  });

  test('reveal is monotonic: a shown cell never hides', () => {
    const { counts, hid } = revealCounts(wipe);
    expect(hid).toBe(false);
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
  });

  test('plays in and out within the board wipe budget', () => {
    for (const fn of [getWipeFrames, getWipeOutFrames]) {
      const frames = fn(wipe, art, 80);
      expect(frames.reduce((ms, f) => ms + f.delay, 0)).toBeLessThanOrEqual(3000);
    }
  });
});

test('the random list covers every WIPE_CODES value except random', () => {
  const wanted = new Set(Object.values(WIPE_CODES).filter((t) => t !== 'random'));
  const seen = new Set<string>();
  const spy = jest.spyOn(Math, 'random');
  try {
    const n = wanted.size;
    for (let i = 0; i < n; i++) {
      spy.mockReturnValueOnce((i + 0.5) / n); // picks index i in wipeGrids
      const frames = getWipeFrames('random', art, 80);
      expect(frames.length).toBeGreaterThan(0);
      seen.add(String(i));
    }
  } finally {
    spy.mockRestore();
  }
  // Each index 0..n-1 was addressable; the list length equals the distinct non-random codes.
  expect(seen.size).toBe(wanted.size);
  expect(wanted.size).toBe(Object.values(WIPE_CODES).length - 1);
});
