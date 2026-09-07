// @ts-nocheck
/**
 * CONFIRMING THE SUMMARY LEADS INTO THE QUESTIONNAIRE.
 *
 * The other half of the sysop's 2026-09-07 report ("i didn't even get the
 * questionaire"): the-questionnaire-is-not-parked.test.ts pins that the
 * board SHIPS the scripts where the lookup reads them, and this pins that
 * the registration flow actually walks into them when they are there.
 *
 * It drives the real `handleConfirmInput` - the function a caller reaches
 * by typing Y at the summary - against a temporary node directory holding
 * one real `script57600`, and asserts the first question is on the
 * caller's screen and the session is parked in NEW_USER_SCRIPT waiting for
 * the answer. With no script the same call creates the account instead,
 * which is the behaviour the board had all April: proved here too, so the
 * test says which of the two happened rather than just "something did".
 */
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
jest.mock('../../../src/services/UserFileManager', () => ({
  userFileManager: { writeUserFiles: jest.fn(), updateUserDataFile: jest.fn() },
}));
jest.mock('../../../src/services/UserDatabaseManager', () => ({
  userDatabaseManager: {
    getUserCount: jest.fn().mockReturnValue(1),
    userToStruct: jest.fn().mockReturnValue({ slotNumber: 0 }),
    userToKeys: jest.fn().mockReturnValue({}),
    userToMisc: jest.fn().mockReturnValue({}),
    appendUser: jest.fn(),
  },
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

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BBSState, LoggedOnSubState } from '../../../src/constants/bbs-states';
import { config } from '../../../src/config';

const { handleConfirmInput, setNewUserDependencies } = require('../../../src/handlers/user/new-user.handler');

/**
 * The board's database, as much of it as registration touches. The account
 * is created BEFORE the questionnaire (express.e:30096-30112), so without
 * one nothing downstream runs and this suite would be measuring the stub.
 */
const users = new Map<string, any>();
const db = {
  createUser: jest.fn(async (data: any) => { users.set(data.username, { id: 7, secLevel: 10, ...data }); return 7; }),
  getUserByUsername: jest.fn(async (name: string) => users.get(name) ?? null),
  appendUserToDisk: jest.fn(async () => undefined),
  getConfigRepository: () => ({ getSystemConfig: () => null }),
};

/** The board's own questionnaire, as Node1 ships it. */
const SCRIPT = [
  'What is your real name: ~',
  'What is your sex,age: ~',
  '',
  'Now to the tricky part... . .',
  '',
  'What is FLT an abbrevation of: ~',
  '',
].join('\r\n');

let dataDir: string;
let getConfig: jest.SpyInstance;

function makeSocket() {
  const emits: { event: string; payload: any }[] = [];
  return {
    id: 'test-socket',
    emit: jest.fn((event: string, payload: any) => emits.push({ event, payload })),
    _text: () => emits.filter((e) => e.event === 'ansi-output').map((e) => String(e.payload)).join(''),
  };
}

const makeSession = () => ({
  state: BBSState.REGISTERING,
  subState: LoggedOnSubState.NEW_USER_CONFIRM,
  nodeId: 1,
  inputBuffer: '',
  newUserData: { username: 'TESTER', location: '', phone: '', email: '', password: '', realname: '' },
});

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'questionnaire-'));
  // getNodeDirectory maps nodeId 1 to Node0 (the index is one behind).
  fs.mkdirSync(path.join(dataDir, 'Node0'), { recursive: true });
  getConfig = jest.spyOn(config, 'getConfig').mockReturnValue({ dataDir } as any);
  users.clear();
  setNewUserDependencies({ db, sessions: new Map() });
});

afterEach(() => {
  getConfig.mockRestore();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('a caller who confirms the summary', () => {
  it('is asked the first question, and waits there for the answer', async () => {
    fs.writeFileSync(path.join(dataDir, 'Node0', 'script57600'), SCRIPT, 'latin1');
    const socket = makeSocket();
    const session = makeSession();

    await handleConfirmInput(socket, session, 'Y');

    expect(socket._text()).toContain('What is your real name');
    // The tricky-part LINE is text, not a prompt: only a trailing `~` asks.
    expect(socket._text()).not.toContain('What is your sex,age');
    expect(session.subState).toBe(LoggedOnSubState.NEW_USER_SCRIPT);
    expect(session.newUserData.questionnaire.steps.length).toBeGreaterThan(3);
  });

  it('skips it when the node has no script - the April behaviour, named', async () => {
    const socket = makeSocket();
    const session = makeSession();

    // No script file: beginQuestionnaire returns false and the flow falls
    // through to the rest of login. The refusal to reach the questionnaire
    // is the assertion.
    await handleConfirmInput(socket, session, 'Y').catch(() => undefined);

    expect(socket._text()).not.toContain('What is your real name');
    expect(session.subState).not.toBe(LoggedOnSubState.NEW_USER_SCRIPT);
    // The account is still made - the caller is let in, just never asked
    // anything. `newUserData` is gone by then, cleared on the way into the
    // board, so the questionnaire's absence is read off the flow and not
    // off a field that no longer exists.
    expect(db.createUser).toHaveBeenCalled();
  });
});
