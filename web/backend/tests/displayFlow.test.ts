import { BBSState, LoggedOnSubState } from '../src/constants/bbs-states';

const displayScreenMock = jest.fn(async () => true);
// doPause must set paginatedScreen to pause the display flow (pauseDisplayFlow checks this)
const doPauseMock = jest.fn((socket: any, session: any) => {
  session.paginatedScreen = {
    callback: null,
    currentPage: 1,
    totalPages: 1,
    content: []
  };
});
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
  handlePaginatedScreenInput: jest.fn(async (socket: any, session: any) => {
    // Simulate pagination completion - clear paginatedScreen
    session.paginatedScreen = null;
    return true;
  }),
}));

jest.mock('../src/amiga-emulation/loader/LibraryLoader', () => ({
  LibraryLoader: jest.fn(),
}));

jest.mock('../src/amiga-emulation/AmigaDoorSession', () => ({
  AmigaDoorSession: jest.fn(),
}));

jest.mock('../src/handlers/operations/conference.handler', () => ({
  displayConferenceBulletins: displayConferenceBulletinsMock,
  joinConference: jest.fn(),
}));

// Mock confScan so it doesn't call the real message scanner or set menuPause
jest.mock('../src/handlers/message/message-scan.handler', () => ({
  performConferenceScan: jest.fn(async (_socket: any, session: any) => {
    const { LoggedOnSubState } = require('../src/constants/bbs-states');
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
  }),
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
    // Reset to default implementation
    doPauseMock.mockImplementation((socket: any, session: any) => {
      session.paginatedScreen = {
        callback: null,
        currentPage: 1,
        totalPages: 1,
        content: []
      };
    });
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

  test('advances through display flow states (BULL -> NODE_BULL -> CONF_BULL -> MENU)', async () => {
    const session = baseSession();

    // For this test, doPause should NOT set paginatedScreen (so bulletin flow continues)
    doPauseMock.mockImplementation(() => {
      // Don't set paginatedScreen - let the flow continue
    });

    // First call: BULL → NODE_BULL → CONF_BULL → AUTO_REJOIN → DISPLAY_MENU.
    // CONF_SCAN sets session.menuPause=true, so DISPLAY_MENU calls doPause and returns.
    await handleCommand(socket, session, '');
    expect(displayScreenMock).toHaveBeenCalled();
    const screenNames = displayScreenMock.mock.calls.map((c: any[]) => c[2]);
    expect(screenNames).toContain('BULL');
    expect(screenNames).toContain('NODE_BULL');
    expect(displayConferenceBulletinsMock).toHaveBeenCalled();
    expect(doPauseMock).toHaveBeenCalled();

    // Second call: resumes from DISPLAY_MENU (menuPause now false) — main menu shown.
    displayScreenMock.mockClear();
    await handleCommand(socket, session, '');
    expect(displayMainMenuMock).toHaveBeenCalled();
  });

  // express.e:29853-29855 — quickFlag=TRUE skips BULL bulletin display
  test('express.e:29853 — quickFlag=true skips BULL screen entirely', async () => {
    doPauseMock.mockImplementation(() => {}); // no-pause, let flow continue
    const session = baseSession();
    session.quickFlag = true;

    await handleCommand(socket, session, '');

    const bullCalls = displayScreenMock.mock.calls.filter((c: any[]) => c[2] === 'BULL');
    expect(bullCalls).toHaveLength(0);
    const nodeBullCalls = displayScreenMock.mock.calls.filter((c: any[]) => c[2] === 'NODE_BULL');
    expect(nodeBullCalls).toHaveLength(0);
  });

  // express.e:28556 — doPause IS called when BULL screen was shown
  test('express.e:28556 — doPause called when BULL displayScreen returns true', async () => {
    // Default doPauseMock installs a paginatedScreen — the flow stops at BULL
    const session = baseSession();

    await handleCommand(socket, session, '');

    expect(doPauseMock).toHaveBeenCalled();
    const bullCalls = displayScreenMock.mock.calls.filter((c: any[]) => c[2] === 'BULL');
    expect(bullCalls.length).toBeGreaterThan(0);
    // Flow should be paused (paginatedScreen set by doPauseMock)
    expect(session.paginatedScreen).toBeDefined();
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
