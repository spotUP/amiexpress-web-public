import { LoggedOnSubState, BBSState } from '../src/constants/bbs-states';
import { handleGoodbyeCommand, setSystemCommandsDependencies } from '../src/handlers/system-commands.handler';
import { BatchDownloadHandler } from '../src/handlers/batch-download.handler';

describe('system commands - goodbye flagged files', () => {
  test('prompts for flagged downloads when flagManager has entries', () => {
    const socket = { emit: jest.fn(), disconnect: jest.fn() };
    const session: any = {
      user: { username: 'sysop', slotNumber: 1 },
      nodeId: 1,
      flagManager: { getCount: () => 2, save: jest.fn() },
      flaggedFiles: [],
      state: null,
      subState: null,
      shortcuts: new Map()
    };

    handleGoodbyeCommand(socket, session, '');

    expect(session.subState).toBe(LoggedOnSubState.BATCH_DOWNLOAD_CONFIRM);
    expect(socket.emit).toHaveBeenCalledWith(
      'ansi-output',
      expect.stringContaining('Download them now?')
    );
  });

  test('resumes goodbye after batch confirm when pendingGoodbye is set', async () => {
    jest.useFakeTimers();
    const socket: any = { emit: jest.fn(), disconnect: jest.fn() };
    setSystemCommandsDependencies({
      displayScreen: () => true,
      findSecurityScreen: () => 'Logoff'
    });

    const session: any = {
      user: { username: 'sysop', slotNumber: 1 },
      nodeId: 1,
      flagManager: {
        getCount: () => 1,
        getAll: () => [{ confNum: 1, fileName: 'TEST.TXT' }],
        clearAll: jest.fn(),
        save: jest.fn()
      },
      tempData: {},
      shortcuts: new Map(),
      state: null,
      subState: null
    };

    handleGoodbyeCommand(socket, session, '');
    expect(session.tempData.pendingGoodbye).toBe(true);
    expect(session.subState).toBe(LoggedOnSubState.BATCH_DOWNLOAD_CONFIRM);

    // Simulate confirming downloads with no actual files found (findFileInConference will fail)
    await BatchDownloadHandler.handleBatchConfirm(socket, session, 'Y');
    jest.runOnlyPendingTimers();
    jest.useRealTimers();

    expect(session.state).toBe(BBSState.AWAIT);
    expect(session.subState).toBe('logoff');
  });
});
