/**
 * The Last Callers bulletin is written to FIT, by listing fewer callers.
 *
 * "it pauses here and corrupts when it proceed" (the sysop, 2026-09-14) was
 * two faults in one screen. The corruption was the page break eating a line
 * (the-page-break-does-not-eat-the-last-line.test.ts). This is the other half:
 * the bulletin should not need a page break at all.
 *
 * `Bulletins/bull6.txt` came to 38 lines against a 25-row screen because the
 * batch asks for 20 callers and everything else on the screen - the header
 * art, the credits bar, the column rule, the daily and record bars, the tailer
 * - is fixed furniture. The only part that can give is how many callers are
 * listed, and the oldest are the ones to lose: "oldest ones out based on the
 * height of the ascii logo that can vary".
 *
 * That last clause is the reason the fit is MEASURED rather than calculated.
 * The header and tailer are files a sysop edits, so their height is not known
 * until they have been read, and a taller logo has to cost caller rows instead
 * of overflowing. The third test is that property, and it is the one that
 * stays true when an artist redraws the logo.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const REPO = path.join(__dirname, '..', '..', '..', '..');

/** A header of `height` rows, shaped like the real one (art, then a blank). */
function logo(height: number): string {
  return Array.from({ length: height }, (_, i) => `\x1b[1;36m${'_'.repeat(20)} logo row ${i}`).join('\n') + '\n';
}

function boardWith(headerRows: number): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'samilog-fit-'));
  const utils = path.join(dir, 'Utils', 'samilog');
  fs.mkdirSync(utils, { recursive: true });
  // The board's real store, so the entries are real records rather than a
  // guess at the binary layout.
  fs.copyFileSync(path.join(REPO, 'S', 'SAmiLog.Store'), path.join(utils, 'SAmiLog.Store'));
  fs.writeFileSync(path.join(utils, 'samilog.header.txt'), logo(headerRows), 'latin1');
  return dir;
}

/** Load the service against `dir` - DATA_DIR is read at module load. */
function serviceFor(dir: string) {
  process.env.BBS_DATA_DIR = dir;
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../src/services/SamiLogService');
}

const rowsOf = (text: string) => text.split('\n').length;
/** The caller rows: every line carrying the table's time column. */
const callerRows = (text: string) => text.split('\n').filter(l => /\d\d:\d\d:\d\d/.test(l)).length;

describe('the last callers bulletin', () => {
  const boards: string[] = [];
  const board = (headerRows: number) => {
    const dir = boardWith(headerRows);
    boards.push(dir);
    return dir;
  };

  afterAll(() => {
    for (const dir of boards) fs.rmSync(dir, { recursive: true, force: true });
  });

  test('without a budget it is as long as it is - the case that paginated', () => {
    const dir = board(12);
    const text = serviceFor(dir).generateBulletin(20, {});

    // No fitRows: nothing trims it, and this is what the sysop met.
    expect(rowsOf(text)).toBeGreaterThan(25);
  });

  test('with a budget it fits, and still lists callers', () => {
    const dir = board(12);
    const text = serviceFor(dir).generateBulletin(20, { fitRows: 24, minCallers: 1 });

    expect(rowsOf(text)).toBeLessThanOrEqual(24);
    expect(callerRows(text)).toBeGreaterThan(0);
  });

  test('a TALLER logo costs caller rows, not the fit', () => {
    // The property the sysop asked for: the logo can vary, and the table gives.
    // Both heights leave room for callers - the furniture around the table is
    // about eleven rows, so a 24-row budget has thirteen to share between the
    // logo and the list.
    // minCallers 1 isolates the height rule from the list floor, which the
    // test below covers on its own.
    const short = serviceFor(board(4)).generateBulletin(20, { fitRows: 24, minCallers: 1 });
    const tall = serviceFor(board(9)).generateBulletin(20, { fitRows: 24, minCallers: 1 });

    expect(rowsOf(short)).toBeLessThanOrEqual(24);
    expect(rowsOf(tall)).toBeLessThanOrEqual(24);
    expect(callerRows(tall)).toBeLessThan(callerRows(short));
  });

  test('the list has a floor - the screen runs long rather than gutting it', () => {
    // The furniture is about eleven rows whatever the art does, so this board's
    // 12-row logo leaves ONE row for callers inside 24. A Last Callers screen
    // with one caller on it is not a Last Callers screen: the floor wins, the
    // bulletin stays tall, and shortening the logo is what buys the fit.
    const text = serviceFor(board(12)).generateBulletin(20, { fitRows: 24 });

    expect(callerRows(text)).toBeGreaterThanOrEqual(8);
    expect(rowsOf(text)).toBeGreaterThan(24);
  });

  test('the OLDEST callers are the ones dropped', () => {
    const dir = board(12);
    const svc = serviceFor(dir);
    const full = svc.generateBulletin(20, {});
    const fitted = svc.generateBulletin(20, { fitRows: 24, minCallers: 1 });

    const fullRows = full.split('\n').filter((l: string) => /\d\d:\d\d:\d\d/.test(l));
    const fittedRows = fitted.split('\n').filter((l: string) => /\d\d:\d\d:\d\d/.test(l));

    // The store is newest-first, so what survives is the FRONT of the list.
    expect(fittedRows).toEqual(fullRows.slice(0, fittedRows.length));
  });

  test('a logo that eats the whole screen still lists callers', () => {
    const dir = board(30);
    const text = serviceFor(dir).generateBulletin(20, { fitRows: 24 });

    // A Last Callers screen with no callers on it is not a bulletin.
    expect(callerRows(text)).toBeGreaterThanOrEqual(8);
  });
});

/**
 * And the logo itself is editable, which is the other half of the fit.
 *
 * "the logo from this door should be editable as well" - the sysop,
 * 2026-09-14. Its height is what decides how many callers fit, so a fit the
 * sysop cannot influence is only half a feature. The file already passed the
 * screen routes' containment check - `resolveScreenPath` allows anything under
 * the board root - it simply never appeared in the manager's LIST, because the
 * art scan only walked `Doors/` and SAmiLog keeps its templates in `Utils/`.
 */
describe('the samilog logo', () => {
  const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..');

  function boardWithUtilArt(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'util-art-'));
    const utils = path.join(dir, 'Utils', 'samilog');
    fs.mkdirSync(utils, { recursive: true });
    fs.writeFileSync(path.join(utils, 'samilog.header.txt'), logo(6), 'latin1');
    fs.writeFileSync(path.join(utils, 'samilog.tailer.txt'), 'tail\n', 'latin1');
    // A door with art, so the Doors/ half is proven not to have been lost.
    const door = path.join(dir, 'Doors', 'somedoor');
    fs.mkdirSync(door, { recursive: true });
    fs.writeFileSync(path.join(door, 'title.txt'), 'art\n', 'latin1');
    // Nothing to find here - a Utils entry with no art must not be listed.
    fs.mkdirSync(path.join(dir, 'Utils', 'aecrypt'), { recursive: true });
    return dir;
  }

  test('is listed as editable art, and the doors are still listed too', () => {
    const dir = boardWithUtilArt();
    try {
      process.env.BBS_DATA_DIR = dir;
      jest.resetModules();
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { listDoorScreenDirectories } = require('../../src/screens/screen-index.service');

      const found = listDoorScreenDirectories(dir);
      const names = found.map((f: { door: string }) => f.door);

      expect(names).toContain('samilog');
      expect(names).toContain('somedoor');
      // A utility with no art of its own stays out of the manager.
      expect(names).not.toContain('aecrypt');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('the screen routes already accept its path - only the listing was missing', () => {
    const dir = boardWithUtilArt();
    try {
      process.env.BBS_DATA_DIR = dir;
      jest.resetModules();
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { resolveScreenPath } = require('../../src/api/screens-routes');

      expect(resolveScreenPath('Utils/samilog/samilog.header.txt')).toBeTruthy();
      // Containment is untouched by the widening.
      expect(resolveScreenPath('../../../etc/passwd')).toBeNull();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // Keeps REPO_ROOT meaningful if the fixture above is ever swapped for the
  // board's own files.
  test('the board really does keep the logo in Utils/samilog', () => {
    expect(fs.existsSync(path.join(REPO_ROOT, 'Utils', 'samilog', 'samilog.header.txt'))).toBe(true);
  });
});
