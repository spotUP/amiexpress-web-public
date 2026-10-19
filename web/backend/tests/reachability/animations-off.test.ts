/**
 * Animations off (W row 23), wired end to end - plan 2026-10-19-animations-off V5.
 *
 * The ONE reachability test for the feature. Everything else is tested where
 * it lives (the gate in services/user-settings, the smear in
 * screen-wipe.util.test.ts, the W row in the-w-screen-offers-the-swedish-set).
 *
 * Drives the REAL W option handler (info-commands.handler, mocked the way
 * the-w-screen-offers-the-swedish-set.test.ts mocks it) against a REAL users
 * row (UserRepository over an in-memory sqlite table), then a door page turn
 * through the REAL AEW_SCREEN answer (boardScreenAnswer, 'WIPE IN P 1 6 B').
 * Sentinel: a spy on getRegionSlideFrames proves whether the slide (and its
 * motion blur) ran at all.
 */
import BetterSqlite3 from 'better-sqlite3';

jest.mock('../../src/index', () => {
  const states = require('../../src/constants/bbs-states');
  return { BBSState: states.BBSState, LoggedOnSubState: states.LoggedOnSubState, BBSSession: {} };
});
jest.mock('../../src/handlers/command-handler/dependency-injection', () => ({
  getDoors: () => [],
}));
// The W handler saves through db.updateUser; it lands on a real users row.
const mockRow: { repo: Pick<UserRepository, 'updateUser'> | null } = { repo: null };
jest.mock('../../src/database', () => ({
  db: { updateUser: (...a: Parameters<UserRepository['updateUser']>) => mockRow.repo!.updateUser(...a) },
}));
// The sentinel: the real slide builder, counted. The module's exports are not
// redefinable (jest.spyOn throws), so the module is wrapped where board-screen
// imports it.
jest.mock('../../src/utils/screen-wipe.util', () => {
  const actual = jest.requireActual('../../src/utils/screen-wipe.util');
  return { ...actual, getRegionSlideFrames: jest.fn(actual.getRegionSlideFrames) };
});
jest.mock('../../src/utils/acs.util', () => ({
  ...jest.requireActual('../../src/utils/acs.util'),
  checkSecurity: () => true,
}));

import { LoggedOnSubState } from '../../src/constants/bbs-states';
import { handleWOptionSelectInput } from '../../src/handlers/commands/info-commands.handler';
import { UserRepository } from '../../src/database/user-repository';
import { boardScreenAnswer, type BoardScreenContext } from '../../src/amiga-emulation/xim/board-screen';
import { feedScreenModel, dropScreenModel } from '../../src/services/screen-model/screen-model';
import { getRegionSlideFrames } from '../../src/utils/screen-wipe.util';

const SOCKET_ID = 'reach-anim-off';

test('W 23 turns the door page-turn slide and its motion blur off, and back on', async () => {
  const sqlite = new BetterSqlite3(':memory:');
  sqlite.exec('CREATE TABLE users (id TEXT PRIMARY KEY, noanimations INTEGER NOT NULL DEFAULT 0, updated INTEGER)');
  sqlite.exec("INSERT INTO users (id) VALUES ('u23')");
  mockRow.repo = new UserRepository(sqlite);
  const stored = () => (sqlite.prepare("SELECT noanimations FROM users WHERE id = 'u23'").get() as { noanimations: number }).noanimations;

  // One caller: the W screen and the door page turn share this session.
  const session: any = {
    nodeId: 1, currentConf: 1, tempData: {}, subState: LoggedOnSubState.W_OPTION_SELECT,
    screenWidth: 80, wireWidth: 80, wireHeight: 25,
    user: { id: 'u23', username: 'SPOT', secLevel: 255 },
  };
  const wSocket: any = { id: 'w-reach', session, emit: () => true, on() { return wSocket; } };
  const sent: string[] = [];
  const ctx: BoardScreenContext = {
    session,
    socket: { id: SOCKET_ID, _directEmit: (_e: string, d: string) => sent.push(d), emit: (_e: string, d: string) => sent.push(d) },
    state: { wipeCapture: null }, mouse: null, columns: () => 80, armMouse: () => undefined,
  } as unknown as BoardScreenContext;

  const spy = getRegionSlideFrames as jest.MockedFunction<typeof getRegionSlideFrames>;
  const pageTurn = async (): Promise<string> => {
    sent.length = 0;
    spy.mockClear();
    dropScreenModel(SOCKET_ID);
    feedScreenModel(SOCKET_ID, session, '\x1b[2J\x1b[H' + Array.from({ length: 6 }, () => 'OLDPAGE').join('\r\n'));
    const answer = await boardScreenAnswer('WIPE IN P 1 6 B', ctx);
    if (answer === 'OK') {
      // Bold bright yellow, so a smeared cell shows in its SGR.
      ctx.state.wipeCapture!.text.push('\x1b[2J\x1b[H' + Array.from({ length: 6 }, () => '\x1b[1;93m' + 'X'.repeat(80)).join('\r\n'));
      await boardScreenAnswer('WIPE END', ctx);
    }
    return answer;
  };

  // W 23: animations off, saved on the row.
  await handleWOptionSelectInput(wSocket, session, '23');
  expect(stored()).toBe(1);
  expect(session.user.noAnimations).toBe(true);

  expect(await pageTurn()).toBe('NO');
  expect(spy).toHaveBeenCalledTimes(0);
  expect(sent).toHaveLength(0);

  // W 23 again: animations on, the slide plays with its blur.
  session.subState = LoggedOnSubState.W_OPTION_SELECT;
  await handleWOptionSelectInput(wSocket, session, '23');
  expect(stored()).toBe(0);

  expect(await pageTurn()).toBe('OK');
  expect(spy).toHaveBeenCalledTimes(1);
  expect(sent).toHaveLength(4);
  // Frame 1, row 1: each glyph with the SGR it was written in.
  const cells: { char: string; params: string[] }[] = [];
  let params: string[] = [];
  for (const part of sent[0].split(/\x1b\[\d+;1H/)[1].split(/(\x1b\[[0-9;]*m)/)) {
    if (part.startsWith('\x1b[') && part.endsWith('m')) params = part.slice(2, -1).split(';');
    else for (const char of part.replace(/\x1b\[\?25[lh]/g, '')) cells.push({ char, params });
  }
  const folded = (c: { params: string[] }) => !c.params.includes('1') && c.params.includes('33');
  expect(cells.some(c => c.char === '·' && folded(c))).toBe(true);
  expect(cells.some(c => c.char === 'X' && folded(c))).toBe(true);

  dropScreenModel(SOCKET_ID);
  sqlite.close();
});
