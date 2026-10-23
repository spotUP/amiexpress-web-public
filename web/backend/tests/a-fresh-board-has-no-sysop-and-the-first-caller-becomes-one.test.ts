/**
 * SECURITY F4: a fresh board has NO sysop account (no seeded sysop/sysop,
 * level 255, known password). The first caller to register becomes sysop; the
 * second is an ordinary user.
 *
 * Two tests, each where the behaviour lives:
 *  1. a brand-new database has no sysop and no level >= 200 user, and the
 *     startup check (the same function index.ts calls) raises firstUserIsSysop;
 *  2. the real registration path (handleCommand -> confirm -> createAccountRecord)
 *     gives the first caller 255 and the second the board default. The
 *     sentinel is the "[SETUP] First user created" log line, which only the
 *     first-user branch prints.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../src/index', () => {
  const states = require('../src/constants/bbs-states');
  const noop = () => jest.fn();
  return {
    BBSState: states.BBSState,
    LoggedOnSubState: states.LoggedOnSubState,
    initializeSecurity: jest.fn(),
    setSecurityDependencies: noop(), setMessageCommandsDependencies: noop(), setDisplayFileCommandsDependencies: noop(),
    setPreferenceChatCommandsDependencies: noop(), setSystemCommandsDependencies: noop(), setNavigationCommandsDependencies: noop(),
    setAdvancedCommandsDependencies: noop(), setInfoCommandsDependencies: noop(), setUtilityCommandsDependencies: noop(),
    setMessageEntryDependencies: noop(), setSysopCommandsDependencies: noop(), setTransferMiscDependencies: noop(),
    setMessagingDependencies: noop(), setDatabaseDependencies: noop(), setCommandHandlerDependencies: noop(),
    setConfigDependencies: noop(), setDoorDependencies: noop(), setNodeServices: noop(), setServiceDependencies: noop(),
    setChatDependencies: noop(), setAmigaExports: noop(), setServerState: noop(), setAmigaDoorDependencies: noop(),
    setUserServices: noop(), setWebhookDependencies: noop(), setBulletinDependencies: noop(),
    setFileMaintenanceDependencies: noop(), setUserCommandsDependencies: noop(), setMessageHandlersDependencies: noop(),
    setSessionManager: noop(), setConferences: noop(), setMessageBases: noop(), setFileAreas: noop(), setDoors: noop(),
    setProcessOlmMessageQueue: noop(), setCheckSecurity: noop(), setSetEnvStat: noop(), setGetRecentCallerActivity: noop(),
  };
});
jest.mock('../src/handlers/screen.handler', () => ({
  displayScreen: jest.fn().mockResolvedValue(false),
  doPause: jest.fn(),
  handlePaginatedScreenInput: jest.fn(),
  parseMciCodes: jest.fn().mockResolvedValue({ parsed: '', inlineEmitted: true }),
}));
jest.mock('../src/amiga-emulation/loader/LibraryLoader', () => ({ LibraryLoader: jest.fn() }));
jest.mock('../src/amiga-emulation/AmigaDoorSession', () => ({ AmigaDoorSession: jest.fn() }));
jest.mock('../src/handlers/operations/conference.handler', () => ({ displayConferenceBulletins: jest.fn(), joinConference: jest.fn() }));
jest.mock('../src/handlers/message/message-scan.handler', () => ({ performConferenceScan: jest.fn() }));
jest.mock('../src/handlers/door.handler', () => ({ executeDoor: jest.fn(), displayDoorMenu: jest.fn() }));
jest.mock('../src/handlers/command-handler/menu', () => ({ displayMainMenu: jest.fn(), displayMenuPrompt: jest.fn() }));
jest.mock('../src/utils/conference-tooltypes.util', () => ({ getConferenceToolFlags: jest.fn() }));
jest.mock('../src/services/UserFileManager', () => ({ userFileManager: { writeUserFiles: jest.fn(), updateUserDataFile: jest.fn() } }));
jest.mock('../src/services/UserDatabaseManager', () => ({
  userDatabaseManager: {
    getUserCount: jest.fn().mockReturnValue(1), userToStruct: jest.fn().mockReturnValue({ slotNumber: 0 }),
    userToKeys: jest.fn().mockReturnValue({}), userToMisc: jest.fn().mockReturnValue({}), appendUser: jest.fn(),
  },
}));
jest.mock('../src/services/bbs-event-emitter', () => ({ emitUserLogin: jest.fn() }));
jest.mock('../src/services/batch-scheduler', () => ({ runExecuteOn: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../src/services/mail-notification.service', () => ({ mailOnNewUser: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../src/services/webhook.service', () => ({
  webhookService: { sendWebhook: jest.fn().mockResolvedValue(undefined) }, WebhookTrigger: { NEW_USER: 'NEW_USER' },
}));
jest.mock('../src/utils/acs.util', () => ({ initializeSecurity: jest.fn() }));
jest.mock('../src/services/config.service', () => ({
  ConfigService: jest.fn().mockImplementation(() => ({ getSystemConfig: jest.fn().mockResolvedValue(null) })),
}));
jest.mock('../src/handlers/command-execution.handler', () => ({ runSysCommand: jest.fn().mockResolvedValue(-1) }));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BBSState, LoggedOnSubState } from '../src/constants/bbs-states';
import { config } from '../src/config';
import { setNewUserDependencies } from '../src/handlers/user/new-user.handler';
import { initFirstUserIsSysopFlag } from '../src/utils/first-user-sysop.util';
import { Database } from '../src/database';

describe('a fresh database', () => {
  let dir: string;
  beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nosysop-')); });
  afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  test('has no sysop user and no level >= 200 user, so the first caller will be promoted', async () => {
    process.env.DATABASE_DIR = dir;
    process.env.DATABASE_FILE = 'fresh.db';
    const fresh = new Database();
    await fresh.init();
    try {
      const sysopRows = await fresh.query("SELECT username FROM users WHERE LOWER(username) = 'sysop'");
      expect(sysopRows.rows).toHaveLength(0);
      const high = await fresh.query('SELECT username FROM users WHERE seclevel >= 200');
      expect(high.rows).toHaveLength(0);

      (global as any).firstUserIsSysop = undefined;
      await initFirstUserIsSysopFlag(fresh);
      expect((global as any).firstUserIsSysop).toBe(true);
    } finally {
      await fresh.close();
    }
  }, 60000);
});

describe('registration through the dispatcher', () => {
  let root: string;
  let previousDataDir: string;
  let handleCommand: typeof import('../src/handlers/command.handler').handleCommand;
  const users = new Map<string, any>();
  let nextId = 1;
  const db = {
    createUser: jest.fn(async (data: any) => {
      const id = nextId++;
      users.set(data.username, { id, slotNumber: id, ...data });
      return id;
    }),
    getUserByUsername: jest.fn(async (name: string) => users.get(name) ?? null),
    appendUserToDisk: jest.fn(async () => undefined),
    getUserById: jest.fn(async (id: number) => [...users.values()].find((u) => u.id === id) ?? null),
    getConfigRepository: () => ({ getSystemConfig: () => null }),
  };

  const makeSocket = () => ({ id: 's', on() {}, emit: jest.fn() });
  const makeSession = (username: string) => ({
    state: BBSState.REGISTERING, subState: LoggedOnSubState.NEW_USER_CONFIRM, nodeId: 1, inputBuffer: '',
    newUserData: {
      username, location: 'Oslo', phone: '', email: `${username}@example.com`, password: 'hunter22',
      realname: '', linesPerScreen: 24, computer: 'Amiga', screenClear: true, questionnaire: undefined,
    },
  } as any);
  /** "Is the above Correct?" is one key, no Enter (express.e:30311): Y creates the account. */
  const register = async (username: string) => {
    await handleCommand(makeSocket() as any, makeSession(username), 'Y');
  };

  beforeAll(() => { ({ handleCommand } = require('../src/handlers/command.handler')); });
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'firstsysop-'));
    previousDataDir = config.get('dataDir');
    config.set('dataDir', root);
    for (const dir of ['Node0', 'Node1']) {
      fs.mkdirSync(path.join(root, dir), { recursive: true });
      fs.writeFileSync(path.join(root, dir, 'script57600'), 'What is your real name: ~\n', 'latin1');
    }
    users.clear();
    nextId = 1;
    db.createUser.mockClear();
    setNewUserDependencies({ db, sessions: new Map() } as any);
  });
  afterEach(() => {
    config.set('dataDir', previousDataDir);
    fs.rmSync(root, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  test('the first caller gets level 255, the second the board default', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    (global as any).firstUserIsSysop = true; // what initFirstUserIsSysopFlag sets on a board with no sysop

    await register('Alice');
    // Sentinel: only the first-user branch prints this.
    expect(log.mock.calls.some((c) => String(c[0]).includes('[SETUP] First user created: Alice'))).toBe(true);
    expect((global as any).firstUserIsSysop).toBe(false);
    expect(users.get('Alice').secLevel).toBe(255);

    await register('Bob');
    expect(log.mock.calls.some((c) => String(c[0]).includes('First user created: Bob'))).toBe(false);
    expect(users.get('Bob').secLevel).not.toBe(255);
    expect(db.createUser).toHaveBeenCalledTimes(2);
  });
});
