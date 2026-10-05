/**
 * A transfer protocol that cannot be started is express.e's "Unable to open
 * the xpr library" (15750 send, 17116 receive), not the port's "Transfer
 * could not be started.".
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('../../src/services/transfer-protocol.service', () => {
  const { EventEmitter } = require('events');
  return {
    ...jest.requireActual('../../src/services/transfer-protocol.service'),
    getDefaultProtocol: () => 'xmodem',
    TransferProtocolManager: class extends EventEmitter {
      start() { return Promise.reject(new Error('no xpr')); }
    },
  };
});

import { startZmodemDownload } from '../../src/handlers/commands/user-commands.handler';

test('a send that will not start prints express.e\'s xpr line', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xpr-'));
  const file = path.join(dir, 'DEMO.LHA');
  fs.writeFileSync(file, 'x');
  const said: string[] = [];
  const socket: any = { id: 'xpr', emit: (e: string, d: unknown) => { if (e === 'ansi-output') said.push(String(d)); return true; }, on: () => socket, once: () => socket };
  const session: any = { nodeId: 1, currentConf: 1, connectionType: 'telnet', transferRawSend: jest.fn(), transferRawSendUnescaped: jest.fn(), user: { id: 1, username: 'spot', protocol: 'xmodem' } };

  startZmodemDownload(socket, session, [file]);
  await new Promise(r => setTimeout(r, 20));

  expect(said.join('')).toContain('\r\nUnable to open the xpr library\r\n');
  expect(said.join('')).not.toContain('Transfer could not be started');
  fs.rmSync(dir, { recursive: true, force: true });
});
