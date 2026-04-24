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

    it('prompts for re-entry on empty location (location required)', async () => {
      const socket = makeSocket();
      const session = makeSession({ subState: LoggedOnSubState.NEW_USER_LOCATION });

      await handleLocationInput(socket, session, '');

      // Empty location keeps the user on location prompt
      expect(socket.emit).toHaveBeenCalled();
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
  });

  describe('handleEmailInput (express.e:30207)', () => {
    it('stores email and advances to PASSWORD', async () => {
      const socket = makeSocket();
      const session = makeSession({ subState: LoggedOnSubState.NEW_USER_EMAIL });

      await handleEmailInput(socket, session, 'user@test.com');

      expect(session.newUserData.email).toBe('user@test.com');
      expect(session.subState).toBe(LoggedOnSubState.NEW_USER_PASSWORD);
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

    it('rejects password that is too short', async () => {
      const socket = makeSocket();
      const session = makeSession({ subState: LoggedOnSubState.NEW_USER_PASSWORD });

      await handlePasswordInput(socket, session, 'ab');

      expect(session.subState).toBe(LoggedOnSubState.NEW_USER_PASSWORD);
      expect(socket.emit).toHaveBeenCalled();
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
    });

    it('empty input uses auto (0)', async () => {
      const socket = makeSocket();
      const session = makeSession({ subState: LoggedOnSubState.NEW_USER_LINES });

      await handleLinesInput(socket, session, '');

      expect(session.subState).toBe(LoggedOnSubState.NEW_USER_COMPUTER);
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
      expect(output).toContain('Invalid');
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
});
