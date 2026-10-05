/**
 * F over an empty DIR file prints nothing for it: express.e's displayIt2
 * reads it with `WHILE(Fgets(...))` (27737), which runs zero times. The port
 * printed an invented "No files in this directory." and an extra pause.
 * A DIR file that will not open is myError(ERR_FILELIST) (27722-27726,
 * 8526-8527): "There is a problem with File listings, please tell <sysop>",
 * and the listing goes on to the next directory.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { FileListingHandler } from '../../../src/handlers/file/file-listing.handler';
import { config } from '../../../src/config';
import { resetFileViewLayoutCache } from '../../../src/services/file-layout.service';

jest.mock('../../../src/utils/sysop-page-text.util', () => ({ boardSysopName: () => 'Byte Bandit' }));

let tmp = '';
let previousDataDir: string;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'empty-dir-'));
  fs.mkdirSync(path.join(tmp, 'Conf1'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'Conf1', 'DIR1'), '\n');
  // DIR2 is a directory, not a file: it exists and will not read.
  fs.mkdirSync(path.join(tmp, 'Conf1', 'DIR2'));
  fs.writeFileSync(path.join(tmp, 'Conf1.info'), 'NDIRS=2\n');
  previousDataDir = config.get('dataDir');
  config.set('dataDir', tmp);
  resetFileViewLayoutCache();
});

afterAll(() => {
  config.set('dataDir', previousDataDir);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* noop */ }
  resetFileViewLayoutCache();
});

test('an empty DIR file lists nothing; an unreadable one is express.e\'s file-list error', async () => {
  const wire: string[] = [];
  const session: any = {
    currentConf: 1, screenWidth: 80, screenHeight: 25, terminalType: 'ansi',
    user: { id: 1, username: 'sysop', secLevel: 255, newSinceDate: new Date(2026, 0, 1) }, tempData: {},
  };
  const socket: any = {
    session, id: 'empty-dir',
    emit: (event: string, payload: any) => { if (event === 'ansi-output' && typeof payload === 'string') wire.push(payload); return true; },
    on: () => socket, once: () => socket, off: () => socket, removeListener: () => socket, removeAllListeners: () => socket,
  };

  await FileListingHandler.handleFileList(socket, session, 'A', false);
  const said = wire.join('');

  expect(said).not.toContain('No files in this directory');
  expect(said).not.toContain('Could not read directory');
  expect(said).toContain('\r\nThere is a problem with File listings, please tell Byte Bandit\r\n\r\n');
});
