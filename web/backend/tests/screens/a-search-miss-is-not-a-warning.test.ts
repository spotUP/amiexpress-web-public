/**
 * A MISS IN ONE DIRECTORY IS THE SEARCH WORKING, NOT A FAULT.
 *
 * `findSecurityScreen` answers for a single directory, and the loader calls
 * it once per search location - `Node<n>`, the theme's copy, the shared
 * `Screens/Node`, the board root. Most of those legitimately do not hold the
 * screen. Each miss used to write a `console.warn` line, and this board's
 * logger costs ~13ms a line: a cold screen-index build (every screen, every
 * node directory, every theme) wrote 9,363 of them, took minutes, and the
 * admin's `GET /api/screens/login-sequence` sat behind it until the browser
 * gave up - "found it on local now its stuck loading" (sysop, 2026-09-16),
 * with `net::ERR_EMPTY_RESPONSE` under it.
 *
 * The real failure is still reported once by the caller that runs out of
 * places to look.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { findSecurityScreen } from '../../src/utils/screen-security.util';

describe('looking for a screen that is not in this directory', () => {
  let dir: string;
  let warn: jest.SpyInstance;
  let log: jest.SpyInstance;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'screen-miss-'));
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    log = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
    log.mockRestore();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('says nothing at all - the caller decides whether a miss matters', () => {
    expect(findSecurityScreen(path.join(dir, 'LOGON'), 255)).toBeNull();
    expect(warn).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it('is silent for every level it walks, not merely for the last', () => {
    // 255 down to 5 in fives is fifty-one lookups in this one directory, and
    // fifty-one log lines is what made the index build a multi-minute stall.
    findSecurityScreen(path.join(dir, 'BULL'), 255);
    findSecurityScreen(path.join(dir, 'MAILSCAN'), 255);
    findSecurityScreen(path.join(dir, 'ACHIEVETOP'), 255);
    expect(warn).not.toHaveBeenCalled();
  });

  it('still answers with the file when the directory does hold one', () => {
    fs.writeFileSync(path.join(dir, 'LOGON20.TXT'), 'art');
    expect(findSecurityScreen(path.join(dir, 'LOGON'), 255)).toBe(path.join(dir, 'LOGON20.TXT'));
    expect(warn).not.toHaveBeenCalled();
  });
});
