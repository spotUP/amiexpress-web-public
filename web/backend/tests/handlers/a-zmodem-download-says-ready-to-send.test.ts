/**
 * express.e's ZMODEM send announces itself as "ZModem: Ready to Send"
 * (15731-15740, internalName 'ZModem' at 15622); the port printed
 * "Starting ZMODEM send (lrzsz)...". An empty file list returns with
 * nothing to say (15597-15599); the port printed "No files available for
 * download.".
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('../../src/services/lrzsz-transfer.service', () => ({
  isLrzszAvailable: () => true,
  LrzszTransferManager: class { constructor(public opts: unknown) {} start() {} handleInput() {} },
}));
jest.mock('../../src/services/transfer-protocol.service', () => ({
  ...jest.requireActual('../../src/services/transfer-protocol.service'),
  getDefaultProtocol: () => 'zmodem',
}));

import { startZmodemDownload } from '../../src/handlers/commands/user-commands.handler';

function aCaller() {
  const said: string[] = [];
  const socket: any = { id: 'dl', emit: (e: string, d: unknown) => { if (e === 'ansi-output') said.push(String(d)); return true; }, on: () => socket, once: () => socket };
  const session: any = {
    nodeId: 1, currentConf: 1, connectionType: 'telnet',
    transferRawSend: jest.fn(), transferRawSendUnescaped: jest.fn(),
    user: { id: 1, username: 'spot', protocol: 'zmodem' },
  };
  return { socket, session, said: () => said.join('') };
}

test('a ZMODEM send says "ZModem: Ready to Send"', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dl-ready-'));
  const file = path.join(dir, 'DEMO.LHA');
  fs.writeFileSync(file, 'x');
  const c = aCaller();

  startZmodemDownload(c.socket, c.session, [file]);

  expect(c.said()).toContain('ZModem: Ready to Send\r\n');
  expect(c.said()).not.toContain('Starting ZMODEM send');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('an empty file list says nothing', () => {
  const c = aCaller();
  startZmodemDownload(c.socket, c.session, []);
  expect(c.said()).toBe('');
});
