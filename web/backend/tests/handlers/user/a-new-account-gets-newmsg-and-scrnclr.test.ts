// @ts-nocheck
/**
 * A NEW ACCOUNT CARRIES THE FLAGS AND FIELDS express.e GIVES IT (30270-30284, 30449).
 *
 * initNewUser/createNewAccount: userFlags:=USER_NEWMSG, OR USER_SCRNCLR when
 * the caller answers Y to "Screen Clears after Messages", and
 * userData.protocol:="Z". The port wrote userFlags 0 and protocol 0.
 * Drives the real handleConfirmInput into user.keys / user.data on disk.
 *
 * (Boilerplate below follows a-new-account-is-written-by-the-one-serializer.)
 * OLD HEADER:
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
const { UserFlag } = require('../../../src/constants/express-flags');
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


async function register(name: string, screenClear: boolean) {
  users.clear(); // the mock db keys every row by id 7
  const writeUserFiles = jest.spyOn(userFileManager, 'writeUserFiles');
  writeUserFiles.mockClear();
  const socket = { id: 's', emit: jest.fn() };
  const session = {
    state: BBSState.REGISTERING,
    subState: LoggedOnSubState.NEW_USER_CONFIRM,
    nodeId: 1,
    inputBuffer: '',
    newUserData: { username: name, location: 'Uprough', phone: '555-1234', email: '', password: 'secret', realname: '', screenClear },
  };
  await handleConfirmInput(socket, session, 'Y');
  expect(writeUserFiles).toHaveBeenCalledTimes(1);
  const slot = writeUserFiles.mock.calls[0][1] as number;
  const keys = fs.readFileSync(path.join(dataDir, 'user.keys'));
  const data = fs.readFileSync(path.join(dataDir, 'user.data'));
  // UserKeys: userName[31] pad number(4) newUser pad oldUpCPS oldDnCPS -> userFlags INT at 42.
  const keysAt = (slot - 1) * 56;
  const dataAt = (slot - 1) * 232;
  return { flags: keys.readInt16BE(keysAt + 42), protocol: data[dataAt + 228] };
}

test('a caller who answers N gets USER_NEWMSG only, and protocol Z, on disk', async () => {
  const r = await register('NOCLR', false);
  expect(r.flags).toBe(UserFlag.NEWMSG);
  expect(r.protocol).toBe(0x5a);
});

test('a caller who answers Y gets USER_NEWMSG and USER_SCRNCLR on disk', async () => {
  const r = await register('CLRME', true);
  expect(r.flags).toBe(UserFlag.NEWMSG | UserFlag.SCRNCLR);
});
