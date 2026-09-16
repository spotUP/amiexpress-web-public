/**
 * THE INDEX IS BUILT WHILE NOBODY IS ON THE BOARD.
 *
 * `buildScreenIndex` is synchronous and costs seconds on a real board (70+
 * node directories). Built lazily it is paid by whoever asks first - the
 * admin's Screens page - and because it holds the event loop for the whole
 * build, a caller logging in at that moment waits for it too (measured on this
 * board, 2026-09-16, and reported on BOARD.md).
 *
 * So the server warms it at boot. These cases pin the two properties that make
 * the warm safe rather than just early: it does not run inside the `listen`
 * callback (the container must answer /health first), and it never runs while
 * a caller is connected - it defers instead, because an optimisation that
 * freezes a live session has lost its own argument.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { warmScreenIndex, invalidateScreenIndex } from '../../src/screens/screen-index.service';

let root: string;

beforeEach(() => {
  jest.useFakeTimers();
  invalidateScreenIndex();
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'warm-index-'));
  fs.mkdirSync(path.join(root, 'Screens'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Screens', 'MENU.txt'), 'a menu\n', 'latin1');
});

afterEach(() => {
  jest.useRealTimers();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('warmScreenIndex', () => {
  it('does not build inside the call - the server has to answer /health first', () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});

    warmScreenIndex(root, { delayMs: 15_000 });

    // Nothing has run yet: the caller returned and the loop is free.
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining('index warmed'));

    jest.advanceTimersByTime(15_000);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('index warmed'));
    log.mockRestore();
  });

  it('defers while a caller is on the board, and builds once they leave', () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    let callers = 1;

    warmScreenIndex(root, { delayMs: 1_000, retryMs: 1_000, isBusy: () => callers > 0 });

    jest.advanceTimersByTime(1_000);
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining('index warmed'));

    // Still on, still deferring - not a one-shot give-up.
    jest.advanceTimersByTime(1_000);
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining('index warmed'));

    callers = 0;
    jest.advanceTimersByTime(1_000);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('index warmed'));
    log.mockRestore();
  });

  it('a board it cannot index is the next reader\'s problem, not a crash at boot', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});

    warmScreenIndex(path.join(root, 'no-such-board'), { delayMs: 0 });

    expect(() => jest.advanceTimersByTime(0)).not.toThrow();
    jest.restoreAllMocks();
  });
});
