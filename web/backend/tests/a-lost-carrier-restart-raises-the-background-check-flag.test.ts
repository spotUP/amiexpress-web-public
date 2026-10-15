/**
 * express.e:17513-17518 scanHoldDesc: the lost-carrier restart sets
 * `bgFileCheck:=checkToolTypeExists(TOOLTYPE_NODE,node,'BGFILECHECK')` before
 * uploadaFile(1,'',FALSE). Driven through scanHoldDesc, the auto-rejoin's call
 * (conference.handler 5067). The filing it hands the files to is the test's.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('../src/handlers/commands/user-commands.handler', () => ({
  fileReceivedUploads: jest.fn(async (_socket: unknown, session: unknown) => {
    require('../src/services/upload-end.service').endUpload(session, 'success', () => {});
  }),
}));

import { config } from '../src/config';
import { clearNodeTooltypeCache } from '../src/utils/node-tooltypes.util';
import { scanHoldDesc } from '../src/services/lost-carrier-files.service';

describe('the lost-carrier restart', () => {
  let root: string;
  let previous: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'lcbg-'));
    previous = config.get('dataDir');
    config.set('dataDir', root);
    clearNodeTooltypeCache();
    fs.mkdirSync(path.join(root, 'Conf1', 'LCFILES'), { recursive: true });
    fs.writeFileSync(path.join(root, 'Conf1', 'LCFILES', '7.lc'), 'GONE.LHA  a description\n');
  });
  afterEach(() => {
    config.set('dataDir', previous);
    clearNodeTooltypeCache();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const restart = async () => {
    const session: any = { nodeId: 1, currentConf: 1, user: { slotNumber: 7, username: 'sysop' } };
    await scanHoldDesc({ id: 'lc', emit: () => true }, session);
    return session;
  };

  it('takes bgFileCheck from the node BGFILECHECK tooltype', async () => {
    fs.writeFileSync(path.join(root, 'Node1.info'), 'BGFILECHECK\n');
    expect((await restart()).bgFileCheck).toBe(true);
  });

  it('is off when the node has no BGFILECHECK', async () => {
    expect((await restart()).bgFileCheck).toBe(false);
  });
});
