/**
 * A `~nSR_` pool with a gap shows nothing and says nothing.
 *
 * express.e:5550-5552 asks findSecurityScreen for the rolled number and
 * displays what it finds. The live Logoff is `~3SR_WORK:bbs/Screens/logoff/logoff`
 * and `001.logoff.txt` had been deleted, so every third logoff raised
 * "Screen not found: .../logoff/001.logoff" to the sysop (2026-09-27).
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
    id: `sr-gap-${Math.random().toString(36).slice(2)}`,
    emit: (_e: string, data: unknown) => { if (typeof data === 'string') emitted.push(data); },
    on: () => {},
  };
  const session: any = { user: { username: 'sysop', secLevel: 255 }, nodeId: 1, currentConf: 1, slowmo: 0, slowmoCount: 0 };
  return { socket, session, emitted };
}

describe('a ~3SR_ logoff pool missing one member', () => {
  const originalRoot = config.get('dataDir');
  let random: jest.SpyInstance;

  beforeEach(() => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-gap-'));
    fs.mkdirSync(path.join(root, 'Screens', 'logoff'), { recursive: true });
    fs.writeFileSync(path.join(root, 'Screens', 'logoff', '002.logoff.txt'), 'SECOND GOODBYE\r\n', 'latin1');
    config.set('dataDir', root);
    (notifySysop as jest.Mock).mockClear();
  });

  afterEach(() => {
    random?.mockRestore();
    config.set('dataDir', originalRoot);
  });

  it('does not alert the sysop when the roll lands on the gap', async () => {
    random = jest.spyOn(Math, 'random').mockReturnValue(0); // rolls 1
    const { socket, session } = aCaller();

    await parseMciCodes('~ ~3SR_WORK:bbs/Screens/logoff/logoff', session, undefined, undefined, undefined, socket);
    flushOutput(socket);

    expect(notifySysop).not.toHaveBeenCalled();
  });

  it('still draws a member that is there', async () => {
    random = jest.spyOn(Math, 'random').mockReturnValue(0.4); // rolls 2
    const { socket, session, emitted } = aCaller();

    await parseMciCodes('~ ~3SR_WORK:bbs/Screens/logoff/logoff', session, undefined, undefined, undefined, socket);
    flushOutput(socket);

    expect(emitted.join('')).toContain('SECOND GOODBYE');
  });
});
