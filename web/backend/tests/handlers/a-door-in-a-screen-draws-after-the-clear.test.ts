/**
 * A door a screen runs draws after what the screen drew before it.
 *
 * Screen text and `~f` go out through the batching output buffer (emitText);
 * a door writes straight to the socket. So `~f` then `~CC_ctop` put the
 * conference top on the wire FIRST and the clear AFTER it, and the caller saw
 * an empty screen with a lone pause under it (Conf2 on the live board,
 * 2026-09-29). Driven through the real displayScreen, with the command the
 * sentinel runs recorded.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('../../src/handlers/command.handler', () => ({
  processCommand: async (socket: any) => {
    socket.emit('ansi-output', 'DOOROUT');
    return 'SUCCESS';
  },
}));

import { displayScreen } from '../../src/handlers/screen.handler';
import { flushOutput } from '../../src/utils/output.util';
import { invalidateScreenIndex } from '../../src/screens/screen-index.service';
import { config } from '../../src/config';
import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';

let root: string;
let previousDataDir: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'door-after-clear-'));
  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
  fs.mkdirSync(path.join(root, 'Screens'), { recursive: true });
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), '');
  fs.writeFileSync(path.join(root, 'Screens', 'DOORTEST.TXT'), '~w\r\nBEFORE\r\n~f|\r\n~CC_ZZZ\r\n', 'latin1');
  invalidateScreenIndex();
});

afterEach(() => {
  config.set('dataDir', previousDataDir);
  fs.rmSync(root, { recursive: true, force: true });
  invalidateScreenIndex();
});

it('puts the clear on the wire before the door output, not after it', async () => {
  const wire: string[] = [];
  const socket = {
    id: `door-after-clear-${Math.random().toString(36).slice(2)}`,
    emit: (event: string, data: unknown) => { if (event === 'ansi-output' && typeof data === 'string') wire.push(data); return true; },
    on: () => {},
  } as any;
  const session = {
    nodeId: 1, state: BBSState.LOGGEDON, subState: LoggedOnSubState.READ_COMMAND,
    currentConf: 1, ansiEnabled: true, screenHeight: 24, screenWidth: 80,
    user: { username: 'x', secLevel: 255, expert: 'X' }, tempData: {},
  } as any;

  await displayScreen(socket, session, 'BBS:Screens/DOORTEST.TXT', true);
  flushOutput(socket);

  const all = wire.join('');
  expect(all).toContain('DOOROUT');
  expect(all.indexOf('BEFORE')).toBeGreaterThanOrEqual(0);
  expect(all.indexOf('BEFORE')).toBeLessThan(all.indexOf('DOOROUT'));
  // The clear (a hard one or a scroll-clear, both end in a home) precedes the door.
  expect(all.lastIndexOf('\x1b[H', all.indexOf('DOOROUT'))).toBeGreaterThan(all.indexOf('BEFORE'));
});
