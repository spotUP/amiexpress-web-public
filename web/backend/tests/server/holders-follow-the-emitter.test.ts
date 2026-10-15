// @ts-nocheck
/**
 * Holders keyed by the emitter OBJECT, not its id (session persistence S4).
 * After a resume a link's id is the new socket's id; anything that captured
 * the id once would split the caller in two.
 */
jest.mock('../../src/services/UserFileManager', () => ({
  userFileManager: { writeUserFiles: jest.fn() }
}));
jest.mock('../../src/services/UserDatabaseManager', () => ({
  userDatabaseManager: {
    getUserCount: jest.fn().mockReturnValue(0),
    userToStruct: jest.fn().mockReturnValue({ slotNumber: 0 }),
    userToKeys: jest.fn().mockReturnValue({}),
    userToMisc: jest.fn().mockReturnValue({}),
    appendUser: jest.fn(),
  }
}));

import { getAnsiBuffer, releaseAnsiBuffer, ansiBufferCount } from '../../src/utils/ansi-buffer.util';
import { NodeManager } from '../../src/services/node-manager.service';
import { cleanupTransfer } from '../../src/utils/raw-transfer-teardown.util';

describe('holders follow the emitter', () => {
  it('a socket keeps one output buffer when its id changes under it', () => {
    const s: any = { id: 'A', emit: jest.fn() };
    const first = getAnsiBuffer(s);
    s.id = 'B';
    expect(getAnsiBuffer(s)).toBe(first);
    releaseAnsiBuffer(s);
  });

  it('two sockets that share an id keep separate buffers, and release is by object', () => {
    const a: any = { id: 'same', emit: jest.fn() };
    const b: any = { id: 'same', emit: jest.fn() };
    const before = ansiBufferCount();
    expect(getAnsiBuffer(a)).not.toBe(getAnsiBuffer(b));
    expect(releaseAnsiBuffer(a)).toBe(true);
    expect(ansiBufferCount()).toBe(before + 1);
    expect(releaseAnsiBuffer(a)).toBe(false);
    expect(releaseAnsiBuffer(b)).toBe(true);
  });

  it("a door's socket wrapper reports the socket's id as it is now", () => {
    const s: any = { id: 'A', emit: jest.fn(), on: jest.fn(), once: jest.fn(), off: jest.fn(), server: {} };
    // Loaded here: door.handler pulls in the database module graph.
    const { createDoorSocketWrapper } = require('../../src/handlers/door.handler');
    const w = createDoorSocketWrapper(s, { nodeId: 1 } as any, {} as any);
    expect(w.id).toBe('A');
    s.id = 'B';
    expect(w.id).toBe('B');
  });

  it('NodeManager moves a session to its new socket id and keeps the node busy', async () => {
    const nm: any = new NodeManager();
    const ns = await nm.assignSessionToNode('A', 'A');
    nm.rekeySession('A', 'B');
    expect(nm.getSession('A')).toBeNull();
    expect(nm.getSession('B')?.nodeId).toBe(ns.nodeId);
    expect(nm.getSession('B')?.socketId).toBe('B');
    expect(nm.getNodeStatus(ns.nodeId)?.status).toBe('busy');
  });

  it('rekeySession ignores an unknown id and a same-id move', async () => {
    const nm: any = new NodeManager();
    await nm.assignSessionToNode('A', 'A');
    nm.rekeySession('nope', 'B');
    nm.rekeySession('A', 'A');
    expect(nm.getSession('A')).not.toBeNull();
    expect(nm.getSession('B')).toBeNull();
  });

  it('cleanupTransfer destroys a transfer stream and drops the raw routing', () => {
    const destroy = jest.fn();
    const session: any = {
      transfer: { stream: { destroy } },
      transferRawActive: true,
      transferRawSink: () => undefined,
      transferRawSend: () => undefined,
    };
    cleanupTransfer(session);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(session.transfer).toBeUndefined();
    expect(session.transferRawActive).toBe(false);
    expect(session.transferRawSink).toBeUndefined();
    expect(session.transferRawSend).toBeUndefined();
    expect(() => cleanupTransfer(undefined)).not.toThrow();
  });
});
