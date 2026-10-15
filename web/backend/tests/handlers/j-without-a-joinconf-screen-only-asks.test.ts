/**
 * J with no conference number shows SCREEN_JOINCONF and asks
 * "Conference Number (1-n): " (express.e:25142-25145). A board without the
 * screen shows nothing before the prompt (displayScreen, 6588-6590). The
 * port drew its own numbered list with "<- Current" instead.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/utils/acs.util', () => ({
  ...jest.requireActual('../../src/utils/acs.util'),
  checkSecurity: () => true,
}));
jest.mock('../../src/utils/message-pointers.util', () => ({
  ...jest.requireActual('../../src/utils/message-pointers.util'),
  loadMsgPointers: async () => ({}),
  saveMsgPointers: async () => undefined,
}));

import { handleJoinConferenceCommand, setUserCommandsDependencies } from '../../src/handlers/commands/user-commands.handler';

test('J asks for the number with nothing before it when the board has no JOINCONF screen', async () => {
  setUserCommandsDependencies({
    conferences: [{ id: 1, name: 'Amiga' }, { id: 2, name: 'C64' }] as any,
    messageBases: [],
    db: {} as any,
    joinConference: jest.fn() as any,
    checkConfAccess: jest.fn() as any,
    displayScreen: (async () => false) as any,
    displayUploadInterface: jest.fn() as any,
  });
  const said: string[] = [];
  const socket: any = { id: 'j', emit: (e: string, d: unknown) => { if (e === 'ansi-output') said.push(String(d)); return true; } };
  const session: any = { nodeId: 1, currentConf: 1, currentMsgBase: 1, user: { id: 1, username: 'spot' } };

  await handleJoinConferenceCommand(socket, session, '');

  expect(said.join('')).toBe('Conference Number (1-2): ');
});
