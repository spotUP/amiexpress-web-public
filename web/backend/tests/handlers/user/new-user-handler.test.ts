// @ts-nocheck
/**
 * New User Handler Tests — BBS registration flow
 *
 * Covers the socket/session-based registration steps.
 * GDPR consent gate (handleGdprConsentInput) is tested in new-user-gdpr-consent.test.ts.
 */

jest.mock('../../../src/index', () => ({
  BBSState: require('../../../src/constants/bbs-states').BBSState,
  LoggedOnSubState: require('../../../src/constants/bbs-states').LoggedOnSubState,
  initializeSecurity: jest.fn(),
  setSecurityDependencies: jest.fn(),
  setMessageCommandsDependencies: jest.fn(),
  setDisplayFileCommandsDependencies: jest.fn(),
  setPreferenceChatCommandsDependencies: jest.fn(),
  setSystemCommandsDependencies: jest.fn(),
  setNavigationCommandsDependencies: jest.fn(),
  setAdvancedCommandsDependencies: jest.fn(),
  setInfoCommandsDependencies: jest.fn(),
  setUtilityCommandsDependencies: jest.fn(),
  setMessageEntryDependencies: jest.fn(),
  setSysopCommandsDependencies: jest.fn(),
  setTransferMiscDependencies: jest.fn(),
  setMessagingDependencies: jest.fn(),
  setDatabaseDependencies: jest.fn(),
  setCommandHandlerDependencies: jest.fn(),
  setConfigDependencies: jest.fn(),
  setDoorDependencies: jest.fn(),
  setNodeServices: jest.fn(),
  setServiceDependencies: jest.fn(),
  setChatDependencies: jest.fn(),
  setAmigaExports: jest.fn(),
  setServerState: jest.fn(),
  setAmigaDoorDependencies: jest.fn(),
  setUserServices: jest.fn(),
  setWebhookDependencies: jest.fn(),
  setBulletinDependencies: jest.fn(),
  setFileMaintenanceDependencies: jest.fn(),
  setUserCommandsDependencies: jest.fn(),
  setMessageHandlersDependencies: jest.fn(),
  setSessionManager: jest.fn(),
  setConferences: jest.fn(),
  setMessageBases: jest.fn(),
  setFileAreas: jest.fn(),
  setDoors: jest.fn(),
  setProcessOlmMessageQueue: jest.fn(),
  setCheckSecurity: jest.fn(),
  setSetEnvStat: jest.fn(),
  setGetRecentCallerActivity: jest.fn(),
}));

jest.mock('../../../src/handlers/screen.handler', () => ({
  displayScreen: jest.fn().mockResolvedValue(false),
  doPause: jest.fn(),
  handlePaginatedScreenInput: jest.fn(),
}));

jest.mock('../../../src/services/UserFileManager', () => ({
  userFileManager: { writeUserFiles: jest.fn(), updateUserDataFile: jest.fn() }
}));
jest.mock('../../../src/services/UserDatabaseManager', () => ({
  userDatabaseManager: {
    getUserCount: jest.fn().mockReturnValue(0),
    userToStruct: jest.fn().mockReturnValue({ slotNumber: 0 }),
    userToKeys: jest.fn().mockReturnValue({}),
    userToMisc: jest.fn().mockReturnValue({}),
    appendUser: jest.fn(),
  }
}));

import { BBSState, LoggedOnSubState } from '../../../src/constants/bbs-states';
// BBSState is needed for the abort test assertion
import {
  setNewUserDependencies,
  handleNameInput,
  handleLocationInput,
  handlePhoneInput,
  handleEmailInput,
  handlePasswordInput,
  handlePasswordConfirm,
  handleLinesInput,
  handleComputerInput,
  handleScreenClearInput,
  handleAccessPasswordInput,
  handleAutoValidationInput,
} from '../../../src/handlers/user/new-user.handler';

function makeSocket() {
  const emits: Array<{ event: string; payload: any }> = [];
  return {
    id: 'test-socket',
    emit: jest.fn((event: string, payload: any) => emits.push({ event, payload })),
    disconnect: jest.fn(),
    _emits: emits,
  };
}

function makeSession(overrides: any = {}) {
  return {
    state: BBSState.REGISTERING,
    subState: LoggedOnSubState.NEW_USER_NAME,
    inputBuffer: '',
    newUserData: {
      username: '',
      location: '',
      phone: '',
      email: '',
      password: '',
      realname: '',
      linesPerScreen: 0,
      computer: '',
      screenClear: true,
      retryCount: 0,
      accessPasswordTries: 0,
      autoValidated: false,
      autoValidationComplete: true,
    },
    ...overrides,
  } as any;
}

async function waitForTestDb(): Promise<any> {
  let attempts = 0;
  while (!(global as any).testDb && attempts < 30) {
    await new Promise(r => setTimeout(r, 500));
    attempts++;
  }
  const db = (global as any).testDb;
  if (!db) throw new Error('Test database not initialized');
  return db;
}

describe('New User Handler — registration steps', () => {
  beforeAll(async () => {
    const db = await waitForTestDb();
    setNewUserDependencies({
      db,
      sessions: new Map(),
      newUserPassword: '',
      autoValidationPassword: '',
    });
  }, 30000);

  describe('handleNameInput (express.e:30154)', () => {
    it('accepts valid handle and advances to LOCATION', async () => {
      const socket = makeSocket();
      const session = makeSession({ subState: LoggedOnSubState.NEW_USER_NAME });

      await handleNameInput(socket, session, 'ValidHandle');

      expect(session.newUserData.username).toBe('ValidHandle');
      expect(session.subState).toBe(LoggedOnSubState.NEW_USER_LOCATION);
    });

    it('rejects empty handle and stays on NAME', async () => {
      const socket = makeSocket();
      const session = makeSession({ subState: LoggedOnSubState.NEW_USER_NAME });

      await handleNameInput(socket, session, '');

      expect(session.subState).toBe(LoggedOnSubState.NEW_USER_NAME);
      expect(socket.emit).toHaveBeenCalled();
    });
  });

  describe('handleLocationInput (express.e:30177)', () => {
    it('stores location and advances to PHONE', async () => {
      const socket = makeSocket();
      const session = makeSession({ subState: LoggedOnSubState.NEW_USER_LOCATION });

      await handleLocationInput(socket, session, 'London');

      expect(session.newUserData.location).toBe('London');
      expect(session.subState).toBe(LoggedOnSubState.NEW_USER_PHONE);
    });

    it('goes back to the name prompt, name filled in, on a blank City (express.e:30198-30200)', async () => {
      const socket = makeSocket();
      const session = makeSession({ subState: LoggedOnSubState.NEW_USER_LOCATION });
      session.newUserData.username = 'Randy';

      await handleLocationInput(socket, session, '');

      const out = socket._emits.map(e => String(e.payload)).join('');
      expect(out).toBe('\r\n\r\n\r\nEnter your Name: Randy');
      expect(session.subState).toBe(LoggedOnSubState.NEW_USER_NAME);
      expect(session.inputBuffer).toBe('Randy');
    });
  });

  describe('handlePhoneInput (express.e:30192)', () => {
    it('stores phone and advances to EMAIL', async () => {
      const socket = makeSocket();
      const session = makeSession({ subState: LoggedOnSubState.NEW_USER_PHONE });

      await handlePhoneInput(socket, session, '555-1234');

      expect(session.newUserData.phone).toBe('555-1234');
      expect(session.subState).toBe(LoggedOnSubState.NEW_USER_EMAIL);
    });

    it('a blank phone number goes back to City (express.e:30209-30212)', async () => {
      const socket = makeSocket();
      const session = makeSession({ subState: LoggedOnSubState.NEW_USER_PHONE });
      await handlePhoneInput(socket, session, '');
      expect(socket._emits.map((e: any) => String(e.payload)).join('')).toBe('\r\n\r\nGroup: ');
      expect(session.subState).toBe(LoggedOnSubState.NEW_USER_LOCATION);
    });
  });

  describe('handleEmailInput (express.e:30207)', () => {
    it('stores email and advances to PASSWORD', async () => {
      const socket = makeSocket();
      const session = makeSession({ subState: LoggedOnSubState.NEW_USER_EMAIL });

      await handleEmailInput(socket, session, 'user@test.com');

      expect(session.newUserData.email).toBe('user@test.com');
      expect(session.subState).toBe(LoggedOnSubState.NEW_USER_PASSWORD);
    });

    it('takes any address, and a blank one goes back to the phone number (express.e:30214-30223)', async () => {
      const taken = makeSession({ subState: LoggedOnSubState.NEW_USER_EMAIL });
      await handleEmailInput(makeSocket(), taken, 'spot at uprough');
      expect(taken.newUserData.email).toBe('spot at uprough');

      const socket = makeSocket();
      const blank = makeSession({ subState: LoggedOnSubState.NEW_USER_EMAIL });
      await handleEmailInput(socket, blank, '');
      expect(socket._emits.map((e: any) => String(e.payload)).join('')).toBe('\r\n\r\nPhone Number: ');
      expect(blank.subState).toBe(LoggedOnSubState.NEW_USER_PHONE);
    });
  });

  describe('handlePasswordInput (express.e:30222)', () => {
    it('stores password and advances to PASSWORD_CONFIRM', async () => {
      const socket = makeSocket();
      const session = makeSession({ subState: LoggedOnSubState.NEW_USER_PASSWORD });

      await handlePasswordInput(socket, session, 'ValidPass123');

      expect(session.newUserData.password).toBe('ValidPass123');
      expect(session.subState).toBe(LoggedOnSubState.NEW_USER_PASSWORD_CONFIRM);
    });

    it('a short password is refused only after it is typed twice (express.e:30240-30253)', async () => {
      const socket = makeSocket();
      const session = makeSession({ subState: LoggedOnSubState.NEW_USER_PASSWORD });

      await handlePasswordInput(socket, session, 'ab');
      expect(session.subState).toBe(LoggedOnSubState.NEW_USER_PASSWORD_CONFIRM);

      await handlePasswordConfirm(socket, session, 'ab');
      const out = socket._emits.filter((e: any) => e.event === 'ansi-output').map((e: any) => String(e.payload)).join('');
      expect(out).toMatch(/Reenter the PassWord: \r\n\r\nPassword length must be at least \d+ chars, try again\.\.\r\nEnter a PassWord: $/);
      expect(session.subState).toBe(LoggedOnSubState.NEW_USER_PASSWORD);
    });

    it('a blank password goes back to the e-mail address (express.e:30228-30231)', async () => {
      const socket = makeSocket();
      const session = makeSession({ subState: LoggedOnSubState.NEW_USER_PASSWORD });
      await handlePasswordInput(socket, session, '');
      const out = socket._emits.filter((e: any) => e.event === 'ansi-output').map((e: any) => String(e.payload)).join('');
      expect(out).toBe('\r\n\r\n\r\nE-Mail Address: ');
      expect(session.subState).toBe(LoggedOnSubState.NEW_USER_EMAIL);
    });
  });

  describe('handlePasswordConfirm (express.e:30237)', () => {
    it('matching password advances to LINES', async () => {
      const socket = makeSocket();
      const session = makeSession({
        subState: LoggedOnSubState.NEW_USER_PASSWORD_CONFIRM,
        newUserData: { password: 'SecretPass', username: 'tester' },
      });

      await handlePasswordConfirm(socket, session, 'SecretPass');

      expect(session.subState).toBe(LoggedOnSubState.NEW_USER_LINES);
      // express.e:11307, verbatim.
      const output = socket._emits.map((e: any) => String(e.payload)).join('');
      expect(output).toContain(
        ' 2\r\n\r\nEnter the number you see at the top of your screen (or 0 for Auto): ');
    });

    it('mismatched password goes back to PASSWORD', async () => {
      const socket = makeSocket();
      const session = makeSession({
        subState: LoggedOnSubState.NEW_USER_PASSWORD_CONFIRM,
        newUserData: { password: 'SecretPass', username: 'tester' },
      });

      await handlePasswordConfirm(socket, session, 'WrongPass');

      expect(session.subState).toBe(LoggedOnSubState.NEW_USER_PASSWORD);
      expect(socket.emit).toHaveBeenCalled();
    });
  });

  describe('handleLinesInput (express.e:30257)', () => {
    it('stores lines per screen and advances', async () => {
      const socket = makeSocket();
      const session = makeSession({ subState: LoggedOnSubState.NEW_USER_LINES });

      await handleLinesInput(socket, session, '24');

      expect(session.newUserData.linesPerScreen).toBe(24);
      expect(session.subState).toBe(LoggedOnSubState.NEW_USER_COMPUTER);
      // express.e:11335-11337: the list, a blank line, 'Choose computer type: '.
      const output = socket._emits.map((e: any) => String(e.payload)).join('');
      expect(output.endsWith('\r\n\r\nChoose computer type: ')).toBe(true);
      // express.e:11321-11324 - two per row: '\d[2]> \l\s[34] ' then
      // '\d[2]> \l\s[34]\b\n' - the left column ends in a space.
      const row = output.split('\r\n').find((l: string) => l.startsWith(' 1> '));
      expect(row).toBeDefined();
      expect(row!.slice(4, 4 + 34 + 1)).toMatch(/^.{34} $/);
      expect(row!.slice(39, 43)).toBe(' 2> ');
    });

    it('Auto (Enter) stores the measured terminal height minus the prompt row, never 0', async () => {
      // The bug (sysop, 2026-09-16): Auto stored 0, createUser turned 0 into
      // the board default 23, and the Bulls door paged a bulletin built to
      // fit. Auto must store the same number the line test shows at the top -
      // the terminal height less the prompt row.
      const socket = makeSocket();
      const session = makeSession({
        subState: LoggedOnSubState.NEW_USER_LINES,
        wireHeight: 25,
        tempData: {},
      });

      await handleLinesInput(socket, session, '');

      expect(session.newUserData.linesPerScreen).toBe(24);
      expect(session.subState).toBe(LoggedOnSubState.NEW_USER_COMPUTER);
    });

    it('a typed 0 is Auto too, and resolves the same way', async () => {
      const socket = makeSocket();
      const session = makeSession({
        subState: LoggedOnSubState.NEW_USER_LINES,
        screenHeight: 25,
      });

      await handleLinesInput(socket, session, '0');

      expect(session.newUserData.linesPerScreen).toBe(24);
    });

    it('Auto falls back to the standard 24 when the session measured nothing', async () => {
      const socket = makeSocket();
      const session = makeSession({ subState: LoggedOnSubState.NEW_USER_LINES });

      await handleLinesInput(socket, session, '');

      expect(session.newUserData.linesPerScreen).toBe(24);
    });
  });

  describe('handleComputerInput (express.e:30273)', () => {
    it('numeric selection stores computerType and advances to SCREEN_CLEAR', async () => {
      const socket = makeSocket();
      const session = makeSession({
        subState: LoggedOnSubState.NEW_USER_COMPUTER,
        newUserData: { computerChoices: ['Amiga', 'PC', 'Mac'] },
      });

      await handleComputerInput(socket, session, '1');

      expect(session.newUserData.computerType).toBe('Amiga');
      expect(session.subState).toBe(LoggedOnSubState.NEW_USER_SCREEN_CLEAR);
    });

    it('empty input uses first choice as default', async () => {
      const socket = makeSocket();
      const session = makeSession({
        subState: LoggedOnSubState.NEW_USER_COMPUTER,
        newUserData: { computerChoices: ['Amiga', 'PC'] },
      });

      await handleComputerInput(socket, session, '');

      expect(session.newUserData.computerType).toBe('Amiga');
      expect(session.subState).toBe(LoggedOnSubState.NEW_USER_SCREEN_CLEAR);
    });
  });

  describe('handleScreenClearInput (express.e:30289)', () => {
    it('Y sets screenClear=true and advances', async () => {
      const socket = makeSocket();
      const session = makeSession({ subState: LoggedOnSubState.NEW_USER_SCREEN_CLEAR });

      await handleScreenClearInput(socket, session, 'Y');

      expect(session.newUserData.screenClear).toBe(true);
      expect(session.subState).not.toBe(LoggedOnSubState.NEW_USER_SCREEN_CLEAR);
    });

    it('the summary labels the location "City, St.:" (express.e:30288)', async () => {
      const socket = makeSocket();
      const session = makeSession({ subState: LoggedOnSubState.NEW_USER_SCREEN_CLEAR });
      session.newUserData.username = 'tester';
      session.newUserData.location = 'Oslo';

      await handleScreenClearInput(socket, session, 'Y');

      const output = socket._emits.map((e: any) => String(e.payload)).join('');
      expect(output).toContain('Handle: tester\r\nCity, St.: Oslo\r\nPhone Num: ');
    });

    it('N sets screenClear=false and advances', async () => {
      const socket = makeSocket();
      const session = makeSession({ subState: LoggedOnSubState.NEW_USER_SCREEN_CLEAR });

      await handleScreenClearInput(socket, session, 'N');

      expect(session.newUserData.screenClear).toBe(false);
    });
  });

  describe('handleAccessPasswordInput (express.e:30139)', () => {
    it('wrong password emits error and increments tries', async () => {
      const socket = makeSocket();
      const session = makeSession({
        subState: LoggedOnSubState.NEW_USER_ACCESS_PASSWORD,
        newUserData: { accessPasswordTries: 0 },
      });

      // With empty newUserPassword, empty input is treated as invalid
      await handleAccessPasswordInput(socket, session, '');

      expect(socket.emit).toHaveBeenCalled();
      const output = socket.emit.mock.calls.map((c: any[]) => String(c[1])).join('');
      // express.e:30036 - plain, 'PassWord', after lineInput's CRLF.
      expect(output).toContain('\r\nInvalid PassWord\r\n');
      expect(output).not.toContain('\x1b[');
    });

    it('three wrong attempts puts session in AWAIT state', async () => {
      jest.useFakeTimers();
      const socket = makeSocket();
      const session = makeSession({
        subState: LoggedOnSubState.NEW_USER_ACCESS_PASSWORD,
        newUserData: { accessPasswordTries: 2 }, // already 2 tries
      });

      await handleAccessPasswordInput(socket, session, 'wrong');

      // abortNewUser sets state to AWAIT before the 500ms disconnect timer
      expect(session.state).toBe(BBSState.AWAIT);
      jest.useRealTimers();
    });
  });

  describe('handleAutoValidationInput (express.e:30068-30085)', () => {
    it('a wrong password says express.e:30084 in plain text, after a blank line', async () => {
      const socket = makeSocket();
      const session = makeSession({ subState: LoggedOnSubState.NEW_USER_AUTOVAL });
      session.newUserData.autoValidationComplete = false;

      await handleAutoValidationInput(socket, session, 'not-it');

      const output = socket._emits.filter((e: any) => e.event === 'ansi-output').map((e: any) => String(e.payload)).join('');
      // express.e:30084 then the prompt again (30068) with no break of its own.
      expect(output).toContain(
        '\r\n\r\nIncorrect password, try again or leave blank if not known.\r\n\r\nEnter the auto-validation password (if known): ');
      expect(output).not.toContain('\x1b[33m');
    });
  });
});

describe('new-user answers break as express.e\'s lineInput does', () => {
  const said = (s: any) => s._emits.map((e: any) => String(e.payload)).join('');

  it('Lines: lineInput\'s break and 30263\'s before the computer list', async () => {
    const socket = makeSocket();
    const session = makeSession({ subState: LoggedOnSubState.NEW_USER_LINES });
    await handleLinesInput(socket, session, '24');
    expect(said(socket).startsWith('\r\n\r\n')).toBe(true);
  });

  it('a computer number out of range asks again, without drawing the list again', async () => {
    const socket = makeSocket();
    const session = makeSession({ subState: LoggedOnSubState.NEW_USER_COMPUTER });
    session.newUserData.computerChoices = ['AMiGA 500', 'AMiGA 2000'];
    await handleComputerInput(socket, session, '9');
    expect(said(socket)).toBe('\r\nChoose computer type: '); // express.e:11342 JUMP jLoop6
  });

  it('a wrong new-user password: "Invalid PassWord", then the prompt with no extra break', async () => {
    const socket = makeSocket();
    const session = makeSession({ subState: LoggedOnSubState.NEW_USER_ACCESS_PASSWORD });
    await handleAccessPasswordInput(socket, session, 'wrong');
    expect(said(socket)).toContain('\r\nInvalid PassWord\r\nEnter New User Password: ');
  });
});
