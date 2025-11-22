import { LoggedOnSubState } from '../src/constants/bbs-states';
import { handleGoodbyeCommand } from '../src/handlers/system-commands.handler';

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
});
