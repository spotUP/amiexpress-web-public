/**
 * AN UPLOAD RAISES WHAT THE CALLER MAY DOWNLOAD TODAY.
 *
 * express.e:19524-19532, at the end of uploadaFile: the bytes the protocol
 * received (uTBT) are added to loggedOnUser.todaysBytesLimit and bytesADL,
 * kilobytes under CREDITBYKB, ONCE for the whole upload, and not at all
 * when the last file was lost to a dropped carrier (lcfile) or the caller
 * has no daily limit (bytesADL=$7fffffff). The port booked the upload to
 * the account and nothing to today's limit, so uploading never let a
 * caller at their daily limit take another file. Driven through
 * processBatchFile, the filing every BBS upload (web and Zmodem) runs, to
 * the end of the upload (runPostUpload).
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
jest.mock('../src/services/upload-end.service', () => ({ endUpload: jest.fn() }));
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

  function makeSession(user: Record<string, unknown>, pendingZmodemFiles: Array<{ name: string; path: string }>) {
    return {
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
        webUploadMode: true, pendingZmodemFiles,
      },
    } as any;
  }

  let shown: string[] = [];

  async function fileFirst(session: any) {
    shown = [];
    await processBatchFile(
      { id: 'socket-credit', emit: (_e: string, d: unknown) => { if (typeof d === 'string') shown.push(d); return true; } } as any, session,
      { filename: 'DEMO.TXT', originalname: 'DEMO.TXT', size: 2_000_000, path: playpenFile },
      config,
    );
    return session.user;
  }

  /** A one-file upload, filed and ended. */
  async function upload(user: Record<string, unknown>) {
    return fileFirst(makeSession(user, []));
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

  // The lcfile edge (19530): the carrier dropped with the batch's last file
  // unfinished. The upload never ends - the logoff files the rest to
  // LCFILES - so the files already filed earn nothing either.
  test('a batch cut off by a dropped carrier earns no upload credit', async () => {
    const second = path.join(dataDir, 'Node1', 'Playpen', 'PART2.TXT');
    fs.writeFileSync(second, Buffer.alloc(500, 0x42));
    const session = makeSession({ byteLimit: 1_000_000, todaysBytesLimit: 1_000_000 }, [{ name: 'PART2.TXT', path: second }]);
    await fileFirst(session);
    // The first file is filed, the second waits for its description...
    expect(session.user.uploads).toBe(1);
    // ...and the line drops: no credit was given per file.
    expect(session.user.todaysBytesLimit).toBe(1_000_000);
  });

  // express.e:19535 displayULStats at the end of the upload.
  test('the end of an upload shows what the caller may download today', async () => {
    await upload({ byteLimit: 1_000_000, todaysBytesLimit: 1_000_000, dailyBytesDld: 250_000, uploads: 4 });
    const out = shown.join('');
    expect(out).toContain('Number of Uploads        : 5');
    expect(out).toContain('Todays Bytes Available   : 2750000');
  });
});
