/**
 * Onboarding runs FROM the questionnaire, with the account in existence.
 *
 * express.e:30096-30112 assigns the caller's slot and only then calls
 * doNewUserQuestions, which first offers the SCRIPT sys-command and falls
 * back to Node<n>/Script<baud>. The port asked first and created the account
 * after, so nothing a script launched could see the caller - processCommand
 * ignores a session that is not LOGGEDON, and a theme picker or the
 * achievements sign-up has no user to work on.
 *
 * The sysop's ask: "it doesnt even have to be a door it can run our theme
 * settings etc apps from a script". A questionnaire line that opens with a
 * tilde is MCI, the same as in a screen file, so `~CC_THEME|` runs the theme
 * picker between two questions. These prove the order and the hand-offs.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../../src/index', () => ({
  BBSState: require('../../../src/constants/bbs-states').BBSState,
  LoggedOnSubState: require('../../../src/constants/bbs-states').LoggedOnSubState,
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
  webhookService: { sendWebhook: jest.fn().mockResolvedValue(undefined) }, WebhookTrigger: { NEW_USER: 'NEW_USER' },
}));
jest.mock('../../../src/utils/acs.util', () => ({ initializeSecurity: jest.fn() }));
jest.mock('../../../src/services/config.service', () => ({
  ConfigService: jest.fn().mockImplementation(() => ({ getSystemConfig: jest.fn().mockResolvedValue(null) })),
}));

const parseMciCodes = jest.fn().mockResolvedValue({ parsed: '', inlineEmitted: true });
jest.mock('../../../src/handlers/screen.handler', () => ({
  displayScreen: jest.fn().mockResolvedValue(false),
  doPause: jest.fn(),
  handlePaginatedScreenInput: jest.fn(),
  parseMciCodes: (...args: unknown[]) => parseMciCodes(...args),
}));

const runSysCommand = jest.fn().mockResolvedValue(-1); // no SCRIPT command on this board
jest.mock('../../../src/handlers/command-execution.handler', () => ({
  runSysCommand: (...args: unknown[]) => runSysCommand(...args),
}));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BBSState, LoggedOnSubState } from '../../../src/constants/bbs-states';
import { config } from '../../../src/config';
import { setNewUserDependencies, handleConfirmInput, handleQuestionnaireAnswer } from '../../../src/handlers/user/new-user.handler';

let root: string;
let previousDataDir: string;

/** The board's database, as much of it as registration touches. */
const users = new Map<string, any>();
const db = {
  createUser: jest.fn(async (data: any) => { users.set(data.username, { id: 7, secLevel: 10, ...data }); return 7; }),
  getUserByUsername: jest.fn(async (name: string) => users.get(name) ?? null),
  appendUserToDisk: jest.fn(async () => undefined),
  getConfigRepository: () => ({ getSystemConfig: () => null }),
};

function makeSocket() {
  const emits: Array<{ event: string; payload: any }> = [];
  return { id: 's', emit: jest.fn((event: string, payload: any) => emits.push({ event, payload })), _emits: emits };
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
/** The node directory the flow reads is derived from the session; write the script where it looks. */
const write = (rel: string, body: string) => {
  for (const dir of ['Node0', 'Node1']) {
    const target = path.join(root, rel.replace(/^Node1/, dir));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, body, 'latin1');
  }
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'onboard-'));
  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
  fs.mkdirSync(path.join(root, 'Node0'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Node1'), { recursive: true });
  users.clear();
  db.createUser.mockClear();
  parseMciCodes.mockClear();
  runSysCommand.mockClear();
  runSysCommand.mockResolvedValue(-1);
  setNewUserDependencies({ db, sessions: new Map() });
});
afterEach(() => {
  config.set('dataDir', previousDataDir);
  fs.rmSync(root, { recursive: true, force: true });
});

test('the account exists, and the caller is logged on, before the first question is asked', async () => {
  write('Node1/script57600', 'What is your handle: ~\n');
  const socket = makeSocket();
  const session = makeSession();

  await handleConfirmInput(socket as any, session, 'Y');

  // The question is on the glass - and the caller behind it is a real user.
  expect(socket._emits.some(e => String(e.payload).includes('What is your handle:'))).toBe(true);
  expect(db.createUser).toHaveBeenCalled();
  expect(session.user?.username).toBe('newbie');
  expect(session.state).toBe(BBSState.LOGGEDON);
  expect(session.subState).toBe(LoggedOnSubState.NEW_USER_SCRIPT);
});

test('a tilde line runs through the board\'s MCI parser with the socket, so ~CC_THEME| is the theme picker', async () => {
  write('Node1/script57600', 'Pick how the board should look.\n~CC_THEME|\nWhat is your handle: ~\n');
  const socket = makeSocket();
  const session = makeSession();

  await handleConfirmInput(socket as any, session, 'Y');

  expect(parseMciCodes).toHaveBeenCalledTimes(1);
  const [content, sess, , , , sock] = parseMciCodes.mock.calls[0];
  expect(content).toBe('~CC_THEME|');
  expect(sess).toBe(session);
  expect(sock).toBe(socket);
  // The plain line was printed as text, not parsed.
  expect(socket._emits.some(e => e.payload === 'Pick how the board should look.\r\n')).toBe(true);
  // And the script carried on to the question afterwards.
  expect(socket._emits.some(e => String(e.payload).includes('What is your handle:'))).toBe(true);
});

test('while a tilde line runs, door exit sees the flow marker and leaves the menu alone; afterwards it is gone', async () => {
  write('Node1/script57600', '~CC_ACHIEVE|\nDone. ~\n');
  const socket = makeSocket();
  const session = makeSession();
  let markerDuring: unknown = 'not captured';
  parseMciCodes.mockImplementationOnce(async (_c: unknown, sess: any) => { markerDuring = sess.screenSegments; return { parsed: '', inlineEmitted: true }; });

  await handleConfirmInput(socket as any, session, 'Y');

  expect(markerDuring).toMatchObject({ screenName: 'QUESTIONNAIRE', inlineMode: true });
  expect(session.screenSegments).toBeUndefined();
});

test('the SCRIPT sys-command, when the board has one, replaces the text questionnaire', async () => {
  write('Node1/script57600', 'What is your handle: ~\n');
  runSysCommand.mockResolvedValue(0); // RESULT_SUCCESS
  const socket = makeSocket();
  const session = makeSession();

  await handleConfirmInput(socket as any, session, 'Y');

  expect(runSysCommand).toHaveBeenCalledWith(socket, session, 'SCRIPT', '');
  expect(socket._emits.some(e => String(e.payload).includes('What is your handle:'))).toBe(false);
  // Straight into the board.
  expect(session.subState).toBe(LoggedOnSubState.DISPLAY_BULL);
  expect(session.newUserData).toBeUndefined();
});

test('after the last answer is confirmed the caller enters the board, once', async () => {
  write('Node1/script57600', 'What is your handle: ~\n');
  const socket = makeSocket();
  const session = makeSession();
  await handleConfirmInput(socket as any, session, 'Y');

  await handleQuestionnaireAnswer(socket as any, session, 'spot');
  const { handleQuestionnaireConfirmInput } = await import('../../../src/handlers/user/new-user.handler');
  await handleQuestionnaireConfirmInput(socket as any, session, 'Y');

  expect(db.createUser).toHaveBeenCalledTimes(1);
  expect(session.subState).toBe(LoggedOnSubState.DISPLAY_BULL);
  expect(session.newUserData).toBeUndefined();
  expect(fs.existsSync(path.join(root, 'Node1', 'Answers')) || fs.existsSync(path.join(root, 'Node0', 'Answers'))).toBe(true);
});

test('coming back through the flow with an account already made does not make a second one', async () => {
  write('Node1/script57600', 'What is your handle: ~\n');
  const socket = makeSocket();
  const session = makeSession();
  await handleConfirmInput(socket as any, session, 'Y');
  expect(db.createUser).toHaveBeenCalledTimes(1);

  // The confirm handler's fallback: no questionnaire on the session any more.
  session.newUserData.questionnaire = undefined;
  const { handleQuestionnaireConfirmInput } = await import('../../../src/handlers/user/new-user.handler');
  await handleQuestionnaireConfirmInput(socket as any, session, 'Y');

  // One account. The questionnaire simply starts over, which is what a caller
  // whose state was lost should get - never a second row in user.data.
  expect(db.createUser).toHaveBeenCalledTimes(1);
  expect(session.user?.username).toBe('newbie');
});
