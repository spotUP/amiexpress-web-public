/**
 * express.e's nodeWorkDir is the caller's own node (`BBS:Node<n>/Work/`):
 * OutPut_Of_Test and a checker's scratch files live there, so two nodes
 * checking at once do not overwrite each other. The socket upload path handed
 * testFile Node0/Work whatever node the caller was on.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

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
(globalThis as any).__workDirMockDb = mockDb;
jest.mock('../src/database', () => ({
  db: new Proxy({} as any, { get: (_t, prop) => (globalThis as any).__workDirMockDb[prop] }),
}));
jest.mock('../src/server/database-helpers', () => ({ callersLog: jest.fn(async () => undefined) }));
jest.mock('../src/services/post-upload.service', () => ({ runPostUpload: jest.fn(async () => undefined) }));
jest.mock('../src/handlers/command-execution.handler', () => ({
  hasSysCommand: () => false,
  runSysCommandInFlow: jest.fn(async () => -1),
}));
jest.mock('../src/utils/file-test.util', () => ({
  ...jest.requireActual('../src/utils/file-test.util'),
  testFile: jest.fn(async () => 'success'),
}));
jest.mock('../src/utils/file-diz.util', () => ({
  ...jest.requireActual('../src/utils/file-diz.util'),
  extractAndReadDiz: jest.fn(async () => null),
}));

import { processBatchFile } from '../src/server/file-socket-handlers';
import { setStorageContext } from '../src/storage/storage-context';
import { config } from '../src/config';
import { testFile } from '../src/utils/file-test.util';

describe('an upload is tested in its own node\'s Work directory', () => {
  let dataDir: string;
  let restoreConfig: () => void;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-workdir-'));
    const original = config.get.bind(config);
    const spy = jest.spyOn(config, 'get')
      .mockImplementation((key: string) => (key === 'dataDir' ? dataDir : original(key as never)));
    restoreConfig = () => spy.mockRestore();
    setStorageContext(null);
    (testFile as jest.Mock).mockClear();
    fs.mkdirSync(path.join(dataDir, 'Conf1', 'Files'), { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'Conf1', 'DIR1'), '');
    fs.mkdirSync(path.join(dataDir, 'Node3', 'Playpen'), { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'Node3', 'Playpen', 'X.TXT'), 'hello');
  });

  afterEach(() => {
    restoreConfig();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('passes testFile Node3/Work for a caller on node 3', async () => {
    const playpenFile = path.join(dataDir, 'Node3', 'Playpen', 'X.TXT');
    const session: any = {
      user: { id: 1, username: 'spot', securityFlags: 'T'.repeat(100), secLibrary: 0 },
      currentConf: 1,
      nodeId: 3,
      subState: 'upload_in_progress',
      tempData: {
        uploadMode: true,
        fileArea: { id: 1, conferenceId: 1, dirNumber: 1, name: 'Conf1 - Dir 1', dlPath: 'BBS:Conf1/Files/', ulPath: 'BBS:Conf1/Files/' },
        uploadSessionId: 'sess-wd',
        uploadBatch: [{ filename: 'X.TXT', description: '', isPrivate: false }],
        uploadCount: 1, currentUploadIndex: 0, uploadStartTime: Date.now(),
        webUploadMode: true, pendingZmodemFiles: [],
        skipDizExtraction: true,
      },
    };
    await processBatchFile(
      { id: 'socket-wd', emit: () => true } as any,
      session,
      { filename: 'X.TXT', originalname: 'X.TXT', size: 5, path: playpenFile },
      config,
    );
    expect(testFile).toHaveBeenCalledTimes(1);
    expect((testFile as jest.Mock).mock.calls[0][1]).toBe(path.join(dataDir, 'Node3', 'Work'));
  });
});
