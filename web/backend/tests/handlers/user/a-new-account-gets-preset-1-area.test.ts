// @ts-nocheck
/**
 * A NEW ACCOUNT GETS PRESET 1'S AREA - THE CONFERENCE ACCESS EXPRESS.E WRITES.
 *
 * express.e builds a new caller's record in initNewUser (express.e:30432):
 * memClear, then applyPreset(Preset.1) - `Node<n>/PRESET.1` when the node has
 * one, else `Access/PRESET.1` (30438-30443, paths tooltypes.e:95-100) - and
 * applyPreset copies PRESET.AREA into user.conferenceAccess, nine characters
 * and a NUL (29358-29369). Nothing pads it to the conference count: an area
 * name grants through `Access/AREA.<name>.info`'s Conf.<n> tooltypes
 * (checkConfAccess, 8499-8512), so a conference added later is granted by
 * adding it to the area.
 *
 * The port gave every new caller NEW_USER_CONF_ACCESS instead - `XXX` on the
 * live board, conferences 1-3 only - while a boot step padded a DATABASE copy
 * of that setting that nothing reads (db-disk audit 2026-10-04, §7 (1)). So a
 * new caller could not see any conference past the third.
 *
 * Driven through the real `handleConfirmInput` (the caller typing Y at the
 * summary) into a temporary board, reading the user.data record back.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'new-account-preset-'));
process.env.BBS_DATA_DIR = dataDir;

jest.mock('../../../src/index', () => ({
  BBSState: require('../../../src/constants/bbs-states').BBSState,
  LoggedOnSubState: require('../../../src/constants/bbs-states').LoggedOnSubState,
}));
jest.mock('../../../src/handlers/screen.handler', () => ({
  displayScreen: jest.fn().mockResolvedValue(false),
  doPause: jest.fn(),
  handlePaginatedScreenInput: jest.fn(),
  parseMciCodes: jest.fn().mockResolvedValue({ parsed: '', inlineEmitted: true }),
}));
jest.mock('../../../src/handlers/command-execution.handler', () => ({
  runSysCommand: jest.fn().mockResolvedValue(-1),
}));
jest.mock('../../../src/services/bbs-event-emitter', () => ({ emitUserLogin: jest.fn() }));
jest.mock('../../../src/services/batch-scheduler', () => ({ runExecuteOn: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../../src/services/mail-notification.service', () => ({ mailOnNewUser: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../../src/services/webhook.service', () => ({
  webhookService: { sendWebhook: jest.fn().mockResolvedValue(undefined) },
  WebhookTrigger: { NEW_USER: 'NEW_USER' },
}));
jest.mock('../../../src/utils/acs.util', () => ({ initializeSecurity: jest.fn() }));
jest.mock('../../../src/services/config.service', () => ({
  ConfigService: jest.fn().mockImplementation(() => ({ getSystemConfig: jest.fn().mockResolvedValue(null) })),
}));

// tests/setup.ts has already loaded the user managers against the worker's
// board; a fresh registry builds them (and everything below) on this one.
jest.resetModules();
const { BBSState, LoggedOnSubState } = require('../../../src/constants/bbs-states');
const { config } = require('../../../src/config');
const { userFileManager } = require('../../../src/services/UserFileManager');
const { UserRepository } = require('../../../src/database/user-repository');
const { handleConfirmInput, setNewUserDependencies } = require('../../../src/handlers/user/new-user.handler');

/** The rows registration creates, and the real appendUserToDisk over them. */
const users = new Map<string, any>();
const repo = Object.create(UserRepository.prototype);
repo.getUserById = async (id: any) => [...users.values()].find((u: any) => u.id === id) ?? null;
repo.run = jest.fn((_sql: string, [slot, id]: any[]) => {
  const row = [...users.values()].find((u: any) => u.id === id);
  if (row) row.slotNumber = slot;
});
const db = {
  createUser: jest.fn(async (data: any) => { const id = users.size + 1; users.set(data.username, { id, ...data }); return id; }),
  getUserByUsername: jest.fn(async (name: string) => users.get(name) ?? null),
  getUserById: (id: any) => repo.getUserById(id),
  appendUserToDisk: (id: any) => repo.appendUserToDisk(id),
  getConfigRepository: () => ({ getSystemConfig: () => null }),
};

let getConfig: jest.SpyInstance;
const { applyTooltypes } = require('../../../src/utils/info-file.util');

beforeAll(() => {
  fs.mkdirSync(path.join(dataDir, 'Node1'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'Node1', 'script57600'), 'What is your real name: ~\r\n', 'latin1');
  fs.mkdirSync(path.join(dataDir, 'Access'), { recursive: true });
  // The board's own new-user setting says three conferences.
  applyTooltypes(path.join(dataDir, 'bbsConfig.info'), [['NEW_USER_CONF_ACCESS', 'XXX']]);
  getConfig = jest.spyOn(config, 'getConfig').mockReturnValue({ dataDir } as any);
  setNewUserDependencies({ db, sessions: new Map() });
});

afterAll(() => {
  getConfig.mockRestore();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

let n = 0;
async function register(): Promise<any> {
  n += 1;
  const username = `TESTER${n}`;
  const socket = { id: `s${n}`, emit: jest.fn() };
  const session = {
    state: BBSState.REGISTERING,
    subState: LoggedOnSubState.NEW_USER_CONFIRM,
    nodeId: 1,
    inputBuffer: '',
    newUserData: { username, location: 'Uprough', phone: '555-1234', email: '', password: 'secret', realname: '' },
  };
  await handleConfirmInput(socket, session, 'Y');
  const row = users.get(username);
  return userFileManager.readUserBySlot(row.slotNumber);
}

test('a new caller gets Access/PRESET.1 area on disk, not the three-conference XXX', async () => {
  applyTooltypes(path.join(dataDir, 'Access', 'PRESET.1.info'), [['PRESET.AREA', 'Elite'], ['PRESET.ACCESS', '50']]);

  const onDisk = await register();
  expect(onDisk.confAccess).toBe('Elite');
});

test('the rest of Preset.1 reaches the record too: access, ratio, time, rejoin, daily bytes', async () => {
  // express.e:29360-29367 applyPreset, then 30447 timeTotal:=timeLimit. The
  // live board's own Preset.1 values; a daily byte limit past 32 bits wraps
  // as the Amiga's LONG does.
  applyTooltypes(path.join(dataDir, 'Access', 'PRESET.1.info'), [
    ['PRESET.AREA', 'Elite'], ['PRESET.ACCESS', '50'], ['PRESET.RATIO_TYPE', '0'], ['PRESET.RATIO', '0'],
    ['PRESET.DAILY_BYTE_LIMIT', '999999999999999'], ['PRESET.TIME_LIMIT', '999999999'], ['PRESET.CONFRJOIN', '2'],
  ]);
  const onDisk = await register();
  expect(onDisk.secLevel).toBe(50);
  expect(onDisk.timeLimit).toBe(999999999);
  expect(onDisk.autoRejoin).toBe(2); // the record's confRJoin
  expect(onDisk.byteLimit).toBe(Number(BigInt.asIntN(32, 999999999999999n)));
});

test('a node with its own PRESET.1 gives that area instead', async () => {
  applyTooltypes(path.join(dataDir, 'Node1', 'PRESET.1.info'), [['PRESET.AREA', 'Newcomer']]);
  try {
    const onDisk = await register();
    expect(onDisk.confAccess).toBe('Newcomer');
  } finally {
    fs.rmSync(path.join(dataDir, 'Node1', 'PRESET.1.info'));
  }
});

test('an area name longer than nine characters is cut to nine, as AstrCopy(...,10) does', async () => {
  applyTooltypes(path.join(dataDir, 'Access', 'PRESET.1.info'), [['PRESET.AREA', 'Membership']]);
  const onDisk = await register();
  expect(onDisk.confAccess).toBe('Membershi');
});

test('a board with no preset area takes NEW_USER_CONF_ACCESS from bbsConfig.info on disk', async () => {
  fs.rmSync(path.join(dataDir, 'Access', 'PRESET.1.info'));
  applyTooltypes(path.join(dataDir, 'bbsConfig.info'), [['NEW_USER_CONF_ACCESS', 'XX_X']]);
  const onDisk = await register();
  expect(onDisk.confAccess).toBe('XX_X');
});
