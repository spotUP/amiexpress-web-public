/**
 * Regression tests for beginLogoff (web/backend/src/server/logoff.ts) —
 * the centralised state-machine disconnect helper that replaces the
 * project's prior `socket.emit(...); setTimeout(disconnect, N); return`
 * inline boilerplate.
 *
 * What we pin:
 *   - session.state transitions to LOGGING_OFF (default) before close
 *   - finalState option overrides the default (AWAIT for pre-login bumps)
 *   - optional message is emitted on the expected channel
 *   - disconnect(true) — engine-layer close, not namespace-only
 *   - readDelayMs controls the close timer
 *   - idempotent on double-call
 *   - tolerates absent session (sessionless connect-time bumps)
 *   - tolerates emit faults without skipping the disconnect
 */

import { beginLogoff } from '../../src/server/logoff';
import { BBSState } from '../../src/constants/bbs-states';

interface MockSocket {
  emitted: Array<[string, any]>;
  disconnected: boolean;
  disconnectArg: boolean | undefined;
  emit: (event: string, payload: any) => void;
  disconnect: (close?: boolean) => void;
}

function makeSocket(opts: { emitThrows?: boolean; disconnectThrows?: boolean } = {}): MockSocket {
  const s: MockSocket = {
    emitted: [],
    disconnected: false,
    disconnectArg: undefined,
    emit(event, payload) {
      if (opts.emitThrows) throw new Error('emit failed');
      s.emitted.push([event, payload]);
    },
    disconnect(close) {
      if (opts.disconnectThrows) throw new Error('disconnect failed');
      s.disconnected = true;
      s.disconnectArg = close;
    },
  };
  return s;
}

function makeSession(): any {
  return { state: BBSState.LOGON };
}

describe('beginLogoff', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('sets session.state to LOGGING_OFF by default', () => {
    const socket = makeSocket();
    const session = makeSession();
    beginLogoff(socket as any, session, { message: 'bye' });
    expect(session.state).toBe(BBSState.LOGGING_OFF);
  });

  test('finalState option overrides default', () => {
    const socket = makeSocket();
    const session = makeSession();
    beginLogoff(socket as any, session, { message: 'bye', finalState: BBSState.AWAIT });
    expect(session.state).toBe(BBSState.AWAIT);
  });

  test('emits message synchronously on ansi-output by default', () => {
    const socket = makeSocket();
    beginLogoff(socket as any, makeSession(), { message: '\r\n420 reserved\r\n' });
    expect(socket.emitted).toEqual([['ansi-output', '\r\n420 reserved\r\n']]);
  });

  test('event option overrides default channel', () => {
    const socket = makeSocket();
    beginLogoff(socket as any, makeSession(), { message: 'kick', event: 'login-failed' });
    expect(socket.emitted).toEqual([['login-failed', 'kick']]);
  });

  test('disconnect fires after readDelayMs with force-close (engine layer)', () => {
    const socket = makeSocket();
    beginLogoff(socket as any, makeSession(), { message: 'bye', readDelayMs: 500 });
    expect(socket.disconnected).toBe(false);
    jest.advanceTimersByTime(499);
    expect(socket.disconnected).toBe(false);
    jest.advanceTimersByTime(1);
    expect(socket.disconnected).toBe(true);
    expect(socket.disconnectArg).toBe(true);
  });

  test('readDelayMs defaults to 500 when not provided', () => {
    const socket = makeSocket();
    beginLogoff(socket as any, makeSession(), { message: 'bye' });
    jest.advanceTimersByTime(499);
    expect(socket.disconnected).toBe(false);
    jest.advanceTimersByTime(1);
    expect(socket.disconnected).toBe(true);
  });

  test('readDelayMs honours the 1500ms long-message timing', () => {
    const socket = makeSocket();
    beginLogoff(socket as any, makeSession(), { message: 'bye', readDelayMs: 1500 });
    jest.advanceTimersByTime(1000);
    expect(socket.disconnected).toBe(false);
    jest.advanceTimersByTime(500);
    expect(socket.disconnected).toBe(true);
  });

  test('idempotent on double-call — second call is a no-op', () => {
    const socket = makeSocket();
    const session = makeSession();
    beginLogoff(socket as any, session, { message: 'first' });
    beginLogoff(socket as any, session, { message: 'second' });
    expect(socket.emitted).toEqual([['ansi-output', 'first']]);
  });

  test('tolerates absent session (sessionless connect-time bump)', () => {
    const socket = makeSocket();
    expect(() => beginLogoff(socket as any, undefined, { message: 'bye' })).not.toThrow();
    jest.advanceTimersByTime(500);
    expect(socket.disconnected).toBe(true);
  });

  test('omitting message skips the emit but still schedules disconnect', () => {
    const socket = makeSocket();
    beginLogoff(socket as any, makeSession(), {});
    expect(socket.emitted).toEqual([]);
    jest.advanceTimersByTime(500);
    expect(socket.disconnected).toBe(true);
  });

  test('emit fault does not prevent the disconnect', () => {
    const socket = makeSocket({ emitThrows: true });
    beginLogoff(socket as any, makeSession(), { message: 'bye' });
    jest.advanceTimersByTime(500);
    expect(socket.disconnected).toBe(true);
  });

  test('disconnect fault is swallowed (socket already closed)', () => {
    const socket = makeSocket({ disconnectThrows: true });
    expect(() => {
      beginLogoff(socket as any, makeSession(), { message: 'bye' });
      jest.advanceTimersByTime(500);
    }).not.toThrow();
  });
});
