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

import { GENERATED_SCREEN_ROWS, paginatesAt, SHORTEST_TERMINAL_ROWS } from '../../src/screens/screen-rows';

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
  /*
   * AND THE TAILER, because the board has one and it is two more rows.
   *
   * The first version of this fixture left it out, so every measurement here
   * was two rows short of the real screen - the fit "passed" while the live
   * bulletin came out at 26 rows against a 25-row terminal. The sysop saw
   * what the test could not: "last callers is one or two lines too tall still
   * i think" (2026-09-15). A fixture that is smaller than the thing it stands
   * for cannot fail the way the real one does.
   */
  fs.copyFileSync(
    path.join(REPO, 'Utils', 'samilog', 'samilog.tailer.txt'),
    path.join(utils, 'samilog.tailer.txt'),
  );
  return dir;
}

/** Load the service against `dir` - DATA_DIR is read at module load. */
function serviceFor(dir: string) {
  process.env.BBS_DATA_DIR = dir;
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../src/services/SamiLogService');
}

/**
 * The rows a caller sees - NOT split length.
 *
 * The loader paginates on `content.split('\n').length > screenHeight`, and a
 * file ending in a newline yields one phantom element. A bulletin escapes the
 * page break when its real rows are at most one under the caller's height, so
 * that is what these assert on.
 */
const rowsOf = (text: string) => (text.endsWith('\n') ? text.split('\n').length - 1 : text.split('\n').length);
/** What screen.handler's needsPaging will actually compare. */
const loaderLineCount = (text: string) => text.split('\n').length;
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

  /*
   * A HEADER THAT DOES NOT END IN A NEWLINE.
   *
   * `Utils/samilog/samilog.header.txt.gr` on the live board ends
   * `...________/  ESC[0m` with nothing after it, so the credits bar was
   * written onto the END of the art's last row: 80 columns of logo plus 76 of
   * credits, one 156-column row, which an 80-column telnet wraps - and every
   * row below it arrives one line low (sysop, 2026-09-22: "one line is to
   * long and the first line is offset").
   *
   * A drawing program does not promise a trailing newline and the art is the
   * sysop's; the JOIN belongs to this tool.
   */
  test('is joined to the credits bar even when the art carries no newline', () => {
    const dir = boardWith(6);
    boards.push(dir);
    const header = path.join(dir, 'Utils', 'samilog', 'samilog.header.txt');
    fs.writeFileSync(header, fs.readFileSync(header, 'latin1').replace(/\n$/, ''), 'latin1');

    const text = serviceFor(dir).generateBulletin(20, {});

    /*
     * WIDTH UP TO THE FIRST CURSOR MOVE, not the whole stripped line.
     *
     * `samilog.tailer.txt` draws TWO screen rows in one file line: it prints
     * the first, then `\x1b[75D\x1b[B` walks the cursor back and down and
     * prints the second. Stripping every escape and measuring what is left
     * calls that a 150-column row, which is a fault in the measurement - the
     * art renders correctly and always has. What actually overflows a screen
     * is a run of PRINTABLE text with no cursor move in it.
     */
    const widestRun = (line: string) =>
      line
        .split(/\x1b\[[0-9;?]*[ABCDEFGHJKfnsu]/)          // cursor motion ends a run
        .map((run) => run.replace(/\x1b\[[0-9;?]*m/g, '').replace(/\r$/, '').length)
        .reduce((a: number, b: number) => Math.max(a, b), 0);

    const tooWide = text.split('\n').filter((l: string) => widestRun(l) > 80);
    expect({ tooWide }).toEqual({ tooWide: [] });
    // And the bar is still there - joined, not dropped.
    expect(text).toContain("Super-AmiLog by P0T-NOoDLE of ANTHROX");
  });

  test('without a budget it is as long as it is - the case that paginated', () => {
    const dir = board(12);
    const text = serviceFor(dir).generateBulletin(20, {});

    // No fitRows: nothing trims it, and this is what the sysop met.
    expect(rowsOf(text)).toBeGreaterThan(25);
  });

  test('with a budget it fits, and still lists callers', () => {
    // A SIX-row logo, which is what the board wears. Twelve cannot fit inside
    // 24 at any caller count once the tailer is counted - that is the
    // "too tall for the budget" case, covered by the floor test below, and
    // asserting a fit here was asserting something impossible.
    const dir = board(6);
    const text = serviceFor(dir).generateBulletin(20, { fitRows: GENERATED_SCREEN_ROWS, minCallers: 1 });

    expect(rowsOf(text)).toBeLessThanOrEqual(GENERATED_SCREEN_ROWS);
    expect(callerRows(text)).toBeGreaterThan(0);
  });

  test('a TALLER logo costs caller rows, not the fit', () => {
    // The property the sysop asked for: the logo can vary, and the table gives.
    // Both heights leave room for callers - the furniture around the table is
    // about eleven rows, so a 24-row budget has thirteen to share between the
    // logo and the list.
    // minCallers 1 isolates the height rule from the list floor, which the
    // test below covers on its own.
    const short = serviceFor(board(4)).generateBulletin(20, { fitRows: GENERATED_SCREEN_ROWS, minCallers: 1 });
    const tall = serviceFor(board(9)).generateBulletin(20, { fitRows: GENERATED_SCREEN_ROWS, minCallers: 1 });

    expect(rowsOf(short)).toBeLessThanOrEqual(24);
    expect(rowsOf(tall)).toBeLessThanOrEqual(24);
    expect(callerRows(tall)).toBeLessThan(callerRows(short));
  });

  test('a fitted bulletin does not paginate on the shortest screen it must fit', () => {
    /*
     * The whole point, asserted the way the LOADER decides it:
     * screen.handler's needsPaging is `content.split('\n').length > height`.
     *
     * Against 24, not 25. A bulletin is generated at logoff with nobody on
     * the board, so it cannot ask anyone's height and must fit the shortest
     * terminal - which is the board's own default and the sysop's actual
     * screen. Asserting 25 here is exactly how a one-row overflow shipped
     * while this suite was green.
     */
    // A 5-row logo: this fixture's furniture is 12 rows, so the 22-row budget
    // (23-row terminal, 2026-09-16) leaves exactly the five-caller floor. A
    // 6-row logo cannot fit any more and stays tall - see the case below.
    const dir = board(5);
    const text = serviceFor(dir).generateBulletin(20, { fitRows: GENERATED_SCREEN_ROWS });

    // Asked on the SHORTEST terminal a generated screen must fit - the
    // sysop's is 23 now (it was 24 when this was written, and 25 before
    // that); asserting a taller one is what let a one-row overflow ship.
    expect(paginatesAt(text, SHORTEST_TERMINAL_ROWS)).toBe(false);
    expect(callerRows(text)).toBeGreaterThanOrEqual(5);
  });

  test('the list has a floor - the screen runs long rather than gutting it', () => {
    // The furniture is about eleven rows whatever the art does, so this board's
    // 12-row logo leaves ONE row for callers inside 24. A Last Callers screen
    // with one caller on it is not a Last Callers screen: the floor wins, the
    // bulletin stays tall, and shortening the logo is what buys the fit.
    const text = serviceFor(board(12)).generateBulletin(20, { fitRows: GENERATED_SCREEN_ROWS });

    expect(callerRows(text)).toBeGreaterThanOrEqual(5);
    expect(rowsOf(text)).toBeGreaterThan(24);
  });

  test('the OLDEST callers are the ones dropped', () => {
    const dir = board(12);
    const svc = serviceFor(dir);
    const full = svc.generateBulletin(20, {});
    const fitted = svc.generateBulletin(20, { fitRows: GENERATED_SCREEN_ROWS, minCallers: 1 });

    const fullRows = full.split('\n').filter((l: string) => /\d\d:\d\d:\d\d/.test(l));
    const fittedRows = fitted.split('\n').filter((l: string) => /\d\d:\d\d:\d\d/.test(l));

    // The store is newest-first, so what survives is the FRONT of the list.
    expect(fittedRows).toEqual(fullRows.slice(0, fittedRows.length));
  });

  test('a logo that eats the whole screen still lists callers', () => {
    const dir = board(30);
    const text = serviceFor(dir).generateBulletin(20, { fitRows: GENERATED_SCREEN_ROWS });

    // A Last Callers screen with no callers on it is not a bulletin.
    expect(callerRows(text)).toBeGreaterThanOrEqual(5);
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

describe('the terminal the bulletin is fitted for', () => {
  it('is 23 rows - the board\'s new-user screen length and the sysop\'s browser - not the ANSI 24', () => {
    // 2026-09-16: fitted to 24, the bulletin was one row too tall for a
    // normal terminal and the Bulls door put the prompt under its last row.
    expect(SHORTEST_TERMINAL_ROWS).toBe(23);
    expect(GENERATED_SCREEN_ROWS).toBe(22);
    const dir = boardWith(5);
    try {
      const text = serviceFor(dir).generateBulletin(20, { fitRows: GENERATED_SCREEN_ROWS, minCallers: 1 });
      expect(paginatesAt(text, 23)).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
