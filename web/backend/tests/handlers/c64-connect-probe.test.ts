/**
 * Task 6 fix round (audit F1-F3): the controller found that the brief's
 * wiring premise was wrong — pre-login.ts's real-C64 branch is dead code,
 * never called by the live dispatcher. command.handler.ts is the actual
 * DISPLAY_CONNECT/ANSI_PROMPT dispatcher (index.ts always imports
 * handleCommand from here for non-door input). These tests exercise the
 * fix against THIS live path, not the dead pre-login.ts copy.
 *
 * Scenarios (per the controller's ruling):
 *  (a) DISPLAY_CONNECT keypress with terminalType already 'c64' (TTYPE or
 *      the DEL-probe classified it within telnet-server.ts's 500ms
 *      window) skips the graphics prompt and enables petsciiMode.
 *  (b) A slower typer: the DEL-probe classifies terminalType as 'c64'
 *      only once the graphics prompt is already showing (ANSI_PROMPT).
 *      That first byte must apply PETSCII immediately, not be treated as
 *      a backspace on the graphics-answer buffer (the pre-fix behavior).
 *  (c) A non-C64 (web/modern terminal) answering P gets a one-line
 *      uppercase confirmation that it is SIMULATING a C64 display — a
 *      real C64 (terminalType === 'c64') must never get this line.
 *
 * Mock harness copied from tests/displayFlow.test.ts, the only existing
 * suite that safely requires command.handler.ts (a 4500+ line module
 * with many static imports that would otherwise try to boot real
 * servers/DB/emulators at require() time).
 */

import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';

const displayScreenMock = jest.fn(async () => true);
const doPauseMock = jest.fn();
const loadBBSConfigMock = jest.fn(() => ({ system_password: '' }));

jest.mock('../../src/index', () => {
  const states = require('../../src/constants/bbs-states');
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

jest.mock('../../src/handlers/screen.handler', () => ({
  displayScreen: displayScreenMock,
  doPause: doPauseMock,
  handlePaginatedScreenInput: jest.fn(async () => true),
}));

jest.mock('../../src/amiga-emulation/loader/LibraryLoader', () => ({
  LibraryLoader: jest.fn(),
}));

jest.mock('../../src/amiga-emulation/AmigaDoorSession', () => ({
  AmigaDoorSession: jest.fn(),
}));

jest.mock('../../src/handlers/operations/conference.handler', () => ({
  displayConferenceBulletins: jest.fn(async () => true),
  joinConference: jest.fn(async () => true),
}));

jest.mock('../../src/handlers/message/message-scan.handler', () => ({
  performConferenceScan: jest.fn(async () => true),
}));

jest.mock('../../src/handlers/door.handler', () => ({
  executeDoor: jest.fn(),
  displayDoorMenu: jest.fn(),
}));

jest.mock('../../src/handlers/command-handler/menu', () => ({
  displayMainMenu: jest.fn(),
  displayMenuPrompt: jest.fn(),
}));

jest.mock('../../src/handlers/file/download.handler', () => ({
  DownloadHandler: {
    handleConfirmInput: jest.fn(),
    handleFilenameInput: jest.fn(),
    handlePGoodbyeInput: jest.fn(),
  },
}));

jest.mock('../../src/utils/conference-tooltypes.util', () => ({
  getConferenceToolFlags: jest.fn(() => ({
    forceNewscan: false,
    noNewscan: false,
    showNewFiles: false,
    noNewFiles: false,
    forceMenus: false,
    noBulls: false,
    noConfBulls: false,
  })),
}));

// Controls the system-password gate (task 6's completeRealC64Connect and
// the pre-existing ANSI_PROMPT Enter-path both read this). Empty string =
// no gate, so both paths fall straight through to BBSTITLE -> LOGON,
// which is what every test below wants to assert against.
jest.mock('../../src/services/bbs-config-file.service', () => ({
  loadBBSConfig: loadBBSConfigMock,
}));

describe('C64 DEL-probe reaches the live command.handler.ts dispatcher (task 6 fix round)', () => {
  let handleCommand: typeof import('../../src/handlers/command.handler').handleCommand;
  let socketCounter = 0;

  beforeAll(() => {
    ({ handleCommand } = require('../../src/handlers/command.handler'));
  });

  beforeEach(() => {
    displayScreenMock.mockClear();
    doPauseMock.mockClear();
    loadBBSConfigMock.mockClear();
    loadBBSConfigMock.mockReturnValue({ system_password: '' });
  });

  // Each test gets its own socket.id — output.util.ts's AnsiBuffer is
  // cached per socket.id in a module-level Map with no test-scoped reset,
  // so a shared id would leak buffered-but-unflushed text between tests.
  function makeSocket() {
    socketCounter += 1;
    return {
      id: `c64-connect-probe-${socketCounter}`,
      on(_event: string, _handler: () => void) { /* no cleanup needed in tests */ },
      emitted: [] as Array<{ event: string; data: any }>,
      emit(event: string, data?: any) {
        this.emitted.push({ event, data });
      },
    };
  }

  function baseSession(): any {
    return {
      state: BBSState.AWAIT,
      subState: LoggedOnSubState.DISPLAY_CONNECT,
      terminalType: 'unknown',
      nodeId: 1,
      tempData: { inputBuffer: '' },
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
    };
  }

  test('(a) DISPLAY_CONNECT + terminalType already c64 skips the graphics prompt, enables petsciiMode', async () => {
    const socket = makeSocket();
    const session = baseSession();
    session.terminalType = 'c64';

    await handleCommand(socket, session, '\x7f');

    expect(session.petsciiMode).toBe(true);
    expect(session.ansiEnabled).toBe(false);
    expect(session.screenWidth).toBe(40);
    expect(session.screenHeight).toBe(25);
    expect(session.needsCharsetPrelude).toBe(true);
    expect(session.state).toBe(BBSState.LOGON);
    expect(session.subState).toBeUndefined();

    expect(displayScreenMock).toHaveBeenCalledWith(socket, session, 'BBSTITLE');

    // The graphics prompt (A/R/P/N question) must never have been shown.
    const texts = socket.emitted.map((e) => e.data).filter((d) => typeof d === 'string');
    expect(texts.some((t) => t.includes('ANSI, RIP, PETSCII'))).toBe(false);

    // Real C64 output goes through petscii-output, not ansi-output.
    expect(socket.emitted.some((e) => e.event === 'petscii-output')).toBe(true);
    expect(socket.emitted.some((e) => e.event === 'prompt-login')).toBe(true);
  });

  test('(b) slower typer: DEL-probe classifies c64 only once ANSI_PROMPT is already showing — applies PETSCII immediately, not a backspace', async () => {
    const socket = makeSocket();
    const session = baseSession();
    session.subState = LoggedOnSubState.ANSI_PROMPT;
    // Simulates index.ts's widened connection.on('data') hook having just
    // classified this byte as PETSCII and flipped terminalType, one tick
    // before command.handler.ts ever sees it. petsciiMode is still unset —
    // this is the "just classified" state the new short-circuit targets.
    session.terminalType = 'c64';

    await handleCommand(socket, session, '\x7f'); // converted PETSCII DEL ($14 -> ASCII DEL)

    expect(session.petsciiMode).toBe(true);
    expect(session.ansiEnabled).toBe(false);
    expect(session.needsCharsetPrelude).toBe(true);
    expect(session.state).toBe(BBSState.LOGON);
    expect(session.subState).toBeUndefined();

    // Pre-fix behavior would have treated '\x7f' as "backspace on an
    // empty buffer" and returned with state still AWAIT/ANSI_PROMPT —
    // asserting the LOGON transition above already rules that out, but
    // pin it explicitly: no lingering inputBuffer content from a
    // backspace no-op.
    expect(session.tempData.inputBuffer).toBe('');
  });

  test('(c) non-c64 terminal answering P gets the SIMULATING C64 confirmation line', async () => {
    const socket = makeSocket();
    const session = baseSession();
    session.subState = LoggedOnSubState.ANSI_PROMPT;
    session.terminalType = 'modern'; // NOT a real C64
    session.tempData = { inputBuffer: 'P' };

    await handleCommand(socket, session, '\r');

    expect(session.petsciiMode).toBe(true);
    const texts = socket.emitted.map((e) => e.data).filter((d) => typeof d === 'string');
    expect(texts.some((t) => t.includes('PETSCII: SIMULATING C64 DISPLAY (40X25)'))).toBe(true);
  });

  test('(c-negative) a real c64 never gets the SIMULATING confirmation line, even via the buffered Enter-path', async () => {
    const socket = makeSocket();
    const session = baseSession();
    session.subState = LoggedOnSubState.ANSI_PROMPT;
    session.terminalType = 'c64';
    // petsciiMode already true — the ANSI_PROMPT short-circuit's own
    // `!session.petsciiMode` guard no longer intercepts, so this exercises
    // the Enter-path's independent `terminalType !== 'c64'` guard on the
    // confirmation line directly.
    session.petsciiMode = true;
    session.tempData = { inputBuffer: 'P' };

    await handleCommand(socket, session, '\r');

    const texts = socket.emitted.map((e) => e.data).filter((d) => typeof d === 'string');
    expect(texts.some((t) => t.includes('SIMULATING C64 DISPLAY'))).toBe(false);
  });
});
