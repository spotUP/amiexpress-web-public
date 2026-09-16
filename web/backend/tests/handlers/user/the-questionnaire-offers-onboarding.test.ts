/**
 * THE QUESTIONNAIRE ACTUALLY OFFERS ONBOARDING.
 *
 * The runner has been here since `ce1bc92b4`: a questionnaire line that
 * opens with a tilde goes through the board's own MCI parser, so
 * `~CC_THEME|` runs the theme picker. Nothing used it. Not one of the 287
 * `Node<n>/script<baud>` files the board ships carried a single `~CC_`
 * line, so a new caller answered the old reference-board questions and was
 * handed to the sysop for validation, exactly as before - which is what
 * the sysop saw: "i didn't even get the questionaire and no onboarding".
 *
 * Onboarding is three of the board's own commands, in the order a caller
 * meets the board: what the screens look like (SCREENTHEME), what the
 * doors look like (THEME), and whether they want a scoreboard identity
 * (ACHIEVE). They are commands, not a new door, because the sysop said so:
 * "it doesnt even have to be a door it can run our theme settings etc apps
 * from a script".
 *
 * Three things have to be true and each is proved differently:
 *   1. the SCRIPTS carry the lines - read off the board itself;
 *   2. the lines REACH the parser at the end of a real run - driven
 *      through handleConfirmInput and handleQuestionnaireAnswer;
 *   3. the parser turns `~CC_SCREENTHEME|` into the command SCREENTHEME,
 *      pipe stripped - the hop the suite above mocks away, and the one
 *      that would silently dispatch a command named `SCREENTHEME|`.
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
jest.mock('../../../src/handlers/command-execution.handler', () => ({
  runSysCommand: jest.fn().mockResolvedValue(-1),
}));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BBSState, LoggedOnSubState } from '../../../src/constants/bbs-states';
import { config } from '../../../src/config';
import {
  setNewUserDependencies,
  handleConfirmInput,
  handleQuestionnaireAnswer,
} from '../../../src/handlers/user/new-user.handler';

const BOARD = path.resolve(__dirname, '../../../../..');

/** The commands onboarding runs, in the order a caller meets the board. */
const ONBOARDING = ['SCREENTHEME', 'THEME', 'COSYSOP', 'ACHIEVE'] as const;

/**
 * Every `Node<n>` that serves a caller - one with its own logon screen.
 *
 * `Logon.txt` was the marker until `93e12958a` deleted it board-wide; this
 * filter then matched nothing and `nodeDirs()[0]` was `undefined`, which is
 * the "path argument must be of type string" this suite failed with
 * (2026-09-16). `logon20.txt` is the security-level screen that remains.
 */
const nodeDirs = (): string[] =>
  fs
    .readdirSync(BOARD, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^Node\d+$/.test(e.name))
    .filter((e) => fs.existsSync(path.join(BOARD, e.name, 'logon20.txt')))
    .map((e) => e.name);

const scriptsOf = (dir: string): string[] =>
  fs
    .readdirSync(path.join(BOARD, dir))
    .filter((f) => /^script\d+$/i.test(f))
    .map((f) => path.join(BOARD, dir, f));

/** Read as latin-1: these are Amiga text files, and a UTF-8 read would lie. */
const textOf = (file: string): string => fs.readFileSync(file).toString('latin1');

describe('the questionnaire the board ships', () => {
  it('offers all four onboarding commands, in every node, in order', () => {
    const wrong: string[] = [];
    for (const dir of nodeDirs()) {
      for (const file of scriptsOf(dir)) {
        const lines = textOf(file).split(/\r?\n/).map((l) => l.trim());
        const found = ONBOARDING.map((cmd) => lines.indexOf(`~CC_${cmd}|`));
        if (found.some((i) => i < 0)) {
          wrong.push(`${path.relative(BOARD, file)} is missing ${ONBOARDING.filter((_, i) => found[i] < 0).join(', ')}`);
          continue;
        }
        if (found[0] > found[1] || found[1] > found[2]) {
          wrong.push(`${path.relative(BOARD, file)} runs them out of order`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it('names commands this board actually installs', () => {
    const missing = ONBOARDING.filter(
      (cmd) => !fs.existsSync(path.join(BOARD, 'Commands', 'BBSCmd', `${cmd}.info`)),
    );
    expect(missing).toEqual([]);
  });

  it('puts them where they cannot be mistaken for a question', () => {
    // Only a line ENDING in `~` is a prompt (loadScriptSteps). An onboarding
    // line ends in `|`, so it is a text line the runner recognises by its
    // LEADING tilde - the two rules must not collide.
    for (const file of scriptsOf(nodeDirs()[0])) {
      for (const line of textOf(file).split(/\r?\n/)) {
        if (!line.trim().startsWith('~CC_')) continue;
        expect(line.trim().endsWith('~')).toBe(false);
      }
    }
  });
});

describe('a caller who answers the whole questionnaire', () => {
  let root: string;
  let previousDataDir: string;
  const users = new Map<string, any>();
  const db = {
    createUser: jest.fn(async (data: any) => { users.set(data.username, { id: 7, secLevel: 10, ...data }); return 7; }),
    getUserByUsername: jest.fn(async (name: string) => users.get(name) ?? null),
    appendUserToDisk: jest.fn(async () => undefined),
    getConfigRepository: () => ({ getSystemConfig: () => null }),
  };

  const makeSocket = () => {
    const emits: Array<{ event: string; payload: any }> = [];
    return { id: 's', emit: jest.fn((event: string, payload: any) => emits.push({ event, payload })), _emits: emits };
  };
  const makeSession = () => ({
    state: BBSState.REGISTERING,
    subState: LoggedOnSubState.NEW_USER_CONFIRM,
    nodeId: 1,
    inputBuffer: '',
    newUserData: {
      username: 'newbie', location: 'Oslo', phone: '', email: 'newbie@example.com',
      password: 'hunter22', realname: '', linesPerScreen: 24, computer: 'Amiga',
      screenClear: true, questionnaire: undefined,
    },
  }) as any;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'onboarding-'));
    previousDataDir = config.get('dataDir');
    config.set('dataDir', root);
    // The BOARD's own questionnaire, byte for byte - not a fixture that
    // could agree with the code while the shipped file does not.
    const shipped = fs.readFileSync(scriptsOf(nodeDirs()[0])[0]);
    for (const dir of ['Node0', 'Node1']) {
      fs.mkdirSync(path.join(root, dir), { recursive: true });
      fs.writeFileSync(path.join(root, dir, 'script57600'), shipped);
    }
    users.clear();
    parseMciCodes.mockClear();
    setNewUserDependencies({ db, sessions: new Map() });
  });

  afterEach(() => {
    config.set('dataDir', previousDataDir);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('is offered the theme pickers and the achievements sign-up at the end', async () => {
    const socket = makeSocket();
    const session = makeSession();

    await handleConfirmInput(socket as any, session, 'Y');
    // Answer until the questionnaire lets go, with a bound so a flow that
    // never ends fails here instead of hanging.
    for (let i = 0; i < 20 && session.subState === LoggedOnSubState.NEW_USER_SCRIPT; i += 1) {
      await handleQuestionnaireAnswer(socket as any, session, `answer ${i}`);
    }

    const ranLines = parseMciCodes.mock.calls.map((call) => String(call[0]).trim());
    expect(ranLines).toEqual(ONBOARDING.map((cmd) => `~CC_${cmd}|`));
  });
});

describe('the parser hop the mock cannot prove', () => {
  it('turns ~CC_SCREENTHEME| into the command SCREENTHEME, pipe stripped', async () => {
    jest.resetModules();
    const processCommand = jest.fn().mockResolvedValue(0);
    jest.doMock('../../../src/handlers/command.handler', () => ({ processCommand }));
    jest.dontMock('../../../src/handlers/screen.handler');
    const { parseMciCodes: realParse } = require('../../../src/handlers/screen.handler');

    const session: any = {
      state: BBSState.LOGGEDON,
      subState: LoggedOnSubState.READ_COMMAND,
      user: { id: 7, username: 'newbie', secLevel: 10 },
      screenSegments: { segments: [], currentIndex: 0, screenName: 'Q', inlineMode: true, isFlowScreen: true },
    };
    const socket: any = { id: 's', emit: jest.fn() };

    await realParse('~CC_SCREENTHEME|', session, undefined, undefined, undefined, socket);

    expect(processCommand).toHaveBeenCalled();
    expect(processCommand.mock.calls[0][2]).toBe('SCREENTHEME');
  });
});
