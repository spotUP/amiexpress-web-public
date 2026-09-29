/**
 * "i edited my sent line in sent now ... but i dont see it under the file_id
 * in the file listing in the file i uploaded" (sysop, 2026-09-29).
 *
 * express.e:19573-19600: after a file lands, the board runs its system
 * command EXAMINE (then EXAMINE1, EXAMINE2 ...) on it, and if the door left
 * `<nodeWorkDir><filename>` that becomes the description. File Description
 * (MST-FD11) is that door - it pulls the FILE_ID.DIZ, strips ads and adds the
 * uploader's tagline there. The upload path only ran the built-in FILE_ID
 * reader, so the door never ran.
 *
 * Driven through `processBatchFile`, the function the ZMODEM/web pipeline
 * calls once the bytes are in the playpen (the mock set of
 * upload-to-dir1-regression.test.ts); only the door itself is a stand-in.
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
(globalThis as any).__examineMockDb = mockDb;
jest.mock('../src/database', () => ({
  db: new Proxy({} as any, { get: (_target, prop) => (globalThis as any).__examineMockDb[prop] }),
}));
jest.mock('../src/server/database-helpers', () => ({ callersLog: jest.fn(async () => undefined) }));
jest.mock('../src/services/post-upload.service', () => ({ runPostUpload: jest.fn(async () => undefined) }));

/** The board's system commands, as the stand-in board has them. */
const sysCommands = new Set<string>();
/** Every system command run, with what it was given. */
const ran: Array<{ cmd: string; params: string; subState: unknown }> = [];
/** What the stand-in EXAMINE door writes, and where. */
let doorWrites: { file: string; text: string } | null = null;
jest.mock('../src/handlers/command-execution.handler', () => ({
  hasSysCommand: (name: string) => sysCommands.has(name.toUpperCase()),
  // The flow's variant: the door's exit must not draw the menu mid-upload.
  runSysCommandInFlow: jest.fn(async (_socket: any, session: any, cmd: string, params: string) => {
    ran.push({ cmd, params, subState: session.subState });
    if (!sysCommands.has(cmd.toUpperCase())) return -1;
    if (doorWrites) fs.writeFileSync(doorWrites.file, doorWrites.text, 'latin1');
    session.subState = 'display_menu'; // what a door exit does
    return 0;
  }),
}));

import { processBatchFile } from '../src/server/file-socket-handlers';
import { setStorageContext } from '../src/storage/storage-context';
import { config } from '../src/config';

describe('an upload runs the board\'s EXAMINE door', () => {
  let dataDir: string;
  let restoreConfig: () => void;
  let confDir: string;
  let playpenFile: string;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-examine-'));
    const original = config.get.bind(config);
    const spy = jest.spyOn(config, 'get')
      .mockImplementation((key: string) => (key === 'dataDir' ? dataDir : original(key as never)));
    restoreConfig = () => spy.mockRestore();
    setStorageContext(null);
    sysCommands.clear();
    ran.length = 0;
    doorWrites = null;

    confDir = path.join(dataDir, 'Conf1');
    fs.mkdirSync(path.join(confDir, 'Files'), { recursive: true });
    fs.writeFileSync(path.join(confDir, 'DIR1'), '');
    const playpen = path.join(dataDir, 'Node1', 'Playpen');
    fs.mkdirSync(playpen, { recursive: true });
    const zip = new AdmZip();
    zip.addFile('FILE_ID.DIZ', Buffer.from('THE BUILT-IN READER FOUND THIS'));
    playpenFile = path.join(playpen, 'DEMO.ZIP');
    zip.writeZip(playpenFile);
  });

  afterEach(() => {
    restoreConfig();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  async function upload() {
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
      { id: 'socket-examine', emit: () => true } as any, session,
      { filename: 'DEMO.ZIP', originalname: 'DEMO.ZIP', size: fs.statSync(playpenFile).size, path: playpenFile },
      config,
    );
    return session;
  }

  test('the description the door leaves in the work directory is what gets listed', async () => {
    sysCommands.add('EXAMINE');
    doorWrites = {
      file: path.join(dataDir, 'Node1', 'Work', 'DEMO.ZIP'),
      text: 'A release, ads stripped\n[-------( spot )---]\n',
    };

    const session = await upload();

    // EXAMINE, told the file the way a door opens it, then EXAMINE1, which the
    // board does not have - express.e's chain ends there.
    expect(ran.map((r) => [r.cmd, r.params])).toEqual([
      ['EXAMINE', 'BBS:Node1/Playpen/DEMO.ZIP'],
      ['EXAMINE1', 'BBS:Node1/Playpen/DEMO.ZIP'],
    ]);
    const dir1 = fs.readFileSync(path.join(confDir, 'DIR1'), 'latin1');
    expect(dir1).toContain('A release, ads stripped');
    expect(dir1).toContain('[-------( spot )---]');
    expect(dir1).not.toContain('THE BUILT-IN READER FOUND THIS');
    // The door's exit does not end the upload.
    expect(session.subState).not.toBe('display_menu');
  });

  test('a board with no EXAMINE door keeps the built-in FILE_ID.DIZ reader', async () => {
    await upload();

    expect(ran).toEqual([]);
    expect(fs.readFileSync(path.join(confDir, 'DIR1'), 'latin1')).toContain('THE BUILT-IN READER FOUND THIS');
  });
});
