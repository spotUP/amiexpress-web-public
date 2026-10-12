/**
 * AN UPLOAD RAISES WHAT THE CALLER MAY DOWNLOAD TODAY.
 *
 * express.e:19524-19532, at the end of uploadaFile: the bytes the protocol
 * received (uTBT) are added to loggedOnUser.todaysBytesLimit and bytesADL,
 * kilobytes under CREDITBYKB, unless the file went to LCFILES or the caller
 * has no daily limit (bytesADL=$7fffffff). The port booked the upload to
 * the account and nothing to today's limit, so uploading never let a
 * caller at their daily limit take another file. Driven through
 * processBatchFile, the filing every BBS upload (web and Zmodem) runs.
 * FTP's path (19684-19686) is in tests/ftp/upload-belongs-to-the-conference.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockDb = {
  query: jest.fn(async () => ({ rows: [] })),
  createFileEntry: jest.fn(async () => 1),
  recordLocation: jest.fn(),
  run: jest.fn(async () => undefined),
  getConfigRepository: () => ({ getNodeConfig: () => ({ sentby_files: false }) }),
  getConferences: jest.fn(async () => []),
  updateConference: jest.fn(async () => undefined),
  getConferenceById: jest.fn(async () => ({ id: 1, name: 'Conf1' })),
  getWebhooksByTrigger: jest.fn(async () => []),
};
(globalThis as any).__creditMockDb = mockDb;
jest.mock('../src/database', () => ({
  db: new Proxy({} as any, { get: (_target, prop) => (globalThis as any).__creditMockDb[prop] }),
}));
jest.mock('../src/server/database-helpers', () => ({ callersLog: jest.fn(async () => undefined) }));
jest.mock('../src/services/post-upload.service', () => ({ runPostUpload: jest.fn(async () => undefined) }));
jest.mock('../src/handlers/command-execution.handler', () => ({
  hasSysCommand: () => false,
  runSysCommandInFlow: jest.fn(async () => -1),
}));

import { processBatchFile } from '../src/server/file-socket-handlers';
import { setStorageContext } from '../src/storage/storage-context';
import { config } from '../src/config';
import { checkDownloadRatios } from '../src/utils/download-ratios.util';

describe('upload credit to today\'s limit (express.e:19524-19532)', () => {
  let dataDir: string;
  let restoreConfig: () => void;
  let playpenFile: string;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-credit-'));
    const original = config.get.bind(config);
    const spy = jest.spyOn(config, 'get')
      .mockImplementation((key: string) => (key === 'dataDir' ? dataDir : original(key as never)));
    restoreConfig = () => spy.mockRestore();
    setStorageContext(null);
    fs.mkdirSync(path.join(dataDir, 'Conf1', 'Files'), { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'Conf1', 'DIR1'), '');
    const playpen = path.join(dataDir, 'Node1', 'Playpen');
    fs.mkdirSync(playpen, { recursive: true });
    playpenFile = path.join(playpen, 'DEMO.TXT');
    fs.writeFileSync(playpenFile, Buffer.alloc(2_000_000, 0x41));
  });

  afterEach(() => {
    restoreConfig();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  async function upload(user: Record<string, unknown>) {
    const session: any = {
      user: { id: 1, username: 'spot', securityFlags: 'T'.repeat(100), secLibrary: 0, secLevel: 20, ...user },
      currentConf: 1,
      nodeId: 1,
      subState: 'upload_in_progress',
      tempData: {
        uploadMode: true,
        fileArea: { id: 1, conferenceId: 1, dirNumber: 1, name: 'Conf1 - Dir 1', dlPath: 'BBS:Conf1/Files/', ulPath: 'BBS:Conf1/Files/' },
        uploadSessionId: 'sess-1',
        uploadBatch: [{ filename: 'DEMO.TXT', description: 'a demo', isPrivate: false }],
        uploadCount: 1, currentUploadIndex: 0, uploadStartTime: Date.now(),
        webUploadMode: true, pendingZmodemFiles: [],
      },
    };
    await processBatchFile(
      { id: 'socket-credit', emit: () => true } as any, session,
      { filename: 'DEMO.TXT', originalname: 'DEMO.TXT', size: 2_000_000, path: playpenFile },
      config,
    );
    return session.user;
  }

  test('a 2 MB upload lets a caller at their 1 MB daily limit take a 1.5 MB file', async () => {
    const user = await upload({ byteLimit: 1_000_000, todaysBytesLimit: 1_000_000, dailyBytesDld: 1_000_000 });
    expect(user.todaysBytesLimit).toBe(3_000_000);
    const verdict = await checkDownloadRatios(user, [{ size: 1_500_000, isFree: false }]);
    expect(verdict.canDownload).toBe(true);
  });

  test('a caller with no daily limit stays unlimited', async () => {
    const user = await upload({ byteLimit: 0, todaysBytesLimit: 0 });
    expect(user.todaysBytesLimit).toBe(0);
  });
});
