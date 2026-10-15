/**
 * A `~SS_` include whose file is missing shows nothing and says nothing.
 *
 * express.e:6773 displayFile opens the file and displays it only when the
 * Open succeeds - there is no else branch. The board raised
 * "Screen not found: BBS:bulletins/bull9.txt" to the sysop instead, in the
 * middle of the Requests conference join (2026-09-27).
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/utils/sysop-alert.util', () => ({ notifySysop: jest.fn() }));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { parseMciCodes } from '../../src/handlers/screen.handler';
import { flushOutput } from '../../src/utils/output.util';
import { notifySysop } from '../../src/utils/sysop-alert.util';
import { config } from '../../src/config';

function aCaller() {
  const emitted: string[] = [];
  const socket: any = {
    id: `ss-missing-${Math.random().toString(36).slice(2)}`,
    emit: (_e: string, data: unknown) => { if (typeof data === 'string') emitted.push(data); },
    on: () => {},
  };
  const session: any = { user: { username: 'sysop', secLevel: 255 }, nodeId: 1, currentConf: 4, slowmo: 0, slowmoCount: 0 };
  return { socket, session, emitted };
}

describe('a ~SS_ include', () => {
  const originalRoot = config.get('dataDir');

  beforeEach(() => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-missing-'));
    fs.mkdirSync(path.join(root, 'Bulletins'), { recursive: true });
    fs.writeFileSync(path.join(root, 'Bulletins', 'bull9.txt'), 'REQUEST LISTING\r\n', 'latin1');
    config.set('dataDir', root);
    (notifySysop as jest.Mock).mockClear();
  });

  afterEach(() => {
    config.set('dataDir', originalRoot);
  });

  it('does not alert the sysop when the file is missing', async () => {
    const { socket, session } = aCaller();

    await parseMciCodes('~ HEADER\r\n~SS_BBS:Bulletins/bull77.txt', session, undefined, undefined, undefined, socket);
    flushOutput(socket);

    expect(notifySysop).not.toHaveBeenCalled();
  });

  it('still draws a file that is there', async () => {
    const { socket, session, emitted } = aCaller();

    await parseMciCodes('~ HEADER\r\n~SS_BBS:Bulletins/bull9.txt', session, undefined, undefined, undefined, socket);
    flushOutput(socket);

    expect(emitted.join('')).toContain('REQUEST LISTING');
  });
});
