/**
 * A paste reaches a door in game mode, once, as typed text.
 *
 * LiveChat runs in game mode: its keys come as key-down, and the 'command'
 * path swallows input for a game-mode door. xterm delivers a paste through
 * onData, which the terminal drops in game mode, so Cmd+V reached nothing
 * (sysop, 2026-11-06: "i still cant copy or paste"). The terminal now sends
 * the pasted text on 'door:paste'. Driven through the real socket listeners.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/index', () => ({}));

import { registerCommandHandler } from '../../src/server/socket-handlers';
import { setSession, deleteSession } from '../../src/server/session-manager';
import { LoggedOnSubState, BBSState } from '../../src/constants/bbs-states';

function webCaller(id: string) {
  const handlers = new Map<string, (...args: any[]) => any>();
  const socket: any = {
    id,
    handshake: { address: '127.0.0.1' },
    connected: true,
    emit: () => true,
    join: () => {}, leave: () => {}, disconnect: () => {}, onAny: () => {},
    once: (event: string, h: any) => { handlers.set(event, h); return socket; },
    on: (event: string, h: any) => { handlers.set(event, h); return socket; },
    removeAllListeners: () => socket, removeListener: () => socket, listenerCount: () => 0,
  };
  registerCommandHandler(socket);
  return handlers;
}

function gameModeDoor(doorInputHandler: jest.Mock | undefined): any {
  return {
    nodeId: 94, state: BBSState.LOGGEDON, subState: LoggedOnSubState.DOOR_RUNNING, inDoorManager: true,
    connectionType: 'web', user: { id: 1, username: 'spot', secLevel: 255 }, tempData: {},
    gameModeEnabled: true, doorInputHandler,
  };
}

describe('door:paste', () => {
  it('hands the pasted text to the game-mode door once, whole', async () => {
    const id = `paste-${Date.now()}`;
    const handlers = webCaller(id);
    const input = jest.fn();
    setSession(id, gameModeDoor(input));
    try {
      await handlers.get('door:paste')!('hello world\rsecond line');
      expect(input).toHaveBeenCalledTimes(1);
      expect(input).toHaveBeenCalledWith('hello world\rsecond line');
    } finally {
      deleteSession(id);
    }
  });

  it('sends nothing outside a door', async () => {
    const id = `paste-none-${Date.now()}`;
    const handlers = webCaller(id);
    const input = jest.fn();
    setSession(id, { ...gameModeDoor(input), inDoorManager: false });
    try {
      await handlers.get('door:paste')!('hello');
      expect(input).not.toHaveBeenCalled();
    } finally {
      deleteSession(id);
    }
  });
});
