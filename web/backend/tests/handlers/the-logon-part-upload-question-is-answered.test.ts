/**
 * At logon, "View them (Y/N)?" waits for the answer (express.e partUploadOK,
 * 17611-17634, and confScan 28124-28142). The port printed the question and
 * moved on: no key was read, N never said "No!", and Y never reached the
 * upload whose resume step offers the part files back.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/handlers/operations/conference.handler', () => ({
  joinConference: jest.fn(async () => true),
  FORCE_MAILSCAN_SKIP: 1,
}));
jest.mock('../../src/handlers/commands/user-commands.handler', () => ({
  uploadaFileAndWait: jest.fn(async () => 'success'),
}));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { config } from '../../src/config';
import { performPartialUploadCheck } from '../../src/handlers/message/message-scan.handler';
import { feedInputWaiter } from '../../src/utils/await-input';
import { flushOutput } from '../../src/utils/output.util';
import { uploadaFileAndWait } from '../../src/handlers/commands/user-commands.handler';

let root = '';
let previous = '';
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'part-upload-'));
  previous = config.get('dataDir');
  config.set('dataDir', root);
  fs.mkdirSync(path.join(root, 'Conf1', 'PartUpload'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Conf1', 'PartUpload', 'GAME.LHA@5'), 'half');
  (uploadaFileAndWait as jest.Mock).mockClear();
});
afterEach(() => {
  config.set('dataDir', previous);
  fs.rmSync(root, { recursive: true, force: true });
});

async function answer(key: string) {
  const wire: string[] = [];
  const socket: any = {
    id: `part-${Math.random().toString(36).slice(2)}`,
    emit: (_e: string, data: unknown) => { if (typeof data === 'string') wire.push(data); return true; },
    on: () => socket,
  };
  const session: any = { nodeId: 1, currentConf: 1, user: { id: 'u5', slotNumber: 5, confAccess: 'X' } };
  const run = performPartialUploadCheck(socket, session, 1, session.user);
  await new Promise((r) => setImmediate(r));
  expect(feedInputWaiter(socket, session, key)).toBe(true);
  await run;
  flushOutput(socket);
  return wire.join('');
}

test('N says No! and starts no upload', async () => {
  const out = await answer('n');
  expect(out).toContain('There are some incompleted uploads of yours\r\nView them (Y/N)? No!\r\n');
  expect(uploadaFileAndWait).not.toHaveBeenCalled();
});

test('Y goes to the upload, which offers the part files back', async () => {
  await answer('Y');
  expect(uploadaFileAndWait).toHaveBeenCalledTimes(1);
});
