/**
 * The questionnaire, driven the way a caller drives it: keystrokes into
 * handleCommand, not calls into the handler.
 *
 * ce1bc92b4 created the account before the questionnaire and flipped the
 * session to LOGGEDON right there. The dispatcher only routes input to the
 * new-user handlers while `session.state === BBSState.REGISTERING`, so the
 * caller typed an answer to "What is your real name:" and nothing read it. A
 * live user hit it within the hour. The test that existed called
 * handleQuestionnaireAnswer directly and so never met the gate; this one
 * types through the gate.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../../src/index', () => {
  const states = require('../../../src/constants/bbs-states');
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
jest.mock('../../../src/handlers/screen.handler', () => ({
  displayScreen: jest.fn().mockResolvedValue(false),
  doPause: jest.fn(),
  handlePaginatedScreenInput: jest.fn(),
  parseMciCodes: jest.fn().mockResolvedValue({ parsed: '', inlineEmitted: true }),
}));
jest.mock('../../../src/amiga-emulation/loader/LibraryLoader', () => ({ LibraryLoader: jest.fn() }));
jest.mock('../../../src/amiga-emulation/AmigaDoorSession', () => ({ AmigaDoorSession: jest.fn() }));
jest.mock('../../../src/handlers/operations/conference.handler', () => ({ displayConferenceBulletins: jest.fn(), joinConference: jest.fn() }));
jest.mock('../../../src/handlers/message/message-scan.handler', () => ({ performConferenceScan: jest.fn() }));
jest.mock('../../../src/handlers/door.handler', () => ({ executeDoor: jest.fn(), displayDoorMenu: jest.fn() }));
jest.mock('../../../src/handlers/command-handler/menu', () => ({ displayMainMenu: jest.fn(), displayMenuPrompt: jest.fn() }));
jest.mock('../../../src/utils/conference-tooltypes.util', () => ({ getConferenceToolFlags: jest.fn() }));
jest.mock('../../../src/services/UserFileManager', () => ({ userFileManager: { writeUserFiles: jest.fn(), updateUserDataFile: jest.fn() } }));
jest.mock('../../../src/services/UserDatabaseManager', () => ({
  userDatabaseManager: {
    getUserCount: jest.fn().mockReturnValue(1), userToStruct: jest.fn().mockReturnValue({ slotNumber: 0 }),
    userToKeys: jest.fn().mockReturnValue({}), userToMisc: jest.fn().mockReturnValue({}), appendUser: jest.fn(),
  },
}));
jest.mock('../../../src/services/bbs-event-emitter', () => ({ emitUserLogin: jest.fn() }));
jest.mock('../../../src/services/batch-scheduler', () => ({ runExecuteOn: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../../src/services/mail-notification.service', () => ({ mailOnNewUser: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../../src/services/webhook.service', () => ({
  webhookService: { sendWebhook: jest.fn().mockResolvedValue(undefined) }, WebhookTrigger: { NEW_USER: 'NEW_USER' },
}));
jest.mock('../../../src/utils/acs.util', () => ({ initializeSecurity: jest.fn() }));
jest.mock('../../../src/services/config.service', () => ({
  ConfigService: jest.fn().mockImplementation(() => ({ getSystemConfig: jest.fn().mockResolvedValue(null) })),
}));
jest.mock('../../../src/handlers/command-execution.handler', () => ({ runSysCommand: jest.fn().mockResolvedValue(-1) }));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BBSState, LoggedOnSubState } from '../../../src/constants/bbs-states';
import { config } from '../../../src/config';
import { setNewUserDependencies } from '../../../src/handlers/user/new-user.handler';

let root: string;
let previousDataDir: string;
let handleCommand: typeof import('../../../src/handlers/command.handler').handleCommand;

const users = new Map<string, any>();
const db = {
  createUser: jest.fn(async (data: any) => { users.set(data.username, { id: 7, secLevel: 10, ...data }); return 7; }),
  getUserByUsername: jest.fn(async (name: string) => users.get(name) ?? null),
  appendUserToDisk: jest.fn(async () => undefined),
  // createAccountRecord reads back the slot the record landed in (dc500bb27).
  getUserById: jest.fn(async (id: number) => [...users.values()].find((u) => u.id === id) ?? null),
  getConfigRepository: () => ({ getSystemConfig: () => null }),
};

function makeSocket() {
  const emits: Array<{ event: string; payload: any }> = [];
  return { id: 's', on() {}, emit: jest.fn((event: string, payload: any) => emits.push({ event, payload })), _emits: emits };
}
function makeSession() {
  return {
    state: BBSState.REGISTERING, subState: LoggedOnSubState.NEW_USER_CONFIRM, nodeId: 1, inputBuffer: '',
    newUserData: {
      username: 'newbie', location: 'Oslo', phone: '', email: 'newbie@example.com', password: 'hunter22',
      realname: '', linesPerScreen: 24, computer: 'Amiga', screenClear: true, questionnaire: undefined,
    },
  } as any;
}
/** What a caller does: type the characters, then Enter. */
async function type(socket: any, session: any, line: string) {
  for (const ch of line) await handleCommand(socket, session, ch);
  await handleCommand(socket, session, '\r');
}
const text = (socket: any) => socket._emits.map((e: any) => String(e.payload)).join('');

beforeAll(() => { ({ handleCommand } = require('../../../src/handlers/command.handler')); });
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-'));
  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
  for (const dir of ['Node0', 'Node1']) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
    fs.writeFileSync(path.join(root, dir, 'script57600'), 'What is your real name: ~\nWhere did you hear of us: ~\n', 'latin1');
  }
  users.clear();
  setNewUserDependencies({ db, sessions: new Map() });
});
afterEach(() => {
  config.set('dataDir', previousDataDir);
  fs.rmSync(root, { recursive: true, force: true });
});

test('a caller who confirms, then answers the questions by typing, gets through to the board', async () => {
  const socket = makeSocket();
  const session = makeSession();

  await type(socket, session, 'Y');                       // "Is the above Correct?"
  expect(text(socket)).toContain('What is your real name:');
  expect(db.createUser).toHaveBeenCalledTimes(1);          // account made first

  await type(socket, session, 'Spot Up');                 // the answer that was being swallowed
  expect(text(socket)).toContain('Where did you hear of us:');

  await type(socket, session, 'a friend');
  expect(text(socket)).toContain('Is the above Correct? (Y/n)');

  await type(socket, session, 'Y');
  expect(session.state).toBe(BBSState.LOGGEDON);
  expect(session.subState).toBe(LoggedOnSubState.DISPLAY_BULL);
  expect(socket._emits.some((e: any) => e.event === 'login-success')).toBe(true);
  // express.e prints nothing between the questionnaire and the logon
  // (30096-30112): no "Creating your account..." and no "created" line.
  expect(text(socket)).not.toMatch(/Creating your account|Account created successfully/);
});

test('the browser is told it is logged on only once the questionnaire is over', async () => {
  const socket = makeSocket();
  const session = makeSession();

  await type(socket, session, 'Y');

  // Mid-questionnaire: an account, but not yet a logged-on caller.
  expect(session.user?.username).toBe('newbie');
  expect(session.state).toBe(BBSState.REGISTERING);
  expect(socket._emits.some((e: any) => e.event === 'login-success')).toBe(false);
});
