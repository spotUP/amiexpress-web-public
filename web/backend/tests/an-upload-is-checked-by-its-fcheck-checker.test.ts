/**
 * One reachability test: an infected upload, through the entry the web/Zmodem
 * socket path uses (processBatchFile), is refused with the checker's own line
 * shown to the uploader (express.e:18581-18590 checkFileExternal +
 * displayOutPutofTest, 19364-19369 the failure branch).
 *
 * The checker is a shell script that leaves a sentinel, prints an amiscan -bbs
 * style line and exits 1. The verdict logic itself is tested where it lives:
 * tests/utils/file-checker-error-strings.test.ts.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import AdmZip = require('adm-zip');

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
(globalThis as any).__fcheckMockDb = mockDb;
jest.mock('../src/database', () => ({
  db: new Proxy({} as any, { get: (_target, prop) => (globalThis as any).__fcheckMockDb[prop] }),
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
import { clearFileCheckerCache } from '../src/utils/file-test.util';

describe('an upload is checked by the FCheck checker for its extension', () => {
  let dataDir: string;
  let restoreConfig: () => void;
  let playpenFile: string;
  let sentinel: string;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-fcheck-'));
    const original = config.get.bind(config);
    const spy = jest.spyOn(config, 'get')
      .mockImplementation((key: string) => (key === 'dataDir' ? dataDir : original(key as never)));
    restoreConfig = () => spy.mockRestore();
    setStorageContext(null);
    clearFileCheckerCache();

    fs.mkdirSync(path.join(dataDir, 'Conf1', 'Files'), { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'Conf1', 'DIR1'), '');
    const playpen = path.join(dataDir, 'Node1', 'Playpen');
    fs.mkdirSync(playpen, { recursive: true });
    const zip = new AdmZip();
    zip.addFile('FILE_ID.DIZ', Buffer.from('A DEMO'));
    playpenFile = path.join(playpen, 'DEMO.ZIP');
    zip.writeZip(playpenFile);

    sentinel = path.join(dataDir, 'checker-ran');
    const script = path.join(dataDir, 'virus-check.sh');
    fs.writeFileSync(
      script,
      `#!/bin/sh\nprintf ran > '${sentinel}'\necho "DEMO.ZIP: infected (Test virus)"\nexit 1\n`,
      { mode: 0o755 },
    );
    fs.mkdirSync(path.join(dataDir, 'FCheck'));
    fs.writeFileSync(
      path.join(dataDir, 'FCheck', 'ZIP.info'),
      `CHECKER=${script}\nERROR.1=infected\nERROR.2=corrupted\n`,
    );
  });

  afterEach(() => {
    restoreConfig();
    clearFileCheckerCache();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  test('an infected file is held and the uploader reads the checker\'s line', async () => {
    const out: string[] = [];
    const session: any = {
      user: { id: 1, username: 'spot', securityFlags: 'T'.repeat(100), secLibrary: 0 },
      currentConf: 1,
      nodeId: 1,
      subState: 'upload_in_progress',
      tempData: {
        uploadMode: true,
        fileArea: { id: 1, conferenceId: 1, dirNumber: 1, name: 'Conf1 - Dir 1', dlPath: 'BBS:Conf1/Files/', ulPath: 'BBS:Conf1/Files/' },
        uploadSessionId: 'sess-1',
        uploadBatch: [{ filename: 'DEMO.ZIP', description: '', isPrivate: false }],
        uploadCount: 1, currentUploadIndex: 0, uploadStartTime: Date.now(),
        webUploadMode: true, pendingZmodemFiles: [],
      },
    };

    await processBatchFile(
      { id: 'socket-fcheck', emit: (_event: string, text: string) => { out.push(String(text)); return true; } } as any,
      session,
      { filename: 'DEMO.ZIP', originalname: 'DEMO.ZIP', size: fs.statSync(playpenFile).size, path: playpenFile },
      config,
    );

    const screen = out.join('');
    expect(fs.existsSync(sentinel)).toBe(true);
    expect(screen).toContain('DEMO.ZIP: infected (Test virus)');
    expect(screen).toContain('Requires review, possibly bad format');
    expect(screen).not.toContain('Tested Ok');
  });
});
