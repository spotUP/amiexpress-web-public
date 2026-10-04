// @ts-nocheck
/**
 * A NEW ACCOUNT'S user.data RECORD IS THE BOARD'S ONE SERIALIZER'S.
 *
 * Registration finished through UserRepository.appendUserToDisk, which wrote
 * the record with a second serializer of its own (UserDatabaseManager
 * userToStruct/userToKeys/userToMisc/appendUser): all nine conferences
 * instead of the access the registration granted (express.e:29369
 * applyPreset copies PRESET.AREA), no phone number, conference rejoin 0,
 * today's calls 0 - a different record from the one every later save of the
 * same account writes.
 *
 * This drives the real `handleConfirmInput` (the caller typing Y at the
 * summary) through the real appendUserToDisk into a temporary BBS root, and
 * reads the bytes back: user.data and user.keys at the new slot must be
 * byte-identical to UserFileManager.userRecord / userKeysRecord for the same
 * user.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'new-account-'));
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
  createUser: jest.fn(async (data: any) => { users.set(data.username, { id: 7, ...data }); return 7; }),
  getUserByUsername: jest.fn(async (name: string) => users.get(name) ?? null),
  getUserById: (id: any) => repo.getUserById(id),
  appendUserToDisk: (id: any) => repo.appendUserToDisk(id),
  getConfigRepository: () => ({ getSystemConfig: () => null }),
};

let getConfig: jest.SpyInstance;

beforeAll(() => {
  // A questionnaire, so the flow stops at its first question - after the
  // account is made (express.e:30096-30112), before anything else runs.
  fs.mkdirSync(path.join(dataDir, 'Node1'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'Node1', 'script57600'), 'What is your real name: ~\r\n', 'latin1');
  getConfig = jest.spyOn(config, 'getConfig').mockReturnValue({ dataDir } as any);
  setNewUserDependencies({ db, sessions: new Map() });
});

afterAll(() => {
  getConfig.mockRestore();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('a caller who registers gets the record UserFileManager.userRecord writes, byte for byte', async () => {
  const writeUserFiles = jest.spyOn(userFileManager, 'writeUserFiles');
  const socket = { id: 's', emit: jest.fn() };
  const session = {
    state: BBSState.REGISTERING,
    subState: LoggedOnSubState.NEW_USER_CONFIRM,
    nodeId: 1,
    inputBuffer: '',
    newUserData: { username: 'TESTER', location: 'Uprough', phone: '555-1234', email: '', password: 'secret', realname: '' },
  };

  await handleConfirmInput(socket, session, 'Y');

  // The sentinel: the record went through the one writer, once, at slot 1.
  expect(writeUserFiles).toHaveBeenCalledTimes(1);
  const [user, slot] = writeUserFiles.mock.calls[0];
  expect(slot).toBe(1);
  expect(user.username).toBe('TESTER');

  const data = fs.readFileSync(path.join(dataDir, 'user.data'));
  const keys = fs.readFileSync(path.join(dataDir, 'user.keys'));
  expect(data.length).toBe(232);
  expect(keys.length).toBe(56);
  expect(fs.readFileSync(path.join(dataDir, 'user.misc')).length).toBe(248);
  expect(data.equals(userFileManager.userRecord(user, 1))).toBe(true);
  expect(keys.equals(userFileManager.userKeysRecord(user, 1))).toBe(true);
  // The two fields the old writer lost, read off the bytes.
  expect(data.subarray(70, 83).toString('latin1').replace(/\0+$/, '')).toBe('555-1234');
  expect(users.get('TESTER').slotNumber).toBe(1);
});
