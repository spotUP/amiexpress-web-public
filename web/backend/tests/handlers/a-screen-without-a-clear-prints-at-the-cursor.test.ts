/**
 * A screen that does not clear prints where the cursor is.
 *
 * express.e streams a screen file at the cursor (displayFile, express.e:6539);
 * only the screens in SCREENS_REQUIRE_CLEAR clear first, and that clear ends
 * in a home of its own. The direct display path also sent a bare `ESC[H`
 * before every screen, so a screen with no clear was painted from the top
 * left over whatever was still showing. On the live board, `d` with the h7
 * theme drew the 20-row DOWNLOADMSG over the 21-row menu: the menu's last
 * row and the old prompt stayed, and the pause landed inside the menu's
 * `[G]...gOODbYE` row (sysop, 2026-11-05, animations off). Driven through
 * the real displayScreen.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { displayScreen } from '../../src/handlers/screen.handler';
import { flushOutput } from '../../src/utils/output.util';
import { invalidateScreenIndex } from '../../src/screens/screen-index.service';
import { config } from '../../src/config';
import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';

let root: string;
let previousDataDir: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'no-clear-at-cursor-'));
  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
  fs.mkdirSync(path.join(root, 'Screens'), { recursive: true });
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), '');
  fs.writeFileSync(path.join(root, 'Screens', 'PLAIN.TXT'), 'ART ROW 1\r\nART ROW 2\r\n', 'latin1');
  fs.writeFileSync(path.join(root, 'Screens', 'WIPED.TXT'), '~WX\r\nART ROW 1\r\nART ROW 2\x1b[0m', 'latin1');
  invalidateScreenIndex();
});

afterEach(() => {
  config.set('dataDir', previousDataDir);
  fs.rmSync(root, { recursive: true, force: true });
  invalidateScreenIndex();
});

function caller(): { socket: any; session: any; wire: string[] } {
  const wire: string[] = [];
  const socket = {
    id: `no-clear-at-cursor-${Math.random().toString(36).slice(2)}`,
    emit: (event: string, data: unknown) => { if (event === 'ansi-output' && typeof data === 'string') wire.push(data); return true; },
    on: () => {},
  } as any;
  const session = {
    nodeId: 1, state: BBSState.LOGGEDON, subState: LoggedOnSubState.READ_COMMAND,
    currentConf: 1, ansiEnabled: true, screenHeight: 24, screenWidth: 80,
    user: { username: 'x', secLevel: 255, expert: 'X', noAnimations: true }, tempData: {},
  } as any;
  return { socket, session, wire };
}

it.each(['PLAIN', 'WIPED'])('draws the %s screen at the cursor, with no move to the top left', async (name) => {
  const { socket, session, wire } = caller();
  await displayScreen(socket, session, `BBS:Screens/${name}.TXT`, false);
  flushOutput(socket);
  const all = wire.join('');
  expect(all).toContain('ART ROW 1');
  expect(all).not.toContain('\x1b[H');
  expect(all).not.toContain('\x1b[2J');
});
