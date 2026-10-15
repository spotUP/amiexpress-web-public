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
 *
 * Checked at runtime: the generator's own output, and the real display flow
 * with the screen renderer recorded - what is already on the wire at the
 * moment ACHIEVETOP is asked for.
 */
process.env.SKIP_DB_INIT = '1';

import { LoggedOnSubState } from '../../src/constants/bbs-states';
import { flushOutput, clearTheScreen } from '../../src/utils/output.util';

/** Every screen asked for, with the wire as it stood at that moment. */
const asked: Array<{ screen: string; wireBefore: string }> = [];
const wire: string[] = [];
jest.mock('../../src/handlers/screen.handler', () => ({
  ...jest.requireActual('../../src/handlers/screen.handler'),
  displayScreen: async (socket: any, _session: any, screen: string) => {
    flushOutput(socket);                    // whatever was emitted before this call
    asked.push({ screen, wireBefore: wire.join('') });
    return true;
  },
}));

import { renderAchievementsBulletin } from '../../src/achievements/bulletin';
import { advanceDisplayFlow } from '../../src/handlers/command.handler';

describe('the generated leaderboard file', () => {
  const file = renderAchievementsBulletin([], [], 'UPROUGH', new Date('2026-09-28T12:00:00Z'));

  it('no longer opens with a form feed that clears nothing', () => {
    // The bug: a leading 0x0C that xterm.js renders as a line feed.
    expect(file).not.toContain('\x0c');
  });

  it('does not try to ask for the clear with an MCI code either', () => {
    // `~f` as the first line would switch MCI on for the whole generated
    // body (express.e:6800-6806) - user names would start being parsed.
    expect(file.startsWith('~')).toBe(false);
  });
});

describe('the display flow', () => {
  it('clears before it draws the leaderboard', async () => {
    const socket = {
      id: 'leaderboard-clear',
      emit: (event: string, data: unknown) => {
        if (event === 'ansi-output' && typeof data === 'string') wire.push(data);
        return true;
      },
      on: () => {},
    } as any;
    const session = {
      nodeId: 1,
      state: 'loggedon',
      subState: LoggedOnSubState.DISPLAY_ACHIEVE_BULL,
      currentConf: 1,
      user: { id: 1, username: 'spot', secLevel: 10, expert: 'X', confRJoin: 1, msgBaseRJoin: 1 },
      tempData: {},
    } as any;

    await advanceDisplayFlow(socket, session);

    const achieve = asked.find((a) => a.screen === 'ACHIEVETOP');
    expect(achieve).toBeDefined();
    expect(achieve!.wireBefore).toContain(clearTheScreen(socket));
  });
});
