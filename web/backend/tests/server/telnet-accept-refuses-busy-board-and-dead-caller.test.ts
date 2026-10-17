/**
 * acceptIncomingConnection - express.e:1024-1056.
 *
 * A node already online closes the second socket (1047-1049, web: the
 * "all nodes are busy" notice, WEB_ text); an accepted socket with no carrier
 * is closed and leaves the node free (1030-1037, checkCarrier()=FALSE).
 */
process.env.SKIP_DB_INIT = '1';

import * as sessionManager from '../../src/server/session-manager';

jest.mock('../../src/server/session-manager', () => ({
  ...jest.requireActual('../../src/server/session-manager'),
  getNextAvailableNodeId: jest.fn(),
}));
import { TelnetServer } from '../../src/server/telnet-server';

function fakeSocket(addr: string, destroyed: boolean) {
  return {
    remoteAddress: addr,
    destroyed,
    setNoDelay: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
    on: jest.fn(),
  };
}

describe('TelnetServer.handleConnection (acceptIncomingConnection)', () => {
  let server: TelnetServer;
  const nodeSpy = sessionManager.getNextAvailableNodeId as unknown as jest.Mock;
  beforeEach(() => {
    server = new TelnetServer(0);
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('tells a second caller the board is busy and hangs up when no node is free', async () => {
    nodeSpy.mockReturnValue(null);
    const s = fakeSocket('10.9.0.1', false);
    await (server as any).handleConnection(s);   // a full board first looks for a parked session (S11)
    expect(s.write).toHaveBeenCalledWith(sessionManager.allNodesBusyNotice());
    expect(s.end).toHaveBeenCalled();
    expect((server as any).connections.size).toBe(0);
  });

  it('does not seat a caller who already hung up, and leaves the node free', () => {
    nodeSpy.mockReturnValue(7);
    const s = fakeSocket('10.9.0.2', true);
    (server as any).handleConnection(s);
    expect((server as any).connections.size).toBe(0);
    expect(s.write).not.toHaveBeenCalled();
    expect(s.on).not.toHaveBeenCalled();
  });
});
