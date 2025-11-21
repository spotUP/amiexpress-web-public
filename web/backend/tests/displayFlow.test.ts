import { BBSState, LoggedOnSubState } from '../src/constants/bbs-states';

const displayScreenMock = jest.fn(async () => true);
const doPauseMock = jest.fn();
const displayConferenceBulletinsMock = jest.fn(async () => true);
const displayMainMenuMock = jest.fn(async (_socket: any, session: any) => {
  // Mirror menu handler: set input mode based on cmdShortcuts.
  session.subState = session.cmdShortcuts ? LoggedOnSubState.READ_SHORTCUTS : LoggedOnSubState.READ_COMMAND;
});
const getConferenceToolFlagsMock = jest.fn(() => ({
  forceNewscan: false,
  noNewscan: false,
  showNewFiles: false,
  noNewFiles: false,
  forceMenus: false,
  noBulls: false,
  noConfBulls: false,
}));

// Prevent index.ts from booting servers; export only the constants and stub setters.
jest.mock('../src/index', () => {
  const states = require('../src/constants/bbs-states');
  return {
    BBSState: states.BBSState,
    LoggedOnSubState: states.LoggedOnSubState,
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
  };
});

jest.mock('../src/handlers/screen.handler', () => ({
  displayScreen: displayScreenMock,
  doPause: doPauseMock,
}));

jest.mock('../src/amiga-emulation/loader/LibraryLoader', () => ({
  LibraryLoader: jest.fn(),
}));

jest.mock('../src/amiga-emulation/AmigaDoorSession', () => ({
  AmigaDoorSession: jest.fn(),
}));

jest.mock('../src/handlers/conference.handler', () => ({
  displayConferenceBulletins: displayConferenceBulletinsMock,
}));

jest.mock('../src/handlers/door.handler', () => ({
  executeDoor: jest.fn(),
  displayDoorMenu: jest.fn(),
}));

jest.mock('../src/handlers/command-handler/menu', () => ({
  displayMainMenu: displayMainMenuMock,
  displayMenuPrompt: jest.fn(),
}));

jest.mock('../src/utils/conference-tooltypes.util', () => ({
  getConferenceToolFlags: getConferenceToolFlagsMock,
}));

describe('Display flow parity', () => {
  const socket = {
    emitted: [] as Array<{ event: string; data: any }>,
    emit(event: string, data?: any) {
      this.emitted.push({ event, data });
    },
  };

  let handleCommand: typeof import('../src/handlers/command.handler').handleCommand;

  beforeAll(() => {
    ({ handleCommand } = require('../src/handlers/command.handler'));
  });

  beforeEach(() => {
    displayScreenMock.mockClear();
    doPauseMock.mockClear();
    displayConferenceBulletinsMock.mockClear();
    displayMainMenuMock.mockClear();
    getConferenceToolFlagsMock.mockClear();
    socket.emitted = [];
  });

  function baseSession() {
    return {
      state: BBSState.LOGGEDON,
      subState: LoggedOnSubState.DISPLAY_BULL,
      user: { expert: 'N', confRJoin: 1 },
      currentConf: 1,
      currentConfName: 'General',
      relConfNum: 1,
      currentMsgBase: 1,
      confRJoin: 1,
      msgBaseRJoin: 1,
      commandBuffer: '',
      inputBuffer: '',
      menuPause: true,
      cmdShortcuts: false,
      shortcuts: new Map(),
      timeRemaining: 60,
      lastActivity: Date.now(),
      displayFlowPaused: false,
      doorExpertMode: false,
      lastScreenHadPause: false,
    } as any;
  }

  test('advances BULL -> NODE_BULL -> CONF_BULL -> MENU with single key per pause', async () => {
    const session = baseSession();

    // Key after BULL
    await handleCommand(socket, session, '');
    expect(displayScreenMock).toHaveBeenCalledTimes(1);
    expect(displayScreenMock).toHaveBeenLastCalledWith(socket, session, 'BULL');
    expect(session.subState).toBe(LoggedOnSubState.DISPLAY_NODE_BULL);
    expect(session.displayFlowPaused).toBe(true);

    // Key after NODE_BULL
    await handleCommand(socket, session, '');
    expect(displayScreenMock).toHaveBeenCalledTimes(2);
    expect(displayScreenMock).toHaveBeenLastCalledWith(socket, session, 'NODE_BULL');
    expect(session.subState).toBe(LoggedOnSubState.CONF_SCAN);
    expect(session.displayFlowPaused).toBe(true);

    // Key after CONF_BULL
    await handleCommand(socket, session, '');
    expect(displayConferenceBulletinsMock).toHaveBeenCalledTimes(1);
    expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
    expect(session.displayFlowPaused).toBe(true);

    // Key for MENU pause
    await handleCommand(socket, session, '');
    expect(doPauseMock).toHaveBeenCalled();
    expect(session.menuPause).toBe(false);
    expect(session.displayFlowPaused).toBe(true);

    // Final key shows menu and enters READ_COMMAND
    await handleCommand(socket, session, '');
    expect(displayMainMenuMock).toHaveBeenCalledTimes(1);
    expect(session.subState).toBe(LoggedOnSubState.READ_COMMAND);
  });

  test('skips bull screens when NO_BULLS/NO_CONF_BULLS set', async () => {
    getConferenceToolFlagsMock.mockReturnValue({
      forceNewscan: false,
      noNewscan: false,
      showNewFiles: false,
      noNewFiles: false,
      forceMenus: false,
      noBulls: true,
      noConfBulls: true,
    });
    const session = baseSession();

    // First key should skip straight to confScan -> CONF_BULL (skipped) -> MENU
    await handleCommand(socket, session, '');
    await handleCommand(socket, session, '');

    expect(displayScreenMock).not.toHaveBeenCalled();
    expect(displayConferenceBulletinsMock).not.toHaveBeenCalled();
    expect(session.subState).toBe(LoggedOnSubState.READ_COMMAND);
  });
});
