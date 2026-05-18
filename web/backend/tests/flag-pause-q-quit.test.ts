/**
 * Regression: pressing Q at the FR / F listing pause prompt left the
 * user stuck in an infinite re-prompt because flagPause only matched
 * Y / N / NS / F<file>. Live user hit this with `fr` + Q. Map Q to
 * the same "stop listing" behavior as N (and X for symmetry with
 * common BBS conventions).
 */

import { flagPause, checkForPause } from '../src/utils/flag-pause.util';

function makeSocket(): { socket: any; emitted: string[] } {
  const emitted: string[] = [];
  const socket: any = {
    emit: (event: string, payload: any) => {
      if (event === 'ansi-output') emitted.push(String(payload));
    },
  };
  return { socket, emitted };
}

function makeSession(initialLineCount = 99): any {
  return {
    tempData: {
      lineCount: initialLineCount,
      termHeight: 23,
    },
    user: { linesPerScreen: 23 },
    flagManager: null,
    currentConf: 1,
    nodeId: 0,
  };
}

describe('flagPause Q-quit (regression — live FR listing got stuck)', () => {
  test('Q at flagPause prompt resolves false (stop listing)', async () => {
    const { socket } = makeSocket();
    const session = makeSession();

    const promise = flagPause(socket, session, 1);
    // Spin-wait for the handler to register (microtask).
    await new Promise((r) => setTimeout(r, 0));

    expect(session.flagPauseHandler).toBeDefined();
    // Simulate the socket-handlers.ts dispatch on CR.
    await session.flagPauseHandler('Q');

    const result = await promise;
    expect(result).toBe(false);
  });

  test('q (lowercase) at flagPause prompt resolves false', async () => {
    const { socket } = makeSocket();
    const session = makeSession();

    const promise = flagPause(socket, session, 1);
    await new Promise((r) => setTimeout(r, 0));

    await session.flagPauseHandler('q');
    const result = await promise;
    expect(result).toBe(false);
  });

  test('Q at checkForPause prompt resolves false', async () => {
    const { socket } = makeSocket();
    const session = makeSession();

    const promise = checkForPause(socket, session);
    await new Promise((r) => setTimeout(r, 0));

    await session.checkPauseHandler('Q');
    const result = await promise;
    expect(result).toBe(false);
  });

  test('N still resolves false (regression-of-regression guard)', async () => {
    const { socket } = makeSocket();
    const session = makeSession();

    const promise = flagPause(socket, session, 1);
    await new Promise((r) => setTimeout(r, 0));

    await session.flagPauseHandler('N');
    const result = await promise;
    expect(result).toBe(false);
  });

  test('Y still resolves true (regression-of-regression guard)', async () => {
    const { socket } = makeSocket();
    const session = makeSession();

    const promise = flagPause(socket, session, 1);
    await new Promise((r) => setTimeout(r, 0));

    await session.flagPauseHandler('Y');
    const result = await promise;
    expect(result).toBe(true);
  });
});
