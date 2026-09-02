/**
 * Task 6 of `thoughts/shared/plans/2026-09-02-mci-in-petscii-seq.md`:
 * the render context's disposal site.
 *
 * `petsciiRenderCtxFor` caches ONE thing on the session - the
 * `PetsciiMachine` that is the render's positional bank/cursor/pen oracle.
 * It must not outlive the session: the disconnect cleanup in
 * `server/socket-handlers.ts` (which runs after the reconnect grace period
 * and is where the session record is dropped from the session maps) calls
 * `disposePetsciiRenderCtx`.
 *
 * The test drives the REAL production path: the `disconnect` handler
 * `registerSocketHandlers` installs -> `finalizeDisconnectCleanup`. It calls
 * `registerDisconnectHandler` (the same function `registerSocketHandlers`
 * calls) rather than the whole registrar, which would also fire
 * EXECUTE_ON_CONNECT and the session log manager - side effects unrelated to
 * disposal that leave handles open in a test process. It never pokes
 * `disposePetsciiRenderCtx` itself: the point is that the cleanup calls it.
 *
 * `src/index.ts` runs a top-level IIFE that starts the HTTP/telnet/SSH
 * servers as a side effect of module load, so it is mocked away here (the
 * same reason `connection-emitter.ts` was extracted out of it - see the
 * comment at the top of that file). Everything else is the real module.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/index', () => ({}));

import { AnsiToPetsciiTransducer } from '@amiexpress/bbs-door-sdk/petscii';
import { petsciiRenderCtxFor } from '../../src/handlers/petscii-screen.render';
import { registerDisconnectHandler } from '../../src/server/socket-handlers';
import { setSession, deleteSession, getSession } from '../../src/server/session-manager';

/** A socket.io-shaped mock that keeps the handlers registered on it. */
function makeSocket(id: string) {
  const handlers = new Map<string, (...args: any[]) => any>();
  const socket: any = {
    id,
    handshake: { address: '127.0.0.1' },
    connected: true,
    emit: () => true,
    join: () => {},
    leave: () => {},
    disconnect: () => {},
    onAny: () => {},
    once: (event: string, handler: any) => { handlers.set(event, handler); return socket; },
    on: (event: string, handler: any) => { handlers.set(event, handler); return socket; },
    removeAllListeners: () => socket,
    removeListener: () => socket,
    listenerCount: () => 0,
  };
  return { socket, handlers };
}

describe('Task 6: the PETSCII render context is disposed with the session', () => {
  it('the disconnect cleanup drops the cached render machine', async () => {
    const socketId = `petscii-dispose-${Date.now()}`;
    const session: any = {
      nodeId: 91,
      petsciiMode: true,
      currentConfName: 'Main',
      // No user: finalizeDisconnectCleanup's logoff/user-file branch is not
      // what this test is about, and a userless session reaches the same
      // session-storage teardown directly.
      user: undefined,
      // Skip the 3-second reconnect grace period (the sysop-kick path takes
      // the same cleanup, just without the wait) so the test does not sleep.
      sysopKicked: true,
    };
    setSession(socketId, session);
    expect(getSession(socketId)).toBe(session);

    // The render's oracle, created exactly the way emitPetsciiScreen creates
    // it. It is a transducer, not a bare machine: a PETSCII terminal also
    // receives ANSI (an `~SS_` include that resolved to a `.TXT`, a pause
    // prompt) and the oracle has to track both flavours.
    await petsciiRenderCtxFor(session);
    expect(session.petsciiRenderTransducer).toBeInstanceOf(AnsiToPetsciiTransducer);

    // A `.seq` paused mid-screen parks its remaining segments together with
    // the ctx they must be rendered against; they must not outlive it.
    session.screenSegments = {
      segments: ['leftover'],
      currentIndex: 0,
      screenName: 'T',
      inlineMode: true,
      eventName: 'petscii-output',
      isFlowScreen: true,
      petscii: true,
    };

    const { socket, handlers } = makeSocket(socketId);
    registerDisconnectHandler(socket);

    const onDisconnect = handlers.get('disconnect');
    expect(typeof onDisconnect).toBe('function');
    await onDisconnect!('transport close');

    expect(session.petsciiRenderTransducer).toBeUndefined();
    expect(session.screenSegments).toBeUndefined();

    deleteSession(socketId);
  });
});
