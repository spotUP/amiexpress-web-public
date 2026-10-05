/**
 * ZOOM runs express.e's qwk sequence (26244-26344): it ASKS the pack method
 * and reads the answer, prints the three "Packing ..." lines, the line
 * break, "Prepare for ZoomMail Zmodem Download:", pauses, then sends - and
 * ends without a press-key prompt of its own. The port printed the pack
 * question as a status line it never read, skipped the packing lines and
 * the pause, and ended with "Press any key to continue...".
 */
process.env.SKIP_DB_INIT = '1';

const pauses: string[] = [];
jest.mock('../../src/handlers/message/zoom-mail', () => ({
  qwkZoom: async () => ({ zoomed: 1, conferences: [], messages: [] }),
}));
jest.mock('../../src/services/qwk.service', () => ({
  QWKManager: class { async generateOutgoingPacket() { return '/tmp/AE0001.QWK'; } },
}));
jest.mock('../../src/handlers/screen.handler', () => ({
  ...jest.requireActual('../../src/handlers/screen.handler'),
  doPause: (_s: unknown, _sess: unknown, done: () => void) => { pauses.push('pause'); done(); },
}));
const downloadFile = jest.fn(async () => 'zmodem');
jest.mock('../../src/handlers/file/file-delivery', () => ({ downloadFile: (...a: unknown[]) => (downloadFile as any)(...a) }));
jest.mock('../../src/utils/acs.util', () => ({ ...jest.requireActual('../../src/utils/acs.util'), checkSecurity: () => true }));

import { handleZoomCommand } from '../../src/handlers/commands/utility-commands.handler';
import { feedInputWaiter } from '../../src/utils/await-input';
import { LoggedOnSubState } from '../../src/constants/bbs-states';

test('ZOOM asks the pack method, packs, pauses, sends, and adds no press-key', async () => {
  const said: string[] = [];
  const socket: any = { id: 'zoom', emit: (e: string, d: unknown) => { if (e === 'ansi-output') said.push(String(d)); return true; } };
  const session: any = { nodeId: 1, currentConf: 1, user: { id: 1, username: 'spot', slotNumber: 1 } };

  const running = handleZoomCommand(socket, session);
  for (let i = 0; i < 50 && !session.inputWaiter; i++) await new Promise(r => setTimeout(r, 5));
  expect(said.join('')).toContain('\r\n\x1b[32mPack Method \x1b[0m1) LHA, 2) ZIP ?>');
  feedInputWaiter(socket, session, '2');
  feedInputWaiter(socket, session, '\r');
  await running;

  const out = said.join('');
  expect(out).toContain('\r\n\x1b[32mPacking Control File\r\n\r\n\x1b[32mPacking Messages\r\n\r\n\x1b[32mPacking Index File\r\n');
  expect(out).toContain('\x1b[33mPrepare for ZoomMail Zmodem Download:\r\n');
  expect(pauses).toEqual(['pause']);
  expect(downloadFile).toHaveBeenCalledTimes(1);
  expect(out).not.toContain('Press any key');
  expect(session.menuPause).toBe(true);
  expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
});
