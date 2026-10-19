/**
 * A SAVED TOKEN DOES NOT LOG ANYONE IN.
 *
 * The socket `login` event used to take a JWT and run the whole post-login
 * pipeline on it: no password, no refusal gates, no state check, and a token
 * logoff never revoked. Token login is retired; a fresh login is typed at the
 * board's own name and password prompt, and a dropped socket comes back
 * through the resume token. This pins the refusal: even a token the database
 * would accept gets `login-failed`, and the pipeline never runs.
 */
const verifyAccessToken = jest.fn(async () => ({ userId: 'u-1', username: 'sysop', secLevel: 255 }));
const getUserById = jest.fn(async () => ({ id: 'u-1', username: 'sysop', secLevel: 255 }));
// Lazy wrappers: jest hoists jest.mock above the consts it closes over.
jest.mock('../../src/database', () => ({
  db: {
    verifyAccessToken: () => verifyAccessToken(),
    getUserById: () => getUserById(),
  },
}));

const runPostAuthLogin = jest.fn(async (socket: { emit: (e: string, d?: unknown) => void }) => {
  socket.emit('login-success', { user: { id: 'u-1' } });
  return { ok: true };
});
jest.mock('../../src/services/login-post.service', () => ({
  runPostAuthLogin: (socket: { emit: (e: string, d?: unknown) => void }) => runPostAuthLogin(socket),
}));

const SESSION = { state: 'await', tempData: {} };
jest.mock('../../src/server/session-manager', () => ({
  getSessionBySocketId: () => SESSION,
}));

import { registerAuthHandlers } from '../../src/server/auth-socket-handlers';

function fakeSocket() {
  const handlers: Record<string, (data: unknown) => unknown> = {};
  const emitted: string[] = [];
  return {
    handlers,
    emitted,
    socket: {
      id: 'token-socket',
      handshake: { address: '127.0.0.1' },
      on(event: string, fn: (data: unknown) => unknown) { handlers[event] = fn; return this; },
      emit(event: string) { emitted.push(event); return true; },
      disconnect() { /* not expected */ },
    },
  };
}

describe('the socket login event', () => {
  it('refuses a valid saved token with login-failed and runs no login', async () => {
    const { socket, handlers, emitted } = fakeSocket();
    registerAuthHandlers(socket as never);
    await handlers.login({ token: 'a-valid-jwt' });
    await new Promise((resolve) => setImmediate(resolve));

    expect(emitted).toContain('login-failed');
    expect(emitted).not.toContain('login-success');
    expect(runPostAuthLogin).not.toHaveBeenCalled();
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it('refuses an empty payload the same way', async () => {
    const { socket, handlers, emitted } = fakeSocket();
    registerAuthHandlers(socket as never);
    await handlers.login(undefined);
    expect(emitted).toEqual(['login-failed']);
  });
});
