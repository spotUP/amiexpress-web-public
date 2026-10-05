import { LoggedOnSubState, BBSState } from '../src/constants/bbs-states';
import { handleGoodbyeCommand, handleGoodbyeConfirm, setSystemCommandsDependencies } from '../src/handlers/commands/system-commands.handler';

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

    expect(session.subState).toBe(LoggedOnSubState.GOODBYE_CONFIRM);
    // express.e:12670-12672 — "You have flagged files still not downloaded.
    // Do you leave without them?" (yesNo prompt). The earlier copy of this
    // test expected "Download them now?" which was never in express.e.
    // Byte for byte, yesNo(2)'s prompt included (both ESC[32m's).
    expect(socket.emit).toHaveBeenCalledWith(
      'ansi-output',
      '\r\nYou have flagged files still not downloaded.\r\nDo you leave without them? '
        + '\x1b[32m(\x1b[33my\x1b[32m/\x1b[33mN\x1b[32m)\x1b[32m?\x1b[0m '
    );
  });

  test('resumes goodbye after batch confirm when pendingGoodbye is set', async () => {
    jest.useFakeTimers();
    const socket: any = { emit: jest.fn(), disconnect: jest.fn() };
    setSystemCommandsDependencies({
      displayScreen: async () => true,
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
    expect(session.subState).toBe(LoggedOnSubState.GOODBYE_CONFIRM);

    // Y at "Do you leave without them?" carries the logoff on (express.e:12670).
    await handleGoodbyeConfirm(socket, session, 'Y');
    jest.runOnlyPendingTimers();
    jest.useRealTimers();

    expect(session.state).toBe(BBSState.AWAIT);
    expect(session.subState).toBe('logoff');
  });
});
