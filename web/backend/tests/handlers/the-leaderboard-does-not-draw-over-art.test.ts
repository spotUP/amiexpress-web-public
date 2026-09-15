/**
 * The achievements leaderboard must not draw on top of whatever was there.
 *
 * `achievements/bulletin.ts` opened the generated `AchieveTop.txt` with
 * '\x0c', expecting the terminal to clear the way a real Amiga does on a form
 * feed (express.e:5224-5228 `sendCLS` sends ASCII 12). xterm.js treats 0x0C as
 * a LINE FEED, so that clear has never happened and the leaderboard has always
 * drawn over the art behind it - the same root cause as the upload screen
 * (b02e1c7b1).
 *
 * The file cannot ask for the clear itself. `~f` would work, but only by
 * turning MCI on for the whole file: express.e:6800-6806 enables MCI when a
 * file's FIRST LINE STARTS WITH `~`, and this file's body is generated from
 * user and board names - a `~` in one would then be read as a code. So the
 * clear belongs to the code that decides to show the screen.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as path from 'path';

const read = (rel: string) =>
  fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

describe('the generated leaderboard file', () => {
  const src = read('src/achievements/bulletin.ts');

  it('no longer opens with a form feed that clears nothing', () => {
    // The bug: a leading 0x0C that xterm.js renders as a line feed.
    expect(src).not.toMatch(/out\.push\('\\x0c'/);
  });

  it('does not try to ask for the clear with an MCI code either', () => {
    // `~f` as the first line would switch MCI on for the whole generated
    // body (express.e:6800-6806) - user names would start being parsed.
    const firstPush = src.slice(src.indexOf('const out: string[] = []'));
    expect(firstPush).not.toMatch(/out\.push\('~f/);
  });
});

describe('the display flow', () => {
  const src = read('src/handlers/command.handler.ts');

  it('clears before it draws the leaderboard', () => {
    // Anchored on the BRANCH, not the first mention: the name appears
    // earlier as `session.subState = ...DISPLAY_ACHIEVE_BULL` inside the
    // NODE_BULL branch, which is a handover, not the place that draws.
    const branch = src.indexOf(
      'if (session.subState === LoggedOnSubState.DISPLAY_ACHIEVE_BULL)');
    expect(branch).toBeGreaterThan(-1);
    const next = src.indexOf(
      'if (session.subState === LoggedOnSubState.CONF_SCAN)', branch);
    const block = src.slice(branch, next > -1 ? next : undefined);

    const clear = block.indexOf('clearTheScreen(socket)');
    const draw = block.indexOf("'ACHIEVETOP'");
    expect(clear).toBeGreaterThan(-1);
    expect(draw).toBeGreaterThan(-1);
    expect(clear).toBeLessThan(draw);
  });
});
