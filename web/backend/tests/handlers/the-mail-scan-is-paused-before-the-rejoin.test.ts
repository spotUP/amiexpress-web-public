/**
 * The conference scan ends with a pause, before the rejoin draws over it.
 *
 * express.e:28145 - the scan's part-upload check ends in doPause(). The port
 * left it as a TODO, so the rejoin's conference bulletin drew straight over
 * "Scanning conferences for mail..." ("no pause after mail scan", sysop,
 * 2026-09-29). The check now owes the pause and the display flow pays it.
 * Driven through the real advanceDisplayFlow, with screens recorded.
 */
process.env.SKIP_DB_INIT = '1';

import { LoggedOnSubState } from '../../src/constants/bbs-states';

const asked: string[] = [];
jest.mock('../../src/handlers/screen.handler', () => ({
  ...jest.requireActual('../../src/handlers/screen.handler'),
  displayScreen: async (_socket: any, _session: any, screen: string) => {
    asked.push(screen);
    return true;
  },
}));

import { advanceDisplayFlow } from '../../src/handlers/command.handler';
import { flushOutput } from '../../src/utils/output.util';

it('pauses after the scan, and draws no conference bulletin until a key is pressed', async () => {
  const wire: string[] = [];
  const socket = {
    id: 'mailscan-pause',
    emit: (event: string, data: unknown) => {
      if (event === 'ansi-output' && typeof data === 'string') wire.push(data);
      return true;
    },
    on: () => {},
  } as any;
  const session = {
    nodeId: 1,
    state: 'loggedon',
    subState: LoggedOnSubState.DISPLAY_CONF_BULL,
    confScanPauseOwed: true,
    currentConf: 1,
    user: { id: 1, username: 'spot', secLevel: 255, expert: 'X', confRJoin: 1, msgBaseRJoin: 1 },
    tempData: {},
  } as any;

  await advanceDisplayFlow(socket, session);
  flushOutput(socket);

  expect(session.paginatedScreen).toBeTruthy();
  expect(wire.join('')).toMatch(/Pause/);
  expect(asked).not.toContain('CONF_BULL');
  expect(session.subState).toBe(LoggedOnSubState.AUTO_REJOIN);
  expect(session.confScanPauseOwed).toBe(false);
});
