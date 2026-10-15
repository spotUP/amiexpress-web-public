/**
 * Uploads the caller had not described when the line dropped go to
 * LCFILES, and come back at the next auto-rejoin to be described
 * (express.e handleLCFiles 19740-19774, RESULT_LCFILES 19358-19489,
 * scanHoldDesc 17477-17522 from joinConf 5067). The port had neither half:
 * the files sat in the playpen until the next upload swept them into
 * PartUpload as partials.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lcfiles-'));
process.env.SKIP_DB_INIT = '1';
process.env.BBS_DATA_DIR = root;
process.env.BBS_ROOT = root;

const received: string[][] = [];
jest.mock('../../src/handlers/commands/user-commands.handler', () => ({
  fileReceivedUploads: jest.fn(async (_s: any, session: any, files: string[]) => {
    received.push(files);
    const { endUpload } = require('../../src/services/upload-end.service');
    endUpload(session, 'success', () => undefined);
  }),
}));
jest.mock('../../src/handlers/command.handler', () => ({
  processCommand: jest.fn(async () => 'SUCCESS'),
  advanceDisplayFlow: jest.fn(async () => {}),
}));
jest.mock('../../src/handlers/screen.handler', () => ({
  displayScreen: jest.fn(async () => false),
  doPause: jest.fn(),
  checkScreenClear: jest.fn(),
  runQueuedScreenCommands: jest.fn(async () => {}),
}));
jest.mock('../../src/utils/message-pointers.util', () => ({
  loadConferenceAccount: jest.fn(),
  saveConferenceAccount: jest.fn(),
  getMailStatFile: jest.fn(async () => ({ lowestKey: 1, highMsgNum: 1, lowestNotDel: 0 })),
  loadMsgPointers: jest.fn(async () => ({ lastNewReadConf: 0, lastMsgReadConf: 0, scanFlags: 0 })),
  saveMsgPointers: jest.fn(async () => {}),
  validatePointers: jest.fn((p: any) => p),
}));
jest.mock('../../src/utils/download-logging.util', () => ({
  ...jest.requireActual('../../src/utils/download-logging.util'),
  writeToCallersLog: jest.fn(async () => undefined),
}));

import { LoggedOnSubState } from '../../src/constants/bbs-states';
import { fileLostCarrierUploads } from '../../src/services/lost-carrier-files.service';
import { joinConference, setConferences, setMessageBases, setHelpers, setConstants, FORCE_MAILSCAN_SKIP } from '../../src/handlers/operations/conference.handler';
import { flushOutput } from '../../src/utils/output.util';
import { config } from '../../src/config';

const playpen = path.join(root, 'Node3', 'Playpen');
const lcDir = path.join(root, 'Conf4', 'LCFILES');

const savedDataDir = config.get('dataDir');

beforeAll(() => {
  config.set('dataDir', root);
  fs.mkdirSync(playpen, { recursive: true });
  fs.mkdirSync(path.join(root, 'Conf4'), { recursive: true });
  setConferences([{ id: 1, name: 'Amiga' }, { id: 2, name: 'C64' }, { id: 3, name: 'Console' }, { id: 4, name: 'Requests' }] as any);
  setMessageBases([{ id: 4, conferenceId: 4, name: 'Main' }] as any);
  setConstants({ SCREEN_BULL: 'BULL', SCREEN_NODE_BULL: 'NODE_BULL', SCREEN_CONF_BULL: 'CONF_BULL', LoggedOnSubState } as any);
  setHelpers({ callersLog: async () => {}, loadFlagged: async () => {}, loadHistory: async () => {} } as any);
});

afterAll(() => {
  config.set('dataDir', savedDataDir);
  fs.rmSync(root, { recursive: true, force: true });
});

const caller = (subState: LoggedOnSubState, tempData: any = {}): any => ({
  state: 'loggedon', subState, nodeId: 3, currentConf: 4,
  user: { id: 1, username: 'spot', slotNumber: 7, secLevel: 20, securityFlags: '', confAccess: 'XXXX' },
  tempData,
});

test('a dropped line files the undescribed uploads in LCFILES, and the next auto-rejoin brings them back', async () => {
  // Received whole, the first one at its description prompt.
  fs.writeFileSync(path.join(playpen, 'DEMO.LHA'), Buffer.alloc(2048));
  fs.writeFileSync(path.join(playpen, 'TUNE.MOD'), Buffer.alloc(100));
  const dropped = caller(LoggedOnSubState.UPLOAD_DESC_INPUT, {
    uploadMode: true,
    currentUploadedFile: { filename: 'DEMO.LHA', path: path.join(playpen, 'DEMO.LHA'), size: 2048 },
    pendingZmodemFiles: [{ name: 'TUNE.MOD', path: path.join(playpen, 'TUNE.MOD') }],
  });

  expect(await fileLostCarrierUploads(dropped)).toBe(2);

  expect(fs.readdirSync(playpen)).toEqual([]);
  expect(fs.readdirSync(lcDir).sort()).toEqual(['7.lc', 'DEMO.LHA', 'TUNE.MOD']);
  const list = fs.readFileSync(path.join(lcDir, '7.lc'), 'latin1');
  expect(list).toMatch(/^DEMO\.LHA     N   2048  \d\d-\d\d-\d\d  LOST CARRIER spot\n/);
  expect(list).toMatch(/\nTUNE\.MOD     N    100  \d\d-\d\d-\d\d  LOST CARRIER spot\n$/);

  // The next call: the auto-rejoin.
  const back = caller(LoggedOnSubState.AUTO_REJOIN);
  const said: string[] = [];
  const socket: any = { id: `lc-${Math.random()}`, emit: (_e: string, d: unknown) => { said.push(String(d)); return true; }, on() {}, off() {}, removeListener() {} };

  await joinConference(socket, back, 4, 4, false, true, FORCE_MAILSCAN_SKIP);
  flushOutput(socket);

  expect(said.join('')).toContain('Preparing Lost Carrier File(s) for File Description(s)\r\n\r\n\tPrepared!\tPrepared!');
  expect(received).toEqual([[path.join(playpen, 'DEMO.LHA'), path.join(playpen, 'TUNE.MOD')]]);
  expect(fs.readdirSync(lcDir)).toEqual([]);
});

test('nothing waiting for a description: nothing is filed', async () => {
  fs.writeFileSync(path.join(playpen, 'PART.LHA'), Buffer.alloc(10));
  expect(await fileLostCarrierUploads(caller(LoggedOnSubState.FILES_UPLOAD))).toBe(0);
  expect(fs.existsSync(path.join(playpen, 'PART.LHA'))).toBe(true);
});
